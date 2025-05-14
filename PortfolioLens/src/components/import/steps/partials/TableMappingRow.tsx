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
import { alpha } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import { SheetMapping } from '../../../../store/batchImportStore';
import debounce from 'lodash/debounce';
import { normalizeTableName, generateSqlSafeName } from '../../utils/stringUtils';
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
  const [localNewTableName, setLocalNewTableName] = useState<string>('');
  const [isEditingNewName, setIsEditingNewName] = useState(false);

  useEffect(() => {
    if (sheet.mappedName === '_create_new_' && sheet.createNewValue) {
      setLocalNewTableName(sheet.createNewValue);
      setIsEditingNewName(true); // Ensure text field is shown
    } else if (sheet.mappedName !== '_create_new_') {
      // if mappedName is no longer _create_new_, reset editing state
      setIsEditingNewName(false);
      // setLocalNewTableName(''); // Optionally clear local name if not creating
    }
    // Add sheet.mappedName as a dependency to handle cases where the selection changes away from '_create_new_'
  }, [sheet.createNewValue, sheet.mappedName]);

  // Handle changes to the new table name input
  const handleNewTableNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalNewTableName(event.target.value);
  };

  // Finalize the new table name (on Enter or Blur)
  const handleNewTableNameFinalized = (finalNameValue: string) => {
    console.log('[TableMappingRow] handleNewTableNameFinalized triggered with:', finalNameValue);
    // Guard against undefined or null finalNameValue
    if (!finalNameValue || !finalNameValue.trim()) {
      // If the name is empty, revert to selecting '_create_new_' or clear, depending on desired UX
      // For now, let's ensure it doesn't save an empty name as a real table
      // updateSheet(sheet.id, { mappedName: '_create_new_', createNewValue: '', isNewTable: true, wasCreatedNew: false, approved: false, status: 'unmapped' });
      // Or, simply do nothing and let the TextField be empty, user can re-select from dropdown
      // setIsEditingNewName(false); // this might hide the field prematurely
      if (sheet.mappedName === '_create_new_') {
        // if it was already _create_new_ and they blurred an empty field, keep it _create_new_
        // and clear any tentative createNewValue
        updateSheet(sheet.id, { createNewValue: ''});
      }
      return; 
    }

    let proposedName = finalNameValue.trim();
    const categoryPrefix = sheet.category === TableCategory.LOAN ? TablePrefixes[TableCategory.LOAN] : TablePrefixes[TableCategory.PASSTHROUGH];

    if (categoryPrefix && !proposedName.startsWith(categoryPrefix)) {
      proposedName = `${categoryPrefix}${normalizeTableName(proposedName, true)}`; // true to keep existing underscores if any after prefix
    } else {
      proposedName = normalizeTableName(proposedName); // Normalize the whole name if no auto prefix or already prefixed
    }

    // Check if this normalized name already exists (case-insensitive)
    const existingTable = tables.find(t => normalizeTableName(t.name) === normalizeTableName(proposedName));
    
    if (existingTable) {
      // If it matches an existing table, map to that table
      console.log(`New name '${proposedName}' matches existing table '${existingTable.name}'. Mapping to existing.`);
      updateSheet(sheet.id, {
        mappedName: existingTable.name, // Use the canonical name from `tables`
        isNewTable: false,
        wasCreatedNew: false,
        createNewValue: '',
        approved: true, // Assuming mapping to existing is auto-approved
        needsReview: false,
        status: 'mapped',
      });
    } else {
      // If it's a new name, proceed to create it
      console.log(`Finalizing as new table: '${proposedName}'`);
      updateSheet(sheet.id, {
        mappedName: proposedName, // Use the processed new name
        isNewTable: true, 
        wasCreatedNew: true, // Mark as created
        createNewValue: proposedName, // Store the finalized name here
        approved: true, // New tables are auto-approved upon creation for now
        needsReview: false,
        status: 'mapped_new',
      });
    }
    setIsEditingNewName(false); // Hide TextField after finalizing
  };

  // Determine the value for the Select component
  const selectValue = (() => {
    if (tablesLoading) return ''; // Show nothing or a placeholder if tables are loading
    if (sheet.mappedName === '_create_new_') return '_create_new_';
    // If it was created new and the mappedName matches createNewValue, it's the selected new table.
    if (sheet.wasCreatedNew && sheet.mappedName && sheet.mappedName === sheet.createNewValue) {
      return sheet.mappedName;
    }
    // If mappedName corresponds to an actual table, use it.
    if (sheet.mappedName && validateTableExists(sheet.mappedName)) {
      // Ensure we return the canonical name if there are slight variations
      const matchedTable = tables.find(t => normalizeTableName(t.name) === normalizeTableName(sheet.mappedName));
      return matchedTable ? matchedTable.name : sheet.mappedName; // Prefer canonical, fallback to mappedName if somehow no exact match but validate passed
    }
    // Fallback for other cases (e.g. initial state, or invalid mappedName not yet corrected)
    // if (sheet.isNewTable && sheet.createNewValue) return '_create_new_'; // If pending new, show create new
    return ''; // Default to 'Select a table' (empty value)
  })();

  const isNewlyCreatedAndSelected = sheet.wasCreatedNew && sheet.mappedName === sheet.createNewValue;
  const showTextField = isEditingNewName && sheet.mappedName === '_create_new_';

  return (
    <div 
      className="ReactWindowRow MappingRow"
      data-testid={`table-mapping-row-${sheet.id}`}
      style={{
        ...style,
        backgroundColor: sheet.skip ? 'rgba(0, 0, 0, 0.04)' : isSelected ? theme.palette.action.selected : theme.palette.background.paper,
        borderLeft: sheet.skip ? 'none' : '4px solid',
        borderLeftColor: sheet.skip
          ? 'transparent'
          : getEffectiveStatus(sheet).isApproved
            ? theme.palette.success.light
            : getEffectiveStatus(sheet).needsReview
              ? theme.palette.warning.light
              : 'transparent',
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
          {getEffectiveStatus(sheet).needsReview && !sheet.skip ? (
            <Tooltip title="Table mapping needs review">
              <span>
                <WarningIcon color="warning" fontSize="small" sx={{ mr: 1, opacity: 0.7, flexShrink: 0 }} />
              </span>
            </Tooltip>
          ) : getEffectiveStatus(sheet).isApproved && !sheet.skip ? (
            <Tooltip title={getEffectiveStatus(sheet).confidence >= TABLE_AUTO_APPROVE_THRESHOLD ? `Table mapping auto-approved (${formatConfidence(getEffectiveStatus(sheet).confidence)}% confidence)` : "Table mapping approved"}>
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
        {/* Show TextField only when mappedName is exactly '_create_new_'. */}
        {(sheet.mappedName === '_create_new_') ? (
          // Create new table mode with edit field
          <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
            <TextField
              size="small"
              value={localNewTableName}
              onChange={handleNewTableNameChange}
              onBlur={(e) => {
                // On blur, immediately apply the change
                handleNewTableNameFinalized(e.target.value);
              }}
              disabled={sheet.skip}
              fullWidth
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
                console.log('[TableMappingRow] TextField onKeyDown:', e.key); // DEBUG
                if (e.key === 'Enter') {
                  e.preventDefault(); // Prevent form submission or other default Enter behavior
                  handleNewTableNameFinalized(localNewTableName);
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
            // Properly handle value selection state
            value={selectValue}
            onChange={(e) => handleMappedNameChange(sheet.id, e.target.value)}
            disabled={sheet.skip || tablesLoading} // Also disable select while tables load
            // Using 'error' boolean as per MUI Select API
            error={Boolean(!tablesLoading && sheet.mappedName && sheet.mappedName !== '_create_new_' && 
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
            
            {/* Always add the newly created table name as an option if it exists */}
            {sheet.wasCreatedNew && sheet.createNewValue && sheet.mappedName === sheet.createNewValue && (
              <MenuItem 
                key={`new-${sheet.id}`} 
                value={sheet.createNewValue} 
                sx={{ 
                  fontWeight: 'bold', 
                  backgroundColor: alpha(theme.palette.success.light, 0.1),
                  border: `1px solid ${theme.palette.success.main}`,
                  borderRadius: '4px',
                  my: 0.5
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography
                    component="span"
                    sx={{
                      color: '#9c27b0', // Purple color
                      fontWeight: 'bold',
                      fontSize: '1.2rem',
                      mr: 1
                    }}
                  >
                    +
                  </Typography>
                  {sheet.createNewValue}
                </Box>
              </MenuItem>
            )}
            
            
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
          if (getEffectiveStatus(sheet).needsReview && !sheet.skip) {
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
          } else if (getEffectiveStatus(sheet).isApproved && !sheet.skip) {
            return (
              <Tooltip
                title={
                  getEffectiveStatus(sheet).isNewTable
                    ? "New table will be created"
                    : getEffectiveStatus(sheet).confidence >= TABLE_AUTO_APPROVE_THRESHOLD
                      ? `Auto-approved (${formatConfidence(getEffectiveStatus(sheet).confidence)}% match)`
                      : "Approved"
                }
                placement="top"
              >
                <span>
                  <Chip
                    label={getEffectiveStatus(sheet).isNewTable ? "New Table" : "Approved"}
                    color={getEffectiveStatus(sheet).isNewTable ? "secondary" : "success"}
                    icon={
                      getEffectiveStatus(sheet).isNewTable
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
          {getEffectiveStatus(sheet).needsReview && !sheet.skip && (
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