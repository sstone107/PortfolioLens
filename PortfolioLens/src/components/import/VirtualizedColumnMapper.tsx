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

// Define types for AutoSizer
interface AutoSizerProps {
  children: (size: { width: number; height: number }) => React.ReactNode;
}
import { BatchColumnMapping, ColumnMapping, TableColumn, ColumnMappingSuggestions } from './types'; // Import BatchColumnMapping

interface VirtualizedColumnMapperProps {
  excelColumns: string[];
  tableColumns: TableColumn[];
  mappings: Record<string, Partial<BatchColumnMapping>>; // Change expected type
  onMappingChange: (excelColumn: string, dbColumn: string | null) => void;
  exampleData?: Record<string, any>[];
  isCreatingTable: boolean; // Add isCreatingTable prop
  columnSuggestions: Record<string, ColumnMappingSuggestions | undefined>; // Update type to match ColumnMappingModal
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
    const mapping: BatchColumnMapping = mappings[excelColumn] || ({
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
    } as BatchColumnMapping); // Assert type for the default object
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
    const ConfidenceIcon = ({ level }: { level?: ConfidenceLevel }) => {
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
                <ConfidenceIcon level={mapping.confidenceLevel} />
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

                // Add all existing table columns (filter out those already suggested)
                options.push({ label: 'All Fields:', value: 'all-fields-header', disabled: true });
                existingTableColumns
                    .filter(colName => !suggestions.some(s => s.columnName === colName))
                    .forEach(colName => {
                        options.push(colName);
                    });

                // Add Skip and Create options
                options.push({ label: '----', value: 'divider-action', disabled: true });
                options.push({ label: 'Skip This Column', value: 'skip-column' }); // Use a specific value for skip
                options.push({ label: '➕ Create New Field...', value: 'create-new-column' });

                return options;
            }, [tableColumns, suggestions])} // Use suggestions from mapping
            getOptionDisabled={(option) => typeof option === 'object' && !!option.disabled}
            // Determine value based on action and mappedColumn
            value={
                mapping.action === 'create' ? 'create-new-column' : // Show create if action is create
                mapping.action === 'map' ? mapping.mappedColumn : // Show mapped column if action is map
                'skip-column' // Default to skip
            }
            onChange={(_, newValue) => {
                const selectedValue = typeof newValue === 'object' && newValue !== null ? newValue.value : newValue;

                if (selectedValue === 'create-new-column') {
                    // Trigger parent modal to open create dialog
                    onMappingUpdate(excelColumn, { action: 'create' }); // Signal intent to create
                } else if (selectedValue === 'skip-column') {
                    onMappingUpdate(excelColumn, { action: 'skip', mappedColumn: null, newColumnProposal: undefined });
                } else if (selectedValue) {
                    // Map to existing column
                    onMappingUpdate(excelColumn, { action: 'map', mappedColumn: selectedValue, newColumnProposal: undefined });
                }
            }}
            getOptionLabel={(option) => typeof option === 'string' ? option : option.label}
            isOptionEqualToValue={(option, value) => {
                 if (!value) return false; // Handle null/undefined value case
                 const optionValue = typeof option === 'string' ? option : option.value;
                 const compareValue = typeof value === 'string' ? value : value.value; // Handle case where value might be object initially
                 return optionValue === compareValue;
            }}
            renderOption={(props, option) => {
                 const key = typeof option === 'string' ? option : option.value;
                 const style: React.CSSProperties = { padding: '4px 16px' };
                 if (typeof option === 'object' && option.disabled) {
                     style.fontWeight = 'bold';
                     style.fontStyle = 'italic';
                 }
                 if (option === 'skip-column') {
                     style.color = 'grey'; // Style skip option
                 }
                 if (option === 'create-new-column') {
                     style.color = 'green'; // Style create option
                 }
                 return (
                     <li {...props} key={key} style={style}>
                         {typeof option === 'string' ? option : option.label}
                     </li>
                 );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Map to Database Column"
                variant="outlined"
                fullWidth
                size="small"
                // Update helper text for create action
                helperText={mapping.action === 'create' ? `Creating: ${mapping.newColumnProposal?.columnName || 'New Field'}` : undefined}
              />
            )}
            sx={{ flexGrow: 1 }}
          />
        </Box>

        {exampleVals.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
            {exampleVals.map((val, i) => (
              <Chip 
                key={i} 
                label={val.length > 20 ? val.substring(0, 20) + '...' : val} 
                size="small" 
                variant="outlined"
                title={val}
              />
            ))}
          </Box>
        )}
      </Paper>
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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