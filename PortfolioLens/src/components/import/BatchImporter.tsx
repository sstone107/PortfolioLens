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
import { useBatchImportStore } from '../../store/batchImportStore';
import FileUploadStep from './steps/FileUploadStep';
import TableMappingStepVirtualized from './steps/TableMappingStepVirtualized';
import ColumnMappingStepVirtualized from './steps/ColumnMappingStepVirtualized';
import ReviewImportStep from './steps/ReviewImportStep';
import { normalizeTableName } from './utils/stringUtils';
import { clearSimilarityCaches } from './services/SimilarityService';

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
  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <FileUploadStep 
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
            onComplete={(results) => {
              setImportResults(results);
              setProgress({
                stage: 'complete',
                message: 'Import completed successfully',
                percent: 100
              });
              handleComplete();
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