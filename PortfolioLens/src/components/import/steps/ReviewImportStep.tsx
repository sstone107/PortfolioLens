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

interface ReviewImportStepProps {
  onError: (error: string | null) => void;
}

/**
 * Step 4: Review and import component
 */
export const ReviewImportStep: React.FC<ReviewImportStepProps> = ({
  onError
}) => {
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [filePattern, setFilePattern] = useState('');
  const [servicerId, setServicerId] = useState<string>('');
  const [servicers, setServicers] = useState<Servicer[]>([]);
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [loadingServicers, setLoadingServicers] = useState(false);
  
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
    const baseTemplateName = fileName.split('.')[0] || 'Import Template';
    setTemplateName(baseTemplateName);
    setTemplateDescription(`Template for ${fileName}`);
    
    // Generate and set an automatic file pattern
    const filePattern = generateFilePattern(fileName);
    setFilePattern(filePattern);
    
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
      
      // Prepare sheet mappings JSON
      const sheetMappingsJson = sheets.map(sheet => ({
        id: sheet.id,
        originalName: sheet.originalName,
        mappedName: sheet.mappedName,
        headerRow: sheet.headerRow,
        skip: sheet.skip,
        columns: sheet.columns
      }));
      
      // First, generate a UUID for the template
      const templateId = uuidv4();
      
      console.log('Saving template with full sheet mappings data:', {
        templateId,
        templateName,
        description: templateDescription,
        servicerId,
        filePattern,
        sheetMappingsCount: sheetMappingsJson.length
      });
      
      // Use the save_mapping_template RPC function
      const { data, error } = await supabaseClient.rpc('save_mapping_template', {
        template_name: templateName,
        template_description: templateDescription,
        servicer_id: servicerId || null,
        file_pattern: filePattern || null,
        header_row: headerRow,
        table_prefix: tablePrefix || null,
        sheet_mappings: sheetMappingsJson,
        user_id: user.id,
        template_id: templateId
      });
      
      if (error) {
        console.error('Template save error:', error);
        throw new Error(`RPC Error: ${error.message || 'Unknown error'}`);
      }
      
      // Close dialog
      handleSaveTemplateClose();
      
      // Refresh templates list
      if (loadTemplates) {
        await loadTemplates();
      }
      
      // Success message
      console.log('Template saved successfully:', templateId);
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
                secondary={`Source: ${sheet.originalName} • ${sheet.columns.filter(c => !c.skip).length} fields`}
              />
              
              {sheet.needsReview ? (
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
        <Button
          variant="outlined"
          startIcon={<SaveIcon />}
          onClick={handleSaveTemplateOpen}
          disabled={needsReviewCount > 0 || templateSaving}
        >
          Save as Template
        </Button>
        
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
        <DialogTitle>Save Import Template</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                autoFocus
                margin="dense"
                label="Template Name"
                fullWidth
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
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
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ReviewImportStep;