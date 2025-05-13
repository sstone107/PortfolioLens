/**
 * Test implementation of the refactored ColumnMappingStepVirtualized component
 * 
 * This file provides a way to test the refactored component in isolation
 * before integrating it into the main application.
 */
import React, { useState } from 'react';
import { Box, Button, Paper, Typography, Alert } from '@mui/material';
import { ColumnMappingStepRefactored } from './ColumnMapping/ColumnMappingStepRefactored';

const TestRefactoredUI: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);

  const handleSheetSelect = (sheetId: string | null) => {
    console.log('Selected sheet:', sheetId);
    setSelectedSheetId(sheetId);
  };

  const handleError = (errorMessage: string | null) => {
    console.error('Error:', errorMessage);
    setError(errorMessage);
  };

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Refactored Column Mapping Test
        </Typography>
        <Typography variant="body1" paragraph>
          This page tests the refactored ColumnMappingStepVirtualized component.
        </Typography>
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Selected Sheet ID: {selectedSheetId || 'None'}
        </Typography>
      </Paper>

      {/* The refactored component */}
      <ColumnMappingStepRefactored
        onSheetSelect={handleSheetSelect}
        onError={handleError}
      />
    </Box>
  );
};

export default TestRefactoredUI;