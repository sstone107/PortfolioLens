import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  TextField,
  Snackbar,
  Paper,
  LinearProgress,
  Alert,
  AlertTitle,
  Stack,
  Divider
} from '@mui/material';
import { Check as CheckIcon, Error as ErrorIcon } from '@mui/icons-material';
import { SchemaGenerator } from './services/SchemaGenerator';

interface SchemaPreviewProps {
  sql: string;
  onExecuteComplete: (success: boolean) => void;
  onCancel: () => void;
}

/**
 * Component to preview and execute generated SQL
 */
const SchemaPreview: React.FC<SchemaPreviewProps> = ({ 
  sql, 
  onExecuteComplete,
  onCancel
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [editedSql, setEditedSql] = useState(sql);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
  
  // Execute the SQL statements
  const handleExecuteSQL = async () => {
    setIsExecuting(true);
    setExecutionResult(null);
    
    console.log('[SchemaPreview] Attempting to execute SQL:', editedSql);

    try {
      const result = await SchemaGenerator.executeSQL(editedSql);
      setExecutionResult(result);
      
      if (result.success) {
        setSnackbarMessage('Schema created successfully');
        setSnackbarSeverity('success');
      } else {
        setSnackbarMessage(`Error creating schema: ${result.message}`);
        setSnackbarSeverity('error');
      }
      
      setShowSnackbar(true);
      onExecuteComplete(result.success);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setExecutionResult({
        success: false,
        message: `Unexpected error: ${errorMessage}`
      });
      
      setSnackbarMessage(`Error executing SQL: ${errorMessage}`);
      setSnackbarSeverity('error');
      setShowSnackbar(true);
      onExecuteComplete(false);
    } finally {
      setIsExecuting(false);
    }
  };
  
  // Handle snackbar close
  const handleSnackbarClose = () => {
    setShowSnackbar(false);
  };
  
  return (
    <Paper elevation={2} sx={{ p: 3, my: 2 }}>
      <Typography variant="h6" gutterBottom>Schema Creation Preview</Typography>
      
      <Typography variant="body2" sx={{ mb: 2 }}>
        Review the SQL statements below to create the required tables and columns.
        You can edit the SQL if needed before execution.
      </Typography>
      
      <TextField
        value={editedSql}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditedSql(e.target.value)}
        multiline
        rows={12}
        fullWidth
        variant="outlined"
        InputProps={{
          style: { fontFamily: 'monospace', fontSize: '0.9rem' }
        }}
        sx={{ mb: 3 }}
        disabled={isExecuting}
      />
      
      {isExecuting && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>Executing SQL statements...</Typography>
          <LinearProgress />
        </Box>
      )}
      
      {executionResult && (
        <Alert 
          severity={executionResult.success ? 'success' : 'error'}
          variant="outlined"
          sx={{ mb: 3 }}
        >
          <AlertTitle>
            {executionResult.success ? 'Schema Created Successfully' : 'Error Creating Schema'}
          </AlertTitle>
          {executionResult.message}
        </Alert>
      )}
      
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Button 
          onClick={onCancel}
          variant="outlined"
          disabled={isExecuting}
        >
          Cancel
        </Button>
        
        <Button
          onClick={handleExecuteSQL}
          variant="contained" 
          color="primary"
          disabled={!editedSql || isExecuting}
        >
          {isExecuting ? 'Executing...' : 'Execute SQL'}
        </Button>
      </Stack>
      
      <Snackbar 
        open={showSnackbar} 
        autoHideDuration={6000} 
        onClose={handleSnackbarClose}
      >
        <Alert severity={snackbarSeverity} onClose={handleSnackbarClose}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Paper>
  );
};

export default SchemaPreview;
