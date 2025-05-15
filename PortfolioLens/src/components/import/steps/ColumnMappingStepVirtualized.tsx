/**
 * Virtualized Column Mapping Step component
 *
 * Optimized for large sheets with hundreds of columns.
 * Uses virtualization, efficient state management, and server-side similarity calculation.
 * UI styling aligned with Table Mapping step for visual consistency.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { refreshSchemaCache } from '../../../utility/schemaRefreshUtil';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  MenuItem,
  Stack,
  Select,
  SelectChangeEvent,
  InputAdornment,
  CircularProgress,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Tabs,
  Tab,
  Grid,
  FormControl,
  InputLabel,
  FormHelperText,
  LinearProgress,
  ListSubheader,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardBackspaceIcon from '@mui/icons-material/KeyboardBackspace';
import ErrorBoundary from '../../common/ErrorBoundary';
import CheckIcon from '@mui/icons-material/Check';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useBatchImportStore, SheetMapping, ColumnMapping } from '../../../store/batchImportStore';
import { useTableMetadata, useTableMatcher } from '../BatchImporterHooks';
import SampleDataTable from '../SampleDataTable';
import { normalizeDataType, ColumnInfo, DbFieldInfo, MappingResult } from '../services/mappingEngine';
import { generateMappings, clearSimilarityCaches } from '../services/SimilarityService';
import { createDebouncedSearch, searchFields } from '../utils/searchUtils';
import { normalizeName, normalizeTableName, normalizeForDb } from '../utils/stringUtils';

interface ColumnMappingStepProps {
  onSheetSelect: (sheetId: string | null) => void;
  onError: (error: string | null) => void;
}

// Helper types for virtualization
interface ColumnItemData {
  columns: ColumnMapping[];
  tableColumns: any[];
  dataTypes: string[];
  handleMappedNameChange: (column: ColumnMapping, newValue: string) => void;
  handleDataTypeChange: (column: ColumnMapping, newValue: string) => void;
  handleSkipChange: (column: ColumnMapping, newValue: boolean) => void;
  handleCreateNewField: (column: ColumnMapping, newName?: string) => void;
  handleCancelNewField: (column: ColumnMapping) => void;
  handleApproveColumn: (column: ColumnMapping) => void;
  normalizeDataType: (type: string) => string;
  fieldSearchText: string;
  isCreatingNewField: (column: ColumnMapping) => boolean;
  generateUniqueFieldName: (baseName: string) => string;
  getCachedMatches: (column: ColumnMapping) => Array<{ name: string; type: string; confidence: number }>;
  editingNewField: string | null;
  theme: any;
  needsReview: (column: ColumnMapping) => boolean;
  newlyCreatedFields: Record<string, Array<{name: string, type: string}>>;
  selectedSheetName?: string;
}

// Virtualized row component for column mapping
const ColumnRow = React.memo(({ index, style, data }: {
  index: number,
  style: React.CSSProperties,
  data: ColumnItemData
}) => {
  // IMPORTANT: Declare ALL hooks first, before any conditional logic
  // This fixes the "Rendered fewer hooks than expected" error

  // Define column - will be null-checked after all hooks are declared
  const column = data.columns[index];

  // Always define these variables (even if column is null) to maintain hook order
  const theme = data.theme;
  const isNewField = column ? data.isCreatingNewField(column) : false;
  const isEditingField = column ? data.editingNewField === column.originalName : false;

  // Local state for field name editing - initialize empty
  const [fieldName, setFieldName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Initialize field name when entering edit mode
  useEffect(() => {
    if (isEditingField && column) {
      try {
        // Start with a SQL-friendly suggested name based on the original column name
        const normalizedName = column.originalName
          .toLowerCase()
          .trim()
          .replace(/[^\w\s]/g, '_')    // Replace special chars with underscore
          .replace(/\s+/g, '_')        // Replace spaces with underscore
          .replace(/_+/g, '_')         // Replace multiple underscores with single
          .replace(/^_+|_+$/g, '')     // Remove leading/trailing underscores
          .replace(/^\d/, 'n$&');      // Prefix with 'n' if starts with a number

        const suggestedName = data.generateUniqueFieldName(normalizedName);
        setFieldName(suggestedName);
        setFieldError(null); // Clear any previous error
      } catch (err) {
        // Fail gracefully without breaking React hook rules
        setFieldName("");
        setFieldError("Could not generate suggested name");
      }
    }
    // Reset field name if not editing
    else if (!isEditingField) {
      setFieldName("");
      setFieldError(null);
    }
  }, [isEditingField, column, data.generateUniqueFieldName]);

  // State for dropdown search
  const [dropdownSearchText, setDropdownSearchText] = useState("");

  // Handler for dropdown search
  const handleDropdownSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDropdownSearchText(e.target.value);
  }, []);

  // Handler for dropdown close - reset search
  const handleDropdownClose = useCallback(() => {
    setDropdownSearchText("");
  }, []);

  // Reference for tracking the last action timestamp (used for debouncing)
  const lastActionTimestamp = useRef(Date.now());

  // Reset field state when not in edit mode
  useEffect(() => {
    if (!isEditingField) {
      setFieldError(null);
    }
  }, [isEditingField]);

  // Validate field name - memoized to maintain stable function reference
  const validateFieldName = useCallback((name: string): string | null => {
    if (!name.trim()) {
      return "Field name cannot be empty";
    }

    if (name.length > 63) {
      return "Field name must be 63 characters or less";
    }

    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return "Field name must start with a letter and contain only lowercase letters, numbers, and underscores";
    }

    // Check if field name already exists in the table schema
    if (data.tableColumns && data.tableColumns.some(col => col.name === name)) {
      return "Field name already exists in this table";
    }

    return null;
  }, [data.tableColumns]);

  // Handle field name changes with validation
  const handleFieldNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setFieldName(newName);
    setFieldError(validateFieldName(newName));
  }, [validateFieldName]);

  // Handle save button click
  const handleSaveField = useCallback(() => {
    const error = validateFieldName(fieldName);
    if (error) {
      setFieldError(error);
      return;
    }

    // // console.log('Saving new field - will be auto-approved');
    
    // Save the new field with needsReview: false directly
    // This will make it already approved from the start
    if (data && column) {
      // Instead of using setTimeout with handleApproveColumn, let's make the field
      // start with needsReview: false by modifying handleCreateNewField
      data.handleCreateNewField(column, fieldName);
    }
  }, [validateFieldName, fieldName, data, column]);

  // Handle cancel button click
  const handleCancelEdit = useCallback(() => {
    data.handleCancelNewField(column);
  }, [data, column]);

  // Handle keyboard events for field editing
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !fieldError) {
      // When user presses Enter to create a field, it should be auto-approved
      handleSaveField();
      // Auto-approval is now handled within handleSaveField
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  }, [handleSaveField, handleCancelEdit, fieldError]);

  // Get confidence color and styles consistent with the table mapping UI
  // Using useCallback to avoid recreation on each render
  const getConfidenceProps = useCallback((confidence: number) => {
    if (confidence >= 95) {
      return {
        color: 'white',
        bgcolor: theme.palette.success.main,
        label: `${confidence}%`
      };
    } else if (confidence >= 70) {
      return {
        color: 'white',
        bgcolor: theme.palette.warning.main,
        label: `${confidence}%`
      };
    } else if (confidence > 0) {
      return {
        color: 'white',
        bgcolor: theme.palette.error.main,
        label: `${confidence}%`
      };
    }
    return {
      color: 'default',
      bgcolor: 'default',
      label: isNewField ? 'New Field' : 'No Match'
    };
  }, [theme.palette.success.main, theme.palette.warning.main, theme.palette.error.main, isNewField]);

  // IMPORTANT: We've declared all hooks above - now it's safe to perform null check and early return
  // This fixes the "Rendered fewer hooks than expected" error
  if (!column) {
    return null; // Safe early return AFTER all hooks declarations
  }

  const confidenceProps = getConfidenceProps(column.confidence);

  // Get cached matches for this column to show in dropdown
  const columnMatches = data.getCachedMatches(column);

  // Memoized helper to filter fields based on search text
  // This gets computation out of the render path
  const getFilteredFields = useCallback((
    searchText: string,
    tableColumns: any[],
    matchedFields: Array<{name: string, type: string, confidence: number}>
  ) => {
    // Skip if no search text
    if (!searchText) {
      return tableColumns.filter(col =>
        !matchedFields.slice(0, 8).some(match => match.name === col.name)
      );
    }

    // Prepare the search text for comparison (only do this once)
    const searchLower = searchText.toLowerCase();
    const searchTerms = searchLower.split(/\s+/);
    const normalizedSearch = searchLower.replace(/[_\-\s]/g, '');

    // Use Set for O(1) lookups of matched fields (much faster than Array.some())
    const matchedFieldsSet = new Set(matchedFields.slice(0, 8).map(match => match.name));

    // Filter using fast comparisons
    return tableColumns.filter(col => {
      // Skip fields already in high/medium confidence matches
      if (matchedFieldsSet.has(col.name)) {
        return false;
      }

      const colName = col.name.toLowerCase();

      // Fast exact match check
      if (colName === searchLower) {
        return true;
      }

      // Fast substring check
      if (colName.includes(searchLower)) {
        return true;
      }

      // Only do the more expensive multi-term check if we have multiple terms
      if (searchTerms.length > 1) {
        return searchTerms.every(term => colName.includes(term));
      }

      // Only do the most expensive normalized check as last resort
      const normalizedColName = colName.replace(/[_\-\s]/g, '');
      return normalizedColName.includes(normalizedSearch);
    });
  }, []);

  // Optimize menu item creation with lazy evaluation
  // Instead of building all elements up front, we prepare data structures
  // that will be used only when needed during rendering
  const prepareMenuItems = useCallback(() => {
    if (!column) return { highConf: [], mediumConf: [], filtered: [] };

    // Get high confidence matches - limit to 5 for performance
    const highConfidenceMatches = columnMatches
      .filter(match => match.confidence >= 95)
      .slice(0, 5);

    // Get medium confidence matches - limit to 3 for performance
    const mediumConfidenceMatches = columnMatches
      .filter(match => match.confidence >= 70 && match.confidence < 95)
      .slice(0, 3);

    // Combine search text from local and parent
    const searchText = dropdownSearchText || data.fieldSearchText;

    // Get filtered fields
    const filteredFields = getFilteredFields(
      searchText,
      data.tableColumns,
      [...highConfidenceMatches, ...mediumConfidenceMatches]
    );

    // Return the prepared data - only prepare data not actual components
    return {
      searchText,
      highConf: highConfidenceMatches,
      mediumConf: mediumConfidenceMatches,
      filtered: filteredFields,
      hasNoResults: searchText &&
                    filteredFields.length === 0 &&
                    highConfidenceMatches.length === 0 &&
                    mediumConfidenceMatches.length === 0
    };
  }, [column?.originalName, columnMatches, dropdownSearchText, data.fieldSearchText, data.tableColumns, getFilteredFields]);

  // The actual render function that uses the prepared data to build UI elements
  // This reduces work done during the render phase
  const renderMenuItems = () => {
    // Prepare data structures instead of components
    const { searchText, highConf, mediumConf, filtered, hasNoResults } = prepareMenuItems();

    const elements = [];

    // Search box at the top of dropdown - avoid inline styles/events where possible
    elements.push(
      <Box
        key="search-box"
        component="li"
        className="dropdown-search-box" // Use class instead of inline styles
        onMouseDown={(e) => {
          // Use mousedown instead of click - prevents focus issues
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Search fields..."
          value={dropdownSearchText}
          onChange={handleDropdownSearchChange}
          variant="outlined"
          autoFocus
          className="dropdown-search-input"
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={handleSearchKeyDown} // Use pre-defined handler
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
            endAdornment: dropdownSearchText ? (
              <InputAdornment position="end">
                <IconButton
                  onMouseDown={handleClearSearch} // Use pre-defined handler
                  edge="end"
                  size="small"
                >
                  <Box component="span" sx={{ fontSize: '0.75rem' }}>✕</Box>
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
        />
      </Box>
    );

    // "Create new column" option - always include
    elements.push(
      <MenuItem
        key="_create_new_"
        value="_create_new_"
        divider
        className="create-new-option"
      >
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <Typography color="primary" fontWeight="medium">➕ Create new column...</Typography>
        </Box>
      </MenuItem>
    );

    // High confidence section - only render if we have matches
    if (highConf.length > 0) {
      elements.push(
        <ListSubheader key="high-confidence" className="confidence-header high">
          High Confidence Matches
        </ListSubheader>
      );

      // Add high confidence menu items
      highConf.forEach(match => {
        elements.push(
          <MenuItem key={match.name} value={match.name} className="match-item">
            <Box className="match-item-content">
              <Box className="match-item-header">
                <Typography className={match.name === column.mappedName ? "selected-match" : ""}>
                  {match.name}
                </Typography>
                <Typography variant="caption" color="success.main" className="confidence-score">
                  ({match.confidence}%)
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {normalizeDataType(match.type)}
              </Typography>
            </Box>
          </MenuItem>
        );
      });
    }

    // Medium confidence section - only if we have high confidence and medium matches
    if (mediumConf.length > 0) {
      if (highConf.length > 0) elements.push(<Divider key="confidence-divider" />);

      elements.push(
        <ListSubheader key="medium-confidence" className="confidence-header medium">
          Suggested Matches
        </ListSubheader>
      );

      // Add medium confidence menu items
      mediumConf.forEach(match => {
        elements.push(
          <MenuItem key={match.name} value={match.name} className="match-item">
            <Box className="match-item-content">
              <Box className="match-item-header">
                <Typography className={match.name === column.mappedName ? "selected-match" : ""}>
                  {match.name}
                </Typography>
                <Typography
                  variant="caption"
                  color={match.confidence >= 70 ? "warning.main" : "error.main"}
                  className="confidence-score"
                >
                  ({match.confidence}%)
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {normalizeDataType(match.type)}
              </Typography>
            </Box>
          </MenuItem>
        );
      });
    }

    // No results message
    if (hasNoResults) {
      elements.push(
        <MenuItem key="no-results" disabled className="no-results-message">
          No matching fields found
        </MenuItem>
      );
    }

    // Search results/other fields section
    if (filtered.length > 0) {
      if (highConf.length > 0 || mediumConf.length > 0) {
        elements.push(<Divider key="other-divider" />);
      }

      elements.push(
        <ListSubheader key="other-fields" className="fields-header">
          {searchText ? `Search Results: ${searchText}` : 'Other Fields'}
        </ListSubheader>
      );

      // Limit number of fields shown to avoid performance issues
      const fieldsToShow = filtered.slice(0, 30); // Only show top 30 fields

      // Add filtered fields
      fieldsToShow.forEach(col => {
        elements.push(
          <MenuItem key={col.name} value={col.name} className="field-item">
            <Box className="field-item-content">
              <Box className="field-item-header">
                <Typography className={col.name === column.mappedName ? "selected-field" : ""}>
                  {col.name}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {normalizeDataType(col.type)}
              </Typography>
            </Box>
          </MenuItem>
        );
      });

      // Show message if we limited the results
      if (filtered.length > 30) {
        elements.push(
          <MenuItem key="more-results" disabled className="more-results">
            {filtered.length - 30} more fields available. Refine your search to see more.
          </MenuItem>
        );
      }
    }

    return elements;
  };

  // Pre-defined handlers to avoid inline functions
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Prevent dropdown from closing on keyboard events
    e.stopPropagation();
    // Clear search on Escape
    if (e.key === 'Escape') {
      setDropdownSearchText('');
    }
  }, []);

  const handleClearSearch = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropdownSearchText('');
  }, []);

  // Important: Do not use useMemo for renderMenuItems as this avoids dynamic dependency arrays
  // The renderMenuItems function is called inline during render

  // Alternate background for row
  const bgColor = index % 2 === 0 ? 'inherit' : theme.palette.action.hover;

  // Get the type info for the selected field
  const selectedFieldType = column.mappedName !== '_create_new_' && column.mappedName ?
    data.tableColumns.find(f => f.name === column.mappedName)?.type :
    column.dataType;

  const typeLabel = selectedFieldType ? `(${normalizeDataType(selectedFieldType)})` : '';

  // Selected display for dropdown (no confidence badge, just clean field name)
  const renderSelectValue = useCallback((value: string) => {
    if (value === '_create_new_') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            borderRadius: 1,
            bgcolor: theme.palette.primary.light + '25',
            px: 1,
            py: 0.5,
            width: '100%'
          }}>
            <Typography color="primary" fontWeight="medium">
              ➕ Create new column...
            </Typography>
          </Box>
        </Box>
      );
    }

    if (!value) return null;

    // Check if this field is a newly created one by using multiple detection strategies
    // Strategy 1: Check if the field exists in tableColumns with creation flags
    const existingField = data.tableColumns.find(col => col.name === value);
    const existingFieldHasCreationFlag = existingField && 
      (existingField._isNewlyCreated || existingField.created);
    
    // Strategy 2: Check all tables in component's newlyCreatedFields state
    let isInComponentNewlyCreatedFields = false;
    if (data.newlyCreatedFields) {
      // First check the current sheet specifically (most likely case)
      const currentSheetName = data.selectedSheetName;
      if (currentSheetName && data.newlyCreatedFields[currentSheetName]) {
        isInComponentNewlyCreatedFields = data.newlyCreatedFields[currentSheetName].some(
          field => field.name === value
        );
      }
      
      // If not found, check all other sheets
      if (!isInComponentNewlyCreatedFields) {
        Object.entries(data.newlyCreatedFields).forEach(([tableName, fields]) => {
          if (tableName !== currentSheetName && 
              fields.some(field => field.name === value)) {
            isInComponentNewlyCreatedFields = true;
            // // console.log(`[Field Detection] Field "${value}" found in newlyCreatedFields for table "${tableName}"`);
          }
        });
      }
    }
    
    // Strategy 3: Check Zustand store for comprehensive field data
    let isInZustandStore = false;
    try {
      // Get store state
      const storeState = useBatchImportStore.getState();
      
      // Check current sheet's column mappings first
      if (data.selectedSheetName && storeState.columnMappings) {
        // Find the sheet ID for the current sheet
        const sheet = storeState.sheets.find(s => s.mappedName === data.selectedSheetName);
        
        if (sheet && sheet.id && storeState.columnMappings[sheet.id]) {
          // Look for the column in sheet's mappings
          const storeCol = storeState.columnMappings[sheet.id].find(
            c => c.name === value || c.createNewValue === value
          );
          
          if (storeCol && (storeCol.created || storeCol._isNewlyCreated)) {
            isInZustandStore = true;
            // // console.log(`[Field Detection] Field "${value}" found in Zustand columnMappings`);
          }
        }
      }
      
      // If not found, check table schemas for this field
      if (!isInZustandStore && data.selectedSheetName) {
        // Look for the field in table schemas
        const tableSchema = storeState.tableSchemas[data.selectedSheetName];
        if (tableSchema && tableSchema.columns) {
          const schemaCol = tableSchema.columns.find(c => c.name === value);
          if (schemaCol && (schemaCol.created || schemaCol._isNewlyCreated)) {
            isInZustandStore = true;
            // // console.log(`[Field Detection] Field "${value}" found in Zustand tableSchemas`);
          }
        }
      }
    } catch (err) {
      // // console.warn(`[Field Detection] Error checking Zustand store:`, err);
      // Continue without the store data
    }
    
    // Consolidated check: field is newly created if ANY detection strategy finds it
    const isNewlyCreatedField = existingFieldHasCreationFlag || 
                               isInComponentNewlyCreatedFields || 
                               isInZustandStore;
                               
    // Extra debug logging for understanding field detection
    if (isNewlyCreatedField) {
      // // console.log(`[Field Detection] "${value}" detected as newly created via:`, {
      //   existingFieldHasCreationFlag,
      //   isInComponentNewlyCreatedFields,
      //   isInZustandStore
      // });
    }

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        {isNewlyCreatedField && (
          <Typography
            color="primary"
            component="span"
            sx={{ mr: 0.5, fontSize: '0.8rem', fontWeight: 'medium' }}
            title="Newly created column"
          >
            ➕
          </Typography>
        )}
        <Typography
          noWrap
          title={`${value} ${typeLabel}`}
          sx={{ fontWeight: isNewlyCreatedField ? 'medium' : 'normal', maxWidth: '90%' }}
        >
          {value} <Typography component="span" variant="caption" color="text.secondary">{typeLabel}</Typography>
        </Typography>
      </Box>
    );
  }, [data.tableColumns, theme.palette.primary.light, typeLabel, data.newlyCreatedFields]);

  // Determine if row needs review for styling
  const rowNeedsReview = data.needsReview(column);

  return (
    <TableRow
      component="div"
      style={{ ...style, display: 'flex' }}
      sx={{
        bgcolor: bgColor,
        borderLeft: rowNeedsReview ? `4px solid ${theme.palette.warning.light}` : 'none',
        '&:hover': { bgcolor: theme.palette.action.hover }
      }}
    >
      <TableCell
        component="div"
        sx={{
          display: 'flex',
          width: '22%',
          alignItems: 'center',
          borderBottom: 'none',
          py: 1,
          minWidth: '180px',
          maxWidth: '240px'
        }}
      >
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          overflow: 'hidden'
        }}>
          {rowNeedsReview ? (
            // Show warning icon for fields that need review
            <Tooltip 
              key={`review-tooltip-${column.originalName}`}
              title={(column._isNewlyCreated || column.created) ? "Newly created field" : "This field needs review"} 
              placement="top"
              disableInteractive={true}
            >
              <Box sx={{
                display: 'flex', 
                alignItems: 'center',
                mr: 1
              }}>
                {(() => {
                  // Enhanced check for newly created fields - using multiple strategies
                  const isNewField = column._isNewlyCreated || column.created;
                  
                  // Also check the newlyCreatedFields state and Zustand store
                  let isInNewlyCreatedState = false;
                  let isInZustandStore = false;
                  
                  try {
                    // Check component state
                    if (data.selectedSheetName && data.newlyCreatedFields && 
                        data.newlyCreatedFields[data.selectedSheetName]) {
                      // First check if the currently mapped field is in newlyCreatedFields
                      if (column.mappedName && column.mappedName !== '_create_new_') {
                        isInNewlyCreatedState = data.newlyCreatedFields[data.selectedSheetName].some(
                          field => field.name === column.mappedName
                        );
                      }
                      
                      // If not found and we have a createNewValue, check that too
                      if (!isInNewlyCreatedState && column.createNewValue) {
                        isInNewlyCreatedState = data.newlyCreatedFields[data.selectedSheetName].some(
                          field => field.name === column.createNewValue
                        );
                      }
                    }
                    
                    // Check Zustand store
                    const storeState = useBatchImportStore.getState();
                    if (data.selectedSheetName && storeState.tableSchemas && 
                        storeState.tableSchemas[data.selectedSheetName]) {
                      // Check if mapped field is in store schemas
                      const schema = storeState.tableSchemas[data.selectedSheetName];
                      if (schema && schema.columns && column.mappedName && column.mappedName !== '_create_new_') {
                        const storeColumn = schema.columns.find(col => col.name === column.mappedName);
                        if (storeColumn && (storeColumn.created || storeColumn._isNewlyCreated)) {
                          isInZustandStore = true;
                        }
                      }
                      
                      // Check createNewValue if present
                      if (!isInZustandStore && column.createNewValue) {
                        const storeColumn = schema.columns.find(col => col.name === column.createNewValue);
                        if (storeColumn && (storeColumn.created || storeColumn._isNewlyCreated)) {
                          isInZustandStore = true;
                        }
                      }
                    }
                  } catch (err) {
                    // Continue without additional checks
                  }
                  
                  const isDefinitelyNewField = isNewField || isInNewlyCreatedState || isInZustandStore;
                  
                  if (isDefinitelyNewField) {
                    return (
                      <React.Fragment>
                        <Chip
                          label="New"
                          size="small"
                          color="primary"
                          icon={<CheckIcon fontSize="small" />}
                          sx={{ 
                            height: 20,
                            fontSize: '0.65rem',
                            fontWeight: 'bold',
                            '& .MuiChip-label': { px: 1, py: 0 },
                            '& .MuiChip-icon': { ml: 0.5 },
                            animation: 'pulse 2s infinite'
                          }}
                        />
                      </React.Fragment>
                    );
                  } else {
                    return <WarningIcon color="warning" fontSize="small" sx={{ opacity: 0.8, flexShrink: 0 }} />;
                  }
                })()}
              </Box>
            </Tooltip>
          ) : (
            // Show checkmark for approved fields
            <Tooltip 
              key={`approved-tooltip-${column.originalName}`}
              title="Approved" 
              placement="top"
              disableInteractive={true}
            >
              <CheckCircleIcon color="success" fontSize="small" sx={{ mr: 1, opacity: 0.7, flexShrink: 0 }} />
            </Tooltip>
          )}
          <Tooltip 
            key={`column-name-tooltip-${column.originalName}`}
            title={column.originalName} 
            enterDelay={500} 
            arrow
            disableInteractive={true}
          >
            <Typography
              variant="body2"
              noWrap
              sx={{
                fontWeight: 'normal',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%'
              }}
            >
              {column.originalName}
            </Typography>
          </Tooltip>
        </Box>
      </TableCell>

      <TableCell
        component="div"
        sx={{
          display: 'flex',
          width: '33%',
          borderBottom: 'none',
          py: 1,
          alignItems: 'center',
          minWidth: '220px',
          maxWidth: '320px',
          position: 'relative'
        }}
      >
        {isEditingField ? (
          // Field creation UI
          <Box sx={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            // Add constraints to prevent overflow issues
            maxHeight: 48,
            overflow: 'visible',
            position: 'relative',
            zIndex: 5 // Ensure it's above other rows
          }}>
            <IconButton
              size="small"
              onClick={handleCancelEdit}
              sx={{ mr: 1, color: 'text.secondary', flexShrink: 0 }}
              title="Go back"
            >
              <KeyboardBackspaceIcon fontSize="small" />
            </IconButton>

            <FormControl
              fullWidth
              error={!!fieldError}
              size="small"
              // Fixed position in the row to avoid layout issues
              sx={{
                height: 38,
                position: 'relative'
              }}
            >
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                position: 'absolute',
                top: -18,
                left: 0,
                zIndex: 2,
                width: '100%'
              }}>
                <Typography
                  variant="caption"
                  color="primary"
                  sx={{
                    fontWeight: 'medium',
                    fontSize: '0.7rem',
                    bgcolor: 'background.paper',
                    px: 0.5,
                    py: 0.25,
                    borderRadius: 0.5
                  }}
                >
                  ➕ Creating new column
                </Typography>
              </Box>
              <TextField
                value={fieldName}
                onChange={handleFieldNameChange}
                onKeyDown={handleKeyDown}
                placeholder="Enter SQL-friendly field name"
                size="small"
                error={!!fieldError}
                // Move helper text to tooltip instead of taking vertical space
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip 
                        key={`field-error-tooltip-${column.originalName}`}
                        title={fieldError || "Field must start with letter, use only lowercase letters, numbers, and underscores"}
                        disableInteractive={true}
                        placement="top"
                      >
                        <span>
                          <IconButton
                            onClick={handleSaveField}
                            disabled={!!fieldError || !fieldName.trim()}
                            edge="end"
                            size="small"
                            color="primary"
                            title="Save field"
                          >
                            <CheckIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </InputAdornment>
                  ),
                  sx: {
                    padding: '8px 4px 8px 14px', // Tighter padding
                    height: 38,
                    // Add ellipsis for long input values
                    "& input": {
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap'
                    }
                  }
                }}
                // Hide helper text to save vertical space, using tooltip instead
                FormHelperTextProps={{
                  sx: { display: 'none' }
                }}
                sx={{
                  width: '100%'
                }}
              />
            </FormControl>
          </Box>
        ) : (
          // Normal dropdown UI - Using optimized rendering approach
          <div className="field-select-container">
            <Select
              // Ensure value is always within the available options
              // This prevents "out-of-range value" warnings
              value={(() => {
                // Get all valid option values
                const menuItems = renderMenuItems();
                const validValues = ['', '_create_new_'];

                // Add database columns as valid values
                if (data.tableColumns) {
                  data.tableColumns.forEach(col => {
                    if (col && col.name) validValues.push(col.name);
                  });
                }

                // Add newly created fields as valid values
                if (data.newlyCreatedFields && data.selectedSheetName) {
                  const newFields = data.newlyCreatedFields[data.selectedSheetName];
                  if (newFields) {
                    newFields.forEach(field => {
                      if (field && field.name) validValues.push(field.name);
                    });
                  }
                }

                // Return the current value if valid, or empty string if not
                return validValues.includes(column.mappedName || '') ?
                  column.mappedName || '' : '';
              })()}
              onChange={(e: SelectChangeEvent) => {
                // Wrap in requestAnimationFrame to defer DOM updates
                // This significantly reduces the click handler time
                requestAnimationFrame(() => {
                  data.handleMappedNameChange(column, e.target.value);
                });
              }}
              disabled={column.skip}
              renderValue={renderSelectValue}
              className="field-select"
              fullWidth
              size="small"
              // By using displayEmpty, we avoid unnecessary calculations
              displayEmpty
              // Use pre-defined menu props to avoid object re-creation on every render
              MenuProps={{
                ...OPTIMIZED_MENU_PROPS,
                onClose: handleDropdownClose // Add the dynamic handler
              }}
              // Use component prop to avoid extra DOM elements
              IconComponent={KeyboardArrowDownIcon}
            >
              {/* Only render menu items when necessary */}
              {renderMenuItems()}
            </Select>
          </div>
        )}
      </TableCell>

      <TableCell
        component="div"
        sx={{
          display: 'flex',
          width: '15%',
          borderBottom: 'none',
          py: 1,
          alignItems: 'center',
          minWidth: '120px'
        }}
      >
        <div className="field-select-container">
          <Select
            // Ensure we always have a valid data type to prevent "out-of-range" warnings
            value={(() => {
              const dataType = column?.dataType;
              // If the type is in our allowed data types, use it
              return data.dataTypes.includes(dataType) ? dataType : 'text';
            })()}
            onChange={(e: SelectChangeEvent) => {
              // Defer state updates to avoid blocking the main thread
              requestAnimationFrame(() => {
                data.handleDataTypeChange(column, e.target.value);
              });
            }}
            // Show dataType even for database fields (fixed "blank data type" issue)
            // Only disable for skipped columns
            disabled={column.skip}
            fullWidth
            size="small"
            className="datatype-select"
            MenuProps={OPTIMIZED_MENU_PROPS}
            displayEmpty
            // Add a special style for database fields so they appear as "read-only"
            // but still show their value clearly
            sx={{
              opacity: (!isNewField && !isEditingField) ? 0.8 : 1,
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: (!isNewField && !isEditingField) ? 'rgba(0, 0, 0, 0.12)' : undefined
              }
            }}
          >
            {data.dataTypes.map(type => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </Select>
        </div>
      </TableCell>

      <TableCell
        component="div"
        sx={{
          display: 'flex',
          width: '10%',
          borderBottom: 'none',
          py: 1,
          alignItems: 'center',
          justifyContent: 'flex-end',
          minWidth: '100px'
        }}
      >
        <FormControlLabel
          control={
            <Switch
              checked={!column.skip}
              onChange={(e) => data.handleSkipChange(column, !e.target.checked)}
              size="small"
              disabled={isEditingField}
            />
          }
          label="Import"
          labelPlacement="start"
          sx={{ mr: 0 }}
        />
      </TableCell>

      {/* Sample Data Column */}
      <TableCell
        component="div"
        sx={{
          display: 'flex',
          width: '20%',
          borderBottom: 'none',
          py: 1,
          alignItems: 'center',
          minWidth: '160px'
        }}
      >
        {column.sample && column.sample.length > 0 ? (
          <Tooltip
            key={`sample-tooltip-${column.originalName}`}
            title={
              <Box component="div" sx={{ p: 0.5 }}>
                <Typography variant="caption" fontWeight="medium" gutterBottom>
                  Sample values:
                </Typography>
                {column.sample.slice(0, 5).map((value, idx) => (
                  <Box key={idx} sx={{ mt: 0.5 }}>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', whiteSpace: 'pre' }}>
                      {String(value !== null && value !== undefined ? value : '')}
                    </Typography>
                  </Box>
                ))}
              </Box>
            }
            placement="left"
            arrow
            disableInteractive={true}
            enterDelay={500}
            leaveDelay={100}
          >
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography
                variant="body2"
                noWrap
                sx={{
                  color: 'text.secondary',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  maxWidth: '90%'
                }}
              >
                {String(column.sample[0] !== null && column.sample[0] !== undefined ? column.sample[0] : '')}
              </Typography>
              <InfoIcon
                color="action"
                fontSize="small"
                sx={{
                  ml: 0.5,
                  opacity: 0.4,
                  '&:hover': { opacity: 0.8 }
                }}
              />
            </Box>
          </Tooltip>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
            No sample data
          </Typography>
        )}
      </TableCell>
    </TableRow>
  );
});

/**
 * Virtualized Column Mapping Step
 */
// Add global CSS styles for menu components to avoid inline style recalculations
const menuStyles = `
  .dropdown-search-box {
    padding: 8px;
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: #fff;
    border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  }

  .dropdown-search-input {
    margin-bottom: 4px;
  }

  .create-new-option {
    padding: 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.12);
    background-color: rgba(25, 118, 210, 0.1);
  }

  .create-new-option:hover {
    background-color: rgba(25, 118, 210, 0.25);
  }

  .confidence-header {
    background-color: #f5f5f5;
  }

  .match-item-content, .field-item-content {
    display: flex;
    flex-direction: column;
    width: 100%;
    overflow: hidden;
  }

  .match-item-header, .field-item-header {
    display: flex;
    align-items: center;
    width: 100%;
  }

  .selected-match, .selected-field {
    font-weight: bold;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-grow: 1;
  }

  .confidence-score {
    margin-left: 8px;
    flex-shrink: 0;
  }

  .no-results-message {
    font-style: italic;
    opacity: 0.7;
  }

  .more-results {
    font-style: italic;
    opacity: 0.7;
    font-size: 0.8rem;
    padding: 4px 16px;
  }

  /* Select field styles */
  .field-select {
    min-height: 38px;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
  }

  .field-select .MuiSelect-select {
    display: flex;
    align-items: center;
    padding-top: 6px;
    padding-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-select-paper {
    overflow-x: hidden;
  }

  /* Optimize rendering - prevent forced reflows */
  .MuiMenuItem-root {
    contain: content;
  }

  /* Use will-change to prevent layout thrashing */
  .field-select-paper {
    will-change: transform;
    transform: translateZ(0);
  }

  /* Data type select styles */
  .datatype-select {
    min-height: 38px;
    width: 100%;
  }

  .datatype-select .MuiSelect-select {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 100%;
  }

  /* Container for select fields */
  .field-select-container {
    width: 100%;
    position: relative;
  }
  
  /* New field badge animation */
  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 rgba(25, 118, 210, 0.4);
    }
    70% {
      box-shadow: 0 0 0 5px rgba(25, 118, 210, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(25, 118, 210, 0);
    }
  }
`;

// Add styles to document once on component first render
const addStylesToDocument = () => {
  // SSR guard - check if document is defined
  if (typeof document === 'undefined') {
    // // console.debug('Skipping style insertion - document not available (SSR)');
    return;
  }

  try {
    const styleId = 'column-mapping-virtualized-styles';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.innerHTML = menuStyles;
      document.head.appendChild(styleEl);
    }
  } catch (error) {
    // Fail gracefully if DOM manipulation fails
    // // console.warn('Failed to inject styles:', error);
  }
};

// Pre-define menu props object to avoid recreating it on every render
// This prevents unnecessary calculations in the render cycle
const OPTIMIZED_MENU_PROPS = {
  PaperProps: {
    className: "field-select-paper",
    style: {
      maxHeight: 300,
      width: '300px',
      maxWidth: '320px',
      overflowX: 'hidden'
    }
  },
  // Use lightweight positioning - simpler math
  anchorOrigin: {
    vertical: 'bottom',
    horizontal: 'left'
  },
  transformOrigin: {
    vertical: 'top',
    horizontal: 'left'
  },
  // Performance optimizations for dropdown menus
  disableAutoFocusItem: true,
  disablePortal: false, // Using portal helps avoid layout issues
  disableScrollLock: true, // Disable scroll lock to improve performance
  // Only mount menu when open - major performance win
  keepMounted: false,
  // Use window to avoid layout calculations
  container: document.body
};

export const ColumnMappingStepVirtualized: React.FC<ColumnMappingStepProps> = ({
  onSheetSelect,
  onError
}) => {
  // Access theme
  const theme = useTheme();

  // View state
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'all' | 'needsReview' | 'approved'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [showSampleData, setShowSampleData] = useState(false);

  // State for field search filter
  const [fieldSearchText, setFieldSearchText] = useState('');

  // State for processing status
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);

  // State for new field creation
  const [editingNewField, setEditingNewField] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldError, setNewFieldError] = useState<string | null>(null);

  // State for column matches cache
  const [columnMatchesCache, setColumnMatchesCache] = useState<Record<string, Array<{ name: string; type: string; confidence: number }>>>({});

  // Track sheets that have been processed
  const processedSheets = useRef(new Set<string>());

  // Store last action time for debouncing
  const lastActionTime = useRef(Date.now());
  
  // Cache for synthetic table schemas (created for new tables)
  const synthTableCache = useRef<Record<string, any>>({});

  // Access batch import store
  const {
    sheets,
    selectedSheetId,
    updateSheet,
    updateSheetColumn,
    batchUpdateSheetColumns,
    setSelectedSheetId,
    progress,
    setProgress
  } = useBatchImportStore();

  // Filter non-skipped sheets
  const validSheets = useMemo(() =>
    sheets.filter(sheet => !sheet.skip),
    [sheets]
  );

  // Get currently selected sheet
  const selectedSheet = useMemo(() => {
    if (selectedSheetId) {
      return sheets.find(sheet => sheet.id === selectedSheetId);
    }
    return validSheets[selectedSheetIndex] || null;
  }, [selectedSheetId, selectedSheetIndex, sheets, validSheets]);

  // Add styles on first render
  React.useEffect(() => {
    addStylesToDocument();
  }, []);

  // Set up state persistence handlers (blur/unload)
  const selectedSheetRef = useRef(selectedSheet);
  const updateSheetRef = React.useRef(updateSheet);

  selectedSheetRef.current = selectedSheet;
  updateSheetRef.current = updateSheet;

  React.useEffect(() => {
    // SSR guard - window may not be defined
    if (typeof window === 'undefined') {
      return;
    }

    // Handler to save state before page unload (navigation/refresh)
    const handleBeforeUnload = () => {
      const currentSheet = selectedSheetRef.current; // Use ref
      if (currentSheet && currentSheet.id) {
        try {
          const needsReviewUpdated = currentSheet.columns?.some?.(col => col.needsReview && !col.skip) || false;
          updateSheetRef.current(currentSheet.id, { // Use ref
            needsReview: needsReviewUpdated,
            lastUpdated: new Date().toISOString()
          });
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            // // console.debug('Ignoring error in unload handler:', err);
          }
        }
      }
    };

    // Handler for when window loses focus (tab switch)
    const handleBlur = () => {
      const currentSheet = selectedSheetRef.current; // Use ref
      if (currentSheet && currentSheet.id && currentSheet.columns) {
        try {
          const needsReviewUpdated = currentSheet.columns.some(col => col.needsReview && !col.skip);
          // Only update if the needsReview status actually changed
          if (needsReviewUpdated !== currentSheet.needsReview) {
            updateSheetRef.current(currentSheet.id, { // Use ref
              needsReview: needsReviewUpdated
            });
          }
        } catch (err) {
          // // console.debug('Ignoring error in blur handler:', err);
        }
      }
    };

    // Add event listeners for better state persistence
    try {
      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('blur', handleBlur);

      // Clean up event listeners
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('blur', handleBlur);
      };
    } catch (err) {
      // // console.error('Failed to attach window event handlers:', err);
      return () => {}; // Empty cleanup function
    }
  }, []);

  // Load database metadata
  const { tables, loading: tablesLoading } = useTableMetadata();

  // Create a memoized table matcher
  const { validateColumnExists, getColumnMetadata } = useTableMatcher(tables);

  // Track newly created fields
  const [newlyCreatedFields, setNewlyCreatedFields] = useState<Record<string, Array<{name: string, type: string}>>>({});

  // Cache for normalized table name lookups to avoid repeated logging
  const normalizedTableCache = useRef(new Map());
  
  // Get the table schema for the selected sheet
  const tableSchema = useMemo(() => {
    if (!selectedSheet || !tables) return null;
    
    // First try exact match
    let table = tables.find((table: any) => table.name === selectedSheet.mappedName);
    
    // If no exact match, try normalized match (ln_ prefix agnostic)
    if (!table) {
      // Check cache first to avoid repeated lookups and logs
      const cacheKey = selectedSheet.mappedName;
      if (normalizedTableCache.current.has(cacheKey)) {
        return normalizedTableCache.current.get(cacheKey);
      }
      
      table = tables.find((table: any) => normalizeName(table.name) === normalizeName(selectedSheet.mappedName));
      
      if (table) {
        // Only log the first time we find this mapping
        if (!normalizedTableCache.current.has(cacheKey)) {
          // // console.log(`Found table with normalized name: ${selectedSheet.mappedName} → ${table.name}`);
          // Cache the result
          normalizedTableCache.current.set(cacheKey, table);
        }
      }
    }
    
    return table;
  }, [selectedSheet, tables]);

  // Create debounced search function (150ms delay)
  const debouncedSearch = useRef(createDebouncedSearch(150));

  // Memoize data types array
  const dataTypes = useMemo(() => {
    return ['text', 'integer', 'numeric', 'boolean', 'date', 'timestamp', 'uuid'];
  }, []);

  // Helper to check if a column is creating a new field
  const isCreatingNewField = useCallback((column: ColumnMapping): boolean => {
    if (!column.mappedName || column.mappedName === '_create_new_') return true;
    if (!tableSchema?.columns) return true;
    return !tableSchema.columns.some((col: any) => col.name === column.mappedName);
  }, [tableSchema]);

  // Helper to determine if a column needs review - with improved evaluation logic
  const needsReview = useCallback((column: ColumnMapping): boolean => {
    // Skip columns never need review
    if (column.skip) return false;

    // Fields with no mapping always need review
    if (!column.mappedName) return true;

    // Check if this is a field in a new table
    const isNewTable = selectedSheet?.isNewTable || selectedSheet?.wasCreatedNew || !!selectedSheet?.createNewValue;
    
    // Special handling: check if this is a newly created field in a new or existing table
    const isInNewlyCreated = column.createNewValue && column.mappedName === '_create_new_';
    
    // Special handling for newly created fields - always auto-approve in new tables
    if (isNewTable && (isInNewlyCreated || column._isNewlyCreated)) {
      // // console.log(`Auto-approving new field ${column.originalName} in new table`);
      return false; // Auto-approve all new fields in new tables
    }
    
    // Mark as automatically created if part of dynamically inferred schema
    if (column._isNewlyCreated && column.confidence >= 90) {
      return false; // Auto-approve high-confidence inferred fields
    }
    
    // New fields in existing tables still need review during creation
    if (column.mappedName === '_create_new_' && !isNewTable) return true;

    // Get the field from tableSchema or newly created fields
    let matchedField = null;
    let fieldExistsInNewlyCreated = false;

    // Check the database schema
    if (tableSchema?.columns) {
      matchedField = tableSchema.columns.find((col: any) => col.name === column.mappedName);
    }

    // Check newly created fields if not found in schema
    if (!matchedField && selectedSheet?.mappedName && newlyCreatedFields[selectedSheet?.mappedName]) {
      fieldExistsInNewlyCreated = newlyCreatedFields[selectedSheet?.mappedName].some(field =>
        field.name === column.mappedName
      );
    }

    // For database fields, if data type matches exactly, no review needed
    // This is crucial for maintaining state persistence during navigation
    if (matchedField) {
      const dbType = normalizeDataType(matchedField.type);
      const columnType = normalizeDataType(column.dataType);

      // Auto-approve rules:
      // 1. Any exact match (100%) gets auto-approved regardless of type
      if (column.confidence === 100) {
        return false;
      }
      // 2. High confidence matches (90%+) get auto-approved regardless of type
      if (column.confidence >= 90) {
        return false;
      }
      // 3. Medium-high confidence (80%+) with matching types get auto-approved
      if (column.confidence >= 80 && dbType === columnType) {
        return false;
      }

      // For non-exact matches, check if this is a manually validated field
      // If user has explicitly set needsReview to false, respect that decision
      if (column.needsReview === false) {
        return false;
      }
    }

    // Special handling for newly created fields - always auto-approve in new tables
    if (isNewTable && (fieldExistsInNewlyCreated || column._isNewlyCreated)) {
      return false; // Auto-approve all new fields in new tables
    }
    
    // For newly created fields in existing tables, respect the existing review status
    if (fieldExistsInNewlyCreated || column._isNewlyCreated) {
      // Log for debug purposes
      // // console.log(`Checking newly created field ${column.originalName}:`, 
      //   column.needsReview !== false ? 'Needs review' : 'Already approved');
      return column.needsReview !== false;
    }

    // Default - need review unless explicitly marked otherwise
    return column.needsReview !== false;
  }, [tableSchema, selectedSheet, newlyCreatedFields]);

  // Validate the proposed field name
  const validateFieldName = useCallback((name: string): string | null => {
    if (!name.trim()) {
      return 'Field name cannot be empty.';
    }
    // Basic validation: Allow alphanumeric and underscores, must start with a letter or underscore
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      return 'Invalid characters. Use letters, numbers, and underscores. Must start with a letter or underscore.';
    }
    // Add more specific checks if needed (e.g., reserved words, length limits)
    return null; // No error
  }, []);

  // Generate cached matches for a column
  const getCachedMatches = useCallback((column: ColumnMapping) => {
    if (!column.originalName) {
      return [];
    }

    // Store current column for the cache effect
    lastColumnRef.current = column;

    // Check if we have cached matches for this column
    if (columnMatchesCache[column.originalName]) {
      return columnMatchesCache[column.originalName];
    }

    // Start with an empty matches array
    let matches: Array<{ name: string; type: string; confidence: number; isNewlyCreated?: boolean }> = [];

    // Add fields from the table schema if available
    if (tableSchema?.columns) {
      matches = tableSchema.columns.map((field: any) => {
        // If this is the current mapping, use the stored confidence
        if (field.name === column.mappedName && column.confidence > 0) {
          return {
            name: field.name,
            type: field.type,
            confidence: column.confidence,
            isNewlyCreated: field._isNewlyCreated
          };
        }

        // Otherwise calculate similarity (simplified version for dropdown)
        let confidence = 0;

        // Exact match
        if (field.name === column.originalName) {
          confidence = 100;
        }
        // Normalized match
        else if (field.name.toLowerCase() === column.originalName.toLowerCase()) {
          confidence = 100;
        }
        // DB style match
        else if (field.name.toLowerCase().replace(/_/g, '') ===
                column.originalName.toLowerCase().replace(/[^a-z0-9]/g, '')) {
          confidence = 100;
        }
        // Contains match
        else if (field.name.toLowerCase().includes(column.originalName.toLowerCase()) ||
                column.originalName.toLowerCase().includes(field.name.toLowerCase())) {
          confidence = 80;
        }

        return {
          name: field.name,
          type: field.type,
          confidence,
          isNewlyCreated: field._isNewlyCreated
        };
      });
    }

    // Add newly created fields for this table - use defensive coding
    const tableName = selectedSheet?.mappedName;
    if (tableName && newlyCreatedFields && newlyCreatedFields[tableName]) {
      // Add each newly created field that isn't already in the matches
      const tableFields = newlyCreatedFields[tableName] || [];
      tableFields.forEach(field => {
        if (!field || !field.name) return; // Skip invalid fields

        // Check if this field is already in matches
        const existingIndex = matches.findIndex(m => m.name === field.name);

        if (existingIndex === -1) {
          // Add the field to matches (as a newly created field)
          matches.push({
            name: field.name,
            type: field.type || 'text', // Provide default type
            confidence: field.name === column.mappedName ? 100 : 0,
            isNewlyCreated: true
          });
        } else if (field.name === column.mappedName) {
          // If this is the mapped field and already exists, update its confidence
          matches[existingIndex].confidence = 100;
          matches[existingIndex].isNewlyCreated = true;
        }
      });
    }

    // Sort by confidence
    const sortedMatches = matches.sort((a, b) => b.confidence - a.confidence);

    // Store matches in ref for caching in the useEffect
    lastMatchesRef.current = sortedMatches;

    // Return matches without setting state during render
    // We'll cache the result in a separate useEffect
    return sortedMatches;
  }, [tableSchema, columnMatchesCache, newlyCreatedFields, selectedSheet]);

  // Separate effect to cache column matches to avoid setState during render
  const lastColumnRef = useRef<ColumnMapping | null>(null);
  const lastMatchesRef = useRef<Array<any>>([]);

  useEffect(() => {
    // Only run the effect when non-empty matches are available
    const cachedMatches = lastMatchesRef.current;
    const column = lastColumnRef.current;

    // Run this after a slight delay to avoid render cycle issues
    const timeoutId = setTimeout(() => {
      if (column && column.originalName && cachedMatches && cachedMatches.length > 0) {
        // Only update if we don't already have this column in the cache
        if (!columnMatchesCache[column.originalName]) {
          setColumnMatchesCache(prev => ({
            ...prev,
            [column.originalName]: cachedMatches
          }));
        }
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  // Run this effect whenever any match calculation is done but do NOT depend on columnMatchesCache
  // to avoid infinite update loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter and sort columns based on view mode with prioritization
  const filteredColumns = useMemo(() => {
    if (!selectedSheet) return [];

    let filteredCols;

    // Filter based on view mode
    if (viewMode === 'all') {
      // In "all" mode, we'll show all non-skipped columns
      filteredCols = selectedSheet.columns.filter(col => !col.skip);

      // Sort with priority for needs review and newly created fields, then by data type
      filteredCols.sort((a, b) => {
        // First prioritize newly created fields (using either flag)
        const aIsNewlyCreated = (a._isNewlyCreated || a.created) ? 1 : 0;
        const bIsNewlyCreated = (b._isNewlyCreated || b.created) ? 1 : 0;
        
        if (aIsNewlyCreated !== bIsNewlyCreated) {
          return bIsNewlyCreated - aIsNewlyCreated; // Put newly created at top
        }
        
        // Then prioritize by review status
        const aReviewNeeded = needsReview(a) ? 1 : 0;
        const bReviewNeeded = needsReview(b) ? 1 : 0;

        if (aReviewNeeded !== bReviewNeeded) {
          return bReviewNeeded - aReviewNeeded; // Reversed to put needs review at top
        }

        // Within each status group, sort by data type for consistency
        return (a.dataType || '').localeCompare(b.dataType || '');
      });
    } else if (viewMode === 'needsReview') {
      // Only columns that need review
      filteredCols = selectedSheet.columns.filter(col => !col.skip && needsReview(col));
      
      // Sort by newly created first, then by data type
      filteredCols.sort((a, b) => {
        // First prioritize newly created fields (using either flag)
        const aIsNewlyCreated = (a._isNewlyCreated || a.created) ? 1 : 0;
        const bIsNewlyCreated = (b._isNewlyCreated || b.created) ? 1 : 0;
        
        if (aIsNewlyCreated !== bIsNewlyCreated) {
          return bIsNewlyCreated - aIsNewlyCreated; // Put newly created at top
        }
        
        // Within each status group, sort by data type for consistency
        return (a.dataType || '').localeCompare(b.dataType || '');
      });
    } else { // 'approved' view
      // Show columns that don't need review AND have mappings
      // This ensures unmapped columns don't appear in the approved tab
      filteredCols = selectedSheet.columns.filter(col => 
        !col.skip && !needsReview(col) && !!col.mappedName && col.mappedName !== '_create_new_'
      );

      // Sort by data type within the filtered group
      filteredCols.sort((a, b) =>
        (a.dataType || '').localeCompare(b.dataType || '')
      );
    }
    
    // For logging - only run in development
    // // console.log(`View mode: ${viewMode}, Displaying ${filteredCols.length} columns, ` +
    //   `Newly created: ${filteredCols.filter(col => col._isNewlyCreated || col.created).length}, ` +
    //   `Needs review: ${filteredCols.filter(col => needsReview(col)).length}`);

    return filteredCols;
  }, [selectedSheet, viewMode, needsReview]);

  // Add loading state during sheet switching
  const [isSwitchingSheet, setIsSwitchingSheet] = useState(false);
  
  // Effect to handle setting selected sheet when tab changes
  useEffect(() => {
    if (validSheets.length > 0 && selectedSheetIndex < validSheets.length) {
      const sheet = validSheets[selectedSheetIndex];
      if (sheet && sheet.id !== selectedSheetId) {
        // Set loading state during switch
        setIsSwitchingSheet(true);
        
        // Persist any changes from the current sheet before switching
        if (selectedSheetId) {
          // Force an update to ensure state is saved
          const currentSheet = sheets.find(s => s.id === selectedSheetId);
          if (currentSheet) {
            const needsReviewUpdated = currentSheet.columns.some(col => col.needsReview && !col.skip);
            if (needsReviewUpdated !== currentSheet.needsReview) {
              updateSheet(currentSheet.id, {
                needsReview: needsReviewUpdated
              });
            }
          }
        }

        // Increased delay to ensure all state updates complete before switching
        setTimeout(() => {
          setSelectedSheetId(sheet.id);
          onSheetSelect(sheet.id);
          
          // Use a second timeout to ensure the new sheet is fully rendered before removing loading state
          setTimeout(() => {
            setIsSwitchingSheet(false);
          }, 100);
        }, 150);
      }
    }
  }, [selectedSheetIndex, validSheets, selectedSheetId, setSelectedSheetId, onSheetSelect, sheets, updateSheet]);

  // Effect for saving state before component unmounts or when navigating away
  useEffect(() => {
    return () => {
      // Create a function to save all pending changes
      const saveChanges = () => {
        if (selectedSheet) {
          // Update the sheet status based on current column states
          const needsReviewUpdated = selectedSheet.columns.some(col =>
            col.needsReview && !col.skip
          );

          updateSheet(selectedSheet.id, {
            needsReview: needsReviewUpdated,
            // Force a timestamp update to ensure state is saved
            lastUpdated: new Date().toISOString()
          });
        }
      };

      // Save when component unmounts
      saveChanges();
    };
  }, []);
  
  // Check if the current sheet should be auto-approved
  // Use useRef to track if we've processed this sheet already to prevent loops
  const processedSheetApprovals = useRef(new Set<string>());
  
  useEffect(() => {
    if (!selectedSheet || selectedSheet.approved || !selectedSheet.id) return;
    
    // Skip this sheet if we've already processed it in this session
    if (processedSheetApprovals.current.has(selectedSheet.id)) return;
    
    // Count columns that need review (not skipped)
    const columnsNeedingReview = selectedSheet.columns.filter(col => 
      !col.skip && col.needsReview
    ).length;
    
    // If no columns need review, auto-approve the sheet
    if (columnsNeedingReview === 0 && selectedSheet.columns.length > 0) {
      // // console.log(`Auto-approving sheet ${selectedSheet.originalName} - all fields are approved`);
      
      // Mark this sheet as processed to prevent loops
      processedSheetApprovals.current.add(selectedSheet.id);
      
      // Update the sheet status
      updateSheet(selectedSheet.id, {
        needsReview: false,
        status: 'approved',
        approved: true
      });
    }
  }, [selectedSheet]);
  
  // Effect to auto-approve all sheets when the component loads
  // Use a ref to track if we've run this effect to prevent multiple executions
  const initialAutoApprovalRun = useRef(false);
  
  useEffect(() => {
    // Wait for tables to load and ensure we have sheets to process
    if (tablesLoading || !sheets.length || !tables.length) return;
    
    // Only run this once when the component loads
    if (initialAutoApprovalRun.current) return;
    initialAutoApprovalRun.current = true;
    
    // This will run once on initial load after tables are available
    // // console.log('Running auto-approval for all sheets');
    
    // Process each sheet sequentially to avoid overwhelming the UI
    const processAutoApproval = async () => {
      for (const sheet of sheets) {
        if (sheet.skip || !sheet.mappedName) continue;
        
        // Find matched table schema
        let tableSchema;
        
        // First try exact match
        tableSchema = tables.find((table: any) => table.name === sheet.mappedName);
        
        // If no exact match, try with normalized name
        if (!tableSchema) {
          // Check cache first to avoid repeated lookups and logs
          const cacheKey = sheet.mappedName;
          if (normalizedTableCache.current.has(cacheKey)) {
            tableSchema = normalizedTableCache.current.get(cacheKey);
          } else {
            tableSchema = tables.find((table: any) => 
              normalizeName(table.name) === normalizeName(sheet.mappedName)
            );
            
            if (tableSchema) {
              // // console.log(`[Sheet Processing] Found table with normalized name: ${sheet.mappedName} → ${tableSchema.name}`);
              // Cache the result
              normalizedTableCache.current.set(cacheKey, tableSchema);
            }
          }
        }
        
        if (!tableSchema) continue;
        
        // Go through each column and auto-approve good matches
        const updates: Record<string, Partial<ColumnMapping>> = {};
        
        sheet.columns.forEach(col => {
          if (col.skip || !col.mappedName || col.mappedName === '_create_new_') return;
          
          // Already approved
          if (col.needsReview === false) return;
          
          // Check confidence levels for auto-approval
          if (col.confidence === 100) {
            updates[col.originalName] = { needsReview: false };
          } else if (col.confidence >= 90) {
            updates[col.originalName] = { needsReview: false };
          } else if (col.confidence >= 80) {
            // For medium-high confidence, approve if types match
            const dbField = tableSchema.columns.find((tcol: any) => tcol.name === col.mappedName);
            if (dbField && normalizeDataType(dbField.type) === normalizeDataType(col.dataType)) {
              updates[col.originalName] = { needsReview: false };
            }
          }
        });
        
        // Apply updates if we have any
        if (Object.keys(updates).length > 0) {
          // // console.log(`Auto-approving ${Object.keys(updates).length} columns in sheet ${sheet.originalName}`);
          await batchUpdateSheetColumns(sheet.id, updates);
        }
          
        // Do a local check on fields after updates are applied
        const localUpdatedColumns = [...sheet.columns].map(col => {
          // If this column is being updated in this batch, apply that update
          if (updates[col.originalName]) {
            return { ...col, ...updates[col.originalName] };
          }
          return col;
        });
        
        const columnsStillNeedingReview = localUpdatedColumns.filter(col => {
          if (col.skip) return false; // Skip columns don't need review
          return col.needsReview === true; // Only count columns explicitly marked as needing review
        });
        
        // Only update sheet if it's not already approved and all columns are handled
        if (columnsStillNeedingReview.length === 0 && !sheet.approved && sheet.status !== 'approved') {
          // Sheet is fully mapped - mark as not needing review
          // // console.log(`Sheet ${sheet.originalName} is fully mapped - marking as not needing review`);
          updateSheet(sheet.id, { 
            needsReview: false,
            status: 'approved',
            approved: true
          });
        }
      }
    };
    
    // Run the auto-approval process
    processAutoApproval();
  }, [tables, sheets, tablesLoading, batchUpdateSheetColumns, updateSheet]);

  // Generate sheet -> DB mappings for all sheets on initial load - with optimized performance
  useEffect(() => {
    // Skip operation entirely if any dependencies are missing
    if (sheets.length === 0 || tables.length === 0 || tablesLoading) return;

    // Use requestAnimationFrame to avoid blocking the main thread for large sheet processing
    const frameId = requestAnimationFrame(() => {
      // Process only one sheet per animation frame to prevent performance violations
      const processNextSheet = async () => {
        // Find the next unprocessed sheet
        const nextSheet = sheets.find(sheet =>
          !processedSheets.current.has(sheet.id) &&
          !sheet.skip &&
          sheet.mappedName
        );

        // If no more sheets to process, we're done
        if (!nextSheet) {
          setIsProcessing(false);
          setProcessingProgress(100);
          return;
        }

        // Get the table schema - using various strategies
        // Strategy 1: First try exact match from tables list
        let tableSchema = tables.find((table: any) => table.name === nextSheet.mappedName);
        
        // Strategy 2: Try normalized match (ln_ prefix agnostic)
        if (!tableSchema) {
          tableSchema = tables.find((table: any) => 
            normalizeName(table.name) === normalizeName(nextSheet.mappedName)
          );
          
          if (tableSchema) {
            // // console.log(`[Sheet Processing] Found table with normalized name: ${nextSheet.mappedName} → ${tableSchema.name}`);
          }
        }
        
        // Strategy 3: Check synthetic table cache for newly created tables (local component cache)
        if (!tableSchema) {
          // Check our synthetic table cache
          const potentialTableNames = [
            nextSheet.mappedName,
            nextSheet.createNewValue,
            `ln_${normalizeTableName(nextSheet.originalName)}`
          ];
          
          // Find the first matching entry in our synthetic table cache
          for (const name of potentialTableNames) {
            if (name && synthTableCache.current[name]) {
              tableSchema = synthTableCache.current[name];
              // // console.log(`[Sheet Processing] Found table in component synthetic cache: ${name}`);
              break;
            }
          }
        }
        
        // Strategy 4: Check the centralized Zustand store for dynamic schemas
        if (!tableSchema) {
          const { tableSchemas } = useBatchImportStore.getState();
          const storeTableNames = [
            nextSheet.mappedName,
            nextSheet.createNewValue,
            `ln_${normalizeTableName(nextSheet.originalName)}`
          ];
          
          // Check all potential table names in the store
          for (const name of storeTableNames) {
            if (name && tableSchemas[name]) {
              tableSchema = tableSchemas[name];
              // // console.log(`[Sheet Processing] Found table in Zustand store: ${name}`);
              break;
            }
          }
        }
        
        // Check if this is a new table
        const isNewTable = nextSheet.isNewTable || nextSheet.wasCreatedNew || 
                          nextSheet.createNewValue === nextSheet.mappedName || 
                          nextSheet.mappedName === '_create_new_';
        
        if (!tableSchema) {
          // // console.warn(`[Sheet Processing] No table schema found for "${nextSheet.mappedName}" (with or without ln_ prefix)`);
          
          if (isNewTable) {
            // For new tables, create a dynamic schema based on the sheet columns
            // // console.log(`[Sheet Processing] Creating dynamic schema for new table "${nextSheet.mappedName}"`);
            
            // Generate a valid SQL-safe table name with appropriate prefixes
            const tableName = nextSheet.createNewValue || 
                             (nextSheet.mappedName.startsWith('ln_') ? 
                              nextSheet.mappedName : 
                              `ln_${normalizeTableName(nextSheet.originalName)}`);
            
            // // console.log(`[Schema Generation] Using normalized table name: ${tableName}`);
            
            // Use the Zustand store to create a dynamic schema
            const storeState = useBatchImportStore.getState();
            // // console.log(`[Schema Generation] Before creation - schemas in store:`, Object.keys(storeState.tableSchemas));
            
            // Create the schema in the centralized store
            storeState.createDynamicSchemaForSheet(nextSheet.id, tableName);
            
            // Get the fresh state and schema after creation
            const updatedState = useBatchImportStore.getState();
            // // console.log(`[Schema Generation] After creation - schemas in store:`, Object.keys(updatedState.tableSchemas));
            
            // Get the fresh schema from the store with proper error handling
            tableSchema = updatedState.tableSchemas[tableName];
            
            if (tableSchema) {
              // // console.log(`[Schema Generation] Successfully created schema for ${tableName} with ${tableSchema.columns?.length || 0} columns`);
            } else {
              // // console.error(`[Schema Generation] Schema creation failed - ${tableName} not found in store after creation`);
            }
            
            // If for some reason the schema wasn't created in the store, create a fallback
            if (!tableSchema) {
              // // console.warn(`[Schema Generation] Schema not found in store after creation, creating fallback.`);
              
              // Generate column definitions
              const generatedColumns = nextSheet.columns.map((col, idx) => {
                // Field name generation with fallbacks
                let fieldName = '';
                
                if (col.createNewValue) {
                  fieldName = col.createNewValue;
                } else if (col.mappedName && col.mappedName !== '_create_new_') {
                  fieldName = col.mappedName;
                } else {
                  fieldName = normalizeForDb(col.originalName);
                }
                
                // Type inference
                const inferenceResult = col.sample ? inferColumnType(col.originalName, col.sample) : null;
                const inferredType = col.inferredDataType || 
                                    (inferenceResult ? inferenceResult.type : col.dataType || 'text');
                
                return {
                  name: fieldName,
                  originalName: col.originalName,
                  displayName: col.originalName,
                  normalizedName: fieldName,
                  type: inferredType,
                  dataType: inferredType,
                  is_nullable: 'YES',
                  description: `Auto-generated from: ${col.originalName}`,
                  ordinal: idx,
                  source: 'auto',
                  import: true,
                  reviewStatus: 'approved',
                  created: true,
                  confidence: 100,
                  needsReview: false
                };
              });
              
              // Create schema object
              tableSchema = {
                name: tableName,
                table_name: tableName,
                schema: 'public',
                description: `Auto-generated from sheet: ${nextSheet.originalName}`,
                createdAt: new Date().toISOString(),
                createdBy: 'auto',
                isDynamic: true,
                columns: generatedColumns
              };
            }
            
            // Always save to component's cache as a backup
            synthTableCache.current[tableName] = tableSchema;
            
            // Try to refresh schema cache - this might help with subsequent sheets
            try {
              // // console.log(`[Schema Generation] Refreshing schema cache to save new table: ${tableName}`);
              refreshSchemaCache();
              
              // Log schema details for debugging
              // // console.log('[Schema Debug] Synthetic schema columns:', 
              //   tableSchema.columns.map((col: any) => ({
              //     name: col.name,
              //     type: col.type,
              //     created: col.created
              //   }))
              // );
              
              // Dispatch a custom event to notify other components that the schema was refreshed
              window.dispatchEvent(new CustomEvent('schema-cache-refreshed', { 
                detail: { tableName, isNewTable: true, autoCreated: true }
              }));
            } catch (err) {
              // // console.warn('Schema cache refresh failed:', err);
            }
            
            // Show a toast notification that we've created a synthetic schema
            // // console.log(`[Schema Generation] Created synthetic schema for ${tableName} with ${tableSchema.columns.length} columns`);
            
            // Make sure we update the UI to show these as created fields
            // // console.log(`[Schema Generation] Auto-approving all columns as created fields`);
            
            // Add the schema to global referenceable schemas for this component
            if (!newlyCreatedFields[tableName]) {
              newlyCreatedFields[tableName] = [];
            }
            
            // Add all column definitions to the newlyCreatedFields for reference
            tableSchema.columns.forEach((col: any) => {
              newlyCreatedFields[tableName].push({
                name: col.name,
                type: col.type || col.dataType,
                created: true,
                reviewStatus: 'approved'
              });
            });
            
            // Step 1: Update the sheet's column mappings for all unmapped columns
            const columnUpdates: Record<string, Partial<ColumnMapping>> = {};
            
            // Auto-mark all columns in this new table as created and approved
            nextSheet.columns.forEach(col => {
              if (!col.mappedName || col.mappedName === '_create_new_') {
                // Create mapping for each field
                const normalizedName = normalizeForDb(col.originalName);
                
                // Create the update with proper UI fields
                columnUpdates[col.originalName] = {
                  mappedName: '_create_new_',
                  createNewValue: normalizedName,
                  dataType: col.inferredDataType || 'text',
                  confidence: 100,
                  _isNewlyCreated: true,
                  needsReview: false,
                  created: true,
                  reviewStatus: 'approved',
                  import: true
                };
              }
            });
            
            // Batch update all columns at once for better performance
            if (Object.keys(columnUpdates).length > 0) {
              // // console.log(`[Schema Generation] Batch updating ${Object.keys(columnUpdates).length} columns with auto-generated mappings`);
              batchUpdateSheetColumns(nextSheet.id, columnUpdates);
              
              // Also mark the sheet as not needing review and set to 'approved' status
              updateSheet(nextSheet.id, {
                needsReview: false,
                status: 'approved',
                approved: true
              });
            }
          } else {
            // For existing tables with missing schema, log error and skip
            // // console.error(`[Sheet Processing] No table schema found for existing table "${nextSheet.mappedName}" - skipping`);
            // Mark as processed even though we skipped it (no valid table schema)
            processedSheets.current.add(nextSheet.id);
            // Schedule next sheet
            requestAnimationFrame(processNextSheet);
            return;
          }
        }

        try {
          // Mark sheet as being processed
          setIsProcessing(true);

          // Prepare sheet columns and DB fields
          const sheetColumns: ColumnInfo[] = nextSheet.columns.map(col => ({
            originalName: col.originalName,
            originalIndex: col.originalIndex,
            inferredDataType: col.inferredDataType,
            sample: col.sample
          }));

          // Add extra safety check for tableSchema to ensure it exists and has columns
          if (!tableSchema || !tableSchema.columns || !Array.isArray(tableSchema.columns)) {
            // // console.error(`[Sheet Processing] Invalid schema for "${nextSheet.mappedName}" after processing - creating empty schema`);
            tableSchema = {
              name: nextSheet.mappedName,
              columns: []
            };
          }
          
          // Create properly formatted dbFields for mapping, with all required UI properties
          // This will handle columns from both real DB schemas and our synthetically created ones
          const dbFields: DbFieldInfo[] = (tableSchema.columns || []).map((col: any) => {
            // Handle synthetic columns with dataType property vs DB columns with type property
            const fieldType = col.type || col.dataType || 'text';
            const fieldName = col.name || col.normalizedName || 'unknown';
            
            // Return with standardized properties
            return {
              name: fieldName,
              type: fieldType,
              isRequired: col.is_nullable === 'NO' || col.required === true,
              // Include extra properties for the UI
              displayName: col.displayName || col.name,
              description: col.description || '',
              created: col.created || false,
              reviewStatus: col.reviewStatus || 'pending',
              source: col.source || 'db'
            };
          });
          
          // Log the processed fields for debugging
          // // console.log(`[Sheet Processing] Processing ${nextSheet.originalName} with ${dbFields.length} fields:`, 
          //   dbFields.map(f => `${f.name}:${f.type}`).join(', ')
          // );

          // Generate mappings with progress callback
          const mappingResults = await generateMappings(
            sheetColumns,
            dbFields,
            {
              progressCallback: (percent) => {
                setProcessingProgress(percent);
              }
            }
          );

          // Convert mapping results to column updates - with enhanced auto-approval logic
          const updates: Record<string, Partial<ColumnMapping>> = {};
          mappingResults.forEach(result => {
            let needsReview = true;
            let isCreatedField = false;
            
            // Check if this is a newly created field (in our synthetic schema)
            try {
              const dbField = tableSchema?.columns?.find((col: any) => col?.name === result.mappedName);
              isCreatedField = dbField?.created === true || dbField?.source === 'auto';
              
              // For created fields or fields in a new table, mark as not needing review
              if (isCreatedField || nextSheet.isNewTable || nextSheet.wasCreatedNew) {
                needsReview = false;
              }
            } catch (err) {
              // // console.warn(`Error checking if field is created: ${err}`);
            }
            
            // Auto-approve high confidence matches
            if (result.confidence === 100) {
              needsReview = false; // Auto-approve exact matches
            } else if (result.confidence >= 90) {
              needsReview = false; // Auto-approve high confidence matches
            } else if (result.confidence >= 80) {
              // For medium-high confidence, approve if types match
              // Handle safely with error boundaries for the column lookup
              try {
                const dbField = tableSchema?.columns?.find((col: any) => col?.name === result.mappedName);
                const dbType = dbField?.type || dbField?.dataType;
                if (dbField && dbType && normalizeDataType(dbType) === normalizeDataType(result.dataType)) {
                  needsReview = false;
                }
              } catch (err) {
                // // console.warn(`Error comparing data types: ${err}. Using default needsReview=true`);
                // Keep the default needsReview = true
              }
            }
            
            // Create the update with complete properties for proper UI rendering
            updates[result.originalName] = {
              mappedName: result.mappedName,
              dataType: result.dataType,
              confidence: result.confidence,
              needsReview: needsReview,
              // Add UI-specific fields for proper rendering
              _isNewlyCreated: isCreatedField,
              created: isCreatedField,
              reviewStatus: needsReview ? 'pending' : 'approved',
              import: true
            };
          });

          // Update sheet columns in a single batch
          batchUpdateSheetColumns(nextSheet.id, updates);

          // Mark sheet as processed
          processedSheets.current.add(nextSheet.id);

          // Mark sheet as ready
          updateSheet(nextSheet.id, {
            status: 'ready',
            needsReview: mappingResults.some(result => result.needsReview)
          });

          // Schedule next sheet with requestAnimationFrame to avoid UI blocking
          requestAnimationFrame(processNextSheet);
        } catch (error) {
          // // console.error(`Error processing sheet ${nextSheet.originalName}:`, error);
          onError(`Failed to process sheet ${nextSheet.originalName}: ${error instanceof Error ? error.message : 'Unknown error'}`);

          // Mark as processed to avoid getting stuck
          processedSheets.current.add(nextSheet.id);

          // Continue with next sheet despite error
          requestAnimationFrame(processNextSheet);
        }
      };

      // Start processing the first sheet
      processNextSheet();
    });

    // Cleanup animation frame on unmount
    return () => cancelAnimationFrame(frameId);
  }, [sheets, tables, tablesLoading, batchUpdateSheetColumns, updateSheet, onError]);

  // Handle keyboard event listener for dropdown search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Clear on escape
      if (e.key === 'Escape') {
        setFieldSearchText('');
        return;
      }

      // Backspace
      if (e.key === 'Backspace') {
        setFieldSearchText(prev => prev.slice(0, -1));
        return;
      }

      // Only handle alphanumeric characters, underscore, and hyphen
      if (/^[a-zA-Z0-9_\-]$/.test(e.key)) {
        // Use debounced search to avoid excessive re-renders
        debouncedSearch.current(() => {
          setFieldSearchText(prev => prev + e.key);
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Auto-clear search text after 3 seconds of inactivity
    const clearTimer = setTimeout(() => {
      setFieldSearchText('');
    }, 3000);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(clearTimer);
    };
  }, []);

  // Clean up caches when component unmounts
  useEffect(() => {
    return () => {
      clearSimilarityCaches();
    };
  }, []);

  // Generate normalized field name from original column name
  const normalizeFieldName = useCallback((originalName: string): string => {
    // Convert to lowercase, replace spaces and special chars with underscores
    return originalName
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '_')    // Replace special chars with underscore
      .replace(/\s+/g, '_')        // Replace spaces with underscore
      .replace(/_+/g, '_')         // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '');    // Remove leading/trailing underscores
  }, []);

  // Generate a unique field name based on base name
  const generateUniqueFieldName = useCallback((baseName: string): string => {
    if (!tableSchema?.columns) return baseName;

    // Check if the base name already exists
    const exists = tableSchema.columns.some((col: any) => col.name === baseName);
    if (!exists) return baseName;

    // If it exists, try appending numbers
    let suffix = 1;
    let newName = `${baseName}_${suffix}`;

    while (tableSchema.columns.some((col: any) => col.name === newName)) {
      suffix++;
      newName = `${baseName}_${suffix}`;
    }

    return newName;
  }, [tableSchema]);

  // Handle clicking "Create New Field"
  const handleCreateNewField = useCallback((column: ColumnMapping, newName?: string) => {
    if (!selectedSheet) return;

    // Determine if we are saving or entering edit mode
    const isSaving = !!newName;
    const name = isSaving ? newName : '';

    if (isSaving) {
      // User has provided a name, create the field
      const dataType = column.dataType || 'text';

      // Check for validation errors before proceeding
      const validationError = validateFieldName(name);
      if (validationError) {
        setNewFieldError(validationError);
        // // console.error(`[Field Creation] Validation failed for field name "${name}": ${validationError}`);
        return; // Don't proceed if validation fails
      }

      // // console.log(`[Field Creation] Creating new field: ${name} with type: ${dataType}`);

      // When a user manually creates a field, mark it as already approved
      // No need for manual approval when pressing Enter
      updateSheetColumn(selectedSheet.id, column.originalName, {
        mappedName: name,
        dataType: dataType, // Ensure data type is set correctly
        confidence: 100, // Set high confidence for user-created fields
        needsReview: false, // Auto-approve fields when they're created
        _isNewlyCreated: true, // Mark with legacy flag
        created: true // Mark with new flag too for redundancy
      });
      
      // // console.log(`[Field Creation] Created and auto-approved new field: ${name}`);

      // Add the new field to our component's state tracking for newly created fields
      setNewlyCreatedFields(prev => {
        const tableName = selectedSheet.mappedName;
        if (!tableName) {
          // // console.error(`[Field Creation] No table name found for selected sheet, can't update state`);
          return prev;
        }

        // // console.log(`[Field Creation] Updating newlyCreatedFields state for table: ${tableName}`);
        const tableFields = [...(prev[tableName] || [])];

        // Check if field already exists to avoid duplication
        if (!tableFields.some(field => field.name === name)) {
          tableFields.push({
            name: name,
            type: dataType,
            created: true // Explicitly set created flag
          });
          // // console.log(`[Field Creation] Added field "${name}" to newlyCreatedFields state`);
        } else {
          // // console.log(`[Field Creation] Field "${name}" already exists in state, skipping`);
        }

        // Return updated state
        return {
          ...prev,
          [tableName]: tableFields
        };
      });

      // Also update the Zustand store's tableSchemas to include this field
      try {
        const { tableSchemas } = useBatchImportStore.getState();
        const tableName = selectedSheet.mappedName;
        
        if (tableName && tableSchemas[tableName]) {
          // Get current state with proper typings
          const storeState = useBatchImportStore.getState();
          
          // Create updated schemas object
          const updatedSchemas = { ...storeState.tableSchemas };
          
          // Get the existing schema or create a new one
          const existingSchema = updatedSchemas[tableName] ? 
            { ...updatedSchemas[tableName] } : 
            {
              name: tableName,
              table_name: tableName,
              schema: 'public',
              description: `Auto-generated from column creation`,
              createdAt: new Date().toISOString(),
              createdBy: 'manual',
              isDynamic: true,
              columns: []
            };
            
          // Create updated columns array
          const updatedColumns = [...(existingSchema.columns || [])];
          
          // Check if column already exists
          const existingColumnIndex = updatedColumns.findIndex(col => col.name === name);
          
          // Create the column object with full metadata
          const columnObject = {
            name: name,
            originalName: column.originalName,
            displayName: column.originalName,
            normalizedName: name,
            type: dataType,
            dataType: dataType,
            is_nullable: 'YES',
            description: `Manually created from: ${column.originalName}`,
            ordinal: updatedColumns.length,
            source: 'manual',
            import: true,
            reviewStatus: 'approved',
            created: true,
            _isNewlyCreated: true,
            confidence: 100,
            needsReview: false
          };
          
          // Add or update the column
          if (existingColumnIndex >= 0) {
            updatedColumns[existingColumnIndex] = {
              ...updatedColumns[existingColumnIndex],
              ...columnObject
            };
            // // console.log(`[Field Creation] Updated existing column in Zustand store: ${name}`);
          } else {
            updatedColumns.push(columnObject);
            // // console.log(`[Field Creation] Added new column to Zustand store: ${name}`);
          }
          
          // Update the schema with new columns
          existingSchema.columns = updatedColumns;
          
          // Update the schemas object
          updatedSchemas[tableName] = existingSchema;
          
          // Set the updated schemas in the store
          useBatchImportStore.setState({
            tableSchemas: updatedSchemas
          });
          
          // // console.log(`[Field Creation] Updated Zustand store with new field: ${name}`);
        } else {
          // // console.warn(`[Field Creation] No schema found for table ${tableName} in Zustand store`);
        }
      } catch (err) {
        // // console.error(`[Field Creation] Error updating Zustand store:`, err);
      }

      // Clear ALL column matches cache to ensure the newly created field shows up everywhere
      setColumnMatchesCache({});

      // Force an update of the sheet status to ensure it's properly tracked in all views
      if (selectedSheet) {
        updateSheet(selectedSheet.id, {
          needsReview: false, // Auto-approve the field
          lastUpdated: new Date().toISOString()
        });
      }

      // Reset the edit state
      setEditingNewField(null);
      setNewFieldName('');
      setNewFieldError(null);

      // Ensure we're in "All Columns" or "Needs Review" view to see the newly created field
      if (viewMode === 'approved') {
        setViewMode('all');
      }

      // Wait a beat to make sure the column is created before attempting to focus
      // This helps the user see their newly created field
      setTimeout(() => {
        // Force a DOM refresh to ensure the newly created field is visible
        window.dispatchEvent(new Event('resize'));
        
        // Force a component re-render to update the UI with newly created field
        setIsProcessing(prev => !prev);
        setTimeout(() => setIsProcessing(prev => !prev), 50);
      }, 100);
    } else {
      // Enter edit mode for this column
      const suggestedName = generateUniqueFieldName(normalizeFieldName(column.originalName));
      setNewFieldName(suggestedName);
      setEditingNewField(column.originalName);
    }

    // Record the action time
    lastActionTime.current = Date.now();
  }, [selectedSheet, updateSheetColumn, updateSheet, generateUniqueFieldName, normalizeFieldName, validateFieldName, viewMode, setViewMode, setIsProcessing]);

  // Handle canceling new field creation
  const handleCancelNewField = useCallback((column: ColumnMapping) => {
    setEditingNewField(null);
    setNewFieldName('');
    setNewFieldError(null);

    // Restore previous mapping if available
    if (column.mappedName && column.mappedName !== '_create_new_') {
      // Do nothing, keep existing mapping
    } else {
      // Reset to empty
      updateSheetColumn(selectedSheet?.id || '', column.originalName, {
        mappedName: '',
        confidence: 0
      });
    }
  }, [selectedSheet, updateSheetColumn]);

  // Handler for changing the mapped name of a column
  const handleMappedNameChange = useCallback((column: ColumnMapping, newValue: string) => {
    if (!selectedSheet) return;

    // Handle "Create New Field" selection
    if (newValue === '_create_new_') {
      handleCreateNewField(column);
      return;
    }

    // Get the data type from the selected field if it exists
    let newDataType = column.dataType;
    let confidence = 0; // Default for custom selections
    let isExistingField = false;

    if (tableSchema?.columns) {
      const matchedField = tableSchema.columns.find((col: any) => col.name === newValue);
      if (matchedField) {
        newDataType = normalizeDataType(matchedField.type);
        confidence = 100; // Manual selection of database field = 100% confidence
        isExistingField = true;
      }
    }

    // Check if field is a newly created one
    let isNewlyCreated = false;
    if (selectedSheet.mappedName && newlyCreatedFields[selectedSheet.mappedName]) {
      isNewlyCreated = newlyCreatedFields[selectedSheet.mappedName].some(field =>
        field.name === newValue
      );
    }

    // Determine if this field needs review
    const updatedColumn = {
      ...column,
      mappedName: newValue,
      dataType: newDataType,
      confidence: isExistingField || isNewlyCreated ? 100 : 0
    };

    // User manually mapped this column, so it should not need review
    // When a user explicitly selects a mapping, we consider it approved
    const shouldNeedReview = false;

    // Update the column mapping
    updateSheetColumn(selectedSheet.id, column.originalName, {
      mappedName: newValue,
      dataType: newDataType,
      confidence: isExistingField || isNewlyCreated ? 100 : 0,
      needsReview: shouldNeedReview
    });

    // Trigger sheet update check *after* column state is set.
    // Let lifecycle hooks (blur/unmount) handle the actual persistence if needed.
    if (selectedSheet) {
      const needsReviewUpdated = selectedSheet.columns.some(col =>
        (col.originalName === column.originalName ? shouldNeedReview : col.needsReview) && !col.skip
      );
      if (needsReviewUpdated !== selectedSheet.needsReview) {
        // Update the sheet's review status in the store immediately
        // Note: This updates the store, but doesn't necessarily trigger blur/unload persistence
        updateSheet(selectedSheet.id, { needsReview: needsReviewUpdated });
      }
    }

    // Record the action time
    lastActionTime.current = Date.now();
  }, [selectedSheet, tableSchema, updateSheetColumn, updateSheet, handleCreateNewField, newlyCreatedFields]);

  // Handler for changing the data type of a column
  const handleDataTypeChange = useCallback((column: ColumnMapping, newValue: string) => {
    if (!selectedSheet) return;

    // Check if this is a database field that should match its source type
    let isMappedToDbField = false;
    let dbFieldType = '';

    if (column.mappedName && column.mappedName !== '_create_new_' && tableSchema?.columns) {
      const matchedField = tableSchema.columns.find((col: any) => col.name === column.mappedName);
      if (matchedField) {
        isMappedToDbField = true;
        dbFieldType = normalizeDataType(matchedField.type);
      }
    }

    // If it's a DB field and the type matches, then no review needed
    // Otherwise it may need review
    const needsFieldReview = isMappedToDbField ?
      (dbFieldType !== newValue) :
      (column.needsReview !== false); // Preserve existing state if not DB field

    // Update the column with new data type and review status
    updateSheetColumn(selectedSheet.id, column.originalName, {
      dataType: newValue,
      // If type matches DB field, then no need for review
      needsReview: needsFieldReview
    });

    // Trigger sheet update check *after* column state is set.
    // Let lifecycle hooks (blur/unmount) handle the actual persistence if needed.
    if (selectedSheet) {
      const needsReviewUpdated = selectedSheet.columns.some(col =>
        (col.originalName === column.originalName ? needsFieldReview : col.needsReview) && !col.skip
      );
      if (needsReviewUpdated !== selectedSheet.needsReview) {
        // Update the sheet's review status in the store immediately
        updateSheet(selectedSheet.id, { needsReview: needsReviewUpdated });
      }
    }

    // Record the action time
    lastActionTime.current = Date.now();
  }, [selectedSheet, updateSheetColumn, updateSheet, tableSchema, normalizeDataType]);

  // Handler for toggling column skip status
  const handleSkipChange = useCallback((column: ColumnMapping, newValue: boolean) => {
    if (!selectedSheet) return;

    updateSheetColumn(selectedSheet.id, column.originalName, {
      skip: newValue
    });

    // Record the action time
    lastActionTime.current = Date.now();
  }, [selectedSheet, updateSheetColumn]);
  

  // Handler for sheet tab change
  const handleSheetTabChange = useCallback((_event: React.SyntheticEvent, newValue: number) => {
    setSelectedSheetIndex(newValue);
  }, []);

  // Handler for view mode change
  const handleViewModeChange = useCallback((_event: React.SyntheticEvent, newValue: 'all' | 'needsReview' | 'approved') => {
    setViewMode(newValue);
  }, []);
  
  // Handle auto-create all fields button click - this works across all sheets if allSheets is true
  const handleAutoCreateAllFields = useCallback((allSheets: boolean = false) => {
    // // console.log(`Auto-creating all unmapped fields for ${allSheets ? 'ALL SHEETS' : 'current sheet'}`);
    
    const sheetsToProcess = allSheets ? validSheets : [selectedSheet];
    
    if (!sheetsToProcess || sheetsToProcess.length === 0) {
      // // console.error('[AutoCreate] No sheets available to process');
      // Could show a toast notification here
      return;
    }
    
    // Track schemas created for better debugging
    const createdSchemas = [];
    
    // Process each sheet using the Zustand store's createDynamicSchemaForSheet
    sheetsToProcess.forEach(sheet => {
      if (!sheet || sheet.skip) {
        // // console.log(`[AutoCreate] Skipping sheet ${sheet?.id} - marked to skip`);
        return;
      }
      
      // // console.log(`[AutoCreate] Processing sheet ${sheet.id} (${sheet.originalName})`);
      
      try {
        // Generate the appropriate table name
        const tableName = sheet.createNewValue || 
                         (sheet.mappedName.startsWith('ln_') ? 
                          sheet.mappedName : 
                          `ln_${normalizeTableName(sheet.originalName)}`);
        
        // Verify we can create a schema for this sheet
        if (!sheet.columns || sheet.columns.length === 0) {
          // // console.error(`[AutoCreate] Cannot create schema for ${sheet.originalName} - no columns available`);
          return;
        }
        
        // // console.log(`[AutoCreate] Creating schema for ${sheet.originalName} -> ${tableName}`);
        
        // Get the current state for later validation
        const storeStateBefore = useBatchImportStore.getState();
        // // console.log(`[AutoCreate] Schema store before creation:`, 
        //   Object.keys(storeStateBefore.tableSchemas).length, 
        //   `tables including:`, 
        //   Object.keys(storeStateBefore.tableSchemas).slice(0, 5)
        // );
        
        // Use the store function to create dynamic schema and update all mappings
        const { createDynamicSchemaForSheet } = storeStateBefore;
        
        // Create the schema in the store
        createDynamicSchemaForSheet(sheet.id, tableName);
        
        // Get updated state after creation
        const storeStateAfter = useBatchImportStore.getState();
        // // console.log(`[AutoCreate] Schema store after creation:`, 
        //   Object.keys(storeStateAfter.tableSchemas).length,
        //   `tables including:`,
        //   Object.keys(storeStateAfter.tableSchemas).slice(0, 5)
        // );
        
        // Verify schema was created
        const schemaCreated = storeStateAfter.tableSchemas[tableName];
        if (!schemaCreated) {
          // // console.error(`[AutoCreate] Failed to create schema for ${tableName} - not found in store after creation`);
        } else {
          // // console.log(`[AutoCreate] Successfully created schema for ${tableName} with ${schemaCreated.columns?.length || 0} columns`);
          createdSchemas.push(tableName);
          
          // Also update local component state to track newly created fields
          // This ensures fields show up in the UI with "New" badges
          setNewlyCreatedFields(prev => {
            const updatedFields = { ...prev };
            
            if (!updatedFields[tableName]) {
              updatedFields[tableName] = [];
            }
            
            // Add each column from the schema to our tracking state
            schemaCreated.columns.forEach((col: any) => {
              // Avoid duplicates
              if (!updatedFields[tableName].some(field => field.name === col.name)) {
                updatedFields[tableName].push({
                  name: col.name,
                  type: col.type || col.dataType || 'text',
                  created: true
                });
              }
            });
            
            // // console.log(`[AutoCreate] Updated component's newlyCreatedFields state with ${updatedFields[tableName].length} fields for ${tableName}`);
            return updatedFields;
          });
        }
        
        // Update sheet status to reflect changes
        updateSheet(sheet.id, {
          needsReview: false,
          status: 'approved', 
          approved: true,
          isNewTable: true,
          wasCreatedNew: true
        });
        
        // Update individual columns to mark them with the created flag
        if (sheet.columns && sheet.columns.length > 0) {
          const columnUpdates: Record<string, Partial<ColumnMapping>> = {};
          
          sheet.columns.forEach((col) => {
            // Only update columns that don't already have mappings
            if (!col.skip && (!col.mappedName || col.mappedName === '_create_new_' || !col._isNewlyCreated)) {
              columnUpdates[col.originalName] = {
                _isNewlyCreated: true,
                created: true,
                confidence: 100,
                needsReview: false
              };
            }
          });
          
          if (Object.keys(columnUpdates).length > 0) {
            // // console.log(`[AutoCreate] Marking ${Object.keys(columnUpdates).length} columns as newly created`);
            batchUpdateSheetColumns(sheet.id, columnUpdates);
          }
        }
        
        // // console.log(`[AutoCreate] Updated sheet status for ${sheet.originalName}`);
      } catch (err) {
        // // console.error(`[AutoCreate] Error processing sheet ${sheet.originalName}:`, err);
      }
    });
    
    // Log summary
    // // console.log(`[AutoCreate] Created ${createdSchemas.length} schemas:`, createdSchemas);
    
    // Try to refresh schema cache to make sure new tables are recognized
    try {
      refreshSchemaCache();
      window.dispatchEvent(new CustomEvent('schema-cache-refreshed', {
        detail: { 
          autoCreated: true,
          schemasCreated: createdSchemas,
          sheetsProcessed: sheetsToProcess.map(s => s.id)
        }
      }));
      // // console.log('[AutoCreate] Schema cache refresh event dispatched');
      
      // Force a state refresh to trigger re-renders
      setTimeout(() => {
        // Trigger a UI refresh by toggling a state value
        setIsProcessing(prev => !prev);
        setTimeout(() => {
          setIsProcessing(prev => !prev);
          
          // Force a column re-render by doing another state toggle after a brief delay
          // This helps ensure the UI displays the latest data after all state updates
          setTimeout(() => {
            // Trigger additional refresh as needed
            setFieldSearchText(prev => prev + ' ');
            setTimeout(() => setFieldSearchText(''), 50);
          }, 150);
        }, 100);
      }, 100);
    } catch (err) {
      // // console.warn('[AutoCreate] Schema cache refresh failed:', err);
    }
  }, [batchUpdateSheetColumns, updateSheet, selectedSheet, validSheets, setIsProcessing, setNewlyCreatedFields, setFieldSearchText]);
  
  // Handler for approving a column
  const handleApproveColumn = useCallback((column: ColumnMapping) => {
    if (!selectedSheet) return;
    
    // // console.log(`Approving column ${column.originalName}`, column);
    
    // Mark the column as not needing review (approved)
    updateSheetColumn(selectedSheet.id, column.originalName, {
      needsReview: false,
      // Clear the _isNewlyCreated flag if it exists
      _isNewlyCreated: undefined
    });
    
    // Update the sheet status if needed
    const needsReviewUpdated = selectedSheet.columns.some(col => 
      (col.originalName === column.originalName ? false : col.needsReview) && !col.skip
    );
    
    if (needsReviewUpdated !== selectedSheet.needsReview) {
      updateSheet(selectedSheet.id, { needsReview: needsReviewUpdated });
    }
    
    // // console.log(`Current view mode: ${viewMode}`);
    
    // Force switching to all view if we're in needsReview and this was the last column
    // This prevents the field from "disappearing" suddenly
    if (viewMode === 'needsReview') {
      const remainingColumnsNeedingReview = selectedSheet.columns.filter(col => 
        col.originalName !== column.originalName && col.needsReview && !col.skip
      ).length;
      
      // // console.log(`Remaining columns needing review: ${remainingColumnsNeedingReview}`);
      
      // If this was the last column in needsReview view, switch to 'all' view
      if (remainingColumnsNeedingReview === 0) {
        // // console.log('Switching to all columns view because no more fields need review');
        setTimeout(() => setViewMode('all'), 100);
      }
    }
    
    // Record the action time
    lastActionTime.current = Date.now();
  }, [selectedSheet, updateSheetColumn, updateSheet, viewMode, setViewMode]);

  // Import schema refresh utility moved to top of file
  
  // Handler for approving a sheet
  const handleApproveSheet = useCallback(async () => {
    if (!selectedSheet) return;

    // Check if this is a newly created table
    const isNewTable = selectedSheet.isNewTable || selectedSheet.wasCreatedNew || !!selectedSheet.createNewValue;
    
    // Mark the sheet as approved
    updateSheet(selectedSheet.id, {
      approved: true,
      status: 'approved',
      // Mark it as wasCreatedNew if it was a new table so we can identify it later
      wasCreatedNew: isNewTable ? true : selectedSheet.wasCreatedNew
    });
    
    // Also mark all columns as not needing review
    const updates: Record<string, Partial<ColumnMapping>> = {};
    selectedSheet.columns.forEach(col => {
      if (col.needsReview) {
        updates[col.originalName] = { needsReview: false };
      }
    });
    
    if (Object.keys(updates).length > 0) {
      batchUpdateSheetColumns(selectedSheet.id, updates);
    }
    
    // If this was a new table, refresh the schema cache to make it available for auto-approval
    if (isNewTable) {
      // // console.log(`Refreshing schema cache for newly created table: ${selectedSheet.mappedName}`);
      try {
        // Refresh schema cache
        const result = await refreshSchemaCache();
        // // console.log(`Schema cache refresh result:`, result);
        
        // Force refresh of table metadata to include the newly created table
        if (result.success) {
          // Wait a brief moment for the cache to update on the server
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('schema-cache-refreshed', {
              detail: { tableName: selectedSheet.mappedName }
            }));
          }, 500);
        }
      } catch (error) {
        // // console.error(`Error refreshing schema cache:`, error);
      }
    }
  }, [selectedSheet, updateSheet, batchUpdateSheetColumns]);
  
  // Handler for approving all exact matches in the sheet
  const handleApproveExactMatches = useCallback(() => {
    if (!selectedSheet || !tableSchema) return;
    
    // Find all columns that have exact matches (high confidence) but are marked as needing review
    const updates: Record<string, Partial<ColumnMapping>> = {};
    
    selectedSheet.columns.forEach(col => {
      if (col.needsReview && !col.skip && col.mappedName && col.confidence >= 95) {
        // Check if data types match
        const dbField = tableSchema.columns?.find((field: any) => field.name === col.mappedName);
        if (dbField && normalizeDataType(dbField.type) === normalizeDataType(col.dataType)) {
          updates[col.originalName] = { needsReview: false };
        }
      }
    });
    
    if (Object.keys(updates).length > 0) {
      batchUpdateSheetColumns(selectedSheet.id, updates);
      
      // Check if all columns are now approved
      const stillNeedsReview = selectedSheet.columns.some(col => {
        // Skip this column if it's in our updates (no longer needs review)
        if (updates[col.originalName]) return false;
        // Otherwise, check its current status
        return col.needsReview && !col.skip;
      });
      
      // Update sheet status if all columns are now approved
      if (!stillNeedsReview) {
        updateSheet(selectedSheet.id, { needsReview: false });
      }
    }
  }, [selectedSheet, tableSchema, batchUpdateSheetColumns, updateSheet, normalizeDataType]);

  // Don't update list data during sheet switching to prevent UI thrashing
  const listItemData = useMemo(() => {
    // Skip updating data during sheet switching
    if (isSwitchingSheet) {
      // Return previous data or empty defaults if not available
      return {
        columns: [],
        tableColumns: [],
        dataTypes,
        handleMappedNameChange,
        handleDataTypeChange,
        handleSkipChange,
        handleCreateNewField,
        handleCancelNewField,
        handleApproveColumn,
        normalizeDataType,
        fieldSearchText: '',
        isCreatingNewField,
        generateUniqueFieldName,
        getCachedMatches,
        editingNewField: null,
        theme,
        needsReview,
        newlyCreatedFields: {},
        selectedSheetName: ''
      };
    }
    
    // Normal data when not switching
    return {
      columns: filteredColumns,
      tableColumns: tableSchema?.columns || [],
      dataTypes,
      handleMappedNameChange,
      handleDataTypeChange,
      handleSkipChange,
      handleCreateNewField,
      handleCancelNewField,
      handleApproveColumn,
      normalizeDataType,
      fieldSearchText,
      isCreatingNewField,
      generateUniqueFieldName,
      getCachedMatches,
      editingNewField,
      theme,
      needsReview,
      newlyCreatedFields,
      selectedSheetName: selectedSheet?.mappedName
    };
  }, [
    filteredColumns,
    tableSchema,
    dataTypes,
    handleMappedNameChange,
    handleDataTypeChange,
    handleSkipChange,
    handleCreateNewField,
    handleCancelNewField,
    fieldSearchText,
    isCreatingNewField,
    generateUniqueFieldName,
    getCachedMatches,
    editingNewField,
    theme,
    needsReview,
    newlyCreatedFields,
    selectedSheet?.mappedName,
    isSwitchingSheet,
    handleApproveColumn
  ]);

  // Status indicators
  const readyColumns = useMemo(() => {
    if (!selectedSheet) return 0;
    return selectedSheet.columns.filter(col => !col.needsReview && !col.skip).length;
  }, [selectedSheet]);

  const totalColumns = useMemo(() => {
    if (!selectedSheet) return 0;
    return selectedSheet.columns.filter(col => !col.skip).length;
  }, [selectedSheet]);

  const reviewColumns = useMemo(() => {
    if (!selectedSheet) return 0;
    return selectedSheet.columns.filter(col => col.needsReview && !col.skip).length;
  }, [selectedSheet]);

  // Check if sheet is fully mapped and can be approved
  const canApprove = useMemo(() => {
    if (!selectedSheet) return false;
    return readyColumns === totalColumns && totalColumns > 0;
  }, [selectedSheet, readyColumns, totalColumns]);

  // CRITICAL EARLY RETURN: Prevent usage of undefined data
  // Guard against uninitialized state - providing clear error message for debugging
  if (!sheets || !validSheets) {
    return (
      <Box>
        <Alert severity="error">
          Error: Sheets data not available. Please try refreshing the page.
        </Alert>
        <Typography sx={{ mt: 2 }}>Sheets data must be properly initialized before rendering.</Typography>
      </Box>
    );
  }

  // Guard against selectedSheet undefined issues
  if (!selectedSheetId && validSheets.length > 0) {
    // Auto-select the first sheet as a fallback
    setTimeout(() => {
      setSelectedSheetId(validSheets[0].id);
      onSheetSelect(validSheets[0].id);
    }, 10);
    return (
      <Box>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Initializing sheet selection...</Typography>
      </Box>
    );
  }

  // If loading or no sheet selected, show loading state
  if (tablesLoading || !selectedSheet) {
    return (
      <Box>
        <LinearProgress />
        <Typography sx={{ mt: 2 }}>Loading table metadata...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Sheet Navigation */}
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={selectedSheetIndex}
          onChange={handleSheetTabChange}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            '.MuiTabs-scrollButtons': {
              opacity: 1,
              '&.Mui-disabled': {
                opacity: 0.3,
              }
            }
          }}
        >
          {validSheets.map((sheet, index) => {
            // Determine status icon and color
            let StatusIcon = CheckCircleOutlineIcon;
            let statusColor = 'info.main';
            let tooltipTitle = 'Ready';

            if (sheet.approved) {
              StatusIcon = CheckCircleIcon;
              statusColor = 'success.main';
              tooltipTitle = 'Approved';
            } else if (sheet.needsReview) {
              StatusIcon = WarningIcon;
              statusColor = 'warning.main';
              tooltipTitle = 'Needs Review';
            }

            return (
              <Tab
                key={sheet.id}
                sx={{
                  minHeight: 48,
                  py: 1,
                  opacity: 1,
                  '&.Mui-selected': {
                    bgcolor: 'action.selected',
                    borderBottom: 2,
                    borderColor: 'primary.main'
                  }
                }}
                label={(() => {
                  // Compute tooltip text outside of render to avoid re-renders
                  let tooltipText = tooltipTitle;
                  
                  // Count columns needing review - do this calculation once per render
                  if (sheet.columns && sheet.needsReview) {
                    const columnsNeedingReview = sheet.columns.filter(col => col.needsReview && !col.skip).length;
                    if (columnsNeedingReview > 0) {
                      tooltipText = `${columnsNeedingReview} column${columnsNeedingReview === 1 ? '' : 's'} need${columnsNeedingReview === 1 ? 's' : ''} review`;
                    }
                  }
                  
                  return (
                    <Tooltip 
                      key={`tooltip-${sheet.id}`} 
                      title={tooltipText}
                      placement="top"
                      disableInteractive={true}
                    >
                      <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        color: selectedSheetIndex === index ? 'text.primary' : 'text.secondary',
                      }}>
                        {/* Check if any columns need review to show yellow checkmark */}
                        {sheet.columns && sheet.needsReview ? (
                          // Yellow warning checkmark for tables with columns needing review
                          <CheckCircleIcon
                            fontSize="small"
                            sx={{ mr: 0.5, color: 'warning.main' }}
                          />
                        ) : (
                          // Original status icon
                          <StatusIcon
                            fontSize="small"
                            sx={{ mr: 0.5, color: statusColor }}
                          />
                        )}
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{
                            fontWeight: selectedSheetIndex === index ? 'medium' : 'normal',
                            maxWidth: { xs: 80, sm: 120, md: 150 },
                          }}
                        >
                          {sheet.originalName}
                        </Typography>
                      </Box>
                    </Tooltip>
                  );
                })()}
                value={index}
              />
            );
          })}
        </Tabs>
      </Paper>

      {/* Main Content */}
      <Box>
        {/* Sheet switching indicator */}
        {isSwitchingSheet && (
          <Box sx={{ width: '100%', mb: 2 }}>
            <LinearProgress />
            <Typography variant="caption" sx={{ mt: 0.5, display: 'block', textAlign: 'center' }}>
              Switching to {validSheets[selectedSheetIndex]?.originalName}...
            </Typography>
          </Box>
        )}
        
        {/* Header with action buttons */}
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            {selectedSheet.originalName} → {selectedSheet.mappedName}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {/* Auto-Create Button - shown only for new tables or tables with unmapped columns */}
            {(selectedSheet?.isNewTable || selectedSheet?.columns?.some(col => !col.mappedName || col.mappedName === '_create_new_')) && (
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<span role="img" aria-label="Auto-create">⚡</span>}
                onClick={() => handleAutoCreateAllFields(false)}
                sx={{ mr: 2 }}
              >
                Auto-Create All Fields
              </Button>
            )}
            
            <Tabs
              value={viewMode}
              onChange={handleViewModeChange}
              aria-label="view mode"
              sx={{ mr: 2 }}
            >
              <Tab label="All Columns" value="all" />
              <Tab
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    Needs Review
                    {reviewColumns > 0 && (
                      <Chip
                        size="small"
                        label={reviewColumns}
                        color="warning"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Box>
                }
                value="needsReview"
              />
              <Tab
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    Approved
                    <Chip
                      size="small"
                      label={readyColumns}
                      color="success"
                      sx={{ ml: 1 }}
                    />
                  </Box>
                }
                value="approved"
              />
            </Tabs>

            <IconButton
              color="primary"
              onClick={() => setShowSampleData(!showSampleData)}
              sx={{ mr: 1 }}
            >
              <VisibilityIcon />
            </IconButton>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip
                title="Auto-approval happens automatically. Click to manually approve any remaining fields with good matches."
                placement="top"
              >
                <span> {/* Wrapper span to fix MUI tooltip with disabled button warning */}
                  <Button
                    variant="outlined"
                    color="success"
                    onClick={handleApproveExactMatches}
                    disabled={selectedSheet.approved || reviewColumns === 0}
                    startIcon={<AutoAwesomeIcon />}
                    size="small"
                  >
                    Approve Remaining Matches
                  </Button>
                </span>
              </Tooltip>
              
              <Tooltip title="Approves the entire sheet and marks all fields as approved">
                <span> {/* Wrapper span to fix MUI tooltip with disabled button warning */}
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleApproveSheet}
                    disabled={selectedSheet.approved}
                    startIcon={<CheckCircleIcon />}
                  >
                    {selectedSheet.approved ? 'Approved' : 'Approve All Fields'}
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </Box>

        {/* Status Indicators */}
        <Box sx={{ mb: 2 }}>
          <LinearProgress
            variant="determinate"
            value={(readyColumns / Math.max(totalColumns, 1)) * 100}
            color="success"
            sx={{ height: 8, borderRadius: 1 }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
            <Typography variant="body2">
              {readyColumns} of {totalColumns} columns mapped
            </Typography>

            {reviewColumns > 0 && (
              <Typography variant="body2" color="warning.main">
                {reviewColumns} columns need review
              </Typography>
            )}
          </Box>
        </Box>

        {/* Processing Indicator */}
        {isProcessing && (
          <Box sx={{ mb: 2 }}>
            <Alert severity="info" icon={<CircularProgress size={20} />}>
              Processing column mappings... {processingProgress}%
            </Alert>
          </Box>
        )}

        {/* Sample Data Display (Collapsible) */}
        {showSampleData && (
          <Paper sx={{ mb: 2, p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle1">Sample Data</Typography>
              <IconButton size="small" onClick={() => setShowSampleData(false)}>
                <Box component="span" sx={{ fontSize: '0.75rem' }}>✕</Box>
              </IconButton>
            </Box>
            <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
              <SampleDataTable
                data={selectedSheet.firstRows || []}
                headerRow={selectedSheet.headerRow || 0}
                maxRows={5}
              />
            </Box>
          </Paper>
        )}

        {/* Column Mapping Table with Header */}
        <Paper sx={{ mb: 2 }}>
          {/* Table Header - Fixed/Sticky */}
          <Box sx={{
            position: 'sticky',
            top: 0,
            bgcolor: 'background.paper',
            zIndex: 2,
            borderBottom: 1,
            borderColor: 'divider'
          }}>
            <Table component="div" sx={{ tableLayout: 'fixed' }}>
              <TableHead component="div">
                <TableRow component="div" sx={{ display: 'flex' }}>
                  <TableCell component="div" sx={{ width: '22%', py: 1.5, fontWeight: 'medium', minWidth: '180px', maxWidth: '240px' }}>
                    Original Column
                  </TableCell>
                  <TableCell component="div" sx={{ width: '33%', py: 1.5, fontWeight: 'medium', minWidth: '220px', maxWidth: '320px' }}>
                    Database Field
                  </TableCell>
                  <TableCell component="div" sx={{ width: '15%', py: 1.5, fontWeight: 'medium', minWidth: '120px' }}>
                    Data Type
                  </TableCell>
                  <TableCell component="div" sx={{ width: '10%', py: 1.5, fontWeight: 'medium', textAlign: 'right', minWidth: '100px' }}>
                    Import
                  </TableCell>
                  <TableCell component="div" sx={{ width: '20%', py: 1.5, fontWeight: 'medium', minWidth: '160px' }}>
                    Sample Data
                  </TableCell>
                </TableRow>
              </TableHead>
            </Table>
          </Box>

          {/* Virtualized Column List */}
          <Box sx={{ height: 'calc(100vh - 400px)', minHeight: 300 }}>
            {isSwitchingSheet ? (
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100%',
                flexDirection: 'column' 
              }}>
                <CircularProgress size={40} />
                <Typography variant="body2" sx={{ mt: 2 }}>
                  Loading column data...
                </Typography>
              </Box>
            ) : (
              <AutoSizer>
                {({ height, width }) => (
                  <List
                    height={height}
                    width={width}
                    itemCount={filteredColumns.length}
                    itemSize={50}
                    itemData={listItemData}
                  >
                    {ColumnRow}
                  </List>
                )}
              </AutoSizer>
            )}
          </Box>
        </Paper>

        {/* Footer with field search indicator */}
        {fieldSearchText && (
          <Box sx={{ p: 1, bgcolor: 'primary.light', color: 'primary.contrastText', borderRadius: 1, mt: 1 }}>
            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
              <SearchIcon fontSize="small" sx={{ mr: 1 }} />
              Field search: {fieldSearchText}
              <IconButton size="small" onClick={() => setFieldSearchText('')} sx={{ ml: 1, color: 'inherit' }}>
                <Box component="span" sx={{ fontSize: '0.75rem' }}>✕</Box>
              </IconButton>
            </Typography>
          </Box>
        )}
        
        {/* Bottom Action Bar */}
        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
          {validSheets.some(sheet => 
            sheet.columns?.some(col => !col.mappedName || col.mappedName === '_create_new_') && 
            !sheet.skip
          ) && (
            <Button
              variant="outlined"
              color="primary"
              size="medium"
              startIcon={<span role="img" aria-label="Auto-create all">⚡</span>}
              onClick={() => handleAutoCreateAllFields(true)}
              sx={{ borderRadius: 4, px: 3 }}
            >
              Auto-Create All Unmapped Fields (All Sheets)
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
};

// Wrap component in an ErrorBoundary with a custom fallback for schema issues
const ColumnMappingStepWithErrorBoundary = (props: Props) => {
  const handleSchemaError = () => {
    // When an error occurs, try to refresh the schema cache
    try {
      refreshSchemaCache();
      window.dispatchEvent(new CustomEvent('schema-cache-refreshed'));
    } catch (error) {
      // // console.error('Failed to refresh schema cache after error:', error);
    }
  };

  // Custom fallback UI for schema-related errors
  const SchemaErrorFallback = () => (
    <Box sx={{ p: 3 }}>
      <Alert 
        severity="warning" 
        sx={{ mb: 2 }} 
        action={
          <Button color="inherit" size="small" onClick={handleSchemaError}>
            Refresh Schema
          </Button>
        }
      >
        Error loading schema information. This may be due to missing or invalid table schemas.
      </Alert>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Schema Resolution Issue
        </Typography>
        <Typography variant="body2" paragraph>
          We encountered an issue loading schema information for one or more sheets. This could happen when:
        </Typography>
        <ul>
          <li>A new table is being created but the schema hasn't been cached yet</li>
          <li>Table names were changed and the schema cache needs to be refreshed</li>
          <li>There are schema validation issues with the data</li>
        </ul>
        <Box sx={{ mt: 2 }}>
          <Button 
            variant="contained" 
            onClick={() => window.location.reload()}
            sx={{ mr: 1 }}
          >
            Reload Page
          </Button>
          <Button 
            variant="outlined" 
            onClick={handleSchemaError}
          >
            Refresh Schema Cache
          </Button>
        </Box>
      </Paper>
    </Box>
  );

  return (
    <ErrorBoundary
      fallback={<SchemaErrorFallback />}
      onError={() => handleSchemaError()}
    >
      <ColumnMappingStepVirtualized {...props} />
    </ErrorBoundary>
  );
};

export default ColumnMappingStepWithErrorBoundary;