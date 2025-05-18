/**
 * Review and Import Step component
 * Final step in the import wizard
 */
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Alert,
  AlertTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Grid,
  Stack,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  IconButton
} from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChart';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import EditIcon from '@mui/icons-material/Edit';
import { useBatchImportStore, MappingTemplate } from '../../../store/batchImportStore';
import { useBatchImport, useMappingTemplates } from '../BatchImporterHooks';
import { supabaseClient } from '../../../utility/supabaseClient';
import { recordMetadataService } from '../services/RecordMetadataService';
import { saveTemplate as saveTemplateDirectly } from '../mappingLogic';
import { v4 as uuidv4 } from 'uuid';

// Servicer interface
interface Servicer {
  id: string;
  name: string;
  code?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Source file types supported by the system
type SourceFileType = 'xlsx' | 'csv' | 'json' | 'txt';

interface ReviewImportStepProps {
  onError: (error: string | null) => void;
  onComplete?: (results: any) => void;
  onGoBack?: () => void;
  fromTemplate?: boolean;
  templateName?: string | null;
  templateId?: string | null;
  templateVersion?: number;
}

/**
 * Step 4: Review and import component
 */
export const ReviewImportStep: React.FC<ReviewImportStepProps> = ({
  onError,
  onComplete,
  onGoBack,
  fromTemplate = false,
  templateName: appliedTemplateName = null,
  templateId = null,
  templateVersion = 1
}) => {
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [filePattern, setFilePattern] = useState('');
  const [servicerId, setServicerId] = useState<string>('');
  const [servicers, setServicers] = useState<Servicer[]>([]);
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [loadingServicers, setLoadingServicers] = useState(false);
  const [sourceFileType, setSourceFileType] = useState<SourceFileType>('xlsx');
  
  // For template versioning
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(templateId);
  const [appliedTemplateVersion, setAppliedTemplateVersion] = useState<number>(templateVersion);
  const [saveAsNewVersion, setSaveAsNewVersion] = useState<boolean>(false);
  
  // Access batch import store
  const {
    fileName,
    sheets,
    headerRow,
    tablePrefix,
    importResults,
    progress,
    setImportResults,
    resetImportResults
  } = useBatchImportStore();
  
  // Fetch servicers
  useEffect(() => {
    const fetchServicers = async () => {
      try {
        setLoadingServicers(true);
        const { data, error } = await supabaseClient
          .from('servicers')
          .select('*')
          .eq('active', true)
          .order('name');
          
        if (error) {
          throw error;
        }
        
        setServicers(data || []);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Failed to load servicers');
      } finally {
        setLoadingServicers(false);
      }
    };
    
    fetchServicers();
  }, [onError]);
  
  // Import functionality
  const { executeImport, loading, error } = useBatchImport();
  const { saveTemplate, loading: templateSaving, loadTemplates } = useMappingTemplates();
  
  // Filter sheets that aren't skipped
  const importableSheets = sheets.filter(sheet => !sheet.skip);
  
  // Count how many sheets need review
  const needsReviewCount = importableSheets.filter(sheet => sheet.needsReview).length;
  
  // Count tables that will be created
  const tablesToCreate = importableSheets.map(sheet => sheet.mappedName);
  
  // Count total columns
  const totalColumns = importableSheets.reduce((sum, sheet) => {
    const nonSkippedColumns = sheet.columns.filter(col => !col.skip).length;
    return sum + nonSkippedColumns;
  }, 0);
  
  // Count total rows
  const totalRows = importableSheets.reduce((sum, sheet) => {
    return sum + (sheet.rowCount || 0);
  }, 0);
  
  // Handle import execution
  const handleExecuteImport = async () => {
    // Reset any previous results
    resetImportResults();
    
    // Execute the import
    const success = await executeImport();
    
    // Log the import activity if successful
    if (success) {
      try {
        // Get current user
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        if (user) {
          // Log the import activity
          await recordMetadataService.logImportActivity({
            userId: user.id,
            fileName,
            templateId: selectedTemplateId || undefined,
            status: importResults.failedSheets.length > 0 ? 'partial' : 'success',
            tablesCreated: importResults.createdTables || [],
            rowsAffected: importResults.importedRows || 0,
            errorDetails: importResults.failedSheets.length > 0 ? {
              failedSheets: importResults.failedSheets,
              errors: importResults.errors
            } : undefined
          });
        }
      } catch (logError) {
        // Non-critical error, just log to console
        console.error('Failed to log import activity:', logError);
      }
      
      // Notify parent of completion if callback provided
      if (onComplete) {
        onComplete(importResults);
      }
    }
    
    if (!success && error) {
      onError(error);
    } else {
      onError(null);
    }
  };
  
  // Helper function to generate a file pattern from a filename
  const generateFilePattern = (filename: string): string => {
    if (!filename) return '';
    
    // Extract filename components
    const parts = filename.split('.');
    const extension = parts.pop() || ''; // Get the file extension
    const baseName = parts.join('.'); // Reconstruct base name without extension
    
    // Try to identify patterns in the filename
    
    // Check for date patterns (YYYY-MM-DD, YYYYMMDD, MM-DD-YYYY, etc.)
    const datePatterns = [
      /\d{4}-\d{2}-\d{2}/,       // YYYY-MM-DD
      /\d{2}-\d{2}-\d{4}/,       // MM-DD-YYYY
      /\d{2}\.\d{2}\.\d{4}/,     // MM.DD.YYYY
      /\d{8}/                    // YYYYMMDD
    ];
    
    let patternizedName = baseName;
    
    // Replace date patterns with wildcards
    for (const pattern of datePatterns) {
      if (pattern.test(baseName)) {
        patternizedName = patternizedName.replace(pattern, '*');
      }
    }
    
    // Replace numeric sequences that could be report/batch numbers
    patternizedName = patternizedName.replace(/\d+/g, '*');
    
    // If the pattern became too generic (all wildcards), use a more specific pattern
    if (patternizedName.replace(/[^*]/g, '').length > patternizedName.length / 2) {
      // Too many wildcards, use a more conservative approach
      // Just take the first part of the name and add a wildcard
      const nameWords = baseName.split(/[\s_-]/); // Split by common delimiters
      if (nameWords.length > 1) {
        patternizedName = `${nameWords[0]}*`;
      }
    }
    
    // Return the pattern with the original extension
    return `${patternizedName}.${extension}`;
  };

  // Handle save template dialog open
  const handleSaveTemplateOpen = () => {
    // If updating an existing template version, use its name
    if (saveAsNewVersion && fromTemplate && appliedTemplateName) {
      setTemplateName(appliedTemplateName);
      setTemplateDescription(`Updated version of template for ${fileName}`);
      
      // If we're updating, we want to keep the original file pattern
      // We'll load it from existing template in the database
      if (appliedTemplateId) {
        // Try to load the existing template to get its file pattern
        supabaseClient.rpc('get_mapping_template_by_id', { p_id: appliedTemplateId })
          .then(({ data, error }) => {
            if (!error && data) {
              setFilePattern(data.filePattern || generateFilePattern(fileName));
              setTemplateDescription(data.description || `Updated version of template for ${fileName}`);
              setServicerId(data.servicerId || '');
              
              // Log the template data for debugging
              console.log('Retrieved template data:', data);
              
              // If template data has sourceFileType, use it
              if (data.sourceFileType) {
                setSourceFileType(data.sourceFileType as SourceFileType);
              } else {
                // Otherwise, derive from file extension
                const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'xlsx';
                setSourceFileType(fileExtension === 'csv' ? 'csv' : 
                  fileExtension === 'json' ? 'json' : 
                  fileExtension === 'txt' ? 'txt' : 'xlsx');
              }
            } else {
              // Fallback to generating a new pattern
              const generatedPattern = generateFilePattern(fileName);
              setFilePattern(generatedPattern);
            }
          })
          .catch(err => {
            console.error('Error loading template details:', err);
            // Fallback to generating a new pattern
            const generatedPattern = generateFilePattern(fileName);
            setFilePattern(generatedPattern);
          });
      } else {
        // Generate a new pattern as fallback
        const generatedPattern = generateFilePattern(fileName);
        setFilePattern(generatedPattern);
      }
    } else {
      // For new templates, generate a name from the filename
      const baseTemplateName = fileName.split('.')[0] || 'Import Template';
      setTemplateName(baseTemplateName);
      setTemplateDescription(`Template for ${fileName}`);
      
      // Generate and set an automatic file pattern
      const generatedPattern = generateFilePattern(fileName);
      setFilePattern(generatedPattern);
    }
    
    setSaveTemplateOpen(true);
  };
  
  // Handle save template dialog close
  const handleSaveTemplateClose = () => {
    setSaveTemplateOpen(false);
  };
  
  // Handle save template
  const handleSaveTemplate = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // Prepare sheet mappings JSON with all essential data
      const sheetMappingsJson = sheets.map(sheet => ({
        id: sheet.id,
        originalName: sheet.originalName,
        mappedName: sheet.mappedName,
        headerRow: sheet.headerRow,
        skip: sheet.skip,
        approved: sheet.approved || !sheet.needsReview,
        needsReview: sheet.needsReview || false,
        // Include all column mapping details
        columns: sheet.columns.map(col => ({
          originalName: col.originalName,
          mappedName: col.mappedName,
          dataType: col.dataType,
          skip: col.skip || false,
          confidence: col.confidence || 0,
          originalIndex: col.originalIndex,
          needsReview: col.needsReview || false,
          // Include additional properties that may be needed
          createNewValue: col.createNewValue,
          inferredDataType: col.inferredDataType,
          _isNewlyCreated: col._isNewlyCreated
        }))
      }));
      
      // Determine the source file type from the file extension
      const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'xlsx';
      const derivedSourceFileType = fileExtension === 'csv' ? 'csv' : 
                                   fileExtension === 'json' ? 'json' : 
                                   fileExtension === 'txt' ? 'txt' : 'xlsx';
      
      // Update source file type state
      setSourceFileType(derivedSourceFileType as SourceFileType);
      
      // Determine if we're creating a new template or updating an existing one
      const selectedTemplateId = saveAsNewVersion ? appliedTemplateId : null;
      const templateData = {
        id: selectedTemplateId, // If updating existing template
        name: templateName,
        description: templateDescription,
        servicerId: servicerId || null,
        filePattern: filePattern || null,
        headerRow: headerRow,
        tablePrefix: tablePrefix || null,
        sheetMappings: sheetMappingsJson,
        sourceFileType: sourceFileType || derivedSourceFileType
      };
      
      // Log what we're doing for debugging
      if (selectedTemplateId) {
        console.log(`Updating template ${selectedTemplateId} to version ${appliedTemplateVersion + 1}:`, templateData);
      } else {
        console.log('Creating new template:', {
          templateId: uuidv4(), // Just for logging
          templateName,
          description: templateDescription,
          servicerId,
          filePattern,
          sheetMappingsCount: sheetMappingsJson.length,
          headerRow
        });
      }
      
      // Try using the hooks saveTemplate function
      try {
        console.log('Using hooks saveTemplate function with data:', templateData);
        await saveTemplate(templateData);
        console.log('Template saved successfully using hooks method');
        
        // Create a record of this version update for tracking history if needed
        if (saveAsNewVersion && appliedTemplateId) {
          try {
            await recordMetadataService.createAuditRecord({
              userId: user.id,
              action: 'template_version_update',
              entityType: 'template',
              entityId: appliedTemplateId,
              entityName: templateName,
              details: {
                previousVersion: appliedTemplateVersion,
                newVersion: appliedTemplateVersion + 1,
                updatedAt: new Date().toISOString(),
                fileName: fileName,
                sourceFileType: sourceFileType,
                savedVia: 'hooks_method'
              }
            });
          } catch (auditError) {
            console.warn('Failed to create audit record for template version update:', auditError);
          }
        }
        
        // Reset the versioning flag
        setSaveAsNewVersion(false);
        
        // Close dialog
        handleSaveTemplateClose();
        
        // Refresh templates list
        if (loadTemplates) {
          await loadTemplates();
        }
        
        // Success message
        const successMessage = saveAsNewVersion 
          ? `Template "${templateName}" updated to version ${appliedTemplateVersion + 1}`
          : 'Template saved successfully';
        
        console.log(successMessage);
        
        // Show success notification to user
        onError(null); // Clear any existing errors
        
        return; // Exit the function after hooks save success
      } catch (hookError) {
        console.error('Error using hooks method, falling back to RPC:', hookError);
        
        // Continue with direct RPC as fallback
        try {
          // Prepare RPC parameters
          const rpcParams = {
            p_name: templateName,
            p_description: templateDescription || '',
            p_servicer_id: servicerId || null,
            p_file_pattern: filePattern || null,
            p_header_row: headerRow,
            p_table_prefix: tablePrefix || null,
            p_sheet_mappings: sheetMappingsJson,
            p_source_file_type: sourceFileType || derivedSourceFileType
          };
          
          // Log RPC params for debugging
          console.log('Using direct RPC call with params:', rpcParams);
          
          // Call our new RPC functions with renamed parameters
          const { data, error } = await supabaseClient.rpc('save_template_v2', {
            p_template_name: templateName,
            p_template_description: templateDescription || '',
            p_template_servicer_id: servicerId || null,
            p_template_file_pattern: filePattern || null,
            p_template_header_row: headerRow,
            p_template_table_prefix: tablePrefix || null,
            p_template_sheet_mappings: sheetMappingsJson,
            p_template_id: selectedTemplateId || null,
            p_template_source_file_type: sourceFileType || derivedSourceFileType
          });
          
          if (error) {
            console.error('Template save error:', error);
            
            // Last resort fallback to specific create/update functions if save_template_v2 fails
            let fallbackResult;
            
            if (selectedTemplateId) {
              // Try update
              const { data: updateData, error: updateError } = await supabaseClient.rpc('update_existing_mapping_template', {
                p_template_id: selectedTemplateId,
                p_template_name: templateName,
                p_template_description: templateDescription || '',
                p_template_servicer_id: servicerId || null,
                p_template_file_pattern: filePattern || null,
                p_template_header_row: headerRow,
                p_template_table_prefix: tablePrefix || null,
                p_template_sheet_mappings: sheetMappingsJson,
                p_template_source_file_type: sourceFileType || derivedSourceFileType
              });
              
              if (updateError) {
                console.error('Fallback update failed:', updateError);
                throw new Error(`RPC Error: ${error.message || 'Unknown error'}`);
              }
              
              fallbackResult = updateData;
            } else {
              // Try create
              const { data: createData, error: createError } = await supabaseClient.rpc('create_new_mapping_template', {
                p_template_name: templateName,
                p_template_description: templateDescription || '',
                p_template_servicer_id: servicerId || null,
                p_template_file_pattern: filePattern || null,
                p_template_header_row: headerRow,
                p_template_table_prefix: tablePrefix || null,
                p_template_sheet_mappings: sheetMappingsJson,
                p_template_source_file_type: sourceFileType || derivedSourceFileType
              });
              
              if (createError) {
                console.error('Fallback create failed:', createError);
                throw new Error(`RPC Error: ${error.message || 'Unknown error'}`);
              }
              
              fallbackResult = createData;
            }
            
            // Use the fallback result
            console.log('Template saved successfully via fallback specific function:', fallbackResult);
            return fallbackResult;
          }
          
          console.log('Template saved successfully via direct RPC:', data);
          
          // Create a record of this version update for tracking history
          if (saveAsNewVersion && appliedTemplateId) {
            try {
              await recordMetadataService.createAuditRecord({
                userId: user.id,
                action: 'template_version_update',
                entityType: 'template',
                entityId: appliedTemplateId,
                entityName: templateName,
                details: {
                  previousVersion: appliedTemplateVersion,
                  newVersion: appliedTemplateVersion + 1,
                  updatedAt: new Date().toISOString(),
                  fileName: fileName,
                  sourceFileType: sourceFileType,
                  savedVia: 'direct_rpc'
                }
              });
            } catch (auditError) {
              console.warn('Failed to create audit record for template version update:', auditError);
            }
          }
        } catch (rpcError) {
          console.error('RPC method failed, trying last fallback:', rpcError);
          
          // Final fallback - try the save_template_v2 function with forced params
          const { data, error } = await supabaseClient.rpc('save_template_v2', {
            p_template_name: templateName,
            p_template_description: templateDescription || '',
            p_template_servicer_id: servicerId || null,
            p_template_file_pattern: filePattern || null,
            p_template_header_row: headerRow || 0,
            p_template_table_prefix: tablePrefix || null,
            p_template_sheet_mappings: Array.isArray(sheetMappingsJson) ? sheetMappingsJson : [],
            p_template_id: selectedTemplateId || null,
            p_template_source_file_type: sourceFileType || 'xlsx'
          });
          
          if (error) {
            console.error('Error with final fallback save_template_v2:', error);
            
            // Absolute last resort - try the specific function based on operation
            if (selectedTemplateId) {
              // Update specific
              const { data: updateData, error: updateError } = await supabaseClient.rpc('update_existing_mapping_template', {
                p_template_id: selectedTemplateId,
                p_template_name: templateName,
                p_template_description: templateDescription || '',
                p_template_servicer_id: servicerId || null,
                p_template_file_pattern: filePattern || null,
                p_template_header_row: headerRow || 0,
                p_template_table_prefix: tablePrefix || null,
                p_template_sheet_mappings: Array.isArray(sheetMappingsJson) ? sheetMappingsJson : [],
                p_template_source_file_type: sourceFileType || 'xlsx'
              });
              
              if (updateError) {
                console.error('Absolute last resort update failed:', updateError);
                throw updateError;
              }
              
              console.log('Template updated via update_existing_mapping_template:', updateData);
              return updateData;
            } else {
              // Create specific
              const { data: createData, error: createError } = await supabaseClient.rpc('create_new_mapping_template', {
                p_template_name: templateName,
                p_template_description: templateDescription || '',
                p_template_servicer_id: servicerId || null,
                p_template_file_pattern: filePattern || null,
                p_template_header_row: headerRow || 0,
                p_template_table_prefix: tablePrefix || null,
                p_template_sheet_mappings: Array.isArray(sheetMappingsJson) ? sheetMappingsJson : [],
                p_template_source_file_type: sourceFileType || 'xlsx'
              });
              
              if (createError) {
                console.error('Absolute last resort create failed:', createError);
                throw createError;
              }
              
              console.log('Template created via create_new_mapping_template:', createData);
              return createData;
            }
          }
          
          console.log('Template saved successfully via fallback method:', data);
        }
      }
      
      // Reset the versioning flag
      setSaveAsNewVersion(false);
      
      // Close dialog
      handleSaveTemplateClose();
      
      // Refresh templates list
      if (loadTemplates) {
        await loadTemplates();
      }
      
      // Success message
      const successMessage = saveAsNewVersion 
        ? `Template "${templateName}" updated to version ${appliedTemplateVersion + 1}`
        : 'Template saved successfully';
      
      console.log(successMessage);
      
      // Show success notification to user
      onError(null); // Clear any existing errors
    } catch (err) {
      // Handle error with more details
      console.error('Template save error:', err);
      onError(err instanceof Error ? 
        `Failed to save template: ${err.message}` : 
        'Failed to save template: Unknown error'
      );
    }
  };
  
  // Check if we can proceed with import
  const canImport = importableSheets.length > 0 && needsReviewCount === 0 && confirmationChecked;
  
  // Handle confirmation checkbox change
  const handleConfirmationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmationChecked(event.target.checked);
  };
  
  return (
    <Box>
      {/* Template notification if mapping was applied from a template */}
      {fromTemplate && (
        <Alert severity="info" sx={{ mb: 3 }} icon={<SaveIcon />}>
          <AlertTitle>Template Applied</AlertTitle>
          <Typography paragraph>
            The mapping was automatically applied from the template "{appliedTemplateName}".
            You can proceed directly to importing, or go back to make adjustments if needed.
          </Typography>
          
          {/* Actions explanation */}
          <Box sx={{ mb: 2, p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              What would you like to do with this template?
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={12} md={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ height: 12, width: 12, borderRadius: '50%', bgcolor: 'primary.main' }} />
                  <Typography variant="body2" fontWeight="medium">
                    One-time Adjustment
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ pl: 3 }}>
                  Modify mappings for this import only. Changes won't be saved to the template.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ height: 12, width: 12, borderRadius: '50%', bgcolor: 'success.main' }} />
                  <Typography variant="body2" fontWeight="medium">
                    Update Template
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ pl: 3 }}>
                  Change mappings and save as the next version of this template (v{appliedTemplateVersion} → v{appliedTemplateVersion + 1}).
                </Typography>
              </Grid>
            </Grid>
          </Box>
          
          {onGoBack && (
            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
              <Tooltip 
                title="Go back to adjust mappings for this import session without changing the original template"
                placement="top"
                arrow
              >
                <Button 
                  variant="outlined" 
                  size="small"
                  color="primary"
                  onClick={onGoBack}
                  startIcon={<EditIcon />}
                >
                  Adjust for This Import Only
                </Button>
              </Tooltip>
              <Tooltip 
                title={`Save your changes as version ${appliedTemplateVersion + 1} of the template. The template ID will remain the same for version tracking.`}
                placement="top"
                arrow
              >
                <Button
                  variant="contained" // Make it more prominent
                  size="small"
                  color="success"
                  onClick={() => {
                    // Set flag to show template update dialog when going back
                    sessionStorage.setItem('updateTemplateOnReturn', 'true');
                    if (onGoBack) onGoBack();
                  }}
                  startIcon={<SaveIcon />}
                >
                  Adjust and Save as v{appliedTemplateVersion + 1}
                </Button>
              </Tooltip>
            </Stack>
          )}
        </Alert>
      )}
      
      {/* Summary card */}
      <Card sx={{ mb: 3 }}>
        <CardHeader 
          title="Import Summary"
          subheader="Review and confirm the import configuration"
        />
        <Divider />
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" gutterBottom fontWeight="medium">
                Source File
              </Typography>
              
              <Typography variant="body1" gutterBottom>
                <strong>Filename:</strong> {fileName}
              </Typography>
              
              <Typography variant="body1" gutterBottom>
                <strong>Header Row:</strong> {headerRow}
              </Typography>
              
              {tablePrefix && (
                <Typography variant="body1" gutterBottom>
                  <strong>Table Prefix:</strong> {tablePrefix}
                </Typography>
              )}
              
              <Typography variant="body1">
                <strong>Sheets:</strong> {importableSheets.length} (of {sheets.length} total)
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" gutterBottom fontWeight="medium">
                Import Details
              </Typography>
              
              <Typography variant="body1" gutterBottom>
                <strong>Tables to Create:</strong> {tablesToCreate.length}
              </Typography>
              
              <Typography variant="body1" gutterBottom>
                <strong>Total Fields:</strong> {totalColumns}
              </Typography>
              
              <Typography variant="body1" gutterBottom>
                <strong>Total Rows:</strong> {totalRows}
              </Typography>
              
              {needsReviewCount > 0 && (
                <Alert severity="warning" icon={<WarningIcon />} sx={{ mt: 2 }}>
                  <AlertTitle>Attention Required</AlertTitle>
                  {needsReviewCount} sheet(s) need review before import. Please go back to the previous steps.
                </Alert>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      {/* Tables to be created */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Tables to be Created
        </Typography>
        
        <List dense>
          {importableSheets.map((sheet) => (
            <ListItem key={sheet.id}>
              <ListItemIcon>
                <TableChartIcon color="primary" />
              </ListItemIcon>
              <ListItemText 
                primary={sheet.mappedName} 
                secondary={`Source: ${sheet.originalName} • ${sheet.columns.filter(c => !c.skip).length} fields • Rows: ${sheet.rowCount || 0}`}
              />
              
              {sheet.rowCount === 0 ? (
                <Tooltip title="This table has no data rows to import">
                  <Chip 
                    label="Empty" 
                    color="default"
                    size="small"
                    icon={<WarningIcon />}
                  />
                </Tooltip>
              ) : sheet.needsReview ? (
                <Chip 
                  label="Needs Review" 
                  color="warning"
                  size="small"
                  icon={<WarningIcon />}
                />
              ) : (
                <Chip 
                  label="Ready" 
                  color="success"
                  size="small"
                  icon={<CheckCircleIcon />}
                />
              )}
            </ListItem>
          ))}
        </List>
        
        {importableSheets.length === 0 && (
          <Alert severity="error" sx={{ mt: 2 }}>
            No tables will be created. Please go back and configure at least one sheet to import.
          </Alert>
        )}
      </Paper>
      
      {/* Import confirmation */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Confirmation
        </Typography>
        
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>Please Confirm</AlertTitle>
          This action will create new tables and fields in your database. This cannot be undone.
          Make sure your data is properly mapped before proceeding.
        </Alert>
        
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Checkbox 
            checked={confirmationChecked}
            onChange={handleConfirmationChange}
            color="primary"
          />
          <Typography>
            I understand the consequences and confirm that I want to proceed with this import
          </Typography>
        </Box>
      </Paper>
      
      {/* Import results (if available) */}
      {importResults.success && (
        <Paper sx={{ p: 2, mb: 3, bgcolor: 'success.light' }}>
          <Typography variant="h6" gutterBottom color="success.contrastText">
            Import Completed Successfully
          </Typography>
          
          <List dense>
            <ListItem>
              <ListItemIcon>
                <CheckCircleIcon color="success" />
              </ListItemIcon>
              <ListItemText 
                primary={`Tables Created: ${importResults.createdTables.length}`}
                primaryTypographyProps={{ color: 'success.contrastText' }}
              />
            </ListItem>
            
            <ListItem>
              <ListItemIcon>
                <CheckCircleIcon color="success" />
              </ListItemIcon>
              <ListItemText 
                primary={`Rows Imported: ${importResults.importedRows} of ${importResults.totalRows}`} 
                primaryTypographyProps={{ color: 'success.contrastText' }}
              />
            </ListItem>
          </List>
          
          {importResults.failedSheets.length > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <AlertTitle>Partial Success</AlertTitle>
              Some sheets could not be imported:
              <ul>
                {importResults.failedSheets.map((sheet, index) => (
                  <li key={index}>{sheet}</li>
                ))}
              </ul>
            </Alert>
          )}
        </Paper>
      )}
      
      {/* Action buttons */}
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={handleSaveTemplateOpen}
            disabled={needsReviewCount > 0 || templateSaving}
          >
            Save as Template
          </Button>
          
          {/* Add version update button when a template was applied */}
          {fromTemplate && appliedTemplateId && (
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<SaveIcon />}
              onClick={() => {
                setSaveAsNewVersion(true);
                handleSaveTemplateOpen();
              }}
              disabled={needsReviewCount > 0 || templateSaving}
            >
              Save as v{appliedTemplateVersion + 1}
            </Button>
          )}
        </Stack>
        
        <Button
          variant="contained"
          color="primary"
          startIcon={loading ? <CircularProgress size={20} /> : <PlayArrowIcon />}
          onClick={handleExecuteImport}
          disabled={!canImport || loading || progress.stage === 'importing'}
        >
          {loading ? 'Importing...' : 'Execute Import'}
        </Button>
      </Stack>
      
      {/* Save Template Dialog */}
      <Dialog open={saveTemplateOpen} onClose={handleSaveTemplateClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {saveAsNewVersion 
            ? `Update Template to v${appliedTemplateVersion + 1}` 
            : 'Save Import Template'}
        </DialogTitle>
        <DialogContent>
          {saveAsNewVersion && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <AlertTitle>Updating Existing Template</AlertTitle>
              <Typography variant="body2">
                You are creating version {appliedTemplateVersion + 1} of "{appliedTemplateName}".
                This will preserve the same template ID, making it easier to track changes over time.
              </Typography>
            </Alert>
          )}
          
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                autoFocus
                margin="dense"
                label="Template Name"
                fullWidth
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                disabled={saveAsNewVersion} // Keep the name the same when updating a version
                helperText={saveAsNewVersion ? "Template name is preserved across versions" : "Enter a descriptive name for this template"}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                margin="dense"
                label="Description"
                fullWidth
                multiline
                rows={2}
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                helperText={saveAsNewVersion ? "Consider noting what has changed in this version" : "Describe what type of files this template is for"}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <TextField
                  margin="dense"
                  label="File Pattern"
                  fullWidth
                  placeholder="e.g., *_loan_report.xlsx"
                  value={filePattern}
                  onChange={(e) => setFilePattern(e.target.value)}
                />
                <Tooltip 
                  title="File pattern is used to automatically match templates to uploaded files. Use wildcards like * to match any characters. e.g., monthly_*.xlsx" 
                  placement="top"
                  arrow
                >
                  <IconButton sx={{ mt: 1 }}>
                    <HelpOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Grid container spacing={2}>
                <Grid item xs={7}>
                  <FormControl fullWidth margin="dense">
                    <InputLabel id="servicer-select-label">Servicer</InputLabel>
                    <Select
                      labelId="servicer-select-label"
                      id="servicer-select"
                      value={servicerId}
                      onChange={(e) => setServicerId(e.target.value)}
                      label="Servicer"
                      disabled={loadingServicers}
                    >
                      <MenuItem value="">
                        <em>None (All Servicers)</em>
                      </MenuItem>
                      {servicers.map((servicer) => (
                        <MenuItem key={servicer.id} value={servicer.id}>
                          {servicer.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={5}>
                  <FormControl fullWidth margin="dense">
                    <InputLabel id="file-type-select-label">File Type</InputLabel>
                    <Select
                      labelId="file-type-select-label"
                      id="file-type-select"
                      value={sourceFileType}
                      onChange={(e) => setSourceFileType(e.target.value as SourceFileType)}
                      label="File Type"
                    >
                      <MenuItem value="xlsx">Excel (XLSX)</MenuItem>
                      <MenuItem value="csv">CSV</MenuItem>
                      <MenuItem value="json">JSON</MenuItem>
                      <MenuItem value="txt">Text</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Grid>
            
            {/* Version information for existing templates */}
            {saveAsNewVersion && (
              <Grid item xs={12}>
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Version Information
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 4 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Current Version
                      </Typography>
                      <Typography variant="body2" fontWeight="medium">
                        v{appliedTemplateVersion}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        New Version
                      </Typography>
                      <Typography variant="body2" fontWeight="medium" color="success.main">
                        v{appliedTemplateVersion + 1}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Template ID
                      </Typography>
                      <Typography variant="body2" fontWeight="medium" 
                        sx={{ 
                          maxWidth: '180px', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis',
                          fontSize: '0.75rem' 
                        }}
                      >
                        {appliedTemplateId}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleSaveTemplateClose}>Cancel</Button>
          <Button 
            onClick={handleSaveTemplate} 
            variant="contained"
            disabled={!templateName || templateSaving}
            startIcon={templateSaving ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            {saveAsNewVersion 
              ? `Save as v${appliedTemplateVersion + 1}` 
              : 'Save Template'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ReviewImportStep;