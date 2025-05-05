import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  Tooltip,
  LinearProgress,
  Alert,
  AlertTitle,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Divider
} from '@mui/material';
import { ExpandMore, ExpandLess, Error as ErrorIcon } from '@mui/icons-material';

interface ImportResultsDisplayProps {
  isImporting: boolean;
  importProgress: number;
  importResults: Record<string, {
    success: boolean;
    message: string;
    rowCount: number;
    columnsCreated?: string[];
  }>;
  sheetTableMappings: Record<string, string>;
}

/**
 * Component for displaying import progress and results
 */
export const ImportResultsDisplay: React.FC<ImportResultsDisplayProps> = ({
  isImporting,
  importProgress,
  importResults,
  sheetTableMappings,
}) => {
  // State to track expanded error details
  const [expandedErrors, setExpandedErrors] = React.useState<Record<string, boolean>>({});

  // Toggle error details expansion
  const toggleErrorDetails = (sheetName: string) => {
    setExpandedErrors(prev => ({
      ...prev,
      [sheetName]: !prev[sheetName]
    }));
  };

  // Helper to check if there are any failures
  const hasFailures = React.useMemo(() => {
    return Object.values(importResults).some(result => !result.success);
  }, [importResults]);

  // If import is in progress, show progress bar
  if (isImporting) {
    return (
      <Box sx={{ mt: 3 }}>
        <Typography variant="body2" gutterBottom>
          Importing sheets...
        </Typography>
        <LinearProgress 
          variant="determinate" 
          value={importProgress} 
          sx={{ mb: 1 }}
        />
        <Typography variant="body2" align="right">
          {importProgress}%
        </Typography>
      </Box>
    );
  }

  // If there are results and import is done, show results summary
  if (Object.keys(importResults).length > 0) {
    // Extract any global errors (not associated with a specific sheet)
    const globalError = importResults['error'] ? importResults['error'].message : null;
    
    return (
      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Import Results
        </Typography>
        
        {/* Global Error Alert */}
        {globalError && (
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            variant="filled"
          >
            <AlertTitle>Import Error</AlertTitle>
            {globalError}
          </Alert>
        )}
        
        {/* Error Summary Alert - only shown if there are sheet-specific failures */}
        {hasFailures && !globalError && (
          <Alert 
            severity="warning" 
            sx={{ mb: 2 }}
            variant="outlined"
            icon={<ErrorIcon />}
          >
            <AlertTitle>Some imports failed</AlertTitle>
            Please check the details below for more information. Common issues include:
            <List dense sx={{ pl: 2 }}>
              <ListItem sx={{ display: 'list-item', listStyleType: 'disc' }}>
                <ListItemText primary="Missing column mappings" />
              </ListItem>
              <ListItem sx={{ display: 'list-item', listStyleType: 'disc' }}>
                <ListItemText primary="Data type mismatches" />
              </ListItem>
              <ListItem sx={{ display: 'list-item', listStyleType: 'disc' }}>
                <ListItemText primary="Database connection issues" />
              </ListItem>
            </List>
          </Alert>
        )}
        
        {/* Results Table */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1} divider={<Divider flexItem />}>
            {Object.entries(importResults)
              .filter(([key]) => key !== 'error') // Filter out global error
              .map(([sheet, result]) => (
                <Box key={sheet}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                      {sheet} → {sheetTableMappings[sheet] || 'Unknown'}
                    </Typography>
                    {result.success ? (
                      <Chip 
                        label={`${result.rowCount} rows imported`} 
                        color="success" 
                        size="small"
                      />
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Chip 
                          label="Failed" 
                          color="error" 
                          size="small" 
                          sx={{ mr: 1 }}
                        />
                        <IconButton 
                          size="small" 
                          onClick={() => toggleErrorDetails(sheet)}
                          aria-label="Show error details"
                        >
                          {expandedErrors[sheet] ? <ExpandLess /> : <ExpandMore />}
                        </IconButton>
                      </Box>
                    )}
                  </Box>
                  
                  {/* Expandable Error Details */}
                  {!result.success && (
                    <Collapse in={expandedErrors[sheet]} timeout="auto" unmountOnExit>
                      <Box sx={{ mt: 1, mb: 1, pl: 2, borderLeft: '2px solid #d32f2f' }}>
                        <Typography variant="body2" color="error">
                          {result.message}
                        </Typography>
                      </Box>
                    </Collapse>
                  )}
                  
                  {/* Show columns created if applicable */}
                  {result.success && result.columnsCreated && result.columnsCreated.length > 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Created columns: {result.columnsCreated.join(', ')}
                    </Typography>
                  )}
                </Box>
              ))}
          </Stack>
        </Paper>
      </Box>
    );
  }

  // No import in progress and no results to show
  return null;
};
