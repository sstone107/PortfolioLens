/**
 * Batch Import Page
 * Main page for the Excel/CSV import functionality
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Container,
  Alert,
  Button,
  Breadcrumbs,
  Link,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HomeIcon from '@mui/icons-material/Home';
import FolderIcon from '@mui/icons-material/Folder';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import BatchImporter from '../../components/import/BatchImporter';
import { useBatchImportStore } from '../../store/batchImportStore';

/**
 * Batch Import page component
 */
const BatchImportPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  
  // Access batch import store
  const { reset, fileName } = useBatchImportStore();
  
  // Check for unsaved work before navigating away
  useEffect(() => {
    // Function to handle before unload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (fileName) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
      return undefined;
    };
    
    // Add event listener
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Clean up
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [fileName]);
  
  // Handle import completion
  const handleImportComplete = (results: any) => {
    // Show success message
    setSuccess(`Import completed successfully! Created ${results.createdTables.length} tables with ${results.importedRows} rows.`);
    
    // Reset state after a delay
    setTimeout(() => {
      reset();
    }, 2000);
  };
  
  // Handle import cancellation
  const handleImportCancel = () => {
    if (fileName) {
      // Show leave prompt if file is loaded
      setLeavePromptOpen(true);
    } else {
      // Just reload the current page if no file
      reset();
      window.location.href = '/import/batch';
    }
  };
  
  // Handle confirm leave
  const handleConfirmLeave = () => {
    setLeavePromptOpen(false);
    reset();
    // Force a complete page reload to reset all components
    window.location.href = '/import/batch';
  };
  
  // Handle cancel leave
  const handleCancelLeave = () => {
    setLeavePromptOpen(false);
  };
  
  // Handle error display close
  const handleErrorClose = () => {
    setError(null);
  };
  
  // Handle success display close
  const handleSuccessClose = () => {
    setSuccess(null);
  };
  
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <Link
          underline="hover"
          sx={{ display: 'flex', alignItems: 'center' }}
          color="inherit"
          href="/"
        >
          <HomeIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          Home
        </Link>
        <Link
          underline="hover"
          sx={{ display: 'flex', alignItems: 'center' }}
          color="inherit"
          href="/import"
        >
          <FolderIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          Import
        </Link>
        <Typography
          sx={{ display: 'flex', alignItems: 'center' }}
          color="text.primary"
        >
          <CloudUploadIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          Batch Import
        </Typography>
      </Breadcrumbs>
      
      {/* Page header */}
      <Box sx={{ mb: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Excel/CSV Batch Import
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" align="center" sx={{ maxWidth: 800 }}>
          Import data from Excel or CSV files into your database. The system will automatically match
          sheets to tables and columns to fields for easy data loading.
        </Typography>
      </Box>
      
      {/* Main content */}
      <Paper sx={{ p: 3 }}>
        <BatchImporter
          onComplete={handleImportComplete}
          onCancel={handleImportCancel}
        />
      </Paper>
      
      {/* Leave confirmation dialog */}
      <Dialog open={leavePromptOpen} onClose={handleCancelLeave}>
        <DialogTitle>Discard Import?</DialogTitle>
        <DialogContent>
          <Typography>
            You have an import in progress. If you start over now, your progress will be lost
            and you'll return to the beginning of the import process.
            Are you sure you want to discard this import?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelLeave}>Cancel</Button>
          <Button onClick={handleConfirmLeave} color="error">
            Discard Import
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Error snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={handleErrorClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleErrorClose} 
          severity="error" 
          sx={{ width: '100%' }}
          action={
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={handleErrorClose}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          }
        >
          {error}
        </Alert>
      </Snackbar>
      
      {/* Success snackbar */}
      <Snackbar
        open={!!success}
        autoHideDuration={6000}
        onClose={handleSuccessClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleSuccessClose} 
          severity="success" 
          sx={{ width: '100%' }}
          action={
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={handleSuccessClose}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          }
        >
          {success}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default BatchImportPage;