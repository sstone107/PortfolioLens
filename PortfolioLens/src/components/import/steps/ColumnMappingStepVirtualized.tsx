/**
 * Virtualized Column Mapping Step component
 *
 * Optimized for large sheets with hundreds of columns.
 * Uses virtualization, efficient state management, and server-side similarity calculation.
 * UI styling aligned with Table Mapping step for visual consistency.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import CheckIcon from '@mui/icons-material/Check';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useBatchImportStore, SheetMapping, ColumnMapping } from '../../../store/batchImportStore';
import { useTableMetadata, useTableMatcher } from '../BatchImporterHooks';
import SampleDataTable from '../SampleDataTable';
import { normalizeDataType, ColumnInfo, DbFieldInfo, MappingResult } from '../services/mappingEngine';
import { generateMappings, clearSimilarityCaches } from '../services/SimilarityService';
import { createDebouncedSearch, searchFields } from '../utils/searchUtils';

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
  normalizeDataType: (type: string) => string;
  fieldSearchText: string;
  isCreatingNewField: (column: ColumnMapping) => boolean;
  generateUniqueFieldName: (baseName: string) => string;
  getCachedMatches: (column: ColumnMapping) => Array<{ name: string; type: string; confidence: number }>;
  editingNewField: string | null;
  theme: any;
}

// Virtualized row component for column mapping
const ColumnRow = React.memo(({ index, style, data }: {
  index: number,
  style: React.CSSProperties,
  data: ColumnItemData
}) => {
  const column = data.columns[index];
  if (!column) return null;

  const isNewField = data.isCreatingNewField(column);
  const isEditingField = data.editingNewField === column.originalName;
  const theme = data.theme;

  // Local state for field name editing
  const [fieldName, setFieldName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Initialize field name when entering edit mode
  useEffect(() => {
    if (isEditingField) {
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
    }
  }, [isEditingField, column.originalName, data.generateUniqueFieldName]);

  // Validate field name
  const validateFieldName = (name: string): string | null => {
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
    if (data.tableColumns.some(col => col.name === name)) {
      return "Field name already exists in this table";
    }

    return null;
  };

  // Handle field name changes with validation
  const handleFieldNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setFieldName(newName);
    setFieldError(validateFieldName(newName));
  };

  // Handle save button click
  const handleSaveField = () => {
    const error = validateFieldName(fieldName);
    if (error) {
      setFieldError(error);
      return;
    }

    // Save the new field
    data.handleCreateNewField(column, fieldName);
  };

  // Handle cancel button click
  const handleCancelEdit = () => {
    data.handleCancelNewField(column);
  };

  // Handle keyboard events for field editing
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !fieldError) {
      handleSaveField();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  // Get confidence color and styles consistent with the table mapping UI
  const getConfidenceProps = (confidence: number) => {
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
  };

  const confidenceProps = getConfidenceProps(column.confidence);

  // Get cached matches for this column to show in dropdown
  const columnMatches = data.getCachedMatches(column);

  // Create menu items showing confidence percentages
  const fieldMenuItems = useMemo(() => {
    // Add "Create new column" as the first option
    const createNewOption = [
      <MenuItem
        key="_create_new_"
        value="_create_new_"
        divider
        sx={{
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          backgroundColor: theme.palette.primary.light + '10', // Light background with transparency
          '&:hover': {
            backgroundColor: theme.palette.primary.light + '25',
          }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography color="primary" fontWeight="medium">➕ Create new column...</Typography>
        </Box>
      </MenuItem>
    ];

    // Get high confidence matches (≥95%)
    const highConfidenceMatches = columnMatches
      .filter(match => match.confidence >= 95)
      .slice(0, 5);

    // Get medium confidence matches (70-94%)
    const mediumConfidenceMatches = columnMatches
      .filter(match => match.confidence >= 70 && match.confidence < 95)
      .slice(0, 3);

    // Filter the remaining fields if there's a search
    const filteredFields = data.fieldSearchText ?
      data.tableColumns.filter(col =>
        col.name.toLowerCase().includes(data.fieldSearchText.toLowerCase()) &&
        !columnMatches.slice(0, 8).some(match => match.name === col.name)
      ) :
      data.tableColumns.filter(col =>
        !columnMatches.slice(0, 8).some(match => match.name === col.name)
      );

    return [
      // Create new field option (always first)
      ...createNewOption,

      // High confidence matches
      highConfidenceMatches.length > 0 && (
        <ListSubheader key="high-confidence" sx={{ bgcolor: theme.palette.background.default }}>
          High Confidence Matches
        </ListSubheader>
      ),
      ...highConfidenceMatches.map(match => (
        <MenuItem key={match.name} value={match.name}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ fontWeight: match.name === column.mappedName ? 'bold' : 'normal' }}>
                {match.name}
              </Typography>
              <Typography variant="caption" color="success.main" sx={{ ml: 1 }}>
                ({match.confidence}%)
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              {normalizeDataType(match.type)}
            </Typography>
          </Box>
        </MenuItem>
      )),

      // Medium confidence matches
      mediumConfidenceMatches.length > 0 && highConfidenceMatches.length > 0 && <Divider key="confidence-divider" />,
      mediumConfidenceMatches.length > 0 && (
        <ListSubheader key="medium-confidence" sx={{ bgcolor: theme.palette.background.default }}>
          Suggested Matches
        </ListSubheader>
      ),
      ...mediumConfidenceMatches.map(match => (
        <MenuItem key={match.name} value={match.name}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ fontWeight: match.name === column.mappedName ? 'bold' : 'normal' }}>
                {match.name}
              </Typography>
              <Typography
                variant="caption"
                color={match.confidence >= 70 ? "warning.main" : "error.main"}
                sx={{ ml: 1 }}
              >
                ({match.confidence}%)
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              {normalizeDataType(match.type)}
            </Typography>
          </Box>
        </MenuItem>
      )),

      // Search results or other fields
      (filteredFields.length > 0 && (highConfidenceMatches.length > 0 || mediumConfidenceMatches.length > 0)) &&
        <Divider key="other-divider" />,
      filteredFields.length > 0 && (
        <ListSubheader key="other-fields" sx={{ bgcolor: theme.palette.background.default }}>
          {data.fieldSearchText ? `Search Results: ${data.fieldSearchText}` : 'Other Fields'}
        </ListSubheader>
      ),
      ...filteredFields.map(col => (
        <MenuItem key={col.name} value={col.name}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography sx={{ fontWeight: col.name === column.mappedName ? 'bold' : 'normal' }}>
              {col.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {normalizeDataType(col.type)}
            </Typography>
          </Box>
        </MenuItem>
      ))
    ];
  }, [column.mappedName, columnMatches, data.fieldSearchText, data.tableColumns, theme]);

  // Alternate background for row
  const bgColor = index % 2 === 0 ? 'inherit' : theme.palette.action.hover;

  // Get the type info for the selected field
  const selectedFieldType = column.mappedName !== '_create_new_' && column.mappedName ?
    data.tableColumns.find(f => f.name === column.mappedName)?.type :
    column.dataType;

  const typeLabel = selectedFieldType ? `(${normalizeDataType(selectedFieldType)})` : '';

  // Selected display for dropdown (no confidence badge, just clean field name)
  const renderSelectValue = (value: string) => {
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

    // Check if this field is a newly created one (not in the original table schema)
    const isNewlyCreatedField = !data.tableColumns.some(col => col.name === value);

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
  };

  return (
    <TableRow
      component="div"
      style={{ ...style, display: 'flex' }}
      sx={{
        bgcolor: bgColor,
        '&:hover': { bgcolor: theme.palette.action.hover }
      }}
    >
      <TableCell
        component="div"
        sx={{
          display: 'flex',
          width: '25%',
          alignItems: 'center',
          borderBottom: 'none',
          py: 1
        }}
      >
        <Tooltip title={column.originalName} enterDelay={500}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 'normal' }}>
            {column.originalName}
          </Typography>
        </Tooltip>
      </TableCell>

      <TableCell
        component="div"
        sx={{
          display: 'flex',
          width: '40%',
          borderBottom: 'none',
          py: 1,
          alignItems: 'center'
        }}
      >
        {isEditingField ? (
          // Field creation UI
          <Box sx={{ display: 'flex', width: '100%', alignItems: 'center' }}>
            <IconButton
              size="small"
              onClick={handleCancelEdit}
              sx={{ mr: 1, color: 'text.secondary' }}
              title="Go back"
            >
              <KeyboardBackspaceIcon fontSize="small" />
            </IconButton>

            <FormControl fullWidth error={!!fieldError} size="small">
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                mb: 0.5,
                pl: 1
              }}>
                <Typography
                  variant="caption"
                  color="primary"
                  sx={{ fontWeight: 'medium' }}
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
                autoFocus
                error={!!fieldError}
                helperText={fieldError || "Field name must be lowercase, no spaces (Ex: customer_id)"}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
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
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiInputBase-root': {
                    height: 38
                  }
                }}
              />
            </FormControl>
          </Box>
        ) : (
          // Normal dropdown UI
          <FormControl fullWidth size="small">
            <Select
              value={column.mappedName || ''}
              onChange={(e: SelectChangeEvent) =>
                data.handleMappedNameChange(column, e.target.value)
              }
              disabled={column.skip}
              renderValue={renderSelectValue}
              sx={{
                minHeight: 38,
                '& .MuiSelect-select': {
                  display: 'flex',
                  alignItems: 'center',
                  py: 0.75
                }
              }}
              MenuProps={{
                PaperProps: {
                  style: {
                    maxHeight: 300,
                  },
                },
              }}
              endAdornment={
                <KeyboardArrowDownIcon sx={{ color: 'action.active', mr: 1 }} />
              }
            >
              {fieldMenuItems}
            </Select>
          </FormControl>
        )}
      </TableCell>

      <TableCell
        component="div"
        sx={{
          display: 'flex',
          width: '20%',
          borderBottom: 'none',
          py: 1,
          alignItems: 'center'
        }}
      >
        <FormControl fullWidth size="small">
          <Select
            value={data.normalizeDataType(column.dataType) || 'text'}
            onChange={(e: SelectChangeEvent) =>
              data.handleDataTypeChange(column, e.target.value)
            }
            disabled={column.skip || (!isNewField && !isEditingField)}
            sx={{ minHeight: 38 }}
          >
            {data.dataTypes.map(type => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </TableCell>

      <TableCell
        component="div"
        sx={{
          display: 'flex',
          width: '15%',
          borderBottom: 'none',
          py: 1,
          alignItems: 'center',
          justifyContent: 'flex-end'
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
    </TableRow>
  );
});

/**
 * Virtualized Column Mapping Step
 */
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
  
  // Load database metadata
  const { tables, loading: tablesLoading } = useTableMetadata();
  
  // Create a memoized table matcher
  const { validateColumnExists, getColumnMetadata } = useTableMatcher(tables);
  
  // Get the table schema for the selected sheet
  const tableSchema = useMemo(() => {
    if (!selectedSheet || !tables) return null;
    return tables.find((table: any) => table.name === selectedSheet.mappedName) || null;
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
  
  // Helper to determine if a column needs review
  const needsReview = useCallback((column: ColumnMapping): boolean => {
    // Skip columns never need review
    if (column.skip) return false;
    
    // New fields always need review
    if (column.mappedName === '_create_new_') return true;
    
    // Exact matches to database fields never need review
    if (column.confidence === 100 && column.mappedName && column.mappedName !== '_create_new_') {
      if (tableSchema?.columns) {
        const matchedField = tableSchema.columns.find((col: any) => col.name === column.mappedName);
        if (matchedField) return false;
      }
    }
    
    // High confidence matches to existing fields don't need review
    if (column.confidence >= 95 && column.mappedName && column.mappedName !== '_create_new_') {
      if (tableSchema?.columns) {
        const matchedField = tableSchema.columns.find((col: any) => col.name === column.mappedName);
        if (matchedField) return false;
      }
    }
    
    return true;
  }, [tableSchema]);
  
  // Generate cached matches for a column
  const getCachedMatches = useCallback((column: ColumnMapping) => {
    if (!tableSchema?.columns || !column.originalName) {
      return [];
    }
    
    // Check if we have cached matches for this column
    if (columnMatchesCache[column.originalName]) {
      return columnMatchesCache[column.originalName];
    }
    
    // Calculate matches for this column
    const matches = tableSchema.columns.map((field: any) => {
      // If this is the current mapping, use the stored confidence
      if (field.name === column.mappedName && column.confidence > 0) {
        return {
          name: field.name,
          type: field.type,
          confidence: column.confidence
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
        confidence
      };
    });
    
    // Sort by confidence
    const sortedMatches = matches.sort((a, b) => b.confidence - a.confidence);
    
    // Cache the result
    setColumnMatchesCache(prev => ({
      ...prev,
      [column.originalName]: sortedMatches
    }));
    
    return sortedMatches;
  }, [tableSchema, columnMatchesCache]);
  
  // Filter columns based on view mode
  const filteredColumns = useMemo(() => {
    if (!selectedSheet) return [];
    
    // No filtering in "all" mode
    if (viewMode === 'all') return selectedSheet.columns;
    
    // Filter based on review status
    return selectedSheet.columns.filter(col => {
      const needsReviewStatus = needsReview(col);
      return viewMode === 'needsReview' ? needsReviewStatus : !needsReviewStatus;
    });
  }, [selectedSheet, viewMode, needsReview]);
  
  // Effect to handle setting selected sheet when tab changes
  useEffect(() => {
    if (validSheets.length > 0 && selectedSheetIndex < validSheets.length) {
      const sheet = validSheets[selectedSheetIndex];
      if (sheet && sheet.id !== selectedSheetId) {
        setSelectedSheetId(sheet.id);
        onSheetSelect(sheet.id);
      }
    }
  }, [selectedSheetIndex, validSheets, selectedSheetId, setSelectedSheetId, onSheetSelect]);
  
  // Generate sheet -> DB mappings for all sheets on initial load
  useEffect(() => {
    const processAllSheets = async () => {
      // Skip if no sheets or tables are loaded
      if (sheets.length === 0 || tables.length === 0 || tablesLoading) return;
      
      // Process all sheets in the background
      for (const sheet of sheets) {
        // Skip already processed sheets
        if (processedSheets.current.has(sheet.id) || sheet.skip) continue;
        
        // Skip sheets with no assigned table
        if (!sheet.mappedName) continue;
        
        // Get the table schema
        const tableSchema = tables.find((table: any) => table.name === sheet.mappedName);
        if (!tableSchema) continue;
        
        try {
          // Mark this sheet as being processed
          setIsProcessing(true);
          
          // Prepare sheet columns and DB fields
          const sheetColumns: ColumnInfo[] = sheet.columns.map(col => ({
            originalName: col.originalName,
            originalIndex: col.originalIndex,
            inferredDataType: col.inferredDataType,
            sample: col.sample
          }));
          
          const dbFields: DbFieldInfo[] = tableSchema.columns.map((col: any) => ({
            name: col.name,
            type: col.type,
            isRequired: col.is_nullable === 'NO'
          }));
          
          // Generate mappings
          const mappingResults = await generateMappings(
            sheetColumns,
            dbFields,
            {
              progressCallback: (percent) => {
                setProcessingProgress(percent);
              }
            }
          );
          
          // Convert mapping results to column updates
          const updates: Record<string, Partial<ColumnMapping>> = {};
          
          mappingResults.forEach(result => {
            updates[result.originalName] = {
              mappedName: result.mappedName,
              dataType: result.dataType,
              confidence: result.confidence,
              needsReview: result.needsReview
            };
          });
          
          // Update sheet columns in a single batch
          batchUpdateSheetColumns(sheet.id, updates);
          
          // Mark sheet as processed
          processedSheets.current.add(sheet.id);
          
          // Mark sheet as ready
          updateSheet(sheet.id, {
            status: 'ready',
            needsReview: mappingResults.some(result => result.needsReview)
          });
        } catch (error) {
          console.error(`Error processing sheet ${sheet.originalName}:`, error);
          onError(`Failed to process sheet ${sheet.originalName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Clear the processing flag when done
      setIsProcessing(false);
      setProcessingProgress(100);
    };
    
    processAllSheets();
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

    if (newName) {
      // User has provided a name, create the field
      updateSheetColumn(selectedSheet.id, column.originalName, {
        mappedName: newName,
        confidence: 0,
        needsReview: true
      });

      setEditingNewField(null);
      setNewFieldName('');
      setNewFieldError(null);
    } else {
      // Enter edit mode for this column
      const suggestedName = generateUniqueFieldName(normalizeFieldName(column.originalName));
      setNewFieldName(suggestedName);
      setEditingNewField(column.originalName);
    }

    // Record the action time
    lastActionTime.current = Date.now();
  }, [selectedSheet, updateSheetColumn, generateUniqueFieldName, normalizeFieldName]);

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

    if (tableSchema?.columns) {
      const matchedField = tableSchema.columns.find((col: any) => col.name === newValue);
      if (matchedField) {
        newDataType = normalizeDataType(matchedField.type);
      }
    }

    // Update the column mapping
    updateSheetColumn(selectedSheet.id, column.originalName, {
      mappedName: newValue,
      dataType: newDataType,
      confidence: 0,
      needsReview: needsReview({
        ...column,
        mappedName: newValue,
        dataType: newDataType
      })
    });

    // Record the action time
    lastActionTime.current = Date.now();
  }, [selectedSheet, tableSchema, updateSheetColumn, needsReview, handleCreateNewField]);
  
  // Handler for changing the data type of a column
  const handleDataTypeChange = useCallback((column: ColumnMapping, newValue: string) => {
    if (!selectedSheet) return;
    
    updateSheetColumn(selectedSheet.id, column.originalName, {
      dataType: newValue
    });
    
    // Record the action time
    lastActionTime.current = Date.now();
  }, [selectedSheet, updateSheetColumn]);
  
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
  
  // Handler for approving a sheet
  const handleApproveSheet = useCallback(() => {
    if (!selectedSheet) return;
    
    updateSheet(selectedSheet.id, {
      approved: true,
      status: 'approved'
    });
  }, [selectedSheet, updateSheet]);
  
  // Prepare data for the virtualized list
  const listItemData = useMemo(() => ({
    columns: filteredColumns,
    tableColumns: tableSchema?.columns || [],
    dataTypes,
    handleMappedNameChange,
    handleDataTypeChange,
    handleSkipChange,
    handleCreateNewField,
    handleCancelNewField,
    normalizeDataType,
    fieldSearchText,
    isCreatingNewField,
    generateUniqueFieldName,
    getCachedMatches,
    editingNewField,
    theme
  }), [
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
    theme
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
                label={
                  <Tooltip title={tooltipTitle}>
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      color: selectedSheetIndex === index ? 'text.primary' : 'text.secondary',
                    }}>
                      <StatusIcon
                        fontSize="small"
                        sx={{ mr: 0.5, color: statusColor }}
                      />
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{
                          maxWidth: { xs: 80, sm: 120, md: 150 },
                          fontWeight: selectedSheetIndex === index ? 'medium' : 'normal'
                        }}
                      >
                        {sheet.originalName}
                      </Typography>
                    </Box>
                  </Tooltip>
                }
                value={index}
              />
            );
          })}
        </Tabs>
      </Paper>
      
      {/* Main Content */}
      <Box>
        {/* Header with action buttons */}
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            {selectedSheet.originalName} → {selectedSheet.mappedName}
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
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
            
            <Button
              variant="contained"
              color="primary"
              onClick={handleApproveSheet}
              disabled={!canApprove || selectedSheet.approved}
              startIcon={<CheckCircleIcon />}
            >
              {selectedSheet.approved ? 'Approved' : 'Approve Mapping'}
            </Button>
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
                  <TableCell component="div" sx={{ width: '25%', py: 1.5, fontWeight: 'medium' }}>
                    Original Column
                  </TableCell>
                  <TableCell component="div" sx={{ width: '40%', py: 1.5, fontWeight: 'medium' }}>
                    Database Field
                  </TableCell>
                  <TableCell component="div" sx={{ width: '20%', py: 1.5, fontWeight: 'medium' }}>
                    Data Type
                  </TableCell>
                  <TableCell component="div" sx={{ width: '15%', py: 1.5, fontWeight: 'medium', textAlign: 'right' }}>
                    Import
                  </TableCell>
                </TableRow>
              </TableHead>
            </Table>
          </Box>

          {/* Virtualized Column List */}
          <Box sx={{ height: 'calc(100vh - 400px)', minHeight: 300 }}>
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
      </Box>
    </Box>
  );
};

export default ColumnMappingStepVirtualized;