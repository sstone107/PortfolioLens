/**
 * Review and Import Step component
 * Final step in the import wizard
 */
import React, { useState } from 'react';
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
  Chip
} from '@mui/material';
import TableChartIcon from '@mui/icons-material/TableChart';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useBatchImportStore, MappingTemplate } from '../../../store/batchImportStore';
import { useBatchImport, useMappingTemplates } from '../BatchImporterHooks';
import { v4 as uuidv4 } from 'uuid';

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
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  
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
  
  // Import functionality
  const { executeImport, loading, error } = useBatchImport();
  const { saveTemplate, loading: templateSaving } = useMappingTemplates();
  
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
    
    if (!success && error) {
      onError(error);
    } else {
      onError(null);
    }
  };
  
  // Handle save template dialog open
  const handleSaveTemplateOpen = () => {
    setTemplateName(fileName.split('.')[0] || 'Import Template');
    setTemplateDescription(`Template for ${fileName}`);
    setSaveTemplateOpen(true);
  };
  
  // Handle save template dialog close
  const handleSaveTemplateClose = () => {
    setSaveTemplateOpen(false);
  };
  
  // Handle save template
  const handleSaveTemplate = async () => {
    try {
      // Create template object
      const template: Partial<MappingTemplate> = {
        id: uuidv4(),
        name: templateName,
        description: templateDescription,
        headerRow,
        tablePrefix: tablePrefix || undefined,
        sheetMappings: sheets.map(sheet => ({
          id: sheet.id,
          originalName: sheet.originalName,
          mappedName: sheet.mappedName,
          headerRow: sheet.headerRow,
          skip: sheet.skip,
          columns: sheet.columns
        })),
        createdBy: 'current_user', // This would be the actual user ID
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        reviewOnly: false
      };
      
      // Save template
      await saveTemplate(template);
      
      // Close dialog
      handleSaveTemplateClose();
    } catch (err) {
      // Handle error
      onError(err instanceof Error ? err.message : 'Failed to save template');
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
      <Dialog open={saveTemplateOpen} onClose={handleSaveTemplateClose}>
        <DialogTitle>Save Import Template</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Template Name"
            fullWidth
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            sx={{ mb: 2 }}
          />
          
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            multiline
            rows={3}
            value={templateDescription}
            onChange={(e) => setTemplateDescription(e.target.value)}
          />
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