import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  InputAdornment,
  CircularProgress,
  Autocomplete,
} from '@mui/material';
import {
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import { BatchColumnMapping, ColumnMapping, TableColumn, ColumnMappingSuggestions, ConfidenceLevel } from './types'; // Import BatchColumnMapping and ConfidenceLevel

// Define AutocompleteOption interface here
interface AutocompleteOption {
  label: string;
  value: string;
  disabled?: boolean;
  isSuggestion?: boolean;
  isNew?: boolean;
  score?: number; 
}

interface VirtualizedColumnMapperProps {
  excelColumns: string[];
  tableColumns: TableColumn[];
  mappings: Record<string, Partial<BatchColumnMapping>>; // Change expected type
  onMappingUpdate: (excelCol: string, changes: Partial<BatchColumnMapping>) => void; // Ensure this matches modal's handler
  exampleData?: Record<string, any>[];
  isCreatingTable: boolean; // Add isCreatingTable prop
}

/**
 * Virtualized column mapper component for efficiently handling large datasets
 */
export const VirtualizedColumnMapper: React.FC<VirtualizedColumnMapperProps> = ({
  excelColumns,
  tableColumns,
  mappings,
  onMappingUpdate, // Use new handler
  exampleData = [],
  isCreatingTable,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMapped, setFilterMapped] = useState(false);
  const [filterUnmapped, setFilterUnmapped] = useState(false);

  // Memoize filtered columns for performance
  const filteredColumns = useMemo(() => {
    return excelColumns.filter(column => {
      const mapping = mappings[column];
      const isMapped = mapping && (mapping.action === 'map' || mapping.action === 'create'); // Check action for mapped status

      // Apply filters
      if (filterMapped && !isMapped) return false;
      if (filterUnmapped && isMapped) return false;
      
      // Apply search
      if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        const matchesExcelColumn = column.toLowerCase().includes(lowerSearch);
        // Update to check newColumnProposal
        const mappedDbColumn = mapping?.action === 'map' ? mapping.mappedColumn : (mapping?.action === 'create' ? mapping.newColumnProposal?.columnName : null);
        const matchesDbColumn = mappedDbColumn?.toLowerCase().includes(lowerSearch);
        return matchesExcelColumn || matchesDbColumn;
      }

      return true;
    });
  }, [excelColumns, mappings, searchTerm, filterMapped, filterUnmapped]);

  // Get example values for a column
  const getExampleValues = (column: string) => {
    if (!exampleData || exampleData.length === 0) return [];
    
    // Get up to 3 unique non-empty values
    const values = new Set<string>();
    exampleData.forEach(row => {
      if (row[column] !== null && row[column] !== undefined && row[column] !== '') {
        values.add(String(row[column]));
      }
    });
    
    return Array.from(values).slice(0, 3);
  };

  // Calculate mapping statistics
  const mappingStats = useMemo(() => {
    const total = excelColumns.length;
    const mapped = excelColumns.filter(col => mappings[col]?.action === 'map' || mappings[col]?.action === 'create').length; // Count based on action
    const unmapped = total - mapped;
    const percentage = total > 0 ? Math.round((mapped / total) * 100) : 0;

    return { total, mapped, unmapped, percentage };
  }, [excelColumns, mappings]);

  // Row renderer for virtualized list
  const RowRenderer = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const excelColumn = filteredColumns[index];
    // Get the full mapping object, provide a default if somehow missing
    const baseMapping: BatchColumnMapping = {
        header: excelColumn, // Ensure header is always defined
        action: 'skip',
        status: 'pending',
        reviewStatus: 'pending',
        mappedColumn: null,
        suggestedColumns: [],
        inferredDataType: null,
        sampleValue: null,
        confidenceScore: 0, // Add default confidence
        confidenceLevel: 'Low', // Add default confidence level
        // Ensure all other BatchColumnMapping fields have defaults if necessary
    };
    const partialMapping = mappings[excelColumn];
    const mapping: BatchColumnMapping = { ...baseMapping, ...partialMapping, header: excelColumn };

    const isMapped = mapping.action === 'map' || mapping.action === 'create';
    // Update display logic for new columns
    const displayDbColumn = mapping.action === 'map'
        ? mapping.mappedColumn
        : (mapping.action === 'create'
            ? `✨ ${mapping.newColumnProposal?.columnName || 'New Field'}`
            : null);
    const exampleVals = getExampleValues(excelColumn);
    const suggestions = mapping.suggestedColumns || []; // Use suggestions from the mapping object

    // Helper for confidence icon
    const ConfidenceIconDisplay = ({ level }: { level?: ConfidenceLevel }) => { // Renamed to avoid conflict if ConfidenceIcon is imported/global
        switch (level) {
            case 'High': return <CheckCircleIcon fontSize="inherit" color="success" sx={{ ml: 0.5 }} />;
            case 'Medium': return <ErrorIcon fontSize="inherit" color="warning" sx={{ ml: 0.5 }} />; // Using Error for Medium for visibility
            case 'Low': return <ErrorIcon fontSize="inherit" color="error" sx={{ ml: 0.5 }} />;
            default: return null;
        }
    };

    return (
      <Paper 
        elevation={1} 
        style={{ 
          ...style, 
          display: 'flex',
          flexDirection: 'column',
          margin: '4px 8px',
          padding: '8px 16px',
          borderLeft: isMapped ? '4px solid #4caf50' : '4px solid #f5f5f5',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography 
            variant="subtitle2" 
            sx={{ 
              flexGrow: 1,
              fontWeight: 'bold',
              color: isMapped ? 'primary.main' : 'text.primary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={excelColumn}
          >
            {excelColumn}
          </Typography>
          
          {/* Display Confidence and Review Status */}
           <Box sx={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem' }}>
                <Typography variant="caption" color="text.secondary">Confidence:</Typography>
                <ConfidenceIconDisplay level={mapping.confidenceLevel} />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>Review:</Typography>
                {/* Add Review Status Icon/Button Here - TBD based on interaction design */}
                <Chip label={mapping.reviewStatus || 'pending'} size="small" variant="outlined" sx={{ ml: 0.5, height: '18px', fontSize: '0.7rem' }} />
           </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {/* AutocompleteOption type is now defined outside the component */}

          <Autocomplete
            size="small"
            options={useMemo<AutocompleteOption[]>(() => {
                const existingTableColumns = tableColumns.map(col => col.columnName);
                const options: AutocompleteOption[] = [];

                // Add suggestions from the mapping object
                if (suggestions.length > 0) {
                    options.push({ label: 'Suggestions:', value: 'suggestions-header', disabled: true });
                    suggestions.forEach(sugg => {
                        options.push({
                            label: `${sugg.columnName} (${Math.round(sugg.confidenceScore * 100)}%)`,
                            value: sugg.columnName,
                            isSuggestion: true,
                            score: sugg.confidenceScore,
                        });
                    });
                    options.push({ label: '----', value: 'divider-sugg', disabled: true });
                }

                // Add table columns
                if (tableColumns.length > 0 && !isCreatingTable) {
                    options.push({ label: 'Map to Existing Field:', value: 'existing-header', disabled: true });
                    tableColumns.forEach(col => {
                        // Only add if not already a top suggestion (to avoid duplicates in simple lists)
                        // More sophisticated de-duplication might be needed if suggestion text matches column text
                        if (!suggestions.some(s => s.columnName === col.columnName)) {
                            options.push({ label: col.columnName, value: col.columnName });
                        }
                    });
                    options.push({ label: '----', value: 'divider-existing', disabled: true });
                }
                
                // Add standard actions
                options.push({ label: 'Skip this field', value: 'skip-column', isNew: false });
                if (isCreatingTable) {
                  options.push({ label: `✨ Create new field: '${excelColumn}'`, value: 'create-new-column-auto', isNew: true });
                } else {
                  options.push({ label: `✨ Create new field...`, value: 'create-new-column', isNew: true });
                }

                return options.sort((a, b) => {
                    // Keep headers on top, then sort by score if suggestion, then by label
                    if (a.disabled && !b.disabled) return -1;
                    if (!a.disabled && b.disabled) return 1;
                    if (a.isSuggestion && b.isSuggestion) return (b.score || 0) - (a.score || 0);
                    if (a.isSuggestion && !b.isSuggestion) return -1;
                    if (!a.isSuggestion && b.isSuggestion) return 1;
                    return a.label.localeCompare(b.label);
                });
            }, [tableColumns, suggestions, isCreatingTable, excelColumn])}
            value={(() => {
                const allOptions: AutocompleteOption[] = useMemo(() => {
                    const existingTableColumns = tableColumns.map(col => col.columnName);
                    const optionsArr: AutocompleteOption[] = [];
                    if (suggestions.length > 0) {
                        optionsArr.push({ label: 'Suggestions:', value: 'suggestions-header', disabled: true });
                        suggestions.forEach(sugg => {
                            optionsArr.push({
                                label: `${sugg.columnName} (${Math.round(sugg.confidenceScore * 100)}%)`,
                                value: sugg.columnName,
                                isSuggestion: true,
                                score: sugg.confidenceScore,
                            });
                        });
                        optionsArr.push({ label: '----', value: 'divider-sugg', disabled: true });
                    }
                    if (tableColumns.length > 0 && !isCreatingTable) {
                        optionsArr.push({ label: 'Map to Existing Field:', value: 'existing-header', disabled: true });
                        tableColumns.forEach(col => {
                            if (!suggestions.some(s => s.columnName === col.columnName)) {
                                optionsArr.push({ label: col.columnName, value: col.columnName });
                            }
                        });
                        optionsArr.push({ label: '----', value: 'divider-existing', disabled: true });
                    }
                    optionsArr.push({ label: 'Skip this field', value: 'skip-column', isNew: false });
                    if (isCreatingTable) {
                      optionsArr.push({ label: `✨ Create new field: '${excelColumn}'`, value: 'create-new-column-auto', isNew: true });
                    } else {
                      optionsArr.push({ label: `✨ Create new field...`, value: 'create-new-column', isNew: true });
                    }
                    return optionsArr;
                }, [tableColumns, suggestions, isCreatingTable, excelColumn]); 

                if (mapping.action === 'map' && mapping.mappedColumn) {
                  return allOptions.find((opt: AutocompleteOption) => opt.value === mapping.mappedColumn) || null;
                } else if (mapping.action === 'create') {
                  if (isCreatingTable) return allOptions.find((opt: AutocompleteOption) => opt.value === 'create-new-column-auto') || null;
                  return allOptions.find((opt: AutocompleteOption) => opt.value === 'create-new-column') || null;
                } else if (mapping.action === 'skip') {
                  return allOptions.find((opt: AutocompleteOption) => opt.value === 'skip-column') || null;
                }
                return null; // Default if no match or unmapped
              })()}
            onChange={(event, newValue) => {
              if (typeof newValue === 'string') {
                // This case should ideally not happen if options are objects
                // For safety, treat as selecting the value directly if it's a string
                const selectedOption = (tableColumns.find(tc => tc.columnName === newValue) || suggestions.find(s => s.columnName === newValue));
                if (selectedOption) {
                    onMappingUpdate(excelColumn, { 
                        mappedColumn: typeof selectedOption === 'object' && 'columnName' in selectedOption ? selectedOption.columnName : String(selectedOption),
                        action: 'map',
                        status: 'userModified',
                        reviewStatus: 'pending', // Reset review status on change
                        // If selected from suggestions, store confidence
                        confidenceScore: typeof selectedOption === 'object' && 'confidenceScore' in selectedOption ? selectedOption.confidenceScore : undefined,
                        confidenceLevel: typeof selectedOption === 'object' && 'confidenceLevel' in selectedOption ? selectedOption.confidenceLevel : undefined,
                    });
                }
              } else if (newValue && typeof newValue === 'object' && 'value' in newValue) {
                const option = newValue as AutocompleteOption;
                if (option.value === 'skip-column') {
                  onMappingUpdate(excelColumn, { action: 'skip', mappedColumn: null, status: 'userModified', reviewStatus: 'pending' });
                } else if (option.value === 'create-new-column' || option.value === 'create-new-column-auto') {
                  onMappingUpdate(excelColumn, { 
                    action: 'create', 
                    mappedColumn: null, // No existing DB column
                    newColumnProposal: { // Initial proposal
                        columnName: excelColumn.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(), // Sanitize header for SQL
                        sqlType: 'TEXT', // Default, user can change later. Corrected from dataType
                        // isPrimaryKey: false, // Default
                        // isNullable: true, // Default
                    },
                    status: 'userModified', 
                    reviewStatus: 'pending' 
                  });
                } else if (option.value && !option.disabled) {
                  onMappingUpdate(excelColumn, { 
                    mappedColumn: option.value, 
                    action: 'map', 
                    status: 'userModified', 
                    reviewStatus: 'pending',
                    confidenceScore: option.score,
                    confidenceLevel: option.score !== undefined ? (option.score > 0.8 ? 'High' : option.score > 0.5 ? 'Medium' : 'Low') : undefined,
                  });
                }
              }
            }}
            renderInput={(params) => (
              <TextField 
                {...params} 
                label="Map to DB Field / Action"
                variant="outlined"
                sx={{ flexGrow: 1, mr:1 }}
              />
            )}
            getOptionLabel={(option) => {
                if (typeof option === 'string') return option; // For initial value if it's a string
                return option.label;
            }}
            isOptionEqualToValue={(option, value) => {
                // value can be the string representation of the selected db column, or an AutocompleteOption object
                if (typeof value === 'string') {
                    return option.value === value;
                }
                // If value is an object (which it should be from options)
                return option.value === value.value;
            }}
            renderOption={(props, option, { selected }) => (
                <MenuItem {...props} key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                  {option.isSuggestion && option.score !== undefined && (
                    <Chip label={`${Math.round(option.score * 100)}%`} size="small" sx={{ ml: 1, opacity: 0.7 }}/>
                  )}
                </MenuItem>
            )}
            // filterOptions={(options, params) => {
            //     // Custom filter logic if needed - for now, default MUI filter is fine
            //     return options;
            // }}
            selectOnFocus
            clearOnBlur
            handleHomeEndKeys
            fullWidth
            autoHighlight
            freeSolo={false} // Disallow free text entry, must select an option
          />

        </Box>

        {exampleVals.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Samples:</Typography>
            {exampleVals.map((val, i) => (
              <Chip key={i} label={val} size="small" variant="outlined" sx={{ mr: 0.5, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={val} />
            ))}
          </Box>
        )}
      </Paper>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 1, backgroundColor: 'grey.100' }}>
      {/* Header with search and filters */}
      <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <TextField
            placeholder="Search columns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            variant="outlined"
            size="small"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: searchTerm ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setSearchTerm('')}
                    edge="end"
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          
          <Tooltip title="Show only mapped columns">
            <IconButton 
              color={filterMapped ? 'primary' : 'default'} 
              onClick={() => setFilterMapped(!filterMapped)}
              sx={{ ml: 1 }}
            >
              <CheckCircleIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Show only unmapped columns">
            <IconButton 
              color={filterUnmapped ? 'primary' : 'default'} 
              onClick={() => setFilterUnmapped(!filterUnmapped)}
              sx={{ ml: 1 }}
            >
              <ErrorIcon />
            </IconButton>
          </Tooltip>
        </Box>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Showing {filteredColumns.length} of {excelColumns.length} columns
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
              {mappingStats.mapped} of {mappingStats.total} mapped ({mappingStats.percentage}%)
            </Typography>
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <CircularProgress
                variant="determinate"
                value={mappingStats.percentage}
                size={24}
                thickness={5}
                color="success"
              />
              <Box
                sx={{
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  position: 'absolute',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography variant="caption" component="div" color="text.secondary">
                  {mappingStats.percentage}%
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
      
      {/* Virtualized column list */}
      <Box sx={{ flexGrow: 1, height: '100%' }}>
        <AutoSizer>
          {({ height, width }: { height: number; width: number }) => (
            <List
              height={height}
              width={width}
              itemCount={filteredColumns.length}
              itemSize={120} // Adjust based on your row height
            >
              {RowRenderer}
            </List>
          )}
        </AutoSizer>
      </Box>
    </Box>
  );
};