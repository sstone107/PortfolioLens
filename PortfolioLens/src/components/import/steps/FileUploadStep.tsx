/**
 * File Upload Step component
 * First step in the import wizard
 */
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Stack,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Alert,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Button,
  Paper,
  Grid,
  Snackbar
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useBatchImportStore } from '../../../store/batchImportStore';
import FileUploader from '../FileUploader';
import { useMappingTemplates } from '../BatchImporterHooks';
import { findMatchingTemplate } from '../mappingLogic';

interface FileUploadStepProps {
  onHeaderRowChange: (row: number) => void;
  onFileLoaded?: () => void;
  onSheetsLoaded?: (sheets: any[]) => void;
  onTemplateApplied?: (template: any) => void;
  onError?: (error: string) => void;
}

/**
 * Step 1: File Upload component
 */
export const FileUploadStep: React.FC<FileUploadStepProps> = ({
  onHeaderRowChange,
  onFileLoaded,
  onSheetsLoaded,
  onTemplateApplied,
  onError
}) => {
  // Access batch import store
  const {
    fileName,
    fileType,
    headerRow,
    tablePrefix,
    selectedTemplateId,
    setSelectedTemplateId
  } = useBatchImportStore();
  
  // Load mapping templates
  const { templates, loading: templatesLoading } = useMappingTemplates();
  
  // State for uploaded files and auto-matching
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autoMatchedTemplate, setAutoMatchedTemplate] = useState<string | null>(null);
  const [showAutoMatchNotification, setShowAutoMatchNotification] = useState(false);
  
  // Auto-match template based on file name pattern
  useEffect(() => {
    const autoMatchTemplate = async () => {
      // Only auto-match if we have a file name and no template is already selected
      if (fileName && !selectedTemplateId && templates.length > 0) {
        try {
          console.log(`Attempting to match template for file: ${fileName}`);
          const matchedTemplate = await findMatchingTemplate(fileName, templates);
          
          if (matchedTemplate) {
            console.log(`Template automatically matched: ${matchedTemplate.name}`);
            
            // Set the template in the store
            setSelectedTemplateId(matchedTemplate.id);
            
            // Update local state to show notification
            setAutoMatchedTemplate(matchedTemplate.name);
            setShowAutoMatchNotification(true);
            
            // Notify parent that template was applied to possibly skip steps
            if (onTemplateApplied) {
              console.log('Calling onTemplateApplied with matched template');
              onTemplateApplied(matchedTemplate);
            }
          } else {
            console.log('No matching template found for this file');
          }
        } catch (error) {
          console.error('Error auto-matching template:', error);
          if (onError) {
            onError('Error matching template: ' + (error instanceof Error ? error.message : String(error)));
          }
        }
      }
    };
    
    autoMatchTemplate();
  }, [fileName, selectedTemplateId, templates, setSelectedTemplateId, onTemplateApplied, onError]);
  
  // Handle header row change
  const handleHeaderRowChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const row = parseInt(e.target.value, 10);
    if (!isNaN(row) && row >= 0) {
      onHeaderRowChange(row);
    }
  };
  
  // Table prefix has been moved to TableMappingStep
  
  // Handle template selection
  const handleTemplateChange = (e: SelectChangeEvent) => {
    const templateId = e.target.value || null;
    setSelectedTemplateId(templateId);
    
    // Clear auto-matched notification if user manually changes the template
    setAutoMatchedTemplate(null);
    
    // If user selected a template, notify parent component
    if (templateId && onTemplateApplied) {
      const selectedTemplate = templates.find(t => t.id === templateId);
      if (selectedTemplate) {
        console.log(`Template manually selected: ${selectedTemplate.name}`);
        onTemplateApplied(selectedTemplate);
      }
    }
  };
  
  // Close auto-match notification
  const handleCloseNotification = () => {
    setShowAutoMatchNotification(false);
  };
  
  return (
    <Box>
      {/* Upload area */}
      <Card sx={{ mb: 3 }}>
        <CardHeader 
          title="Upload Excel or CSV File"
          subheader="Select a file to import into Supabase"
          avatar={<UploadFileIcon color="primary" />}
        />
        <Divider />
        <CardContent>
          <FileUploader />
        </CardContent>
      </Card>
      
      {/* Import settings */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom fontWeight="medium">
              Basic Settings
            </Typography>
            
            <Stack spacing={2}>
              <TextField
                label="Header Row"
                type="number"
                // Display 1-based for user
                value={headerRow + 1}
                onChange={(e) => {
                  // Convert from 1-based (UI) to 0-based (internal)
                  const uiValue = parseInt(e.target.value, 10);
                  const internalValue = uiValue - 1;
                  if (!isNaN(uiValue) && uiValue >= 1) {
                    onHeaderRowChange(internalValue);
                  }
                }}
                helperText="Row number that contains column headers (starts at 1)"
                InputProps={{ inputProps: { min: 1 } }}
                fullWidth
              />
            </Stack>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom fontWeight="medium">
              Mapping Templates
            </Typography>
            
            <FormControl fullWidth>
              <InputLabel>Apply Template</InputLabel>
              <Select
                value={selectedTemplateId || ''}
                label="Apply Template"
                onChange={handleTemplateChange}
                disabled={templatesLoading || templates.length === 0}
              >
                <MenuItem value="">None (Auto-detect)</MenuItem>
                {templates.map(template => (
                  <MenuItem key={template.id || `template-${template.name}`} value={template.id}>
                    {template.name}
                    {autoMatchedTemplate === template.name && (
                      <AutoAwesomeIcon 
                        fontSize="small" 
                        color="primary" 
                        sx={{ ml: 1 }}
                      />
                    )}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            {templates.length === 0 && !templatesLoading && (
              <Alert severity="info" sx={{ mt: 2 }}>
                No mapping templates available. Templates will be created after successful imports.
              </Alert>
            )}
            
            {autoMatchedTemplate && selectedTemplateId && (
              <Alert severity="success" sx={{ mt: 2 }} icon={<AutoAwesomeIcon />}>
                Template "{autoMatchedTemplate}" automatically matched based on file name pattern.
              </Alert>
            )}
          </Grid>
        </Grid>
        
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button 
            variant="text" 
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
          </Button>
        </Box>
        
        {/* Advanced settings */}
        {showAdvanced && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle1" gutterBottom fontWeight="medium">
              Advanced Settings
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Service Account ID"
                  fullWidth
                  helperText="Optional service account for import execution"
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  label="Import Batch Size"
                  type="number"
                  defaultValue={100}
                  fullWidth
                  helperText="Number of rows per batch (for large files)"
                  InputProps={{ inputProps: { min: 10, max: 10000 } }}
                />
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>
      
      {fileName && (
        <Alert severity="success" icon={<UploadFileIcon />}>
          File "{fileName}" uploaded successfully.
          {fileType === 'excel' ? ' All sheets will be processed.' : ' CSV data will be imported.'}
          {headerRow > 0 && ` Using row ${headerRow} as headers.`}
        </Alert>
      )}
      
      {/* Auto-match notification */}
      <Snackbar
        open={showAutoMatchNotification}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        message={`Template "${autoMatchedTemplate}" automatically matched based on file name pattern`}
        action={
          <Button color="primary" size="small" onClick={handleCloseNotification}>
            OK
          </Button>
        }
      />
    </Box>
  );
};

export default FileUploadStep;