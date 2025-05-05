import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { SheetMappingTable } from '../SheetMappingTable';
import { SheetProcessingState } from '../types'; // Use SheetProcessingState

// Updated props to reflect store usage
interface TableMappingStepProps {
  sheets: { [sheetName: string]: SheetProcessingState }; // Pass the sheets object from the store
  tables: string[]; // List of existing table names
  localSelectedSheets: Record<string, boolean>; // UI state for selection
  localSkippedSheets: Record<string, boolean>; // UI state for skipping
  onSheetSelectionToggle: (sheetName: string) => void;
  onTableSelection: (sheetName: string, tableName: string | null) => void; // Allow null for reset
  onSelectAll: (selected: boolean) => void;
  onSkipSheet: (sheetName: string, skipped: boolean) => void;
  onContinue: () => void;
  onBack: () => void;
  isProcessing: boolean; // Global processing state
}

/**
 * Step 2 of the import process: Sheet to Table Mapping (Refactored for Zustand)
 */
export const TableMappingStep: React.FC<TableMappingStepProps> = ({
  sheets,
  tables,
  localSelectedSheets,
  localSkippedSheets,
  onSheetSelectionToggle,
  onTableSelection,
  onSelectAll,
  onSkipSheet,
  onContinue,
  onBack,
  isProcessing, // Use isProcessing instead of isImporting
}) => {

  // Calculate unmapped sheets based on store state and local selections
  const unmappedCount = Object.entries(localSelectedSheets)
    .filter(([sheetName, selected]) => selected && !localSkippedSheets[sheetName])
    .filter(([sheetName]) => !sheets[sheetName]?.selectedTable)
    .length;

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Map Excel Sheets to Database Tables
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Select which sheets to import and map them to database tables using suggestions or manual selection.
        You can also skip sheets.
        {unmappedCount > 0 && (
          <span style={{ fontStyle: 'italic', marginLeft: '5px', color: 'orange' }}>
            ({unmappedCount} selected sheets need table mapping)
          </span>
        )}
      </Typography>

      {/* Sheet Mapping Table - Pass updated props */}
      <SheetMappingTable
        sheets={sheets}
        tables={tables}
        localSelectedSheets={localSelectedSheets}
        localSkippedSheets={localSkippedSheets}
        onSheetSelectionToggle={onSheetSelectionToggle}
        onTableSelection={onTableSelection}
        onSelectAll={onSelectAll}
        onSkipSheet={onSkipSheet}
        isProcessing={isProcessing}
      />

      {/* Navigation Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
        <Button
          variant="outlined"
          onClick={onBack}
          disabled={isProcessing} // Disable if worker is processing
        >
          Back
        </Button>

        <Button
          variant="contained"
          onClick={onContinue}
          disabled={isProcessing} // Disable if worker is processing
        >
          Continue to Column Mapping
        </Button>
      </Box>
    </Box>
  );
};
