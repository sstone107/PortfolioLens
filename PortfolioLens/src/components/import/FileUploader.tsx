/**
 * File uploader component for Excel/CSV imports
 */
import React, { useState, useRef, useCallback } from 'react';
import { Box, Button, Typography, Paper, LinearProgress, Alert, Stack } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ErrorIcon from '@mui/icons-material/Error';
import { readFile } from './FileReader';
import { useBatchImportStore } from '../../store/batchImportStore';

interface FileUploaderProps {
  onFileProcessed?: () => void;
  allowedFileTypes?: string[];
  maxFileSizeMB?: number;
}

/**
 * Drag and drop file uploader with progress indication
 */
export const FileUploader: React.FC<FileUploaderProps> = ({ 
  onFileProcessed, 
  allowedFileTypes = ['.xlsx', '.xls', '.csv'],
  maxFileSizeMB = 10
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Use batch import store
  const { 
    fileName, 
    fileType, 
    fileSize,
    headerRow,
    tablePrefix,
    setFile, 
    setSheets,
    setProgress
  } = useBatchImportStore();
  
  // Format bytes to human-readable size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Handle file selection
  const handleFile = useCallback(async (file: File) => {
    // Reset error state
    setError(null);
    
    // Validate file type
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedFileTypes.includes(fileExt)) {
      setError(`Invalid file type. Please upload one of: ${allowedFileTypes.join(', ')}`);
      return;
    }
    
    // Validate file size
    const maxSizeBytes = maxFileSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError(`File too large. Maximum size is ${maxFileSizeMB} MB`);
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Update progress state
      setProgress({
        stage: 'reading',
        message: `Reading file: ${file.name}`,
        percent: 10
      });
      
      // Read the file
      const result = await readFile(file, {
        headerRow,
        tablePrefixOptions: {
          usePrefix: !!tablePrefix,
          prefix: tablePrefix
        }
      });
      
      // Read file as ArrayBuffer for background import
      const fileArrayBuffer = await file.arrayBuffer();
      
      // Update store with file info and raw data
      setFile(result.fileName, result.fileType, fileArrayBuffer, result.fileSize);
      
      // Update sheets data
      setSheets(result.sheets);

      // Update progress
      setProgress({
        stage: 'analyzing',
        message: 'File processed successfully, running auto-mapping...',
        percent: 75
      });

      // Keep the analyzing stage active for a longer period to hide the UI transitions
      // This gives more time for the TableMappingStep loading screen to fully take over
      setTimeout(() => {
        // This would typically be handled by a dedicated function like handleAutoMap()
        // but we're simulating it here to auto-run sheet matching before user interaction
        console.log("Auto-initializing table mapping...");

        // Keep analysis stage running longer to prevent UI flashes
        setProgress({
          stage: 'analyzing',  // Keep in analyzing stage to maintain full-screen loading
          message: 'Optimizing table mappings and preparing suggestions...',
          percent: 85
        });

        // Only complete processing after a longer delay
        setTimeout(() => {
          setProgress({
            stage: 'complete',
            message: 'File processed and mapped successfully',
            percent: 100
          });
        }, 2000); // Additional 2 second delay before showing UI
      }, 500);
      
      // Trigger callback
      if (onFileProcessed) {
        onFileProcessed();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file');
      
      // Update progress to failed state
      setProgress({
        stage: 'failed',
        message: err instanceof Error ? err.message : 'Failed to process file',
        percent: 0
      });
    } finally {
      setIsLoading(false);
    }
  }, [headerRow, tablePrefix, allowedFileTypes, maxFileSizeMB, onFileProcessed, setFile, setSheets, setProgress]);
  
  // Handle click upload
  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };
  
  // Handle file input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };
  
  // Handle drag events
  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };
  
  // Handle drop event
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };
  
  return (
    <Paper elevation={2} sx={{ p: 2, mb: 2 }}>
      <Box sx={{ width: '100%' }}>
        {/* File upload area */}
        <Box
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          sx={{
            border: '2px dashed',
            borderColor: dragActive ? 'primary.main' : 'grey.400',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: dragActive ? 'rgba(25, 118, 210, 0.04)' : 'transparent',
            transition: 'all 0.2s',
            '&:hover': {
              borderColor: 'primary.main',
              backgroundColor: 'rgba(25, 118, 210, 0.04)'
            }
          }}
          onClick={handleClickUpload}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={allowedFileTypes.join(',')}
            style={{ display: 'none' }}
            onChange={handleChange}
          />
          
          <UploadFileIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          
          <Typography variant="h6" component="div" gutterBottom>
            Drag & drop your file here
          </Typography>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            or click to browse
          </Typography>
          
          <Button variant="contained" disableElevation>
            Browse Files
          </Button>
          
          <Typography variant="caption" display="block" sx={{ mt: 2 }}>
            Supported formats: {allowedFileTypes.join(', ')} (Max: {maxFileSizeMB}MB)
          </Typography>
        </Box>
        
        {/* Loading indicator */}
        {isLoading && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress variant="indeterminate" />
            <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
              Reading file, please wait...
            </Typography>
          </Box>
        )}
        
        {/* Error message */}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} icon={<ErrorIcon />}>
            {error}
          </Alert>
        )}
        
        {/* File info when uploaded */}
        {fileName && !isLoading && (
          <Stack 
            direction="row" 
            spacing={2} 
            alignItems="center" 
            sx={{ 
              mt: 2, 
              p: 2, 
              borderRadius: 1, 
              backgroundColor: 'success.light', 
              color: 'success.contrastText' 
            }}
          >
            <InsertDriveFileIcon />
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle2">{fileName}</Typography>
              <Typography variant="caption">
                {formatFileSize(fileSize)} • {fileType.toUpperCase()}
              </Typography>
            </Box>
            <Button 
              variant="contained" 
              size="small" 
              onClick={handleClickUpload}
              sx={{ bgcolor: 'success.dark' }}
            >
              Replace
            </Button>
          </Stack>
        )}
      </Box>
    </Paper>
  );
};

export default FileUploader;