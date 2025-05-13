/**
 * ImportErrorFallback.tsx
 * Fallback component for import-related errors
 */
import React from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Paper, 
  Alert,
  Stack,
  Divider
} from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

interface ImportErrorFallbackProps {
  error?: Error;
  resetErrorBoundary?: () => void;
  onBackStep?: () => void;
}

/**
 * Fallback component for import module errors
 */
const ImportErrorFallback: React.FC<ImportErrorFallbackProps> = ({
  error,
  resetErrorBoundary,
  onBackStep
}) => {
  const handleReload = () => {
    window.location.reload();
  };

  return (
    <Paper
      elevation={3}
      sx={{
        p: 4,
        m: 2,
        borderRadius: 2,
        backgroundColor: 'background.paper',
        maxWidth: '100%'
      }}
    >
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        textAlign: 'center'
      }}>
        <ErrorOutlineIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
        
        <Typography variant="h5" gutterBottom color="error">
          Import Process Error
        </Typography>
        
        <Alert severity="error" sx={{ mb: 3, width: '100%' }}>
          {error?.message || 'An error occurred during the import process'}
        </Alert>
        
        <Typography variant="body1" sx={{ mb: 2 }}>
          There was a problem with the table mapping process.
        </Typography>
        
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          This could be due to invalid data or connection issues. You can try again or go back to the previous step.
        </Typography>
        
        <Divider sx={{ width: '100%', mb: 3 }} />
        
        <Stack direction="row" spacing={2}>
          {onBackStep && (
            <Button 
              variant="outlined" 
              startIcon={<ArrowBackIcon />} 
              onClick={onBackStep}
            >
              Previous Step
            </Button>
          )}
          
          {resetErrorBoundary && (
            <Button 
              variant="contained" 
              color="primary"
              onClick={resetErrorBoundary}
            >
              Try Again
            </Button>
          )}
          
          <Button 
            variant="contained" 
            color="secondary"
            startIcon={<RefreshIcon />} 
            onClick={handleReload}
          >
            Reload Page
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
};

export default ImportErrorFallback;