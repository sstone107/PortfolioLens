/**
 * File Upload Step component
 * First step in the import wizard
 */
import React, { useState } from 'react';
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
  Grid
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useBatchImportStore } from '../../../store/batchImportStore';
import FileUploader from '../FileUploader';
import { useMappingTemplates } from '../BatchImporterHooks';

interface FileUploadStepProps {
  onHeaderRowChange: (row: number) => void;
}

/**
 * Step 1: File Upload component
 */
export const FileUploadStep: React.FC<FileUploadStepProps> = ({
  onHeaderRowChange
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
  
  // State for uploaded files
  const [showAdvanced, setShowAdvanced] = useState(false);
  
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
    setSelectedTemplateId(e.target.value || null);
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
                  <MenuItem key={template.id} value={template.id}>
                    {template.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            {templates.length === 0 && !templatesLoading && (
              <Alert severity="info" sx={{ mt: 2 }}>
                No mapping templates available. Templates will be created after successful imports.
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
    </Box>
  );
};

export default FileUploadStep;