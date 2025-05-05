import React from 'react';
import {
  Box,
  Alert,
  Button,
  Typography,
  Paper,
  Chip,
  Grid,
  Stack,
  Divider
} from '@mui/material';
import {
  TableChart as TableIcon,
  Description as FileIcon,
  ArrowForward as ArrowIcon
} from '@mui/icons-material';
import { FileUploader } from '../FileUploader';
import { WorkbookInfo, FileType } from '../types';

interface FileUploadStepProps {
  workbookInfo: WorkbookInfo | null;
  isLoadingTables: boolean;
  onFileLoaded: (info: WorkbookInfo, file: File) => Promise<void>;
  onContinue: () => void;
}

/**
 * Step 1 of the import process: File Upload
 */
export const FileUploadStep: React.FC<FileUploadStepProps> = ({
  workbookInfo,
  isLoadingTables,
  onFileLoaded,
  onContinue,
}) => {
  // Get file type icon based on file type
  const getFileTypeIcon = (fileType: FileType) => {
    switch (fileType) {
      case 'xlsx':
      case 'xls':
        return <TableIcon />;
      case 'csv':
      case 'tsv':
        return <FileIcon />;
      default:
        return <FileIcon />;
    }
  };

  // Get file type label
  const getFileTypeLabel = (fileType: FileType): string => {
    switch (fileType) {
      case 'xlsx':
        return 'Excel (XLSX)';
      case 'xls':
        return 'Excel (XLS)';
      case 'csv':
        return 'CSV';
      case 'tsv':
        return 'TSV';
      default:
        return 'Unknown';
    }
  };

  return (
    <Box>
      {!workbookInfo && (
        <FileUploader
          onFileLoaded={onFileLoaded}
          isLoading={isLoadingTables}
        />
      )}
      
      {workbookInfo && (
        <Box sx={{ mt: 3 }}>
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  File Successfully Loaded
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      File Name
                    </Typography>
                    <Typography variant="body1">
                      {workbookInfo.fileName}
                    </Typography>
                  </Box>
                  
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      File Type
                    </Typography>
                    <Chip
                      icon={getFileTypeIcon(workbookInfo.fileType)}
                      label={getFileTypeLabel(workbookInfo.fileType)}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  </Box>
                </Stack>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Sheets Detected
                    </Typography>
                    <Typography variant="body1">
                      {workbookInfo.sheets.length} sheet{workbookInfo.sheets.length !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                  
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Total Columns
                    </Typography>
                    <Typography variant="body1">
                      {workbookInfo.sheets.reduce((sum, sheet) => sum + sheet.columnCount, 0)} columns across all sheets
                    </Typography>
                  </Box>
                </Stack>
              </Grid>
              
              <Grid item xs={12}>
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    onClick={onContinue}
                    endIcon={<ArrowIcon />}
                    size="large"
                  >
                    Continue to Map Tables
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Box>
      )}
    </Box>
  );
};
