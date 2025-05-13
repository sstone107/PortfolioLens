/**
 * TableMappingRow.tsx
 * Component for rendering individual rows in the table mapping UI
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Chip,
  IconButton,
  Tooltip,
  MenuItem,
  Select,
  InputAdornment,
  Divider,
  CircularProgress,
  useTheme,
  SelectChangeEvent
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import { SheetMapping } from '../../../../store/batchImportStore';
import debounce from 'lodash/debounce';
import { normalizeTableName } from '../../utils/stringUtils';
import { getDisplayName, applyTablePrefix, TableCategory, TablePrefixes } from '../../utils/tableNameUtils';
import { TABLE_AUTO_APPROVE_THRESHOLD } from '../../hooks/useAutoTableMatch';

interface TableMappingRowProps {
  sheet: SheetMapping;
  style: React.CSSProperties;
  columnWidths: Record<string, string>;
  cellStyle: React.CSSProperties;
  isSelected: boolean;
  tables: any[];
  tablesLoading: boolean;
  validateTableExists: (tableName: string) => boolean;
  getSortedTableSuggestions: (sheetName: string) => Array<{name: string; originalName: string; confidence: number}>;
  getEffectiveStatus: (sheet: SheetMapping) => {
    isApproved: boolean;
    needsReview: boolean;
    confidence: number;
    isNewTable: boolean;
  };
  toSqlFriendlyName: (name: string) => string;
  handleMappedNameChange: (sheetId: string, value: string) => void;
  handleHeaderRowChange: (sheetId: string, row: number) => void;
  handleSkipToggle: (sheetId: string, skip: boolean) => void;
  handleApproveNew: (sheetId: string) => void;
  handleSelectSheet: (sheetId: string) => void;
  tablePrefix: string;
  updateSheet: (sheetId: string, updates: Partial<SheetMapping>) => void;
  generateSqlSafeName: (friendlyName: string) => string;
  formatConfidence: (confidenceValue: number) => number;
  showOnlyLoanTables?: boolean;
}

/**
 * Renders a single row in the table mapping UI 
 */
const TableMappingRow: React.FC<TableMappingRowProps> = ({
  sheet,
  style,
  columnWidths,
  cellStyle,
  isSelected,
  tables,
  tablesLoading,
  validateTableExists,
  getSortedTableSuggestions,
  getEffectiveStatus,
  toSqlFriendlyName,
  handleMappedNameChange,
  handleHeaderRowChange,
  handleSkipToggle,
  handleApproveNew,
  handleSelectSheet,
  tablePrefix,
  updateSheet,
  generateSqlSafeName,
  formatConfidence,
  showOnlyLoanTables = false
}) => {
  const theme = useTheme();
  const [newTableName, setNewTableName] = useState<string>('');
  const [initialRender, setInitialRender] = useState(true);
  
  // Using imported TABLE_AUTO_APPROVE_THRESHOLD constant
  
  // Status from the hook
  const status = getEffectiveStatus(sheet);
  
  // Returns a user-friendly version of the table name (without ln_ prefix)
  const getLoanTableUserFriendlyName = useCallback((fullTableName: string): string => {
    const loanPrefix = TablePrefixes[TableCategory.LOAN];
    return fullTableName.startsWith(loanPrefix) 
      ? fullTableName.substring(loanPrefix.length) 
      : fullTableName;
  }, []);
  
  // Ensures a table name has the ln_ prefix
  const ensureLoanTablePrefix = useCallback((tableName: string): string => {
    const loanPrefix = TablePrefixes[TableCategory.LOAN];
    return tableName.startsWith(loanPrefix) ? tableName : `${loanPrefix}${tableName}`;
  }, []);
  
  // Initialize newTableName when entering create new mode
  useEffect(() => {
    try {
      if (sheet.mappedName === '_create_new_' || sheet.isNewTable) {
        // Use values in order of priority:
        // 1. User's saved value (createNewValue)
        // 2. System suggested name (suggestedName)
        // 3. Generate an SQL-safe name from the original sheet name
        let fullTableName = sheet.createNewValue || 
          sheet.suggestedName || 
          generateSqlSafeName(sheet.originalName);
          
        // Ensure it has the ln_ prefix for internal storage
        fullTableName = ensureLoanTablePrefix(fullTableName);
        
        // For display, remove the ln_ prefix so the user never sees it
        const displayName = getLoanTableUserFriendlyName(fullTableName);
        setNewTableName(displayName);
        
        // If we're initializing with a generated name, also update the store
        if (!sheet.createNewValue && !sheet.suggestedName) {
          // Update with the SQL-safe name and flags
          updateSheet(sheet.id, {
            mappedName: '_create_new_',
            createNewValue: fullTableName, // Store the full name with prefix
            suggestedName: fullTableName,  // Store the full name with prefix
            isNewTable: true
          });
        }
      }
    } catch (err) {
      console.error('Error initializing newTableName:', err);
    }
  }, [sheet.mappedName, sheet.isNewTable, sheet.createNewValue, sheet.suggestedName, sheet.originalName, generateSqlSafeName, updateSheet, sheet.id, getLoanTableUserFriendlyName, ensureLoanTablePrefix]);
  
  // Debounced function to update the actual table mapping
  const debouncedUpdateNewTableName = React.useCallback(
    debounce((sheetId: string, value: string) => {
      // Only update if the value is valid
      if (value && value.trim()) {
        const normalizedName = normalizeTableName(value);
        updateSheet(sheetId, {
          mappedName: normalizedName,
          isNewTable: true,
          createNewValue: normalizedName,
          suggestedName: normalizedName,
          approved: true,
          needsReview: false,
          status: 'approved'
        });
      }
    }, 300),
    [updateSheet]
  );

  // Effect to mark that first render is complete
  useEffect(() => {
    if (initialRender) {
      setInitialRender(false);
    }
  }, [initialRender]);
  
  // Handle new table name input changes
  const handleNewTableNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      // Get user input raw value
      const rawValue = e.target.value;
      
      // Update the local state with the raw value for better UX
      setNewTableName(rawValue);
      
      // If the input is empty, use SQL-safe version of original sheet name with ln_ prefix
      let baseName = rawValue 
        ? normalizeTableName(rawValue) 
        : generateSqlSafeName(sheet.originalName);
      
      // Apply ln_ prefix if not already present
      const loanPrefix = TablePrefixes[TableCategory.LOAN];
      const sqlSafeName = baseName.startsWith(loanPrefix) ? baseName : `${loanPrefix}${baseName}`;
      
      console.log(`New table name: ${rawValue} -> SQL safe: ${sqlSafeName}`);
      
      // Update the intermediate state
      updateSheet(sheet.id, {
        mappedName: '_create_new_',
        createNewValue: sqlSafeName, // Store the SQL-safe version
        isNewTable: true,
        suggestedName: sqlSafeName
      });
      
      // Debounce the actual update to avoid too many re-renders
      debouncedUpdateNewTableName(sheet.id, sqlSafeName);
    } catch (err) {
      console.error('Error in handleNewTableNameChange:', err);
    }
  };
  
  // Style left border based on status
  const borderLeftColor = sheet.skip
    ? 'transparent'
    : status.isApproved
      ? theme.palette.success.light
      : status.needsReview
        ? theme.palette.warning.light
        : 'transparent';

  return (
    <div 
      className="ReactWindowRow MappingRow"
      data-testid={`table-mapping-row-${sheet.id}`}
      style={{
        ...style,
        backgroundColor: sheet.skip ? 'rgba(0, 0, 0, 0.04)' : isSelected ? theme.palette.action.selected : theme.palette.background.paper,
        borderLeft: sheet.skip ? 'none' : '4px solid',
        borderLeftColor,
        display: 'flex',
        alignItems: 'center',
        borderBottom: `1px solid ${theme.palette.divider}`,
        transition: 'background-color 0.2s ease-in-out',
        '&:hover': {
          backgroundColor: theme.palette.action.hover
        },
      }}
    >
      {/* Sheet Name - Cell 1 */}
      <div style={{ ...cellStyle, width: columnWidths.sheetName }}>
        <Box sx={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          {status.needsReview && !sheet.skip ? (
            <Tooltip title="Table mapping needs review">
              <span>
                <WarningIcon color="warning" fontSize="small" sx={{ mr: 1, opacity: 0.7, flexShrink: 0 }} />
              </span>
            </Tooltip>
          ) : status.isApproved && !sheet.skip ? (
            <Tooltip title={status.confidence >= TABLE_AUTO_APPROVE_THRESHOLD ? `Table mapping auto-approved (${formatConfidence(status.confidence)}% confidence)` : "Table mapping approved"}>
              <span>
                <CheckCircleIcon color="success" fontSize="small" sx={{ mr: 1, opacity: 0.7, flexShrink: 0 }} />
              </span>
            </Tooltip>
          ) : null}
          <Typography fontWeight={isSelected ? 'bold' : 'normal'} noWrap>
            {sheet.originalName}
          </Typography>
        </Box>
        {sheet.error && (
          <Typography variant="caption" color="error" noWrap>
            Error: {sheet.error}
          </Typography>
        )}
      </div>
      
      {/* Mapped Table Name - Cell 2 */}
      <div style={{ ...cellStyle, width: columnWidths.databaseTable, display: 'block' /* Allow select to fill */ }}>
        {/* Check if this table is in create new mode */}
        {(sheet.isNewTable || sheet.mappedName === '_create_new_') ? (
          // Create new table mode with edit field
          <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
            <TextField
              size="small"
              value={newTableName}
              onChange={handleNewTableNameChange}
              onBlur={(e) => {
                // On blur, immediately apply the change
                if (e.target.value && e.target.value.trim()) {
                  let baseName = normalizeTableName(e.target.value);
                  
                  // Ensure ln_ prefix is applied
                  const loanPrefix = TablePrefixes[TableCategory.LOAN];
                  const normalizedName = baseName.startsWith(loanPrefix) ? 
                    baseName : `${loanPrefix}${baseName}`;
                    
                  updateSheet(sheet.id, {
                    mappedName: normalizedName,
                    isNewTable: true,
                    createNewValue: normalizedName,
                    suggestedName: normalizedName,
                    approved: true,
                    needsReview: false,
                    status: 'approved'
                  });
                }
              }}
              disabled={sheet.skip}
              fullWidth
              error={false}
              placeholder=""
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  '&.Mui-focused fieldset': {
                    borderColor: theme.palette.primary.main,
                    borderWidth: 2
                  },
                  transition: theme.transitions.create(['border-color']),
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AddCircleIcon
                      sx={{
                        color: theme.palette.secondary.main,
                        mr: 0.5
                      }}
                      fontSize="small"
                    />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 180 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // Apply the change immediately on Enter key
                  if (e.currentTarget.value && e.currentTarget.value.trim()) {
                    let baseName = normalizeTableName(e.currentTarget.value);
                    
                    // Ensure ln_ prefix is applied
                    const loanPrefix = TablePrefixes[TableCategory.LOAN];
                    const normalizedName = baseName.startsWith(loanPrefix) ? 
                      baseName : `${loanPrefix}${baseName}`;
                      
                    updateSheet(sheet.id, {
                      mappedName: normalizedName,
                      isNewTable: true,
                      createNewValue: normalizedName,
                      suggestedName: normalizedName,
                      approved: true,
                      needsReview: false,
                      status: 'approved'
                    });
                    e.currentTarget.blur();
                  }
                }
              }}
            />
            <Tooltip title="Back to table selection">
              <span>
                <IconButton
                  size="small"
                  onClick={() => handleMappedNameChange(sheet.id, '')}
                  sx={{ ml: 1, mt: 1 }}
                >
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        ) : (
          // Table selection mode with dropdown
          <Select
            size="small"
            // Properly handle value selection state during loading and for invalid values
            value={(() => {
              try {
                const mappedName = sheet.mappedName || '';
                
                // Special values are always valid
                if (mappedName === '_create_new_' || mappedName === '') {
                  return mappedName;
                }
                
                // During table loading, preserve the current value to prevent flickering
                // but only for special values like _create_new_ to avoid MUI warnings
                if (tablesLoading && !initialRender) {
                  return ''; // Return empty during loading for regular tables
                }
                
                // After tables have loaded, validate if this is a real table
                // This ensures we don't have "MUI: out-of-range value" warnings
                const isValidOption = validateTableExists(mappedName);
                
                if (!isValidOption) {
                  console.warn(`Invalid table mapping found: ${sheet.originalName} -> ${mappedName}`);
                  return ''; // Use empty value instead of invalid one
                }
                
                return mappedName;
              } catch (err) {
                console.error("Error setting Select value:", err);
                return ''; // Fallback to empty on error
              }
            })()}
            onChange={(e: SelectChangeEvent<string>) => {
              try {
                handleMappedNameChange(sheet.id, e.target.value);
              } catch (err) {
                console.error("Error handling mapped name change:", err);
              }
            }}
            disabled={sheet.skip || tablesLoading} // Also disable select while tables load
            error={(!tablesLoading && sheet.mappedName && sheet.mappedName !== '_create_new_' && 
                   !validateTableExists(sheet.mappedName))}
            displayEmpty
            MenuProps={{
              // Ensure menu renders above other elements
              style: { zIndex: 9999 },
              // Improve performance by limiting height and enabling virtualization
              PaperProps: {
                style: {
                  maxHeight: 300,
                },
              },
              // Prevent menu from being trapped in a scroll container
              container: document.body,
              // This ensures menu will always be visible
              disablePortal: false,
            }}
            sx={{ 
              minWidth: 150, 
              flexGrow: 1, 
              width: '100%',
              '& .MuiOutlinedInput-root': {
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: theme.palette.primary.main,
                  borderWidth: 2
                },
                transition: theme.transitions.create(['border-color']),
              },
              // Add error styling when there's an invalid selection
              ...((!tablesLoading && sheet.mappedName && sheet.mappedName !== '_create_new_' && 
                 !validateTableExists(sheet.mappedName)) && {
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: theme.palette.error.main,
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: theme.palette.error.main,
                }
              })
            }}
          >
            <MenuItem value="">
              <em>{tablesLoading ? 'Loading...' : ''}</em>
            </MenuItem>
            
            {/* Create New Table Option - Always visible */}
            <MenuItem value="_create_new_">
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center',
                width: '100%',
                padding: '8px 0'
              }}>
                <AddCircleIcon
                  sx={{
                    color: theme.palette.secondary.main,
                    mr: 1
                  }}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography color="primary" fontWeight="medium">Create New Table</Typography>
                </Box>
              </Box>
            </MenuItem>
            
            {/* Show warning for invalid table selection */}
            {!tablesLoading && sheet.mappedName && sheet.mappedName !== '_create_new_' && 
             !validateTableExists(sheet.mappedName) && (
              <MenuItem disabled value="__invalid__" sx={{ 
                backgroundColor: theme.palette.error.light,
                padding: '8px 12px',
                borderRadius: '4px',
                marginTop: '4px',
                marginBottom: '4px'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <WarningIcon color="error" sx={{ mr: 1, fontSize: 18 }} />
                  <Typography variant="body2" color="error" fontWeight="medium">
                    Invalid table selected: "{sheet.mappedName}"
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Table no longer exists.
                </Typography>
              </MenuItem>
            )}
            
            <Divider />
            
            
            {/* Conditional rendering for tables */}
            {(() => {
              // Case 1: Tables are loading
              if (tablesLoading) {
                return (
                  <MenuItem disabled>
                    <Box sx={{ display: 'flex', alignItems: 'center', py: 1 }}>
                      <CircularProgress size={16} sx={{ mr: 1 }} />
                      <Typography variant="body2">Loading...</Typography>
                    </Box>
                  </MenuItem>
                );
              }
              
              // Case 2: No tables available
              if (!tables || tables.length === 0) {
                return (
                  <MenuItem disabled>
                    <Box sx={{ display: 'flex', alignItems: 'center', py: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        No tables found.
                      </Typography>
                    </Box>
                  </MenuItem>
                );
              }
              
              // Case 3: Tables loaded, get suggestions
              const suggestions = getSortedTableSuggestions(sheet.originalName);
              
              // Filter suggestions if showOnlyLoanTables is true
              const filteredSuggestions = showOnlyLoanTables 
                ? suggestions.filter(suggestion => 
                    suggestion.name.startsWith(TablePrefixes[TableCategory.LOAN]))
                : suggestions;
              
              // Case 3a: No matching suggestions
              if (filteredSuggestions.length === 0) {
                return (
                  <MenuItem disabled>
                    <Box sx={{ display: 'flex', alignItems: 'center', py: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        {showOnlyLoanTables ? "No matching loan tables found." : "No matching tables found."}
                      </Typography>
                    </Box>
                  </MenuItem>
                );
              }
              
              // Case 3b: Display all suggestions
              return filteredSuggestions.map((suggestion) => (
                <MenuItem key={suggestion.name} value={suggestion.name}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <Typography>
                      {getDisplayName(suggestion.originalName)}
                    </Typography>
                    <Chip
                      label={`${formatConfidence(suggestion.confidence)}%`}
                      size="small"
                      color={suggestion.confidence >= TABLE_AUTO_APPROVE_THRESHOLD ? 'success' : suggestion.confidence >= 70 ? 'warning' : 'error'}
                      sx={{ ml: 1 }}
                    />
                  </Box>
                </MenuItem>
              ));
            })()}
          </Select>
        )}
      </div>
      
      {/* Header Row - Cell 3 */}
      <div style={{ ...cellStyle, width: columnWidths.headerRow }}>
        <TextField
          type="number"
          size="small"
          // Display 1-based for user
          value={sheet.headerRow + 1}
          onChange={(e) => {
            // Convert from 1-based (UI) to 0-based (internal)
            const uiValue = parseInt(e.target.value, 10);
            const internalValue = uiValue - 1;
            if (!isNaN(uiValue) && uiValue >= 1) {
              handleHeaderRowChange(sheet.id, internalValue);
            }
          }}
          disabled={sheet.skip}
          InputProps={{ inputProps: { min: 1 } }}
          sx={{ width: 80 }}
        />
      </div>
      
      {/* Skip Toggle - Cell 4 */}
      <div style={{ ...cellStyle, width: columnWidths.skip, justifyContent: 'center' }}>
        <FormControlLabel
          control={
            <Switch
              checked={sheet.skip}
              onChange={(e) => handleSkipToggle(sheet.id, e.target.checked)}
              size="small"
              color={sheet.skip ? "default" : "success"}
              sx={{
                '& .MuiSwitch-switchBase': {
                  padding: '3px'
                },
                '& .MuiSwitch-thumb': {
                  width: 16,
                  height: 16
                },
                '& .MuiSwitch-track': {
                  borderRadius: 10,
                  opacity: 0.8,
                  backgroundColor: sheet.skip ? '#bdbdbd' : undefined
                },
                mr: 0.5
              }}
            />
          }
          label={
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.7rem',
                whiteSpace: 'nowrap',
                fontWeight: 'medium',
                color: sheet.skip ? 'text.secondary' : 'success.main'
              }}
            >
              {sheet.skip ? "Skipped" : "Import"}
            </Typography>
          }
          sx={{ 
            m: 0,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        />
      </div>
      
      {/* Status - Cell 5 */}
      <div style={{ ...cellStyle, width: columnWidths.status }}>
        {(() => {
          if (status.needsReview && !sheet.skip) {
            return (
              <Tooltip title="Table mapping needs review" placement="top">
                <span>
                  <Chip
                    label="Needs Review"
                    color="warning"
                    icon={<WarningIcon fontSize="small" />}
                    size="small"
                  />
                </span>
              </Tooltip>
            );
          } else if (status.isApproved && !sheet.skip) {
            return (
              <Tooltip
                title={
                  status.isNewTable
                    ? "New table will be created"
                    : status.confidence >= TABLE_AUTO_APPROVE_THRESHOLD
                      ? `Auto-approved (${formatConfidence(status.confidence)}% match)`
                      : "Approved"
                }
                placement="top"
              >
                <span>
                  <Chip
                    label={status.isNewTable ? "New Table" : "Approved"}
                    color={status.isNewTable ? "secondary" : "success"}
                    icon={
                      status.isNewTable
                        ? <AddCircleIcon fontSize="small" />
                        : <CheckCircleIcon fontSize="small" />
                    }
                    size="small"
                  />
                </span>
              </Tooltip>
            );
          } else if (sheet.skip) {
            return (
              <Chip
                label="Skipped"
                color="default"
                size="small"
              />
            );
          } else {
            return (
              <Chip
                label="Pending"
                color="default"
                size="small"
              />
            );
          }
        })()}
      </div>
      
      {/* Actions - Cell 6 */}
      <div style={{ ...cellStyle, width: columnWidths.actions, justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="View Sample Data">
            <span>
              <IconButton
                size="small"
                onClick={() => handleSelectSheet(sheet.id)}
              >
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          
          {/* Show approval button for items that need review */}
          {status.needsReview && !sheet.skip && (
            <Tooltip title="Approve Mapping">
              <span>
                <IconButton
                  size="small"
                  color="success"
                  onClick={() => handleApproveNew(sheet.id)}
                  disabled={!sheet.mappedName || sheet.mappedName === '_create_new_'}
                >
                  <CheckCircleIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      </div>
    </div>
  );
};

export default TableMappingRow;