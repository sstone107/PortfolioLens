import React, { useState, useCallback, useRef } from 'react';
import { Box, Button, Typography, CircularProgress, Paper } from '@mui/material';
import { CloudUpload as CloudUploadIcon } from '@mui/icons-material';
import { ExcelReader } from './ExcelReader';
import { WorkbookInfo } from './types';

interface ExcelUploaderProps {
  onFileLoaded: (workbookInfo: WorkbookInfo, file: File) => void;
  isLoading?: boolean;
}

/**
 * Component for uploading and analyzing Excel files
 */
export const ExcelUploader: React.FC<ExcelUploaderProps> = ({
  onFileLoaded,
  isLoading = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file) return;
    
    // Check file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Please upload a valid Excel file (.xlsx or .xls)');
      return;
    }
    
    try {
      setError(null);
      
      // Read Excel file and extract info
      const workbookInfo = await ExcelReader.readFile(file);
      // Pass both the workbook info and the original file object to parent
      onFileLoaded(workbookInfo, file);
    } catch (err) {
      console.error('Error reading Excel file:', err);
      setError(`Failed to read Excel file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [onFileLoaded]);

  // Handle file input change
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  // Handle click on upload area
  const handleUploadClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  return (
    <Paper
      elevation={3}
      sx={{
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '200px',
        border: '2px dashed',
        borderColor: isDragging ? 'primary.main' : 'divider',
        borderRadius: 2,
        backgroundColor: isDragging ? 'action.hover' : 'background.paper',
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out'
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleUploadClick}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx, .xls"
        style={{ display: 'none' }}
        disabled={isLoading}
      />
      
      {isLoading ? (
        <>
          <CircularProgress size={40} />
          <Typography variant="body1" sx={{ mt: 2 }}>
            Processing Excel file...
          </Typography>
        </>
      ) : (
        <>
          <CloudUploadIcon color="primary" sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="h6" color="textPrimary">
            Drag & Drop Excel File
          </Typography>
          <Typography variant="body2" color="textSecondary" align="center" sx={{ mt: 1 }}>
            or click to browse files (.xlsx, .xls)
          </Typography>
          <Button 
            variant="outlined" 
            size="small" 
            sx={{ mt: 2 }}
            onClick={(e) => {
              e.stopPropagation();
              handleUploadClick();
            }}
          >
            Select File
          </Button>
        </>
      )}
      
      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 2 }}>
          {error}
        </Typography>
      )}
    </Paper>
  );
};
