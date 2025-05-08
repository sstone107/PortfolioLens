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

  // Determine if all selected, non-skipped sheets have 'ready' status and are approved
  const allMappingsReady = Object.entries(localSelectedSheets)
    .filter(([sheetName, selected]) => selected && !localSkippedSheets[sheetName])
    .every(([sheetName]) => {
      const sheet = sheets[sheetName];
      // Only consider ready if both status is ready AND sheetReviewStatus is approved
      return sheet?.status === 'ready' && sheet?.sheetReviewStatus === 'approved';
    });

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

                // DEBUG: Log all sheet state to console
                console.log(`[DEBUG-UI] Sheet state for ${sheetName}:`, {
                  selectedTable: sheetState.selectedTable,
                  status: sheetState.status,
                  sheetReviewStatus: sheetState.sheetReviewStatus,
                  isNewTable: sheetState.isNewTable,
                  tableConfidenceScore: sheetState.tableConfidenceScore
                });

                // CRITICAL FIX: Only consider a table new if it has the 'new:' prefix
                // This aligns with the fix in BatchImporter.tsx
                const isNewByPrefix = sheetState.selectedTable.startsWith('new:');
                const isEffectivelyNew = isNewByPrefix;

                const tableName = isNewByPrefix
                    ? `New Table (${sheetState.selectedTable.replace(/^(new:|import_)/, '')})`
                    : sheetState.selectedTable;

                // DOUBLE-CHECK: Determine table status with enhanced safeguards
                // Consider a sheet as complete only if:
                // 1. It has a status of 'ready' AND 
                // 2. Its reviewStatus is 'approved' AND
                // 3. It is NOT a new table
                
                // CRITICAL: Force new tables to never be shown as complete
                // This is a UI override even if data says otherwise
                const isEffectivelyNewTable = isEffectivelyNew; // Using the already computed value
                
                // Force needsReview=true for any new table regardless of its status
                const needsReview = sheetState.status === 'needsReview' || 
                                   sheetState.sheetReviewStatus !== 'approved' || 
                                   isEffectivelyNewTable;
                
                // UI override: Never allow a new table to be considered complete
                const isComplete = sheetState.status === 'ready' && 
                                  sheetState.sheetReviewStatus === 'approved' && 
                                  !isEffectivelyNewTable;
                
                // Debug: Log if any new table is being marked as ready in the data
                const isNewTableMarkedReadyInData = isEffectivelyNewTable && 
                                                   sheetState.status === 'ready' && 
                                                   sheetState.sheetReviewStatus === 'approved';
                
                if (isNewTableMarkedReadyInData) {
                  console.warn(`[CRITICAL UI OVERRIDE] Preventing display of new table ${sheetName} as 'Ready':`, {
                    selectedTable: sheetState.selectedTable,
                    status: sheetState.status,
                    sheetReviewStatus: sheetState.sheetReviewStatus,
                    isNewTable: sheetState.isNewTable,
                    isEffectivelyNewTable,
                    // Explicitly show the UI override happening
                    dataIndicatesReady: true,
                    uiShowingAsReady: false,
                  });
                }

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
                        // Always enable mapping buttons
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
          // Always enable Back button
        >
          Back
        </Button>

        <Button
          variant="contained"
          onClick={onContinue}
          // Allow continuing even if not all mappings are ready
          title="Continue to review import"
        >
          Continue to Review
        </Button>
      </Box>
    </Box>
  );
};
