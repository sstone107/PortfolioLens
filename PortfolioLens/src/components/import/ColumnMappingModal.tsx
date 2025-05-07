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
  Checkbox 
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
  SheetProcessingState, 
  TableInfo, 
  BatchColumnMapping, 
  ColumnType,
  NewColumnProposal, 
  ReviewStatus,      
  ConfidenceLevel
} from './types';

import { VirtualizedColumnMapper } from './VirtualizedColumnMapper';
import { ColumnMappingTableView } from './ColumnMappingTableView';

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
  onSave: (mappings: Record<string, BatchColumnMapping>, newTableName?: string) => void; 
  sheetState: SheetProcessingState | null; 
  tableInfo: TableInfo | null; 
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
  console.log('[DEBUG ColumnMappingModal] Props received:', {
    open,
    sheetState,
    tableInfo,
    isCreatingTable
  });

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
  const [viewMode, setViewMode] = useState<'table' | 'virtualized'>('table'); 
  const [newColumnDialogOpen, setNewColumnDialogOpen] = useState(false);
  const [currentExcelColumn, setCurrentExcelColumn] = useState<string>('');
  const [newColumnName, setNewColumnName] = useState<string>('');
  const [newColumnType, setNewColumnType] = useState<ColumnType>('string');
  const [createStructureOnly, setCreateStructureOnly] = useState<boolean>(false); 
  const [editableTableName, setEditableTableName] = useState<string>(''); // State for editable table name

  const actualTableNameFromSheetState = useMemo(() => {
      if (!sheetState?.selectedTable) return 'Unknown Table';
      return isCreatingTable ? sheetState.selectedTable.substring(4) : sheetState.selectedTable;
  }, [sheetState?.selectedTable, isCreatingTable]);

  const memoizedExcelHeaders = useMemo(() => {
    if (!sheetState?.headers) return [];
    const headers = sheetState.headers.filter(header =>
      header?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    console.log('[DEBUG ColumnMappingModal] memoizedExcelHeaders:', headers);
    return headers;
  }, [sheetState, searchQuery]);

  const memoizedTargetColumns = useMemo(() => {
    return (tableInfo?.columns || []).filter(col => !['id', 'created_at', 'updated_at'].includes(col.columnName));
  }, [tableInfo]);

  useEffect(() => {
    console.log('[DEBUG ColumnMappingModal] useEffect for mapping init. Deps:', { open, sheetState, tableInfo });

    if (open && sheetState) {
      const initialMappings: Record<string, BatchColumnMapping> = {};
      sheetState.headers?.forEach(header => {
        const existingMapping = sheetState.columnMappings?.[header];
        if (existingMapping) {
          initialMappings[header] = {
            ...existingMapping, 
            reviewStatus: existingMapping.reviewStatus || 'pending', 
            suggestedColumns: existingMapping.suggestedColumns || [],
          };
        } else {
          console.warn(`No existing BatchColumnMapping found for header: ${header}. Creating default.`);
          initialMappings[header] = {
            header: header,
            sampleValue: sheetState.sampleData?.[0]?.[header] ?? null,
            suggestedColumns: [], 
            inferredDataType: null, 
            status: 'pending', 
            reviewStatus: 'pending',
            action: 'skip', 
            mappedColumn: null,
            newColumnProposal: undefined,
            confidenceScore: 0,
            confidenceLevel: 'Low',
          };
        }
      });
      setMappings(initialMappings);
      setNewColumnDialogOpen(false);
      setSearchQuery('');
      setViewMode((sheetState.headers?.length || 0) > 30 ? 'virtualized' : 'table');
      if (isCreatingTable) {
        setEditableTableName(actualTableNameFromSheetState); // Initialize editable name
      }
    } else if (open && !sheetState) {
      setMappings({});
      if (isCreatingTable) {
        setEditableTableName(''); // Reset if creating but no sheet state
      }
    }
  }, [open, sheetState, tableInfo, isCreatingTable, actualTableNameFromSheetState]); 

  const handleMappingUpdate = (excelCol: string, changes: Partial<BatchColumnMapping>) => {
    console.log('[DEBUG ColumnMappingModal] handleMappingUpdate:', { excelCol, changes });

    if ((changes.action === 'create' && !changes.newColumnProposal) ||
        (changes.action === 'create' && (changes as any).openDialog)) {
      setCurrentExcelColumn(excelCol);
      const suggestedName = excelCol.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
      setNewColumnName(suggestedName);
      setNewColumnType(mappings[excelCol]?.inferredDataType || 'string');
      setNewColumnDialogOpen(true);
      handleMappingUpdate(excelCol, { action: 'create' });
    }

    setMappings(prev => {
      const defaultMapping: BatchColumnMapping = {
        header: excelCol,
        sampleValue: sheetState?.sampleData?.[0]?.[excelCol] ?? null,
        suggestedColumns: [],
        inferredDataType: 'string', // Default
        status: 'pending', // Added missing status property
        reviewStatus: 'pending',
        action: 'skip',
        mappedColumn: null,
        newColumnProposal: undefined,
        confidenceScore: 0,
        confidenceLevel: 'Low',
      };

      const current: BatchColumnMapping = prev[excelCol] || defaultMapping;

      const resetFields: Partial<BatchColumnMapping> = {};
      if (changes.action && changes.action !== current.action) {
        if (changes.action === 'skip') {
          resetFields.mappedColumn = null;
          resetFields.newColumnProposal = undefined;
        } else if (changes.action === 'map') {
          resetFields.newColumnProposal = undefined;
          if (!changes.mappedColumn) {
            resetFields.mappedColumn = null;
          } else {
            resetFields.mappedColumn = changes.mappedColumn;
          }
        } else if (changes.action === 'create') {
          const columnName = changes.newColumnProposal?.columnName || null;
          resetFields.mappedColumn = columnName; 
          resetFields.newColumnProposal = changes.newColumnProposal;
        }
      } else if (changes.mappedColumn && changes.mappedColumn !== current.mappedColumn) {
        resetFields.mappedColumn = changes.mappedColumn;
      }

      return {
        ...prev,
        [excelCol]: {
          ...current,
          ...changes, 
          ...resetFields, 
          status: 'userModified', 
          reviewStatus: changes.reviewStatus || current.reviewStatus || 'pending',
        }
      };
    });
  };

  const updateColumnMapping = (excelCol: string, selectedValue: string | null) => {
    console.log('[DEBUG ColumnMappingModal] updateColumnMapping:', { excelCol, selectedValue });

    if (selectedValue === 'create-new-column') {
      setCurrentExcelColumn(excelCol);
      const suggestedName = excelCol.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
      setNewColumnName(suggestedName);
      setNewColumnType(mappings[excelCol]?.inferredDataType || 'string');
      setNewColumnDialogOpen(true);
      handleMappingUpdate(excelCol, { action: 'create' });
    } else if (!selectedValue) {
      handleMappingUpdate(excelCol, { action: 'skip', mappedColumn: null, newColumnProposal: undefined });
    } else {
      handleMappingUpdate(excelCol, { action: 'map', mappedColumn: selectedValue, newColumnProposal: undefined });
    }
  };

  const handleCreateNewColumn = () => {
    console.log('[DEBUG ColumnMappingModal] handleCreateNewColumn:', { newColumnName, newColumnType });

    const trimmedName = newColumnName.trim();
    if (!trimmedName) {
      alert('Please enter a valid column name.');
      return;
    }
    const formattedColumnName = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_');

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
        sqlType: mapColumnTypeToSql(newColumnType), 
        isNullable: true, 
        sourceSheet: sheetState?.sheetName,
        sourceHeader: currentExcelColumn,
        createStructureOnly: createStructureOnly, 
    };

    handleMappingUpdate(currentExcelColumn, {
        action: 'create',
        mappedColumn: formattedColumnName, 
        newColumnProposal: proposal,
        inferredDataType: newColumnType, 
        reviewStatus: 'approved', 
    });

    setNewColumnDialogOpen(false);
    setNewColumnName('');
    setCurrentExcelColumn('');
    setCreateStructureOnly(false); 
  };

  const handleSave = () => {
    console.log('[DEBUG ColumnMappingModal] handleSave called.');
    const finalMappings = { ...mappings };

    // Finalize any pending new column creations that weren't explicitly saved through the sub-dialog
    // This handles cases where user might have selected 'Create New' but didn't complete the sub-dialog
    // and then hits the main save button.
    Object.keys(finalMappings).forEach(key => {
      if (finalMappings[key].action === 'create' && !finalMappings[key].newColumnProposal) {
        // If 'create' was selected but no proposal exists, revert to 'skip' or clear mappedColumn
        console.warn(`[DEBUG ColumnMappingModal] Reverting action for ${key} from 'create' to 'skip' due to missing newColumnProposal on final save.`);
        finalMappings[key] = {
          ...finalMappings[key],
          action: 'skip', // Revert to skip
          mappedColumn: null, // Ensure no dbColumn is set
          reviewStatus: finalMappings[key].reviewStatus === 'approved' ? 'modified' : finalMappings[key].reviewStatus // Mark as modified if was approved
        };
      }
    });

    onSave(finalMappings, isCreatingTable ? editableTableName : undefined);
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

  if (!sheetState) {
    console.log('[DEBUG ColumnMappingModal] Displaying loading indicator. Conditions:', {
      open,
      sheetState
    });
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
        Map Columns for Sheet: <strong>{sheetState?.sheetName || 'N/A'}</strong>
        {isCreatingTable 
          ? ` (New Table)` 
          : ` (Existing Table: ${actualTableNameFromSheetState})`}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {isCreatingTable && (
          <TextField
            label="New Table Name"
            value={editableTableName}
            onChange={(e) => setEditableTableName(e.target.value)}
            variant="outlined"
            size="small"
            sx={{ mt: 1, mb: 1, maxWidth: '400px' }} // Added margin and limited width
          />
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
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
        {/* Table view for column mapping */}
        <ColumnMappingTableView
          excelHeaders={memoizedExcelHeaders}
          mappings={mappings} 
          targetColumns={memoizedTargetColumns}
          sheetState={sheetState}
          isCreatingTable={isCreatingTable}
          getColumnSample={getColumnSample}
          onMappingUpdate={handleMappingUpdate} 
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
            Creating a new field in table '{actualTableNameFromSheetState}' for Excel column: <strong>{currentExcelColumn}</strong>
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewColumnType(e.target.value as ColumnType)} 
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
        </DialogContent> 
        <DialogActions>
          <Button onClick={() => { setNewColumnDialogOpen(false); setCreateStructureOnly(false); }}>Cancel</Button>
          <Button onClick={handleCreateNewColumn} variant="contained">Create Field</Button>
        </DialogActions>
      </Dialog> 
    </Dialog>
  );
};
