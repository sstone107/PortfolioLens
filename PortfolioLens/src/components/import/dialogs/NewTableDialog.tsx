import React, { useEffect } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogContentText, 
  DialogActions, 
  Button, 
  TextField 
} from '@mui/material';
import { useBulkMappingStore } from '../BulkMappingStore';

interface NewTableDialogProps {
  onTableCreated: (sheetName: string, tableName: string) => void;
}

/**
 * Dialog component for creating a new database table
 */
export const NewTableDialog: React.FC<NewTableDialogProps> = ({ onTableCreated }) => {
  // Access store state
  const { 
    newTableDialogOpen,
    newTableName,
    currentSheetForNewTable,
    setNewTableDialogOpen,
    setNewTableName,
    setCurrentSheetForNewTable
  } = useBulkMappingStore();

  // Validate table name
  const isValidTableName = newTableName.match(/^[a-z0-9_]+$/);
  const hasError = !isValidTableName && newTableName !== '';

  // Handle close without saving
  const handleClose = () => {
    setNewTableDialogOpen(false);
  };

  // Set initial table name based on sheet name when the dialog opens
  useEffect(() => {
    if (newTableDialogOpen && currentSheetForNewTable && (!newTableName || newTableName === '')) {
      // Convert sheet name to a SQL-friendly format
      const sqlFriendlyName = currentSheetForNewTable
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_') // Replace non-alphanumeric chars with underscore
        .replace(/_{2,}/g, '_')     // Replace multiple underscores with a single one
        .replace(/^_+|_+$/g, '');   // Remove leading/trailing underscores
      
      setNewTableName(sqlFriendlyName);
    }
  }, [newTableDialogOpen, currentSheetForNewTable, newTableName, setNewTableName]);

  // Access more store items, including selectedSheets
  const selectedSheets = useBulkMappingStore(state => state.selectedSheets);
  const setSelectedSheets = useBulkMappingStore(state => state.setSelectedSheets);

  // Handle creating the new table
  const handleCreateTable = () => {
    if (currentSheetForNewTable && newTableName && isValidTableName) {
      console.log(`[DEBUG NewTableDialog] Creating new table: ${newTableName} for sheet: ${currentSheetForNewTable}`);
      
      // Ensure the current sheet is selected - defensive check
      const currentSelectedSheets = useBulkMappingStore.getState().selectedSheets;
      
      if (!Array.isArray(currentSelectedSheets) || !currentSelectedSheets.includes(currentSheetForNewTable)) {
        console.log(`[DEBUG NewTableDialog] Adding ${currentSheetForNewTable} to selectedSheets before setting mapping`);
        // Use a reliable reference to the current state
        const updatedSheets = Array.isArray(currentSelectedSheets)
          ? [...currentSelectedSheets, currentSheetForNewTable]
          : [currentSheetForNewTable];
        
        setSelectedSheets(updatedSheets);
        console.log(`[DEBUG NewTableDialog] Updated selected sheets:`, updatedSheets);
      }
      
      // Delay the callback slightly to ensure state updates first
      setTimeout(() => {
        // Call the callback with the sheet name and new table name
        // IMPORTANT: We can't use the 'create_new:' prefix because it causes Select validation errors
        // We need to store this as a direct table name and handle creation elsewhere
        onTableCreated(currentSheetForNewTable!, newTableName);
        
        // Close the dialog and reset state
        setNewTableDialogOpen(false);
        
        // Don't reset currentSheetForNewTable immediately to avoid race conditions
        setTimeout(() => {
          setCurrentSheetForNewTable(null);
        }, 100);
      }, 50);
    }
  };

  return (
    <Dialog
      open={newTableDialogOpen}
      onClose={handleClose}
      aria-labelledby="new-table-dialog-title"
    >
      <DialogTitle id="new-table-dialog-title">Create New Table</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Enter a name for the new table. Table names must contain only lowercase letters, numbers, and underscores.
        </DialogContentText>
        <TextField
          autoFocus
          margin="dense"
          id="table-name"
          label="Table Name"
          type="text"
          fullWidth
          variant="outlined"
          value={newTableName}
          onChange={(e) => setNewTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
          inputProps={{
            pattern: "[a-z0-9_]+",
            title: "Only lowercase letters, numbers and underscores allowed"
          }}
          helperText={
            hasError ? 
            "Invalid table name. Use only lowercase letters, numbers and underscores." : 
            ""
          }
          error={hasError}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button 
          onClick={handleCreateTable}
          disabled={!newTableName || hasError}
          color="primary"
        >
          Create Table
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewTableDialog;