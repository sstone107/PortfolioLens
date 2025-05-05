import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Box, 
  Button, 
  Typography, 
  CircularProgress, 
  Paper, 
  Chip,
  LinearProgress,
  Stack,
  Tooltip
} from '@mui/material';
import { 
  CloudUpload as CloudUploadIcon,
  InsertDriveFile as FileIcon,
  Description as CsvIcon,
  TableChart as ExcelIcon
} from '@mui/icons-material';
import { FileReader } from './FileReader';
import { WorkbookInfo, FileType } from './types';

interface FileUploaderProps {
  onFileLoaded: (workbookInfo: WorkbookInfo, file: File) => void;
  isLoading?: boolean;
}

/**
 * Component for uploading and analyzing Excel and CSV files
 */
export const FileUploader: React.FC<FileUploaderProps> = ({
  onFileLoaded,
  isLoading = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Simulate progress for better UX during file processing
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setProcessingProgress(prev => {
          // Cap at 90% until actual completion
          const newProgress = prev + (90 - prev) * 0.1;
          return Math.min(newProgress, 90);
        });
        
        // Update processing stage messages
        if (processingProgress < 30) {
          setProcessingStage('Reading file contents...');
        } else if (processingProgress < 60) {
          setProcessingStage('Analyzing data structure...');
        } else {
          setProcessingStage('Preparing data preview...');
        }
      }, 300);
      
      return () => {
        clearInterval(interval);
        // Reset to 0 when loading is complete
        setProcessingProgress(0);
      };
    }
  }, [isLoading, processingProgress]);

  // Get file type icon based on extension
  const getFileTypeIcon = (fileType: FileType) => {
    switch (fileType) {
      case 'xlsx':
      case 'xls':
        return <ExcelIcon />;
      case 'csv':
      case 'tsv':
        return <CsvIcon />;
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

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file) return;
    
    // Check file type
    const validExtensions = ['.xlsx', '.xls', '.csv', '.tsv', '.txt'];
    const hasValidExtension = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!hasValidExtension) {
      setError(`Unsupported file format. Please upload a valid file (${validExtensions.join(', ')})`);
      return;
    }
    
    try {
      setError(null);
      setProcessingProgress(10); // Start progress indication
      
      // Read file and extract info
      const workbookInfo = await FileReader.readFile(file);
      
      // Complete the progress
      setProcessingProgress(100);
      
      // Pass both the workbook info and the original file object to parent
      onFileLoaded(workbookInfo, file);
    } catch (err) {
      console.error('Error reading file:', err);
      setError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
      setProcessingProgress(0);
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
        height: '250px',
        border: '2px dashed',
        borderColor: isDragging ? 'primary.main' : 'divider',
        borderRadius: 2,
        backgroundColor: isDragging ? 'action.hover' : 'background.paper',
        cursor: isLoading ? 'default' : 'pointer',
        transition: 'all 0.2s ease-in-out',
        position: 'relative',
        overflow: 'hidden'
      }}
      onDragEnter={!isLoading ? handleDragEnter : undefined}
      onDragLeave={!isLoading ? handleDragLeave : undefined}
      onDragOver={!isLoading ? handleDragOver : undefined}
      onDrop={!isLoading ? handleDrop : undefined}
      onClick={!isLoading ? handleUploadClick : undefined}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx,.xls,.csv,.tsv,.txt"
        style={{ display: 'none' }}
        disabled={isLoading}
      />
      
      {isLoading ? (
        <Box sx={{ width: '100%', textAlign: 'center' }}>
          <CircularProgress size={40} />
          <Typography variant="body1" sx={{ mt: 2, mb: 1 }}>
            {processingStage}
          </Typography>
          <Box sx={{ width: '80%', mx: 'auto', mt: 2 }}>
            <LinearProgress 
              variant="determinate" 
              value={processingProgress} 
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        </Box>
      ) : (
        <>
          <CloudUploadIcon color="primary" sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="h6" color="textPrimary">
            Drag & Drop File
          </Typography>
          
          <Stack direction="row" spacing={1} sx={{ mt: 2, mb: 2 }}>
            <Tooltip title="Excel Workbook">
              <Chip 
                icon={<ExcelIcon />} 
                label="XLSX/XLS" 
                size="small" 
                color="primary" 
                variant="outlined" 
              />
            </Tooltip>
            <Tooltip title="Comma Separated Values">
              <Chip 
                icon={<CsvIcon />} 
                label="CSV" 
                size="small" 
                color="primary" 
                variant="outlined" 
              />
            </Tooltip>
            <Tooltip title="Tab Separated Values">
              <Chip 
                icon={<CsvIcon />} 
                label="TSV" 
                size="small" 
                color="primary" 
                variant="outlined" 
              />
            </Tooltip>
          </Stack>
          
          <Button 
            variant="contained" 
            size="medium" 
            startIcon={<CloudUploadIcon />}
            sx={{ mt: 1 }}
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
        <Box 
          sx={{ 
            position: 'absolute', 
            bottom: 0, 
            left: 0, 
            right: 0, 
            bgcolor: 'error.light', 
            color: 'error.contrastText',
            p: 1,
            textAlign: 'center'
          }}
        >
          <Typography variant="body2">
            {error}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};