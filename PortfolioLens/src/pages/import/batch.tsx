import React, { useState, useCallback, useEffect } from 'react';
import {
  Container,
  Typography,
  Paper,
  Box,
  Alert,
  AlertTitle,
  Breadcrumbs,
  Link,
  Divider,
  Snackbar,
  IconButton,
  Button,
  CircularProgress
} from '@mui/material';
import {
  Home as HomeIcon,
  CloudUpload as UploadIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
// Import the original component, but we'll wrap it with error handling
import { BatchImporter as OriginalBatchImporter } from '../../components/import/BatchImporter';

// Create a proper error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode, fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode, fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    // Update state so the next render will show the fallback UI
    console.error("ErrorBoundary caught an error:", error);
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to console
    console.error("Error in component:", error, errorInfo);
    
    // Clear localStorage if this is a maximum update depth error
    if (error.message && error.message.includes("Maximum update depth exceeded")) {
      console.warn("Detected infinite update loop! Clearing localStorage to prevent future issues");
      try {
        localStorage.clear();
      } catch (e) {
        console.error("Failed to clear localStorage:", e);
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

// Create a fallback/safe version of the component
const SafeBatchImporter: React.FC<{ onImportComplete?: () => void }> = ({ onImportComplete }) => {
  const [isFixing, setIsFixing] = useState(false);
  
  // The fallback UI to show when there's an error
  const ErrorFallback = (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      <Typography variant="h6" gutterBottom>
        There was an error loading the batch import feature
      </Typography>
      <Typography variant="body1" paragraph>
        Our team is working on a fix. You can try the following:
      </Typography>
      <Box sx={{ mt: 2 }}>
        <Button 
          variant="contained" 
          color="primary" 
          onClick={() => window.location.reload()}
          sx={{ mr: 2 }}
        >
          Reload Page
        </Button>
        <Button 
          variant="outlined" 
          onClick={() => {
            setIsFixing(true);
            // Clear local storage (which might contain corrupted state)
            localStorage.clear();
            
            // Wait a moment and reload
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }}
          disabled={isFixing}
        >
          {isFixing ? <CircularProgress size={24} /> : "Reset Storage & Reload"}
        </Button>
      </Box>
    </Box>
  );
  
  // Wrap the original component in an error boundary
  return (
    <ErrorBoundary fallback={ErrorFallback}>
      <OriginalBatchImporter onImportComplete={onImportComplete} />
    </ErrorBoundary>
  );
};

/**
 * Enhanced page for batch importing multiple files (Excel, CSV, TSV) simultaneously
 * This page integrates the enhanced batch import feature with support for:
 * - Multi-format support (XLSX, XLS, CSV, TSV)
 * - Mapping templates
 * - Column mapping with suggestions
 * - Missing column detection and creation
 * - Data enrichment test
 */
export const BatchImportPage: React.FC = () => {
  // Setting up local state that doesn't depend on Zustand
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);

  // Handle import completion
  const handleImportComplete = useCallback(() => {
    setSuccessMessage('Import completed successfully!');
    setImportSuccess(true);
    setSnackbarOpen(true);
  }, []);

  // Handle snackbar close
  const handleSnackbarClose = useCallback(() => {
    setSnackbarOpen(false);
  }, []);

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 3 }}>
        {/* Breadcrumbs navigation */}
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
          <Link
            component={RouterLink}
            to="/"
            sx={{ display: 'flex', alignItems: 'center' }}
          >
            <HomeIcon sx={{ mr: 0.5 }} fontSize="inherit" />
            Home
          </Link>
          <Typography
            sx={{ display: 'flex', alignItems: 'center' }}
            color="text.primary"
          >
            <UploadIcon sx={{ mr: 0.5 }} fontSize="inherit" />
            Batch Import
          </Typography>
        </Breadcrumbs>

        <Typography variant="h4" gutterBottom>
          Enhanced Batch Import
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Import a multi-sheet file (Excel, CSV, TSV) to map to different database tables.
        </Typography>
        
        <Divider sx={{ mb: 3 }} />
        
        {/* Main importer component with error handling */}
        <Paper elevation={3} sx={{ p: 3, mt: 2 }}>
          <SafeBatchImporter
            onImportComplete={handleImportComplete}
          />
        </Paper>
      </Box>

      {/* Success notification */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        message={successMessage}
        action={
          <IconButton
            size="small"
            aria-label="close"
            color="inherit"
            onClick={handleSnackbarClose}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />
    </Container>
  );
};

export default BatchImportPage;
