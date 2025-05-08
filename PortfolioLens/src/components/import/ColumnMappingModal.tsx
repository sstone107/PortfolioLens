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
import { inferDataType } from './dataTypeInference';
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

  // Helper function to infer data type from column header and sample value
  // Now leverages the more robust implementation from dataTypeInference.ts
  const inferColumnDataType = (header: string, sampleVal: any): ColumnType => {
    // Use the imported function with an array of sample values
    return inferDataType([sampleVal], header);
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
    
    // Add diagnostic logging to track mapping creation
    console.log(`[DEBUG] getOrCreateMappingForHeader: ${header}, isNewTable: ${isNewTableMapping}`);
    
    if (!currentSheetState) {
      // Fallback if sheetState is null - should ideally not happen if called correctly
      return {
        header: header,
        sampleValue: '',
        mappedColumn: null,
        suggestedColumns: [],
        inferredDataType: 'string', // Default to string instead of null
        action: isNewTableMapping ? 'create' : 'map', // Default based on table type
        status: 'pending',
        reviewStatus: 'pending',
        newColumnProposal: undefined,
        confidenceScore: undefined,
        confidenceLevel: undefined,
        errorMessage: undefined,
      };
    }

    const mappingFromSheetState = currentSheetState?.columnMappings?.[header];
    const mappingFromExisting = existingMappings?.[header];

    const base = mappingFromExisting || mappingFromSheetState;
    
    // Log if we're using base mapping to diagnose issues
    if (base) {
      console.log(`[DEBUG] Using existing mapping for ${header}. Action: ${base.action}, Type: ${base.inferredDataType}`);
    } else {
      console.log(`[DEBUG] No existing mapping found for ${header}, creating new one`);
    }

    // For new tables, ALWAYS generate a proper SQL-friendly column name
    const normalizedHeader = toSqlFriendlyName(header.toLowerCase());
    
    // Check if we're dealing with an empty dataset or empty column
    const sampleValue = currentSheetState?.sampleData?.[0]?.[header] ?? '';
    const isEmptySheet = !currentSheetState?.sampleData || currentSheetState.sampleData.length === 0; 
    const isEmptyColumn = currentSheetState?.sampleData?.every(row => 
      row[header] === undefined || row[header] === null || row[header] === '') ?? true;
    
    // Log empty status for debugging
    if (isEmptySheet || isEmptyColumn) {
      console.log(`[DEBUG] ${header} has no data. Empty sheet: ${isEmptySheet}, Empty column: ${isEmptyColumn}`);
    }
    
    // Enhanced type detection that works for empty sheets and empty columns
    // Use our improved inferDataType function which now handles empty datasets better
    // If the column has sample data, get all available samples (up to 5)
    const sampleValues = isEmptySheet || isEmptyColumn ? [] : 
      currentSheetState.sampleData
        .slice(0, 5)
        .map(row => row[header])
        .filter(val => val !== undefined && val !== null && val !== '');
      
    // Pass all collected samples to inferDataType for better type detection
    const detectedType = inferDataType(sampleValues, header);
    console.log(`[DEBUG] Detected type for ${header}: ${detectedType} (based on ${sampleValues.length} samples)`);
    
    // Map the detected type to an SQL type
    const inferredSqlType = mapColumnTypeToSql(detectedType);

const newProposal = {
      type: 'new_column' as const,
      details: {
        columnName: normalizedHeader,
        sqlType: inferredSqlType, // Use inferred SQL type based on column name and data
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
    
    // Generate improved suggestions for better auto-mapping
    const suggestedColumns: RankedColumnSuggestion[] = [];
    if (!isNewTableMapping && tableInfo?.columns && tableInfo.columns.length > 0) {
      // Get database columns for matching (exclude system columns)
      const dbColumns = tableInfo.columns
        .filter(col => !['id', 'created_at', 'updated_at'].includes(col.columnName));
      
      // Find exact and fuzzy matches based on column names
      const headerLower = header.toLowerCase();
      
      // First try exact match (case-insensitive)
      const exactMatches = dbColumns.filter(col => 
        col.columnName.toLowerCase() === headerLower);
      
      if (exactMatches.length > 0) {
        suggestedColumns.push({
          columnName: exactMatches[0].columnName,
          confidenceScore: 0.95,
          confidenceLevel: 'High',
          isTypeCompatible: true
        });
      }
      
      // Then try case-insensitive contains/partial matches
      const partialMatches = dbColumns.filter(col => {
        // Skip if already added as exact match
        if (exactMatches.some(m => m.columnName === col.columnName)) return false;
        
        // Look for substring matches
        const colLower = col.columnName.toLowerCase();
        return colLower.includes(headerLower) || headerLower.includes(colLower);
      });
      
      partialMatches.forEach(col => {
        const colLower = col.columnName.toLowerCase();
        // Calculate score based on string similarity
        let score = 0.7; // Base score for partial matches
        
        // Higher score for begining/ending matches
        if (colLower.startsWith(headerLower) || headerLower.startsWith(colLower)) {
          score = 0.85;
        }
        
        // Length similarity also affects confidence 
        const lengthRatio = Math.min(headerLower.length, colLower.length) / 
                           Math.max(headerLower.length, colLower.length);
        score = score * (0.5 + (lengthRatio * 0.5)); // Adjust score by length ratio
        
        const confidenceLevel: ConfidenceLevel = 
          score > 0.8 ? 'High' : 
          score > 0.6 ? 'Medium' : 'Low';
        
        suggestedColumns.push({
          columnName: col.columnName,
          confidenceScore: score,
          confidenceLevel,
          isTypeCompatible: true
        });
        
      });
      
      // Sort suggestions by confidence score
      suggestedColumns.sort((a, b) => b.confidenceScore - a.confidenceScore);
    }
    
    // Use enhanced inferDataType function to determine data type
    // Get sample values for better inference
    const allSampleValues = currentSheetState?.sampleData
      ?.slice(0, 5)
      ?.map(row => row[header])
      ?.filter(val => val !== undefined && val !== null) || [];
      
    // Use robust data type inference
    let inferredType: ColumnType = inferDataType(allSampleValues, header);
    
    // For new mapping, try auto-mapping if we have good suggestions
    let mappedColumn = defaultAction === 'create' ? normalizedHeader : null;
    let confidenceScore = defaultAction === 'create' ? 1.0 : undefined;
    let confidenceLevel: ConfidenceLevel | undefined = defaultAction === 'create' ? 'High' : undefined;
    
    // Auto-map to the best match if score > 0.85 and not creating a table
    if (!isNewTableMapping && suggestedColumns.length > 0 && suggestedColumns[0].confidenceScore > 0.85) {
      mappedColumn = suggestedColumns[0].columnName;
      confidenceScore = suggestedColumns[0].confidenceScore;
      confidenceLevel = suggestedColumns[0].confidenceLevel;
    }
    
    return {
      header: header,
      sampleValue: sampleVal,
      mappedColumn,
      suggestedColumns,
      inferredDataType: inferredType,
      action: defaultAction,
      status: 'pending',
      reviewStatus: 'pending',
      newColumnProposal: defaultAction === 'create' ? newProposal : undefined,
      confidenceScore,
      confidenceLevel,
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
    // Log debugging info about headers
    console.log('[DEBUG memoizedExcelHeaders] sheetState:', 
                sheetState?.sheetName,
                'Headers:', sheetState?.headers?.length,
                'HasHeaders array?', !!(sheetState?.headers && Array.isArray(sheetState.headers)),
                'IsNewTable:', isCreatingTable,
                'RowCount:', sheetState?.rowCount);
    
    // CRITICAL FIX: For completely empty sheets when creating a new table, ALWAYS create a default header
    // This needs to be checked first to ensure empty sheets get at least one column
    if (isCreatingTable && sheetState?.rowCount === 0) {
      // Create default columns for empty sheet
      console.log('[DEBUG] Creating default headers for empty new table');
      // Create at least one column, but preferably a few useful default columns
      const defaultHeaders = ['id', 'name', 'description', 'created_date'];
      return defaultHeaders;
    }
    
    // CASE 1: Use headers from sheet state if available
    if (sheetState?.headers && Array.isArray(sheetState.headers) && sheetState.headers.length > 0) {
      // Filter based on search query if any
      const headers = sheetState.headers.filter(header => 
        header && typeof header === 'string' && 
        header.toLowerCase().includes(searchQuery.toLowerCase())
      );
      
      // Log the filtered headers
      console.log('[DEBUG] Filtered headers:', headers.length);
      return headers;
    }
    
    // CASE 2: For empty headers, fall back to table columns from database if table is selected
    // and we're not creating a new table
    if (!isCreatingTable && sheetState?.selectedTable && tableInfo?.columns && tableInfo.columns.length > 0) {
      // Use the database columns as headers (skip system columns)
      const dbHeaders = tableInfo.columns
        .filter(col => !['id', 'created_at', 'updated_at'].includes(col.columnName))
        .map(col => col.columnName)
        .filter(header => header.toLowerCase().includes(searchQuery.toLowerCase()));
        
      console.log('[DEBUG] Using DB columns as headers:', dbHeaders.length);
      return dbHeaders;
    }
    
    // CASE 3: For new tables, use the sheet headers directly even if they're empty
    // This is a special case for empty sheets with just headers
    if (isCreatingTable && sheetState?.headers && Array.isArray(sheetState.headers)) {
      // Filter based on search query if any, but include all headers
      const headers = sheetState.headers.filter(header => 
        header && typeof header === 'string' && 
        header.toLowerCase().includes(searchQuery.toLowerCase())
      );
      
      console.log('[DEBUG] Using headers for new table:', headers.length);
      return headers;
    }
    
    // Fallback: If we somehow haven't returned yet but we're creating a new table,
    // still create some default columns as backup
    if (isCreatingTable) {
      console.log('[DEBUG] Fallback: Creating default headers for new table');
      return ['default_column'];
    }
    
    // CASE 5: No headers available
    console.log('[DEBUG] No headers available');
    return [];
  }, [sheetState, tableInfo, searchQuery, isCreatingTable]);

  const memoizedTargetColumns = useMemo(() => {
    return (tableInfo?.columns || []).filter(col => !['id', 'created_at', 'updated_at'].includes(col.columnName));
  }, [tableInfo]);

  const initialMappings = useMemo(() => {
    // Log the sheet state for debugging
    console.log('[DEBUG] initialMappings for sheet:', 
                sheetState?.sheetName, 
                'Headers:', sheetState?.headers?.length, 
                'Rows:', sheetState?.rowCount);
                
    const mappings: Record<string, BatchColumnMapping> = {};
    
    // Special case for empty sheets (0 rows) when creating a new table
    const isEmptySheet = sheetState?.rowCount === 0;
    const hasNoHeaders = !sheetState?.headers || sheetState.headers.length === 0;
    
    // If we have a completely empty sheet but we're creating a new table,
    // create default column mappings with useful standard columns
    if (isCreatingTable && isEmptySheet) {
      // Create useful default columns for empty sheets
      const defaultHeaders = ['id', 'name', 'description', 'created_date'];
      
      defaultHeaders.forEach(header => {
        // Infer type based on column name
        let inferredType: ColumnType = 'string';
        if (header.includes('date') || header.includes('created') || header.includes('updated')) {
          inferredType = 'date';
        } else if (header === 'id' || header.includes('_id')) {
          inferredType = 'number';
        }
        
        // Map type to SQL
        const sqlType = 
          inferredType === 'string' ? 'TEXT' :
          inferredType === 'number' ? 'NUMERIC' :
          inferredType === 'date' ? 'TIMESTAMP WITH TIME ZONE' :
          inferredType === 'boolean' ? 'BOOLEAN' : 'TEXT';
        
        mappings[header] = {
          header: header,
          sampleValue: '',
          mappedColumn: header,
          suggestedColumns: [],
          inferredDataType: inferredType,
          action: 'create',
          status: 'pending',
          reviewStatus: 'pending',
          confidenceScore: 1.0,
          confidenceLevel: 'High',
          newColumnProposal: {
            type: 'new_column',
            details: {
              columnName: header,
              sqlType: sqlType,
              isNullable: header === 'id' ? false : true,
              sourceSheet: sheetState?.sheetName || 'unknown',
              sourceHeader: header
            }
          }
        };
      });
      
      console.log('[DEBUG] Created default mappings for empty new table:', Object.keys(mappings).join(', '));
      return mappings;
    }
    
    // Normal case: process headers from the sheet
    if (sheetState?.headers) {
      // Always create mappings for all headers, even if there's no sample data
      sheetState.headers.forEach(header => {
        // Pass sheetState directly, getOrCreateMappingForHeader will handle its columnMappings
        mappings[header] = getOrCreateMappingForHeader(header, sheetState);
        
        // If creating a new table, force the action to be 'create'
        if (isCreatingTable) {
          const sqlFriendlyName = header.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
          
          // Infer data type from header name when no sample data
          let inferredType: ColumnType = 'string';
          if (/date|dt|time|created|updated|birth|dob/i.test(header)) {
            inferredType = 'date';
          } else if (/count|amount|balance|price|cost|rate|percent|number/i.test(header)) {
            inferredType = 'number';
          } else if (/is|has|active|flag|indicator/i.test(header)) {
            inferredType = 'boolean';
          }
          
          // Create default mapping
          mappings[header] = {
            ...mappings[header],
            action: 'create',
            mappedColumn: sqlFriendlyName,
            inferredDataType: inferredType,
            // Create new column proposal
            newColumnProposal: {
              type: 'new_column',
              details: {
                columnName: sqlFriendlyName,
                sqlType: mapColumnTypeToSql(inferredType),
                isNullable: true,
                sourceSheet: sheetState.sheetName,
                sourceHeader: header
              }
            }
          };
        }
      });
    }
    
    // Log the created mappings count
    console.log('[DEBUG] Created mappings for', Object.keys(mappings).length, 'headers');
    
    return mappings;
  }, [sheetState, isCreatingTable, mapColumnTypeToSql]);

  useEffect(() => {
    if (sheetState) {
      console.log('[DEBUG] Processing mappings in useEffect, sheetState.rowCount:', sheetState.rowCount);
      
      // CRITICAL FIX: Use excelHeaders from memoizedExcelHeaders for empty sheets instead of sheetState.headers
      // This ensures we process the generated default headers for empty sheets
      const currentHeaders = sheetState.rowCount === 0 && isCreatingTable ? 
                            memoizedExcelHeaders : sheetState.headers;
      const newProcessedMappings: Record<string, BatchColumnMapping> = {};

      // Special case: For completely empty sheets when creating a new table,
      // create default mappings with intelligent data type detection
      if (isCreatingTable && sheetState.rowCount === 0) {
        console.log('[DEBUG] Creating default mappings for empty sheet with headers:', memoizedExcelHeaders.join(', '));
        
        // Use memoizedExcelHeaders which contains our generated default columns
        memoizedExcelHeaders.forEach(header => {
          // Use our enhanced inferDataType function for better type detection from field names
          const inferredType = inferDataType([], header);
          
          console.log(`[DEBUG] Inferred type for empty sheet column ${header}: ${inferredType}`);
          
          // SQL friendly column name
          const sqlFriendlyName = header.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
          
          // SQL type mapping
          const sqlType = mapColumnTypeToSql(inferredType);
          
          // Create the proposal with the correct data type
          const newProposal = {
            type: 'new_column' as const,
            details: {
              columnName: sqlFriendlyName,
              sqlType: sqlType,
              isNullable: header === 'id' ? false : true,
              sourceSheet: sheetState.sheetName || 'unknown',
              sourceHeader: header
            }
          };
          
          // Create the full mapping
          newProcessedMappings[header] = {
            header: header,
            sampleValue: '',
            mappedColumn: sqlFriendlyName,
            suggestedColumns: [],
            inferredDataType: inferredType,
            action: 'create',
            status: 'pending',
            reviewStatus: 'pending',
            newColumnProposal: newProposal,
            confidenceScore: 1.0,
            confidenceLevel: 'High',
            errorMessage: undefined,
          };
        });
        
        // Create a new object for setMappings to ensure re-render
        const finalMappingsToSet = { ...newProcessedMappings };
        console.log(`[DEBUG] Final mappings for empty sheet: ${Object.keys(finalMappingsToSet).join(', ')}`);
        setMappings(finalMappingsToSet);
        return; // Skip the rest of processing for empty sheets
      }

      // Normal case - process mappings for sheets with data
      currentHeaders.forEach(header => {
        const local = mappings[header];
        const initial = initialMappings[header];
        
        // Start with a base, prioritizing local (user edits), then initial, then fresh default
        const baseForConstruction = local || initial || getOrCreateMappingForHeader(header, sheetState);
        
        // *** CRITICAL FIX: Check for user modifications before overriding values ***
        // If the user has explicitly set action='create' or action='map', preserve that choice
        const userHasExplicitlySet = local?.status === 'userModified' || 
                                     local?.reviewStatus === 'approved';
        
        if (userHasExplicitlySet) {
          console.log(`[DEBUG] Preserving user selection for ${header}. Action: ${local?.action}, Type: ${local?.inferredDataType}`);
          newProcessedMappings[header] = { ...local };
          // Continue to next item in forEach loop, not exiting the entire effect
          return;
        }

        // Get all available sample values (up to 5) for this header to improve type detection
        const sampleValues = sheetState?.sampleData
          ?.slice(0, 5)
          ?.map(row => row[header])
          ?.filter(val => val !== undefined && val !== null && val !== '') || [];
        
        // Check if we're dealing with an empty column
        const isEmptyColumn = sampleValues.length === 0;
        
        // Determine inferred data type using our enhanced function
        const detectedDataType = inferDataType(sampleValues, header);
        console.log(`[DEBUG] Detected type for ${header}: ${detectedDataType} (empty: ${isEmptyColumn})`);
        
        // For new tables, FORCE 'create' action and include proposals unless user explicitly changed it
        const forceCreateForNewTable = (isCreatingTable || sheetState.isNewTable) && 
                                      (!baseForConstruction.action || 
                                       (baseForConstruction.action === 'map' && baseForConstruction.status === 'suggested'));
        
        if (forceCreateForNewTable) {
          // Explicitly set create action for new tables
          console.log(`[DEBUG] Forcing 'create' action for ${header} in new table`);
          
          // Create a SQL-friendly column name
          const sqlFriendlyName = header.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
          
          // Create a proper proposal with inferred data type
          const newProposal = {
            type: 'new_column' as const,
            details: {
              columnName: sqlFriendlyName,
              sqlType: mapColumnTypeToSql(detectedDataType),
              isNullable: true,
              sourceSheet: sheetState.sheetName,
              sourceHeader: header
            }
          };
          
          newProcessedMappings[header] = {
            header: header,
            sampleValue: baseForConstruction.sampleValue ?? (sampleValues[0] || ''),
            mappedColumn: sqlFriendlyName, // Use SQL-friendly name for new columns
            suggestedColumns: baseForConstruction.suggestedColumns || [],
            inferredDataType: detectedDataType, // Use our detected type
            action: 'create', // Force to create
            status: 'suggested',
            reviewStatus: 'pending',
            newColumnProposal: {
              ...newProposal,
              details: {
                ...newProposal.details,
                sqlType: mapColumnTypeToSql(detectedDataType) // Ensure SQL type is correctly set
              }
            },
            confidenceScore: 1.0, // High confidence
            confidenceLevel: 'High', // High confidence
            errorMessage: baseForConstruction.errorMessage,
          };
        } else if (isEmptyColumn && !userHasExplicitlySet) {
          // *** CRITICAL FIX: For empty columns in existing tables, preserve base settings but enhance with type inference ***
          console.log(`[DEBUG] Processing empty column ${header} with field name type inference`);
          
          // Use the field name inference for data type
          const nameBasedType = inferDataType([], header);
          
          // For empty columns, we want to default to 'create' for better UX
          // The user can still choose to map or skip if needed
          const actionToUse = baseForConstruction.action || 'create';
          
          // Create a SQL-friendly column name for potential new column creation
          const sqlFriendlyName = header.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
          
          // Create or update proposal if needed
          let proposalToUse = baseForConstruction.newColumnProposal;
          if (actionToUse === 'create' && !proposalToUse) {
            // Create a new proposal if missing
            proposalToUse = {
              type: 'new_column' as const,
              details: {
                columnName: sqlFriendlyName,
                sqlType: mapColumnTypeToSql(nameBasedType),
                isNullable: true,
                sourceSheet: sheetState.sheetName,
                sourceHeader: header
              }
            };
          }
          
          // Combine settings with appropriate defaults
          newProcessedMappings[header] = {
            header: header,
            sampleValue: baseForConstruction.sampleValue || '',
            mappedColumn: baseForConstruction.mappedColumn || 
                          (actionToUse === 'create' ? sqlFriendlyName : null),
            suggestedColumns: baseForConstruction.suggestedColumns || [],
            inferredDataType: nameBasedType, // Use our name-based detection for empty columns
            action: actionToUse,
            status: baseForConstruction.status || 'pending',
            reviewStatus: baseForConstruction.reviewStatus || 'pending',
            newColumnProposal: proposalToUse,
            confidenceScore: baseForConstruction.confidenceScore || 0.8,
            confidenceLevel: baseForConstruction.confidenceLevel || 'Medium',
            errorMessage: baseForConstruction.errorMessage,
          };
        } else {
          // Normal case - use what we have but enhance with inferred type if needed
          console.log(`[DEBUG] Normal processing for column ${header}`);
          
          const effectiveDataType = baseForConstruction.inferredDataType || detectedDataType;
          
          newProcessedMappings[header] = {
            header: header, // Always use the current header from iteration
            sampleValue: baseForConstruction.sampleValue ?? (sampleValues[0] || ''),
            mappedColumn: baseForConstruction.mappedColumn,
            suggestedColumns: baseForConstruction.suggestedColumns || [],
            inferredDataType: effectiveDataType, // Use detected type if not already set
            action: baseForConstruction.action || 'map',
            status: baseForConstruction.status || 'pending',
            reviewStatus: baseForConstruction.reviewStatus || 'pending',
            newColumnProposal: baseForConstruction.newColumnProposal,
            confidenceScore: baseForConstruction.confidenceScore,
            confidenceLevel: baseForConstruction.confidenceLevel,
            errorMessage: baseForConstruction.errorMessage,
          };
          
          // If creating a column, ensure the proposal has the correct SQL type based on inferred type
          if (newProcessedMappings[header].action === 'create' && newProcessedMappings[header].newColumnProposal) {
            newProcessedMappings[header].newColumnProposal = {
              ...newProcessedMappings[header].newColumnProposal,
              details: {
                ...newProcessedMappings[header].newColumnProposal.details,
                sqlType: mapColumnTypeToSql(effectiveDataType)
              }
            };
          }
        }
      });

      // Only process this for non-empty sheets
      if (sheetState.rowCount > 0 || !isCreatingTable) {
        // Prune mappings for headers that no longer exist
        Object.keys(mappings).forEach(header => {
          if (!currentHeaders.includes(header)) {
            // Headers that no longer exist are ignored
            console.log(`[DEBUG] Ignoring header that no longer exists: ${header}`);
          } else if (!newProcessedMappings[header]) {
            // This only happens if there's a header in mappings not handled above
            console.log(`[DEBUG] Header in mappings not processed: ${header}`);
          }
        });
      
        // Create a new object for setMappings to ensure re-render if changed
        const finalMappingsToSet: Record<string, BatchColumnMapping> = {};
        currentHeaders.forEach(header => {
          finalMappingsToSet[header] = newProcessedMappings[header];
        });

        // Only update state if mappings have actually changed
        if (JSON.stringify(finalMappingsToSet) !== JSON.stringify(mappings)) {
          console.log(`[DEBUG] Updating mappings state with ${Object.keys(finalMappingsToSet).length} columns`);
          setMappings(finalMappingsToSet);
        } else {
          console.log('[DEBUG] No changes to mappings, skipping state update');
        }
      }
    }
  }, [sheetState, initialMappings, mappings, isCreatingTable, mapColumnTypeToSql, memoizedExcelHeaders]);

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

    try {
      if (!excelCol) {
        console.error('[ERROR] Missing excelCol in updateColumnMapping');
        return;
      }
      
      if (selectedValue === 'create-new-column') {
        // Set current Excel column for the new column dialog
        setCurrentExcelColumn(excelCol);
        
        // Generate a SQL-friendly name from the Excel column name
        const suggestedName = excelCol.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
        
        // Set the suggested name in the dialog
        setNewColumnName(suggestedName);
        
        // Use our enhanced data type inference for more accurate type detection
        // Get sample value for inference using original approach
        const sampleVal = sheetState?.sampleData?.[0]?.[excelCol] ?? '';
          
        // Use the inferDataType function with single sample approach
        const inferredType = inferDataType([sampleVal], excelCol);
        
        // Log detection result
        setNewColumnType(inferredType);
        
        // Also update the mapping with this inferred type if it's not already set
        if (mappings[excelCol]) {
          handleMappingUpdate(excelCol, { inferredDataType: inferredType });
        }
        
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
    } catch (error) {
      console.error(`[ERROR] Failed to update column mapping for ${excelCol}:`, error);
    }
  };

  const handleCreateNewColumn = () => {

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

    // Get the SQL type based on the user-selected type
    const sqlType = mapColumnTypeToSql(newColumnType);

    // Create the column proposal with match percentage information
    const proposal: NewColumnProposal = {
        columnName: formattedColumnName,
        sqlType: sqlType, 
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
        inferredDataType: newColumnType, // Always respect user's selected type
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
    const finalMappings = { ...mappings };

    // Finalize any pending new column creations that weren't explicitly saved through the sub-dialog
    // This handles cases where user might have selected 'Create New' but didn't complete the sub-dialog
    // and then hits the main save button.
    Object.keys(finalMappings).forEach(key => {
      if (finalMappings[key].action === 'create' && !finalMappings[key].newColumnProposal) {
        // If 'create' was selected but no proposal exists, revert to 'skip' or clear mappedColumn
        finalMappings[key] = {
          ...finalMappings[key],
          action: 'skip', // Revert to skip
          mappedColumn: null, // Ensure no dbColumn is set
          reviewStatus: finalMappings[key].reviewStatus === 'approved' ? 'modified' : finalMappings[key].reviewStatus // Mark as modified if was approved
        };
      }
      
      // For 'create' action, ensure the data type is properly set using the robust inference
      if (finalMappings[key].action === 'create' && finalMappings[key].newColumnProposal) {
        // Get sample values for better inference
        const sampleValues = sheetState?.sampleData
          ?.slice(0, 5)
          ?.map(row => row[key])
          ?.filter(val => val !== undefined && val !== null) || [];
          
        // Use existing type inference with a sample value
        const sampleVal = sheetState?.sampleData?.[0]?.[key] ?? '';
        
        // If user hasn't explicitly set a type, detect it
        let inferredType: ColumnType;
        if (!finalMappings[key].inferredDataType) {
          inferredType = inferDataType([sampleVal], key);
          // Update the inferred data type in the mapping
          finalMappings[key].inferredDataType = inferredType;
        } else {
          // Use the already set type
          inferredType = finalMappings[key].inferredDataType;
        }
        
        // Log the inferred type for debugging
        
        // CRITICAL FIX: Always ensure the newColumnProposal exists and has correct SQL type
        if (!finalMappings[key].newColumnProposal) {
          // Create a new default proposal if somehow missing
          const sqlFriendlyName = key.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
          finalMappings[key].newColumnProposal = {
            type: 'new_column' as const,
            details: {
              columnName: sqlFriendlyName,
              sqlType: mapColumnTypeToSql(inferredType),
              isNullable: true,
              sourceSheet: sheetState?.sheetName || '',
              sourceHeader: key
            }
          };
        } else if (finalMappings[key].newColumnProposal.details) {
          // Update SQL type in existing proposal
          finalMappings[key].newColumnProposal.details.sqlType = mapColumnTypeToSql(inferredType);
        }
      }
      
      // Ensure all mappings have a reviewStatus (ALWAYS set to 'approved' when user hits save)
      // This ensures that even for new tables, all column mappings will be approved 
      finalMappings[key].reviewStatus = 'approved';
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
    // Special case for default column in completely empty sheet
    if (columnName === 'default_column' && isCreatingTable && 
        (!sheetState?.headers || sheetState.headers.length === 0) && 
        sheetState?.rowCount === 0) {
      return 'Default column for empty sheet structure';
    }

    // Handle empty dataset cases more explicitly
    if (!sheetState?.sampleData || sheetState.sampleData.length === 0) {
      // Detect if this is a new table
      if (isCreatingTable) {
        const sqlFriendlyName = columnName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
        return `Will create column: ${sqlFriendlyName} (empty sheet)`;
      }
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
      if (isCreatingTable) {
        const sqlFriendlyName = columnName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
        return `Will create column: ${sqlFriendlyName} (no data in this column)`;
      }
      return '(column contains no data)';
    }
    
    // Format sample values with truncation
    const result = samples.map(s => String(s).substring(0, 15)).join(' | ');
    return result.length > 60 ? result.substring(0, 57) + '...' : result;
  };

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
