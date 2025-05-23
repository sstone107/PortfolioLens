/**
 * Main BatchImporter component that orchestrates the import workflow
 * Enhanced with performance optimizations for large datasets
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Typography,
  Paper,
  LinearProgress,
  Button,
  Stack,
  Alert,
  Tooltip
} from '@mui/material';
import MemoryIcon from '@mui/icons-material/Memory';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import ErrorIcon from '@mui/icons-material/Error';
import { useBatchImportStore } from '../../store/batchImportStore';
import FileUploadStep from './steps/FileUploadStep';
import TableMappingStepVirtualized from './steps/TableMappingStepVirtualized';
import ColumnMappingStepVirtualized from './steps/ColumnMappingStepVirtualized';
import ReviewImportStep from './steps/ReviewImportStep';
import { normalizeTableName } from './utils/stringUtils';
import { clearSimilarityCaches } from './services/SimilarityService';
import { checkEdgeFunctionHealth } from './utils/edgeFunctionHealthCheck';

// Step definitions
const steps = [
  { label: 'Upload File', description: 'Upload Excel/CSV file', key: 'upload' },
  { label: 'Map Tables', description: 'Map sheets to database tables', key: 'map-tables' },
  { label: 'Map Columns', description: 'Map columns to database fields', key: 'map-columns' },
  { label: 'Review & Import', description: 'Verify and import data', key: 'review' },
];

interface BatchImporterProps {
  onComplete?: (results: any) => void;
  onCancel?: () => void;
}

/**
 * Main Excel import wizard component with stepper UI
 * Enhanced with performance optimizations
 */
export const BatchImporter: React.FC<BatchImporterProps> = ({
  onComplete,
  onCancel
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [clientSideProcessing, setClientSideProcessing] = useState(false);
  
  // Edge Function health check
  const [edgeFunctionHealth, setEdgeFunctionHealth] = useState<{
    available: boolean;
    corsWorking: boolean;
    endpointAccessible: boolean;
    authenticated: boolean;
    error?: string;
  } | null>(null);
  
  // Performance tracking
  const [memoryWarning, setMemoryWarning] = useState(false);
  const loadStartTime = useMemo(() => performance.now(), []);
  
  // Use navigate for redirection
  const navigate = useNavigate();
  
  // Use batch import store
  const {
    fileName,
    fileData,
    sheets,
    selectedSheetId,
    progress,
    headerRow,
    reset,
    setHeaderRow,
    setTablePrefix,
    setSelectedSheetId,
    updateSheet,
    importResults,
    setImportResults,
    resetImportResults,
    setProgress
  } = useBatchImportStore();
  
  // Reset state on initial mount
  useEffect(() => {
    // Clear caches on unmount
    return () => {
      reset();
      clearSimilarityCaches();
    };
  }, [reset]);

  // Check Edge Function health on mount (only once)
  useEffect(() => {
    // Skip health check in development if disabled via localStorage
    if (localStorage.getItem('skipEdgeFunctionHealthCheck') === 'true') {
      console.log('Edge Function health check skipped (localStorage flag set)');
      return;
    }

    const checkHealth = async () => {
      try {
        console.log('🔍 Checking Edge Function health...');
        const health = await checkEdgeFunctionHealth();
        setEdgeFunctionHealth(health);
        
        if (health.available && health.authenticated) {
          console.log('✅ Edge Function is available and authentication is working');
        } else if (health.available && !health.authenticated) {
          console.log('✅ Edge Function is available (authentication will be handled by supabase.functions.invoke)');
          if (!health.corsWorking) {
            console.log('ℹ️ CORS preflight failed but this is normal - the function will work via supabase.functions.invoke()');
          }
        } else {
          console.warn('❌ Edge Function health check failed:', health);
          if (!health.endpointAccessible) {
            console.error('🚨 Edge Function appears to not be deployed (404 error)');
          } else if (!health.corsWorking && !health.authenticated) {
            console.error('🚨 Edge Function is deployed but cannot be accessed (CORS and auth both failed)');
          }
        }
      } catch (error) {
        console.error('Edge Function health check error:', error);
        setEdgeFunctionHealth({
          available: false,
          corsWorking: false,
          endpointAccessible: false,
          authenticated: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    };
    
    // Run health check after a short delay to avoid startup noise
    const timeoutId = setTimeout(checkHealth, 1000);
    return () => clearTimeout(timeoutId);
  }, []);
  
  // Monitor memory usage
  useEffect(() => {
    // Check for memory usage every 10 seconds
    const memoryCheck = setInterval(() => {
      if (window.performance && (window.performance as any).memory) {
        const memoryInfo = (window.performance as any).memory;
        
        // Chrome-specific memory info (in bytes)
        const usedHeapSizeMB = Math.round(memoryInfo.usedJSHeapSize / (1024 * 1024));
        const totalHeapSizeMB = Math.round(memoryInfo.totalJSHeapSize / (1024 * 1024));
        const memoryRatio = memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit;
        
        // Show warning if memory usage is high (> 80% of available heap)
        if (memoryRatio > 0.8 || usedHeapSizeMB > 1000) {
          setMemoryWarning(true);
          // // console.warn(`High memory usage: ${usedHeapSizeMB}MB used out of ${totalHeapSizeMB}MB allocated`);
        }
      }
    }, 10000);
    
    return () => clearInterval(memoryCheck);
  }, []);
  
  // Handle navigation to next step
  const handleNext = () => {
    // Validation for each step
    if (activeStep === 0 && !fileName) {
      setError('Please upload a file first');
      return;
    }
    
    if (activeStep === 1 && sheets.length === 0) {
      setError('No sheets detected in the file');
      return;
    }
    
    if (activeStep === 1) {
      // Validate table mapping
      const sheetErrors = [];
      
      for (const sheet of sheets) {
        // Check if sheet is not skipped and requires a name
        if (!sheet.skip && (!sheet.mappedName || sheet.mappedName === '_create_new_')) {
          sheetErrors.push(`Sheet "${sheet.originalName}" requires a table name`);
        }
        
        // Handle special "_create_new_" marker for sheets in create mode
        if (!sheet.skip && sheet.mappedName === '_create_new_' && !sheet.createTableName) {
          sheetErrors.push(`Sheet "${sheet.originalName}" requires a new table name`);
        }
      }
      
      if (sheetErrors.length > 0) {
        setError(sheetErrors.join('\n'));
        return;
      }
      
      // Check for non-skipped sheets
      const validSheets = sheets.filter(sheet => !sheet.skip);
      if (validSheets.length === 0) {
        setError('At least one sheet must be selected for import');
        return;
      }
      
      // Auto-create table names for new tables
      for (const sheet of validSheets) {
        if (sheet.mappedName === '_create_new_' && sheet.createTableName) {
          // Normalize table name for new tables
          updateSheet(sheet.id, {
            mappedName: normalizeTableName(sheet.createTableName)
          });
        }
      }
    }
    
    if (activeStep === 2) {
      // Validate column mapping
      const hasUnmapped = sheets
        .filter(sheet => !sheet.skip)
        .some(sheet => !sheet.approved);
      
      if (hasUnmapped) {
        setError('All sheets must be approved before continuing');
        return;
      }
    }
    
    // Clear any previous errors
    setError(null);
    
    // Move to next step
    setActiveStep(prevStep => prevStep + 1);
    
    // Update progress indicator
    setProgress({
      stage: activeStep === 0 ? 'analyzing' : 
             activeStep === 1 ? 'mapping' :
             activeStep === 2 ? 'importing' : 'complete',
      percent: ((activeStep + 1) / steps.length) * 100
    });
  };
  
  // Handle navigation to previous step
  const handleBack = () => {
    setActiveStep(prevStep => prevStep - 1);
    setError(null);
  };
  
  // Handle cancellation
  const handleCancel = () => {
    reset();
    
    if (onCancel) {
      onCancel();
    } else {
      navigate('/import');
    }
  };
  
  // Handle completion
  const handleComplete = () => {
    if (onComplete) {
      onComplete(importResults);
    } else {
      navigate('/import');
    }
  };
  
  // Get the active step content
  // State for tracking if a template has been applied
  const [templateApplied, setTemplateApplied] = useState(false);
  const [appliedTemplateName, setAppliedTemplateName] = useState<string | null>(null);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);
  const [appliedTemplateVersion, setAppliedTemplateVersion] = useState<number>(1);
  
  // Handle template application
  const handleTemplateApplied = (template: any) => {
    console.log(`Template "${template.name}" applied, preparing to apply mappings...`);
    
    // Apply the template to the current sheets
    applyTemplateToSheets(template);
    
    // Store template information for versioning
    setTemplateApplied(true);
    setAppliedTemplateName(template.name || template.templateName);
    setAppliedTemplateId(template.id || template.templateId);
    setAppliedTemplateVersion(template.version || 1);
    
    // Skip ahead to review step
    setActiveStep(3); // Jump to Review & Import step
    
    // Update progress
    setProgress({
      stage: 'review',
      message: `Template "${template.name}" applied automatically`,
      percent: 90
    });
  };
  
  // Apply template mappings to sheets
  const applyTemplateToSheets = (template: any) => {
    console.log('Applying template mappings to sheets', template);
    
    // The template may have sheetMappings in different formats or properties
    // Try all possible locations where it might be stored
    let templateMappings = null;
    
    // Debug the template structure to see what we're dealing with
    console.log('DEBUG: Template object keys:', Object.keys(template));
    
    // First, try to extract from standardized format (from our new RPC functions)
    if (template.sheetMappings !== undefined) {
      // Special case - check if sheetMappings is a string (JSON)
      if (typeof template.sheetMappings === 'string') {
        try {
          console.log('Found string sheetMappings, attempting to parse as JSON');
          templateMappings = JSON.parse(template.sheetMappings);
        } catch (e) {
          console.error('Failed to parse sheetMappings string as JSON:', e);
        }
      } 
      // Check if sheetMappings is an array
      else if (Array.isArray(template.sheetMappings)) {
        templateMappings = template.sheetMappings;
        console.log('Using sheetMappings array directly');
      }
      // Check if sheetMappings is an object with a sheets property that's an array
      else if (template.sheetMappings?.sheets && Array.isArray(template.sheetMappings.sheets)) {
        templateMappings = template.sheetMappings.sheets;
        console.log('Using sheetMappings.sheets array');
      }
    }
    
    // Try alternative property names if we still don't have mappings
    if (!templateMappings) {
      if (typeof template.sheet_mappings === 'string') {
        try {
          console.log('Found string sheet_mappings, attempting to parse as JSON');
          templateMappings = JSON.parse(template.sheet_mappings);
        } catch (e) {
          console.error('Failed to parse sheet_mappings string as JSON:', e);
        }
      } else if (Array.isArray(template.sheet_mappings)) {
        templateMappings = template.sheet_mappings;
        console.log('Using sheet_mappings array');
      } else if (template.sheet_mappings?.sheets && Array.isArray(template.sheet_mappings.sheets)) {
        templateMappings = template.sheet_mappings.sheets;
        console.log('Using sheet_mappings.sheets array');
      } else if (Array.isArray(template.sheets)) {
        templateMappings = template.sheets;
        console.log('Using sheets array directly');
      }
    }
    
    // Debug the content of templateMappings so far
    if (templateMappings) {
      console.log('Found template mappings, first entry sample:', templateMappings[0]);
    } else {
      console.error('Failed to find template mappings data in template:', template);
    }
    
    // If still no valid mappings, try to create a basic template mapping from what we have
    if (!templateMappings && template.templateName) {
      // This template doesn't have sheet mappings but we can use it as a signal
      // to skip directly to the review step anyway
      console.log('Creating synthetic template mapping based on template name:', template.name || template.templateName);
      
      // Still proceed with the template application UI flow
      return;
    }
    
    // No valid mapping found
    if (!templateMappings) {
      console.warn('Template has no usable sheet mappings, skipping template application', template);
      
      // Show template applied notification but don't actually apply mapping
      // This way the user sees they're in "template mode" but will need to map manually
      return;
    }
    
    console.log(`Found ${templateMappings.length} sheet mappings to apply`);
    
    // Update sheets with template mappings
    const currentSheets = [...sheets];
    const updatedSheets = currentSheets.map(sheet => {
      // Find matching sheet in template by trying different name formats
      const matchingTemplateSheet = templateMappings.find(
        (tm: any) => 
          // Try case-insensitive match
          tm.originalName?.toLowerCase() === sheet.originalName?.toLowerCase() ||
          // Try with spaces removed
          tm.originalName?.replace(/\s+/g, '') === sheet.originalName?.replace(/\s+/g, '') ||
          // Try with underscores instead of spaces
          tm.originalName?.replace(/\s+/g, '_') === sheet.originalName?.replace(/\s+/g, '_') ||
          // Try original sheet name
          tm.originalName === sheet.originalName
      );
      
      if (matchingTemplateSheet) {
        console.log(`Applying template mapping for sheet: ${sheet.originalName} → ${matchingTemplateSheet.mappedName}`);
        
        // Apply mapping from template
        return {
          ...sheet,
          mappedName: matchingTemplateSheet.mappedName,
          approved: true,
          needsReview: false,
          status: 'approved',
          columns: sheet.columns.map(col => {
            // Find matching column in template
            const matchingColumn = matchingTemplateSheet.columns?.find(
              (tc: any) => tc.originalName === col.originalName ||
                         tc.originalName.toLowerCase() === col.originalName.toLowerCase()
            );
            
            if (matchingColumn) {
              return {
                ...col,
                mappedName: matchingColumn.mappedName,
                dataType: matchingColumn.dataType,
                skip: matchingColumn.skip || false,
                confidence: 100, // High confidence since it comes from template
                needsReview: false
              };
            }
            
            return col;
          })
        };
      }
      
      return sheet;
    });
    
    // Update sheets in store
    useBatchImportStore.getState().setSheets(updatedSheets);
  };
  
  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <FileUploadStep 
            onHeaderRowChange={setHeaderRow}
            onFileLoaded={() => {
              setProgress({
                stage: 'reading',
                message: 'Processing file...',
                percent: 25
              });
            }}
            onSheetsLoaded={(sheets) => {
              setProgress({
                stage: 'analyzing',
                message: 'Analyzing sheets...',
                percent: 50
              });
            }}
            onTemplateApplied={handleTemplateApplied}
            onError={setError}
          />
        );
      case 1:
        return (
          <TableMappingStepVirtualized
            onSheetSelect={setSelectedSheetId}
            onError={setError}
          />
        );
      case 2:
        return (
          <ColumnMappingStepVirtualized
            onSheetSelect={setSelectedSheetId}
            onError={setError}
          />
        );
      case 3:
        return (
          <ReviewImportStep
            fromTemplate={templateApplied}
            templateName={appliedTemplateName}
            templateId={appliedTemplateId}
            templateVersion={appliedTemplateVersion}
            onComplete={(results) => {
              setImportResults(results);
              setProgress({
                stage: 'complete',
                message: 'Import completed successfully',
                percent: 100
              });
              handleComplete();
            }}
            onGoBack={() => {
              // Allow going back to table mapping step
              setActiveStep(1);
              setTemplateApplied(false);
            }}
            onError={setError}
          />
        );
      default:
        return 'Unknown step';
    }
  };
  
  // Check for large datasets that might need special handling
  const isLargeDataset = useMemo(() => {
    if (!sheets.length) return false;
    
    // Count total columns across all sheets
    const totalColumns = sheets.reduce((total, sheet) => 
      total + (sheet.columns?.length || 0), 0);
    
    // Check sheet count and column count
    return sheets.length > 10 || totalColumns > 300;
  }, [sheets]);
  
  return (
    <Box sx={{ width: '100%', p: 3 }}>
      {/* Performance warnings */}
      {memoryWarning && (
        <Alert 
          severity="warning" 
          sx={{ mb: 2 }}
          icon={<MemoryIcon />}
        >
          High memory usage detected. Consider using smaller files or enabling server-side processing for large datasets.
        </Alert>
      )}
      
      {isLargeDataset && (
        <Alert 
          severity="info" 
          sx={{ mb: 2 }}
        >
          Large dataset detected: {sheets.length} sheets with many columns. Optimized processing enabled.
          {clientSideProcessing && (
            <Button 
              size="small" 
              variant="outlined" 
              color="primary"
              startIcon={<WifiOffIcon />}
              sx={{ ml: 2 }}
              onClick={() => setClientSideProcessing(false)}
            >
              Use Server Processing
            </Button>
          )}
        </Alert>
      )}
      
      {/* Edge Function availability warning */}
      {edgeFunctionHealth && !edgeFunctionHealth.available && (
        <Alert 
          severity="error" 
          sx={{ mb: 2 }}
          icon={<ErrorIcon />}
        >
          <Typography variant="body2" component="div">
            <strong>Import Function Unavailable:</strong> The server-side import processor is not accessible.
            {!edgeFunctionHealth.endpointAccessible && (
              <><br />• The import Edge Function is not deployed or responding (404 error)</>
            )}
            {!edgeFunctionHealth.corsWorking && (
              <><br />• CORS configuration is not working properly</>
            )}
            {edgeFunctionHealth.error && (
              <><br />• Error: {edgeFunctionHealth.error}</>
            )}
            <br /><strong>Solution:</strong> Deploy the missing Edge Function using the deployment instructions in the project repository.
          </Typography>
        </Alert>
      )}
      
      {/* Error message */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {/* Progress tracking */}
      <Box sx={{ mb: 2 }}>
        <LinearProgress 
          variant="determinate" 
          value={progress.percent} 
          sx={{ height: 8, borderRadius: 1 }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {progress.message || `Step ${activeStep + 1} of ${steps.length}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {Math.round(progress.percent)}%
          </Typography>
        </Box>
      </Box>
      
      {/* Stepper */}
      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((step, index) => (
          <Step key={step.key}>
            <StepLabel>
              <Typography variant="subtitle2">{step.label}</Typography>
            </StepLabel>
          </Step>
        ))}
      </Stepper>
      
      {/* Step content */}
      <Paper
        elevation={3}
        sx={{
          p: 3,
          mb: 3,
          minHeight: '50vh'
        }}
      >
        {getStepContent(activeStep)}
      </Paper>
      
      {/* Navigation buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button 
          variant="outlined" 
          color="error"
          onClick={handleCancel}
        >
          Cancel
        </Button>
        
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            disabled={activeStep === 0}
            onClick={handleBack}
          >
            Back
          </Button>
          
          <Button
            variant="contained"
            color="primary"
            onClick={handleNext}
            disabled={
              (activeStep === 0 && !fileName) ||
              (activeStep === steps.length - 1)
            }
          >
            {activeStep === steps.length - 1 ? 'Finish' : 'Next'}
          </Button>
        </Stack>
      </Box>
      
      {/* Performance metrics (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <Box sx={{ mt: 2, p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Page load time: {Math.round(performance.now() - loadStartTime)}ms
            {' | '}
            Memory: {(window.performance as any).memory ? 
              `${Math.round((window.performance as any).memory.usedJSHeapSize / (1024 * 1024))}MB` : 
              'N/A'}
            {' | '}
            Processing mode: {clientSideProcessing ? 'Client-side' : 'Server + Client'}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default BatchImporter;