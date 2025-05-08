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
  ConfidenceLevel,
  RankedColumnSuggestion,
  TableColumn
} from './types';

import { VirtualizedColumnMapper } from './VirtualizedColumnMapper';
import { ColumnMappingTableView } from './ColumnMappingTableView';
import { toSqlFriendlyName } from './utils/stringUtils';

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

export interface ColumnMappingModalProps {
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
  // Debug logging removed

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
  
  // Helper function to convert DB type to column type
  const mapDbTypeToColumnType = (dbType: string | undefined): ColumnType => {
    if (!dbType) return 'string';
    
    const typeLC = dbType.toLowerCase();
    
    if (
      typeLC.includes('int') || 
      typeLC.includes('float') || 
      typeLC.includes('double') || 
      typeLC.includes('decimal') || 
      typeLC.includes('numeric')
    ) {
      return 'number';
    } else if (
      typeLC.includes('bool')
    ) {
      return 'boolean';
    } else if (
      typeLC.includes('date') || 
      typeLC.includes('time')
    ) {
      return 'date';
    } else {
      return 'string';
    }
  };

  // Helper function to get or create a complete BatchColumnMapping
  const getOrCreateMappingForHeader = (
    header: string,
    currentSheetState: SheetProcessingState | null,
    existingMappings?: Record<string, BatchColumnMapping> // Optional existing mappings to check first
  ): BatchColumnMapping => {
    // ALWAYS CHECK if we're creating a new table (for defaulting to 'create' action)
    // This is critical for ensuring we default to 'create' for new tables
    const isNewTableMapping = isCreatingTable || currentSheetState?.isNewTable === true;
    
    // Debug logging removed as requested to reduce console noise
    
    if (!currentSheetState) {
      // Fallback if sheetState is null - should ideally not happen if called correctly
      return {
        header: header,
        sampleValue: '',
        mappedColumn: null,
        suggestedColumns: [],
        inferredDataType: null,
        action: isNewTableMapping ? 'create' : 'map', // Default based on table type
        status: 'pending',
        reviewStatus: 'pending',
        newColumnProposal: undefined,
        confidenceScore: undefined,
        confidenceLevel: undefined,
        errorMessage: undefined,
      };
    }

    const mappingFromSheetState = currentSheetState.columnMappings?.[header];
    const mappingFromExisting = existingMappings?.[header];

    const base = mappingFromExisting || mappingFromSheetState;

    const sampleVal = currentSheetState?.sampleData?.[0]?.[header] ?? '';

    // For new tables, ALWAYS generate a proper SQL-friendly column name using shared utility
    // Import toSqlFriendlyName is already in the imports
    const normalizedHeader = toSqlFriendlyName(header.toLowerCase());
    
    // For new tables, ALWAYS create a default new column proposal
    const newProposal = {
      type: 'new_column' as const,
      details: {
        columnName: normalizedHeader,
        sqlType: 'TEXT', // Default SQL type, can be changed by user
        isNullable: true,
        sourceSheet: currentSheetState.sheetName,
        sourceHeader: header
      }
    };

    if (base) {
      let finalAction = base.action;
      let finalNewColumnProposal = base.newColumnProposal;
      let finalMappedColumn = base.mappedColumn;
      let finalConfidenceScore = base.confidenceScore;
      let finalConfidenceLevel = base.confidenceLevel;
      let finalStatus = base.status; // Preserve status unless overridden

      if (isNewTableMapping) {
        // For new tables, default to 'create' if prior action was 'skip', a mere suggestion, or missing.
        // This ensures new tables robustly suggest creating new fields.
        if (base.action === 'skip' || 
            (base.action === 'map' && (!base.mappedColumn || base.status === 'suggested')) || 
            !base.action
           ) {
          finalAction = 'create';
          finalNewColumnProposal = newProposal; 
          finalMappedColumn = normalizedHeader; 
          finalConfidenceScore = 1.0;
          finalConfidenceLevel = 'High';
          finalStatus = 'pending'; // Reset status for the new default suggestion
        } else if (base.action === 'create') {
          // If action is already 'create', ensure it has a valid proposal and mappedColumn reflects it.
          finalNewColumnProposal = base.newColumnProposal || newProposal;
          finalMappedColumn = finalNewColumnProposal.details.columnName;
          // Keep existing confidence if it's a user-confirmed create, otherwise boost for new suggestion.
          if (!base.newColumnProposal) { // If we added the newProposal
            finalConfidenceScore = 1.0;
            finalConfidenceLevel = 'High';
            finalStatus = 'pending';
          }
        }
        // If base.action was a confirmed 'map' (e.g., user mapped to existing field) or a confirmed 'create',
        // that specific user choice should be respected even for new tables (though mapping to existing on new table is rare).
      }
      
      return {
        header: base.header || header,
        sampleValue: base.sampleValue ?? sampleVal,
        mappedColumn: finalMappedColumn,
        suggestedColumns: base.suggestedColumns || [],
        inferredDataType: base.inferredDataType || 'string',
        action: finalAction,
        status: finalStatus, 
        reviewStatus: base.reviewStatus || 'pending',
        newColumnProposal: finalNewColumnProposal,
        confidenceScore: finalConfidenceScore,
        confidenceLevel: finalConfidenceLevel,
        errorMessage: base.errorMessage,
      };
    }

    // Fallback: No existing mapping found in sheetState or passed existingMappings
    // Set appropriate action based on whether this is a new table
    // For new tables, ALWAYS use 'create'
    const defaultAction = isNewTableMapping ? 'create' : 'map';
    
    return {
      header: header,
      sampleValue: sampleVal,
      mappedColumn: defaultAction === 'create' ? normalizedHeader : null,
      suggestedColumns: [],
      inferredDataType: 'string', // Default, can be refined
      action: defaultAction,
      status: 'pending',
      reviewStatus: 'pending',
      newColumnProposal: defaultAction === 'create' ? newProposal : undefined,
      confidenceScore: defaultAction === 'create' ? 1.0 : undefined,
      confidenceLevel: defaultAction === 'create' ? 'High' : undefined,
      errorMessage: undefined,
    };
  };

  const [mappings, setMappings] = useState<Record<string, BatchColumnMapping>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'virtualized'>('table'); 
  const [newColumnDialogOpen, setNewColumnDialogOpen] = useState(false);
  const [currentExcelColumn, setCurrentExcelColumn] = useState<string>('');
  const [newColumnName, setNewColumnName] = useState<string>('');
  const [newColumnType, setNewColumnType] = useState<ColumnType>('string');
  const [createStructureOnly, setCreateStructureOnly] = useState<boolean>(false); 
  const [editableTableName, setEditableTableName] = useState<string>(''); // State for editable table name
  
  // Initialize editableTableName when the modal opens
  useEffect(() => {
    if (open && isCreatingTable && sheetState?.selectedTable) {
      let currentTableName = '';
      
      if (sheetState.selectedTable.startsWith('new:')) {
        // Case 1: Extract table name from the selectedTable value by removing 'new:' prefix
        currentTableName = sheetState.selectedTable.substring(4);
      } else if (sheetState.isNewTable || isCreatingTable) {
        // Case 2: Handle tables with import_ prefix or other formats that are marked as new
        currentTableName = sheetState.selectedTable;
      }
      
      setEditableTableName(currentTableName);
    }
  }, [open, isCreatingTable, sheetState]);

  const actualTableNameFromSheetState = useMemo(() => {
    if (!sheetState?.selectedTable) return 'Unknown Table';
    
    // If it's explicitly marked as creating a new table with the 'new:' prefix
    if (isCreatingTable && sheetState.selectedTable.startsWith('new:')) {
      return sheetState.selectedTable.substring(4);
    }
    // If it's marked as creating a new table (isNewTable flag) but doesn't have the 'new:' prefix
    // This handles the case of "import_" prefixed tables that are new but don't use the 'new:' convention
    else if (isCreatingTable || sheetState.isNewTable) {
      return sheetState.selectedTable;
    }
    // Default case - existing table
    return sheetState.selectedTable;
  }, [sheetState?.selectedTable, isCreatingTable, sheetState?.isNewTable]);

  const memoizedExcelHeaders = useMemo(() => {
    // CASE 1: Use headers from sheet state if available
    if (sheetState?.headers && Array.isArray(sheetState.headers) && sheetState.headers.length > 0) {
      // Filter based on search query if any
      const headers = sheetState.headers.filter(header => 
        header && typeof header === 'string' && 
        header.toLowerCase().includes(searchQuery.toLowerCase())
      );
      
      console.log('[DEBUG ColumnMappingModal] memoizedExcelHeaders from sheet headers:', headers);
      return headers;
    }
    
    // CASE 2: For empty headers, fall back to table columns from database if table is selected
    if (sheetState?.selectedTable && tableInfo?.columns && tableInfo.columns.length > 0) {
      console.log('[DEBUG ColumnMappingModal] No headers in sheet - falling back to table columns');
      // Use the database columns as headers (skip system columns)
      const dbHeaders = tableInfo.columns
        .filter(col => !['id', 'created_at', 'updated_at'].includes(col.columnName))
        .map(col => col.columnName)
        .filter(header => header.toLowerCase().includes(searchQuery.toLowerCase()));
        
      console.log('[DEBUG ColumnMappingModal] Using tableInfo columns as headers:', dbHeaders);
      return dbHeaders;
    }
    
    // CASE 3: No headers available
    console.warn('[DEBUG ColumnMappingModal] No headers found in sheet or table info');
    return [];
  }, [sheetState, tableInfo, searchQuery]);

  const memoizedTargetColumns = useMemo(() => {
    return (tableInfo?.columns || []).filter(col => !['id', 'created_at', 'updated_at'].includes(col.columnName));
  }, [tableInfo]);

  const initialMappings = useMemo(() => {
    const mappings: Record<string, BatchColumnMapping> = {};
    if (sheetState?.headers) {
      sheetState.headers.forEach(header => {
        // Pass sheetState directly, getOrCreateMappingForHeader will handle its columnMappings
        mappings[header] = getOrCreateMappingForHeader(header, sheetState);
      });
    }
    return mappings;
  }, [sheetState, isCreatingTable]);

  useEffect(() => {
    if (sheetState) {
      const currentHeaders = sheetState.headers;
      const newProcessedMappings: Record<string, BatchColumnMapping> = {};

      // Process mappings

      currentHeaders.forEach(header => {
        const local = mappings[header];
        const initial = initialMappings[header];
        
        // Start with a base, prioritizing local, then initial, then fresh default
        const baseForConstruction = local || initial || getOrCreateMappingForHeader(header, sheetState);

        // For new tables, FORCE 'create' action and include proposals unless user explicitly changed it
        const forceCreateForNewTable = (isCreatingTable || sheetState.isNewTable) && 
                                      (!baseForConstruction.action || 
                                       (baseForConstruction.action === 'map' && baseForConstruction.status === 'suggested'));
        
        if (forceCreateForNewTable) {
          // Explicitly set create action for new tables
          
          // Create a SQL-friendly column name
          const sqlFriendlyName = header.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
          
          // Create a proper proposal
          const newProposal = {
            type: 'new_column' as const,
            details: {
              columnName: sqlFriendlyName,
              sqlType: mapColumnTypeToSql(baseForConstruction.inferredDataType || 'string'),
              isNullable: true,
              sourceSheet: sheetState.sheetName,
              sourceHeader: header
            }
          };
          
          newProcessedMappings[header] = {
            header: header,
            sampleValue: baseForConstruction.sampleValue ?? sheetState?.sampleData?.[0]?.[header] ?? '',
            mappedColumn: sqlFriendlyName, // Use SQL-friendly name for new columns
            suggestedColumns: baseForConstruction.suggestedColumns || [],
            inferredDataType: baseForConstruction.inferredDataType || 'string',
            action: 'create', // Force to create
            status: 'suggested',
            reviewStatus: 'pending',
            newColumnProposal: newProposal,
            confidenceScore: 1.0, // High confidence
            confidenceLevel: 'High', // High confidence
            errorMessage: baseForConstruction.errorMessage,
          };
        } else {
          // Normal case - use what we have
          newProcessedMappings[header] = {
            header: header, // Always use the current header from iteration
            sampleValue: baseForConstruction.sampleValue ?? sheetState?.sampleData?.[0]?.[header] ?? '',
            mappedColumn: baseForConstruction.mappedColumn,
            suggestedColumns: baseForConstruction.suggestedColumns || [],
            inferredDataType: baseForConstruction.inferredDataType,
            action: baseForConstruction.action || 'map',
            status: baseForConstruction.status || 'pending',
            reviewStatus: baseForConstruction.reviewStatus || 'pending',
            newColumnProposal: baseForConstruction.newColumnProposal,
            confidenceScore: baseForConstruction.confidenceScore,
            confidenceLevel: baseForConstruction.confidenceLevel,
            errorMessage: baseForConstruction.errorMessage,
          };
        }
      });

      // Sample checking removed

      // Prune mappings for headers that no longer exist
      Object.keys(mappings).forEach(header => {
        if (!currentHeaders.includes(header)) {
          // This would modify newProcessedMappings if we were building upon it
          // But since we are creating it fresh, we just don't add old headers.
        } else if (!newProcessedMappings[header]) {
           // This case implies a header was in localMappings but not currentHeaders,
           // effectively handled by iterating currentHeaders only for construction.
        }
      });
       // Create a new object for setMappings to ensure re-render if changed.
      const finalMappingsToSet: Record<string, BatchColumnMapping> = {};
      currentHeaders.forEach(header => {
        finalMappingsToSet[header] = newProcessedMappings[header];
      });

      if (JSON.stringify(finalMappingsToSet) !== JSON.stringify(mappings)) {
        setMappings(finalMappingsToSet);
      }
    }
  }, [sheetState, initialMappings, mappings, isCreatingTable, mapColumnTypeToSql]);

  const handleMappingUpdate = (excelCol: string, changes: Partial<BatchColumnMapping>) => {
    // Debug logging removed

    if ((changes.action === 'create' && !changes.newColumnProposal) ||
        (changes.action === 'create' && (changes as any).openDialog)) {
      // Handle the dialog opening case
      setCurrentExcelColumn(excelCol);
      const suggestedName = excelCol.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
      setNewColumnName(suggestedName);
      setNewColumnType(mappings[excelCol]?.inferredDataType || 'string');
      setNewColumnDialogOpen(true);
      
      // Create the proposal with good defaults for new tables
      const newProposal = {
        type: 'new_column' as const,
        details: {
          columnName: suggestedName,
          sqlType: mapColumnTypeToSql(mappings[excelCol]?.inferredDataType || 'string'),
          isNullable: true,
          sourceSheet: sheetState?.sheetName,
          sourceHeader: excelCol
        }
      };
      
      // Set good defaults immediately, not just an action
      setMappings(prev => ({
        ...prev,
        [excelCol]: {
          ...prev[excelCol],
          action: 'create',
          mappedColumn: suggestedName,
          newColumnProposal: newProposal,
          status: 'userModified',
          reviewStatus: 'pending',
          confidenceScore: 1.0,
          confidenceLevel: 'High'
        }
      }));
      return; // Important - already updated state above
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
      // Set current Excel column for the new column dialog
      setCurrentExcelColumn(excelCol);
      
      // Generate a SQL-friendly name from the Excel column name
      const suggestedName = excelCol.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
      
      // Set the suggested name in the dialog
      setNewColumnName(suggestedName);
      
      // Use the inferred data type if available or default to string
      setNewColumnType(mappings[excelCol]?.inferredDataType || 'string');
      
      // Open the new column dialog
      setNewColumnDialogOpen(true);
      
      // Update the mapping to indicate creation action (will be finalized when dialog is confirmed)
      handleMappingUpdate(excelCol, { 
        action: 'create'
      });
    } else if (selectedValue === 'skip-column') {
      // Explicit skip action with UI notification
      handleMappingUpdate(excelCol, { 
        action: 'skip', 
        mappedColumn: null, 
        newColumnProposal: undefined,
        reviewStatus: 'approved', // Mark as approved since user explicitly chose to skip
      });
    } else if (!selectedValue) {
      // Default skip action (when no selection is made)
      handleMappingUpdate(excelCol, { 
        action: 'skip', 
        mappedColumn: null, 
        newColumnProposal: undefined 
      });
    } else {
      // Map to an existing column
      handleMappingUpdate(excelCol, { 
        action: 'map', 
        mappedColumn: selectedValue, 
        newColumnProposal: undefined,
        reviewStatus: 'approved', // Mark as approved since user explicitly selected a mapping
      });
    }
  };

  const handleCreateNewColumn = () => {
    console.log('[DEBUG ColumnMappingModal] handleCreateNewColumn:', { newColumnName, newColumnType });

    const trimmedName = newColumnName.trim();
    if (!trimmedName) {
      alert('Please enter a valid column name.');
      return;
    }
    
    // Format to SQL-friendly name
    const formattedColumnName = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_');

    // Check for duplicates against existing columns and other planned new columns
    const existingDbCols = memoizedTargetColumns.map(c => c.columnName);
    const otherNewCols = Object.values(mappings)
        .filter(m => m.action === 'create' && m.header !== currentExcelColumn)
        .map(m => m.newColumnProposal?.columnName);

     if (existingDbCols.includes(formattedColumnName) || otherNewCols.includes(formattedColumnName)) {
         alert(`Column name "${formattedColumnName}" already exists or is planned. Please choose a different name.`);
        return;
    }

    // Create the column proposal with match percentage information
    const proposal: NewColumnProposal = {
        columnName: formattedColumnName,
        sqlType: mapColumnTypeToSql(newColumnType), 
        isNullable: true, 
        sourceSheet: sheetState?.sheetName,
        sourceHeader: currentExcelColumn,
        createStructureOnly: createStructureOnly, 
    };

    // Update the mapping with the new column information and 100% confidence 
    // since it's user-created
    handleMappingUpdate(currentExcelColumn, {
        action: 'create',
        mappedColumn: formattedColumnName, 
        newColumnProposal: proposal,
        inferredDataType: newColumnType, 
        reviewStatus: 'approved',
        confidenceScore: 1.0, // 100% confidence for user-created columns
        confidenceLevel: 'High', // High confidence for user-created columns
        possibleNewColumnName: formattedColumnName, // Store the SQL-friendly name
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
      
      // Ensure all mappings have a reviewStatus (default to 'approved' if user saved)
      if (!finalMappings[key].reviewStatus) {
        finalMappings[key].reviewStatus = 'approved';
      }
    });

    // Set all mappings to 'approved' status since the user has explicitly saved them
    const allApproved = Object.keys(finalMappings).every(key => 
      finalMappings[key].action === 'skip' || 
      (finalMappings[key].action === 'map' && finalMappings[key].mappedColumn) ||
      (finalMappings[key].action === 'create' && finalMappings[key].newColumnProposal)
    );

    // Pass both mappings and approval status
    onSave(finalMappings, isCreatingTable ? editableTableName : undefined);
    onClose();
  };

  const getColumnSample = (columnName: string) => {
    // Handle empty dataset cases more explicitly
    if (!sheetState?.sampleData || sheetState.sampleData.length === 0) {
      // Return a more informative message for empty tables
      return 'No sample data available (empty table)';
    }
    
    // Extract and filter sample values
    const samples = sheetState.sampleData
        .map(row => row[columnName])
        .filter(value => value !== undefined && value !== null && value !== '')
        .slice(0, 5);
        
    if (samples.length === 0) {
      // More specific message when this column is empty
      return '(column contains no data)';
    }
    
    // Format sample values with truncation
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
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {isCreatingTable && (
            <Typography 
              variant="body2" 
              color="info.main" 
              sx={{ mr: 2 }}
            >
              New tables require review before import (columns default to "Create New Field")
            </Typography>
          )}
          <Button onClick={onClose} startIcon={<CloseIcon />}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            color="primary"
            startIcon={<CheckIcon />}
          >
            Save Mappings
          </Button>
        </Box>
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
            Creating a new field in {isCreatingTable ? 'new' : 'existing'} table '{actualTableNameFromSheetState}' for Excel column: <strong>{currentExcelColumn}</strong>
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
            disabled={false} // Always enabled
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
              // Add a key to force re-render and debug mode to verify it's working
              key={`radio-group-${Date.now()}`}
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
          <Button 
            onClick={() => { setNewColumnDialogOpen(false); setCreateStructureOnly(false); }}
            disabled={false} // Always enable cancel
          >
            Cancel
          </Button>
          <Button 
            onClick={handleCreateNewColumn} 
            variant="contained"
            disabled={false} // Always enable create
          >
            Create Field
          </Button>
        </DialogActions>
      </Dialog> 
    </Dialog>
  );
};
