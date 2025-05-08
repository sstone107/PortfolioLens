import React from 'react';
import { Box, Button, Typography, Paper, Chip } from '@mui/material';
import { Check as CheckIcon, WarningAmber as WarningIcon, Edit as EditIcon } from '@mui/icons-material';
import { SheetProcessingState } from '../types'; // Use SheetProcessingState

// Updated props to reflect store usage
export interface ColumnMappingStepProps {
  sheets: { [sheetName: string]: SheetProcessingState }; // Pass the sheets object from the store
  localSelectedSheets: Record<string, boolean>; // UI state for selection
  localSkippedSheets: Record<string, boolean>; // UI state for skipping
  isProcessing: boolean; // Global processing state
  onOpenColumnMapping: (sheetName: string) => void; // Only need sheetName, table comes from store
  onContinue: () => void;
  onBack: () => void;
}

/**
 * Step 3 of the import process: Column Mapping (Refactored for Zustand)
 */
export const ColumnMappingStep: React.FC<ColumnMappingStepProps> = ({
  sheets,
  localSelectedSheets,
  localSkippedSheets,
  isProcessing,
  onOpenColumnMapping,
  onContinue,
  onBack
}) => {

  // Determine if all selected, non-skipped sheets have 'ready' status
  const allMappingsReady = Object.entries(localSelectedSheets)
    .filter(([sheetName, selected]) => selected && !localSkippedSheets[sheetName])
    .every(([sheetName]) => sheets[sheetName]?.status === 'ready');

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Map Excel Columns to Database Fields
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Review and adjust the automatic column mappings for each selected sheet.
        Click 'Map Columns' or 'Edit Mappings' to open the mapping interface for a sheet.
      </Typography>

      <Box sx={{ mt: 2, mb: 3 }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Selected Sheets - Column Mapping Status:
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {Object.entries(localSelectedSheets)
              .filter(([sheetName, selected]) => selected && !localSkippedSheets[sheetName]) // Filter for selected and not skipped
              .map(([sheetName]) => {
                const sheetState = sheets[sheetName];
                if (!sheetState || !sheetState.selectedTable) {
                  // Handle cases where sheet state or table mapping might be missing (e.g., error during previous step)
                  return (
                     <Box key={sheetName} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, borderBottom: '1px solid #eee', opacity: 0.7 }}>
                        <Typography variant="body1" color="text.secondary">{sheetName} (Mapping unavailable)</Typography>
                        <Chip label="Error" color="error" size="small" variant="outlined" icon={<WarningIcon />} />
                     </Box>
                  );
                }

                const tableName = sheetState.selectedTable.startsWith('new:')
                    ? `New Table (${sheetState.selectedTable.substring(4)})`
                    : sheetState.selectedTable;

                // Determine completeness based on sheet status
                const isComplete = sheetState.status === 'ready';
                const needsReview = sheetState.status === 'needsReview';

                return (
                  <Box key={sheetName} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, borderBottom: '1px solid #eee' }}>
                    <Box>
                      <Typography variant="body1">
                        {sheetName} → {tableName}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {isComplete ? (
                        <Chip
                          label="Ready"
                          color="success"
                          size="small"
                          variant="outlined"
                          icon={<CheckIcon />}
                        />
                      ) : (
                        <Chip
                          label={needsReview ? "Needs Review" : "Pending"}
                          color={needsReview ? "warning" : "default"}
                          size="small"
                          variant="outlined"
                          icon={<WarningIcon />}
                        />
                      )}

                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={() => onOpenColumnMapping(sheetName)} // Only pass sheetName
                        disabled={isProcessing} // Disable if worker is processing
                      >
                        {isComplete ? 'Edit Mappings' : 'Map Columns'}
                      </Button>
                    </Box>
                  </Box>
                );
              })}
              {Object.entries(localSelectedSheets).filter(([_, selected]) => selected).length === 0 && (
                 <Typography color="text.secondary" sx={{p: 1}}>No sheets selected for import.</Typography>
              )}
          </Box>
        </Paper>
      </Box>

      {/* Navigation Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
        <Button
          variant="outlined"
          onClick={onBack}
          disabled={isProcessing}
        >
          Back
        </Button>

        <Button
          variant="contained"
          onClick={onContinue}
          disabled={isProcessing || !allMappingsReady} // Disable if processing or not all selected sheets are ready
          title={!allMappingsReady ? "Please ensure all selected sheets have their columns mapped ('Ready' status)." : ""}
        >
          Continue to Review
        </Button>
      </Box>
    </Box>
  );
};
