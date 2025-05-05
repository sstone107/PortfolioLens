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
 * - Data enrichment
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
          Import multiple files (Excel, CSV, TSV) simultaneously into different database tables with advanced mapping and data enrichment features.
        </Typography>
        
        {/* Feature highlights */}
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            <AlertTitle>Enhanced Features</AlertTitle>
            <ul>
              <li>Support for multiple file formats (XLSX, XLS, CSV, TSV)</li>
              <li>Intelligent column mapping with suggestions</li>
              <li>Automatic missing column detection and creation</li>
              <li>Save and reuse mapping templates</li>
              <li>Data validation and enrichment</li>
            </ul>
          </Alert>
        </Box>
        
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
