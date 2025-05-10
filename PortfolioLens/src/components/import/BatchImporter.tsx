/**
 * Main BatchImporter component that orchestrates the import workflow
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Typography,
  Paper,
  LinearProgress,
  Button,
  Stack,
  Alert
} from '@mui/material';
import { useBatchImportStore } from '../../store/batchImportStore';
import FileUploadStep from './steps/FileUploadStep';
import TableMappingStep from './steps/TableMappingStep';
import ColumnMappingStep from './steps/ColumnMappingStep';
import ReviewImportStep from './steps/ReviewImportStep';
import { normalizeTableName } from './utils/stringUtils';

// Step definitions
const steps = [
  { label: 'Upload File', description: 'Upload Excel/CSV file', key: 'upload' },
  { label: 'Map Tables', description: 'Map sheets to database tables', key: 'map-tables' },
  { label: 'Map Columns', description: 'Map columns to database fields', key: 'map-columns' },
  { label: 'Review & Import', description: 'Verify and import data', key: 'review' },
];

interface BatchImporterProps {
  onComplete?: (results: any) => void;
  onCancel?: () => void;
}

/**
 * Main Excel import wizard component with stepper UI
 */
export const BatchImporter: React.FC<BatchImporterProps> = ({
  onComplete,
  onCancel
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Use navigate for redirection
  const navigate = useNavigate();

  // Use batch import store
  const {
    fileName,
    fileData,
    sheets,
    selectedSheetId,
    progress,
    headerRow,
    reset,
    setHeaderRow,
    setTablePrefix,
    setSelectedSheetId,
    updateSheet,
    importResults,
    setImportResults,
    resetImportResults,
    setProgress
  } = useBatchImportStore();
  
  // Reset state on initial mount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);
  
  // Handle navigation to next step
  const handleNext = () => {
    // Validation for each step
    if (activeStep === 0 && !fileName) {
      setError('Please upload a file first');
      return;
    }

    if (activeStep === 1 && sheets.length === 0) {
      setError('No sheets detected in the file');
      return;
    }

    if (activeStep === 1) {
      // Validate table mapping
      const sheetErrors = [];

      for (const sheet of sheets) {
        // Check if sheet is not skipped and requires a name
        if (!sheet.skip && (!sheet.mappedName || sheet.mappedName === '_create_new_')) {
          sheetErrors.push(`Sheet "${sheet.originalName}" requires a table name`);
        }

        // Handle special "_create_new_" marker for sheets in create mode
        // This shouldn't reach here because of the above check, but just in case
        if (!sheet.skip && sheet.mappedName === '_create_new_') {
          sheetErrors.push(`Sheet "${sheet.originalName}" is in "Create New" mode but no name was provided`);
        }

        // Check for duplicate table names
        const tableNames = sheets
          .filter(s => !s.skip && s.mappedName !== '_create_new_')
          .map(s => s.mappedName);

        if (tableNames.filter(name => name === sheet.mappedName).length > 1) {
          sheetErrors.push(`Duplicate table name: ${sheet.mappedName}`);
        }
      }

      if (sheetErrors.length > 0) {
        setError(sheetErrors.join('; '));
        return;
      }

      // Set all sheet status to ready
      sheets.forEach(sheet => {
        if (!sheet.skip) {
          updateSheet(sheet.id, {
            status: 'ready',
            approved: true,
            needsReview: false
          });
        }
      });
    }

    if (activeStep === 2) {
      // Set default sheet to review if none selected
      if (!selectedSheetId && sheets.length > 0) {
        const firstSheet = sheets.find(s => !s.skip);
        if (firstSheet) {
          setSelectedSheetId(firstSheet.id);
        }
      }
    }

    // Clear any previous errors
    setError(null);

    // Show transition loading when moving to table mapping step
    if (activeStep === 0) {
      // Set loading state before moving to the next step
      setProgress({
        stage: 'analyzing',
        message: 'Preparing table mapping interface...',
        percent: 50
      });

      // Use a short timeout to allow the loading screen to appear before changing steps
      setTimeout(() => {
        // Move to next step
        setActiveStep((prevStep) => prevStep + 1);

        // Reset progress state after a delay to allow loading screen to render
        setTimeout(() => {
          setProgress({
            stage: 'idle',
            message: '',
            percent: 100
          });
        }, 1000);
      }, 200);
    } else {
      // For other steps, just move directly
      setActiveStep((prevStep) => prevStep + 1);
    }
  };
  
  // Handle navigation to previous step
  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
    setError(null);
  };
  
  // Handle cancellation
  const handleCancel = () => {
    // Only call the onCancel callback and let the parent handle navigation
    if (onCancel) {
      onCancel();
    }
  };
  
  // Handle completion
  const handleComplete = () => {
    if (onComplete) {
      onComplete(importResults);
    }
  };
  
  // Render content based on active step
  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <FileUploadStep
            onHeaderRowChange={setHeaderRow}
          />
        );
      case 1:
        return (
          <TableMappingStep 
            onSheetSelect={setSelectedSheetId}
            onError={setError}
          />
        );
      case 2:
        return (
          <ColumnMappingStep 
            onSheetSelect={setSelectedSheetId}
            onError={setError}
          />
        );
      case 3:
        return (
          <ReviewImportStep 
            onError={setError}
          />
        );
      default:
        return null;
    }
  };
  
  return (
    <Box sx={{ width: '100%' }}>
      {/* Progress indicator */}
      {progress.stage !== 'idle' && (
        <Box sx={{ width: '100%', mb: 2 }}>
          <LinearProgress 
            variant="determinate" 
            value={progress.percent} 
            sx={{ height: 8, borderRadius: 1 }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {progress.message}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {progress.percent}%
            </Typography>
          </Box>
        </Box>
      )}
      
      {/* Stepper */}
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
        {steps.map((step) => (
          <Step key={step.key}>
            <StepLabel>{step.label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      
      {/* Error display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {/* Step content */}
      <Box sx={{ mb: 4 }}>
        {renderStepContent()}
      </Box>
      
      {/* Navigation buttons */}
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Button 
          variant="outlined" 
          color="secondary"
          onClick={handleCancel}
        >
          {activeStep === 0 ? 'Cancel' : 'Start Over'}
        </Button>
        
        <Box>
          {activeStep > 0 && (
            <Button
              color="inherit"
              onClick={handleBack}
              sx={{ mr: 1 }}
            >
              Back
            </Button>
          )}
          
          {activeStep < steps.length - 1 ? (
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={!fileName || progress.stage === 'importing'}
            >
              Next
            </Button>
          ) : (
            <Button
              variant="contained"
              color="success"
              onClick={handleComplete}
              disabled={!importResults.success}
            >
              Complete
            </Button>
          )}
        </Box>
      </Stack>
    </Box>
  );
};

export default BatchImporter;