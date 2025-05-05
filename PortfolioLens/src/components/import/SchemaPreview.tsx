import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Snackbar,
  Paper,
  LinearProgress,
  Alert,
  AlertTitle,
  Stack,
  CircularProgress // Added CircularProgress
} from '@mui/material';
import { PlayArrow as PlayArrowIcon } from '@mui/icons-material'; // Removed CheckIcon, ErrorIcon, TextField, Divider
import { SchemaGenerator } from './services/SchemaGenerator';
// Removed SyntaxHighlighter import as it's no longer used
// import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * Props for the SchemaPreview component
 */
interface SchemaPreviewProps {
  // Accept procedure parameters instead of raw SQL
  procedureParams: { tableName: string, columnsJson: string }[];
  onExecuteComplete: (success: boolean) => void;
  onCancel: () => void;
}

/**
 * Component to display schema changes and allow execution via stored procedure
 */
const SchemaPreview: React.FC<SchemaPreviewProps> = ({
  procedureParams,
  onExecuteComplete,
  onCancel
}) => {
  // Remove state related to editing raw SQL
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  // Execute the stored procedure calls
  const handleExecuteSQL = async () => {
    setIsExecuting(true);
    setExecutionResult(null);

    console.log('[DEBUG SchemaPreview] Attempting to execute stored procedure calls...');
    console.log('[DEBUG SchemaPreview] Procedure Parameters:', procedureParams);

    try {
      // Execute the procedure calls using SchemaGenerator.executeSQL
      console.log('[DEBUG SchemaPreview] Calling SchemaGenerator.executeSQL with procedure parameters...');
      const result = await SchemaGenerator.executeSQL(procedureParams);
      console.log('[DEBUG SchemaPreview] SchemaGenerator.executeSQL result:', result);

      setExecutionResult(result);

      if (result.success) {
        console.log('[DEBUG SchemaPreview] Stored procedure execution successful');

        // Schema refresh is handled within SchemaGenerator.executeSQL now

        setSnackbarMessage('Schema created/updated successfully!');
        setSnackbarSeverity('success');
        onExecuteComplete(true); // Notify parent of success
      } else {
        console.error('[DEBUG SchemaPreview] Stored procedure execution failed:', result.message);
        setSnackbarMessage(`Schema execution failed: ${result.message}`);
        setSnackbarSeverity('error');
        onExecuteComplete(false); // Notify parent of failure
      }
    } catch (error) {
      console.error('[DEBUG SchemaPreview] Error executing stored procedures:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      setExecutionResult({ success: false, message: errorMsg });
      setSnackbarMessage(`Error executing schema changes: ${errorMsg}`);
      setSnackbarSeverity('error');
      onExecuteComplete(false); // Notify parent of failure
    } finally {
      setIsExecuting(false);
      setShowSnackbar(true); // Show snackbar regardless of success/failure
    }
  };

  // Handle snackbar close
  const handleSnackbarClose = () => {
    setShowSnackbar(false);
  };

  // Helper to generate a user-friendly summary of changes
  const generateChangeSummary = () => {
    if (!procedureParams || procedureParams.length === 0) {
      return "No schema changes detected.";
    }

    let summary = "";
    procedureParams.forEach(param => {
      try {
        // Add handling for CREATE TABLE if needed in the future based on tablesToCreate
        // For now, focus on ADD COLUMN
        const columns = JSON.parse(param.columnsJson);
        if (columns.length > 0) {
          summary += `Add ${columns.length} column(s) to table "${param.tableName}":\n`;
          columns.forEach((col: { columnName: string, suggestedType: string }) => {
            summary += `  - ${col.columnName} (${col.suggestedType})\n`;
          });
          summary += "\n";
        }
      } catch (e) {
        console.error("Error parsing columns JSON for summary:", e);
        summary += `Error parsing changes for table "${param.tableName}".\n\n`;
      }
    });
    return summary || "No columns to add.";
  };


  return (
    <Paper elevation={2} sx={{ p: 3, my: 2 }}>
      <Typography variant="h6" gutterBottom>Review Schema Changes</Typography>

      <Typography variant="body2" sx={{ mb: 2 }}>
        The following changes will be applied by calling a stored procedure in your database. Review carefully before executing.
      </Typography>

      {/* Display summary of changes instead of raw SQL */}
      <Box sx={{ maxHeight: '400px', overflowY: 'auto', backgroundColor: '#f5f5f5', p: 2, borderRadius: 1, mb: 2, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
        {generateChangeSummary()}
      </Box>


      {isExecuting && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>Executing schema changes...</Typography>
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
            {executionResult.success ? 'Schema Changes Applied Successfully' : 'Error Applying Schema Changes'}
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
          disabled={isExecuting || procedureParams.length === 0} // Disable if no params
          startIcon={isExecuting ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
        >
          {isExecuting ? 'Executing...' : 'Execute Changes'}
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
