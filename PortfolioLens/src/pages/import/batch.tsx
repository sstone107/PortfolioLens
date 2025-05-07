import React, { useState, useCallback } from 'react';
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
  IconButton
} from '@mui/material';
import {
  Home as HomeIcon,
  CloudUpload as UploadIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { BatchImporter } from '../../components/import/BatchImporter';

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
        
        {/* Main importer component */}
        <Paper elevation={3} sx={{ p: 3, mt: 2 }}>
          <BatchImporter
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
