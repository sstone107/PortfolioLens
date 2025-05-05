import React, { useState, useEffect, useMemo, useLayoutEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  FormControl,
  Divider,
  Chip,
  Alert,
  CircularProgress,
  TextField,
  RadioGroup,
  Radio,
  FormControlLabel,
  FormLabel,
  Tab,
  Tabs,
  Checkbox // <-- Import Checkbox
} from '@mui/material';
import {
  Close as CloseIcon,
  Check as CheckIcon,
  Search as SearchIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon,
  CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon,
  CheckBox as CheckBoxIcon
} from '@mui/icons-material';
import {
    ColumnType,
    TableColumn as TableColumnType,
    SheetProcessingState,
    BatchColumnMapping, // Already imported
    TableInfo,
    ColumnMapping,
    ColumnMappingSuggestions,
    ConfidenceLevel,    // Add
    ReviewStatus,       // Add
    NewColumnProposal   // Add
} from './types';
import { VirtualizedColumnMapper } from './VirtualizedColumnMapper';
import { ColumnMappingTableView } from './ColumnMappingTableView';
// import { suggestColumnMappings, mapColumnTypeToSql } from './ColumnMappingUtils'; // mapColumnTypeToSql moved inside

// Suppress MUI console warnings
const SuppressMuiWarnings = () => {
  useLayoutEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args) => {
      if (args[0] && typeof args[0] === 'string' &&
          (args[0].includes('MUI: You have provided an out-of-range value') ||
           args[0].includes('Consider providing a value that matches one of the available options') ||
           args[0].includes('The available values are'))) {
        return;
      }
      originalError.apply(console, args);
    };
    console.warn = (...args) => {
      if (args[0] && typeof args[0] === 'string' &&
          args[0].includes('Mapped column') &&
          args[0].includes('not found in available options')) {
        return;
      }
      originalWarn.apply(console, args);
    };
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);
  return null;
};

interface ColumnMappingModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (mappings: Record<string, BatchColumnMapping>) => void; // Expect full mappings on save
  sheetState: SheetProcessingState | null;
  tableInfo: TableInfo | null; // This might need to accept NewTableProposal too if creating
  isCreatingTable: boolean;
}

export const ColumnMappingModal: React.FC<ColumnMappingModalProps> = ({
  open,
  onClose,
  onSave,
  sheetState,
  tableInfo,
  isCreatingTable,
}) => {
  // Helper function to map column type to SQL type
  const mapColumnTypeToSql = (columnType: ColumnType | null | undefined): string => {
    if (!columnType) return 'TEXT';
    
    switch (columnType) {
      case 'number':
        return 'NUMERIC';
      case 'boolean':
        return 'BOOLEAN';
      case 'date':
        return 'TIMESTAMP WITH TIME ZONE';
      case 'string':
      default:
        return 'TEXT';
    }
  };

  // Update the state type to potentially hold the full structure
  const [mappings, setMappings] = useState<Record<string, BatchColumnMapping>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'virtualized'>('table'); // <-- Allow both types
  const [newColumnDialogOpen, setNewColumnDialogOpen] = useState(false);
  const [currentExcelColumn, setCurrentExcelColumn] = useState<string>('');
  const [newColumnName, setNewColumnName] = useState<string>('');
  const [newColumnType, setNewColumnType] = useState<ColumnType>('string');
  const [createStructureOnly, setCreateStructureOnly] = useState<boolean>(false); // State for the new checkbox

  const actualTableName = useMemo(() => {
      if (!sheetState?.selectedTable) return 'Unknown Table';
      return isCreatingTable ? sheetState.selectedTable.substring(4) : sheetState.selectedTable;
  }, [sheetState?.selectedTable, isCreatingTable]);

  const memoizedExcelHeaders = useMemo(() => {
    if (!sheetState?.headers) return [];
    return sheetState.headers.filter(header =>
      header?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sheetState, searchQuery]);

  const memoizedTargetColumns = useMemo(() => {
    return (tableInfo?.columns || []).filter(col => !['id', 'created_at', 'updated_at'].includes(col.columnName));
  }, [tableInfo]);

  // Remove local columnSuggestions state and its setter
  // const [columnSuggestions, setColumnSuggestions] = useState<Record<string, any>>({}); // Removed

  // Update useEffect to initialize with full BatchColumnMapping structure
  useEffect(() => {
      if (open && sheetState) {
          const initialMappings: Record<string, BatchColumnMapping> = {};
          sheetState.headers?.forEach(header => {
              const existingMapping = sheetState.columnMappings?.[header];
              // Prioritize existing mapping from sheetState if available
              if (existingMapping) {
                  initialMappings[header] = {
                      ...existingMapping, // Use the full existing mapping
                      reviewStatus: existingMapping.reviewStatus || 'pending', // Ensure reviewStatus is initialized
                      // Ensure suggestedColumns is present, even if empty
                      suggestedColumns: existingMapping.suggestedColumns || [],
                  };
              } else {
                   // This case should ideally not happen if AnalysisEngine always provides
                   // a BatchColumnMapping for every header. But as a fallback:
                  console.warn(`No existing BatchColumnMapping found for header: ${header}. Creating default.`);
                  initialMappings[header] = {
                      header: header,
                      sampleValue: sheetState.sampleData?.[0]?.[header] ?? null,
                      suggestedColumns: [], // Default to empty array
                      inferredDataType: null, // Or try to infer again?
                      status: 'pending', // Needs attention
                      reviewStatus: 'pending',
                      action: 'skip', // Default action
                      mappedColumn: null,
                      dbColumn: null, // Add dbColumn property
                      confidenceScore: 0,
                      confidenceLevel: 'Low',
                  };
              }
          });
          setMappings(initialMappings);
          // Reset other states
          setNewColumnDialogOpen(false);
          setSearchQuery('');
          // Correctly set view mode based on header count
          setViewMode((sheetState.headers?.length || 0) > 30 ? 'virtualized' : 'table');

      } else if (open && !sheetState) {
          setMappings({});
      }
  }, [open, sheetState, tableInfo]); // Updated dependencies

  // More flexible update function
  const handleMappingUpdate = (excelCol: string, changes: Partial<BatchColumnMapping>) => {
      // Check if we need to open the new column dialog
      if ((changes.action === 'create' && !changes.newColumnProposal) ||
          (changes.action === 'create' && (changes as any).openDialog)) {
          // Open the dialog for creating a new column
          setCurrentExcelColumn(excelCol);
          const suggestedName = excelCol.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
          setNewColumnName(suggestedName);
          setNewColumnType(mappings[excelCol]?.inferredDataType || 'string');
          setNewColumnDialogOpen(true);
          // We'll still update the mapping state to reflect the 'create' action
          
          // Remove the openDialog flag as it's not part of the BatchColumnMapping type
          if ((changes as any).openDialog) {
              delete (changes as any).openDialog;
          }
      }

      setMappings(prev => {
          // Define the default structure separately to avoid self-reference issues
          const defaultMapping: BatchColumnMapping = {
              header: excelCol,
              sampleValue: sheetState?.sampleData?.[0]?.[excelCol] ?? null,
              suggestedColumns: [],
              inferredDataType: null,
              status: 'pending',
              reviewStatus: 'pending',
              action: 'skip',
              mappedColumn: null,
              dbColumn: null, // Add dbColumn to default structure
              confidenceScore: 0,
              confidenceLevel: 'Low',
          };

          // Get the current mapping or use the default
          const current: BatchColumnMapping = prev[excelCol] || defaultMapping;

          // If action changes, reset potentially conflicting fields
          const resetFields: Partial<BatchColumnMapping> = {};
          if (changes.action && changes.action !== current.action) {
              if (changes.action === 'skip') {
                  resetFields.mappedColumn = null;
                  resetFields.dbColumn = null; // Also reset dbColumn
                  resetFields.newColumnProposal = undefined;
              } else if (changes.action === 'map') {
                  resetFields.newColumnProposal = undefined;
                  // Keep mappedColumn if provided in changes, otherwise nullify
                  if (!changes.mappedColumn) {
                      resetFields.mappedColumn = null;
                      resetFields.dbColumn = null; // Also reset dbColumn
                  } else {
                      // If mappedColumn is provided, ensure dbColumn is also set
                      resetFields.dbColumn = changes.mappedColumn;
                  }
              } else if (changes.action === 'create') {
                  const columnName = changes.newColumnProposal?.columnName || null;
                  resetFields.mappedColumn = columnName; // Map to proposal name
                  resetFields.dbColumn = columnName; // Also set dbColumn to the same value
                  // Keep newColumnProposal if provided, otherwise nullify
                  if (!changes.newColumnProposal) resetFields.newColumnProposal = undefined;
              }
          } else if (changes.mappedColumn && changes.mappedColumn !== current.mappedColumn) {
              // If only mappedColumn changes, ensure dbColumn is updated too
              resetFields.dbColumn = changes.mappedColumn;
          }

          // Changes have been processed

          return {
              ...prev,
              [excelCol]: {
                  ...current,
                  ...changes, // Apply incoming changes
                  ...resetFields, // Apply necessary resets based on action change
                  status: 'userModified', // Mark as modified by user
                  // If review status isn't explicitly changed, keep it, otherwise update
                  reviewStatus: changes.reviewStatus || current.reviewStatus || 'pending',
              }
          };
      });
  };


  // Update the old updateColumnMapping to use the new flexible one
  // This handles the dropdown selection specifically
  const updateColumnMapping = (excelCol: string, selectedValue: string | null) => {
      if (selectedValue === 'create-new-column') {
          // Logic for opening the 'create new column' dialog remains the same
          setCurrentExcelColumn(excelCol);
          const suggestedName = excelCol.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
          setNewColumnName(suggestedName);
          setNewColumnType(mappings[excelCol]?.inferredDataType || 'string');
          setNewColumnDialogOpen(true);
          
          // Also update the mapping state to reflect the 'create' action
          handleMappingUpdate(excelCol, { action: 'create' });
      } else if (!selectedValue) {
          // Handle 'Skip this column' selection
          handleMappingUpdate(excelCol, { action: 'skip', mappedColumn: null, newColumnProposal: undefined });
      } else {
          // Handle selecting an existing DB column
          handleMappingUpdate(excelCol, { action: 'map', mappedColumn: selectedValue, newColumnProposal: undefined });
      }
  };

  // Update handleCreateNewColumn to use handleMappingUpdate
  const handleCreateNewColumn = () => {
    const trimmedName = newColumnName.trim();
    if (!trimmedName) {
      alert('Please enter a valid column name.');
      return;
    }
    const formattedColumnName = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_{2,}/g, '_');

    const existingDbCols = memoizedTargetColumns.map(c => c.columnName);
    const otherNewCols = Object.values(mappings)
        .filter(m => m.action === 'create' && m.header !== currentExcelColumn)
        .map(m => m.newColumnProposal?.columnName);

     if (existingDbCols.includes(formattedColumnName) || otherNewCols.includes(formattedColumnName)) {
         alert(`Column name "${formattedColumnName}" already exists or is planned. Please choose a different name.`);
        return;
    }

    const proposal: NewColumnProposal = {
        columnName: formattedColumnName,
        sqlType: mapColumnTypeToSql(newColumnType), // Use helper function
        isNullable: true, // Default
        sourceSheet: sheetState?.sheetName,
        sourceHeader: currentExcelColumn,
        createStructureOnly: createStructureOnly, // Include the checkbox state
    };

    // Update using the flexible handler
    handleMappingUpdate(currentExcelColumn, {
        action: 'create',
        mappedColumn: formattedColumnName, // Set mappedColumn to the new name for display consistency
        newColumnProposal: proposal,
        inferredDataType: newColumnType, // Update inferred type if changed in dialog
        reviewStatus: 'approved', // Assume creating implies approval for now
    });

    setNewColumnDialogOpen(false);
    setNewColumnName('');
    setCurrentExcelColumn('');
    setCreateStructureOnly(false); // Reset checkbox state on close
  };

  // Update handleSave to ensure it sends the full BatchColumnMapping
  const handleSave = () => {
      // Ensure all mappings have dbColumn set based on mappedColumn
      const updatedMappings = { ...mappings };
      
      // Process each mapping to ensure dbColumn is set
      Object.entries(updatedMappings).forEach(([header, mapping]) => {
          if (mapping.action === 'map' && mapping.mappedColumn && !mapping.dbColumn) {
              // If mappedColumn exists but dbColumn doesn't, copy the value
              updatedMappings[header] = {
                  ...mapping,
                  dbColumn: mapping.mappedColumn
              };
              console.log(`[DEBUG ColumnMappingModal] Setting dbColumn for ${header} to ${mapping.mappedColumn}`);
          } else if (mapping.action === 'create' && mapping.newColumnProposal?.columnName && !mapping.dbColumn) {
              // For new columns, use the proposal name as dbColumn
              updatedMappings[header] = {
                  ...mapping,
                  dbColumn: mapping.newColumnProposal.columnName
              };
          }
      });
      
      // Log the final mappings for debugging
      
      // Pass the updated mappings with dbColumn properly set
      onSave(updatedMappings);
      onClose();
  };

  const getColumnSample = (columnName: string) => {
    if (!sheetState?.sampleData || sheetState.sampleData.length === 0) return 'No data';
    const samples = sheetState.sampleData
        .map(row => row[columnName])
        .filter(value => value !== undefined && value !== null && value !== '')
        .slice(0, 5);
    if (samples.length === 0) return '(empty)';
    const result = samples.map(s => String(s).substring(0, 15)).join(' | ');
    return result.length > 60 ? result.substring(0, 57) + '...' : result;
  };

  // Remove the convertMappingsForDisplay helper function as it's no longer needed
  // const convertMappingsForDisplay = (...) => { ... }; // REMOVE THIS


  if (!sheetState) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
        <DialogTitle>Loading Mapping Information...</DialogTitle>
        <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
          <CircularProgress />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
        </DialogActions>
      </Dialog>
    );
  }

  const totalColumns = sheetState?.headers?.length || 0;
  const mappedOrCreatedColumns = Object.values(mappings).filter(m => m.action === 'map' || m.action === 'create').length;
  const mappingPercentage = totalColumns > 0 ? Math.round((mappedOrCreatedColumns / totalColumns) * 100) : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      aria-labelledby="column-mapping-dialog-title"
      PaperProps={{
        sx: { bgcolor: 'background.paper' }
      }}
    >
      <SuppressMuiWarnings />
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            Map Excel Columns to Database Fields
          </Typography>
          <Box>
            <Chip
              label={`${mappedOrCreatedColumns}/${totalColumns} columns mapped (${mappingPercentage}%)`}
              color={mappingPercentage > 80 ? "success" : mappingPercentage > 50 ? "info" : "warning"}
            />
          </Box>
        </Box>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ bgcolor: 'background.paper' }}>
        <Box mb={2}>
          <Typography variant="subtitle1" gutterBottom>
            Mapping Sheet: <strong>{sheetState.sheetName}</strong> to Table: <strong>{isCreatingTable ? `New Table (${actualTableName})` : actualTableName}</strong>
          </Typography>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Alert severity="info" sx={{ flexGrow: 1, mr: 2 }}>
              Map Excel columns to database fields below. Unmapped columns will be skipped. Use 'Create New Field' to add missing fields to the database table.
            </Alert>

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
               <TextField
                 label="Search Columns"
                 variant="outlined"
                 size="small"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 InputProps={{
                   startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'action.active' }} />,
                 }}
                 sx={{ width: '200px' }}
               />
            </Box>
          </Box>
        </Box>

        {/* Table view for column mapping */}
        <ColumnMappingTableView
          excelHeaders={memoizedExcelHeaders}
          mappings={mappings} // Pass the full state
          targetColumns={memoizedTargetColumns}
          sheetState={sheetState}
          isCreatingTable={isCreatingTable}
          getColumnSample={getColumnSample}
          onMappingUpdate={handleMappingUpdate} // Pass the flexible update function
        />
      </DialogContent>

      <DialogActions>
         {/* Simplified actions */}
        <Button onClick={onClose} startIcon={<CloseIcon />}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          color="primary"
          startIcon={<CheckIcon />}
          disabled={mappedOrCreatedColumns === 0}
        >
          Save Mappings
        </Button>
      </DialogActions>

      {/* Dialog for Creating New Column */}
      <Dialog
        open={newColumnDialogOpen}
        onClose={() => setNewColumnDialogOpen(false)}
        PaperProps={{
          sx: { bgcolor: 'background.paper' }
        }}
      >
        <DialogTitle>Create New Database Field</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Creating a new field in table '{actualTableName}' for Excel column: <strong>{currentExcelColumn}</strong>
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="New Field Name (snake_case)"
            type="text"
            fullWidth
            variant="standard"
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            helperText="Use lowercase letters, numbers, and underscores."
          />
          <FormControl component="fieldset" margin="normal">
            <FormLabel component="legend">Data Type</FormLabel>
            <RadioGroup
              row
              aria-label="data type"
              name="newColumnType"
              value={newColumnType}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewColumnType(e.target.value as ColumnType)} // Add event type
            >
              <FormControlLabel value="string" control={<Radio />} label="Text" />
              <FormControlLabel value="number" control={<Radio />} label="Number" />
              <FormControlLabel value="date" control={<Radio />} label="Date/Time" />
              <FormControlLabel value="boolean" control={<Radio />} label="True/False" />
            </RadioGroup>
          </FormControl>
          {/* Correct placement for the Checkbox, after the RadioGroup's FormControl */}
          <FormControlLabel
            control={
              <Checkbox
                checked={createStructureOnly}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCreateStructureOnly(e.target.checked)}
                name="createStructureOnly"
                color="primary"
              />
            }
            label="Create column structure only (do not import data)"
            sx={{ mt: 1 }}
          />
          {/* Removed duplicate block */}
        </DialogContent> {/* Correct closing tag for inner DialogContent */}
        <DialogActions>
          <Button onClick={() => { setNewColumnDialogOpen(false); setCreateStructureOnly(false); }}>Cancel</Button>
          <Button onClick={handleCreateNewColumn} variant="contained">Create Field</Button>
        </DialogActions>
      </Dialog> {/* Correct closing tag for inner Dialog */}
    </Dialog>
  );
};
