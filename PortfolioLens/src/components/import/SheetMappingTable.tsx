import React, { useEffect, useState, useMemo } from 'react';
import {
  TableContainer,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Checkbox,
  FormControl,
  Select,
  MenuItem,
  Tooltip,
  Typography,
  Box,
  LinearProgress,
  Chip,
  IconButton,
  TextField, // Added TextField
  Divider,
  Collapse, 
  TableSortLabel, 
} from '@mui/material';
import {
  Check as CheckIcon,
  AutoFixHigh,
  Warning,
  CheckCircle,
  SkipNext,
  DoNotDisturb,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Add as AddIcon, 
  ThumbUpAlt, 
  HelpOutline, 
  ErrorOutline, 
  PlaylistAddCheck, 
  EditNotifications, 
  ReportProblem, 
  HourglassEmpty, 
} from '@mui/icons-material';
import { useBatchImportStore } from '../../store/batchImportStore'; // Added
import { SheetProcessingState, RankedTableSuggestion, ConfidenceLevel, SheetReviewStatus } from './types'; 
import SampleDataTable from './SampleDataTable'; 

// Helper function to create a SQL-friendly name from a sheet name
export const toSqlFriendlyName = (name: string): string => {
    if (!name) return '';
    // Replace spaces and common problematic characters with underscores
    let sqlName = name.replace(/[\s\/\\?%*:|"<>.-]+/g, '_');
    // Remove any leading/trailing underscores that might result
    sqlName = sqlName.replace(/^_+|_+$/g, '');
    // Ensure it doesn't start with a number (common SQL restriction)
    if (/^\d/.test(sqlName)) {
        sqlName = '_' + sqlName;
    }
    // Optional: Convert to lowercase, as many SQL dialects are case-insensitive or default to lowercase
    // sqlName = sqlName.toLowerCase();
    return sqlName.slice(0, 63); // Max length for some identifiers like in PostgreSQL
};

// Helper function to normalize header strings for better matching
export const normalizeHeaderForMatching = (header: string): string => {
    if (!header) return '';
    let normalized = header.toLowerCase();
    // Step 1: Specifically replace "&" with " and " to handle ampersands consistently
    normalized = normalized.replace(/&/g, ' and '); // Note the spaces around 'and'

    // Step 2: Replace spaces, commas, hyphens, and periods (and now an extra space from ' and ') with underscores
    // The + ensures multiple consecutive characters from the set become a single underscore
    normalized = normalized.replace(/[\s,\-.]+/g, '_'); // Removed & from this regex

    // Step 3: Remove any leading/trailing underscores that might have been created by the replacement
    normalized = normalized.replace(/^_+|_+$/g, '');

    // Step 4: Consolidate multiple underscores down to one.
    normalized = normalized.replace(/__+/g, '_');
    return normalized;
};

// Helper function for confidence icons
const ConfidenceIcon = ({ level }: { level?: ConfidenceLevel }) => {
  switch (level) {
    case 'High': return <ThumbUpAlt fontSize="small" color="success" sx={{ ml: 0.5, verticalAlign: 'middle' }} />;
    case 'Medium': return <HelpOutline fontSize="small" color="warning" sx={{ ml: 0.5, verticalAlign: 'middle' }} />;
    case 'Low': return <ErrorOutline fontSize="small" color="error" sx={{ ml: 0.5, verticalAlign: 'middle' }} />;
    default: return null;
  }
};

// Helper function for review status icons
const ReviewStatusIcon = ({ status }: { status?: SheetReviewStatus }) => {
    switch (status) {
        case 'approved': return <PlaylistAddCheck fontSize="small" color="success" sx={{ verticalAlign: 'middle' }} />;
        case 'rejected': return <ReportProblem fontSize="small" color="error" sx={{ verticalAlign: 'middle' }} />;
        case 'partiallyApproved': 
            return <EditNotifications fontSize="small" color="info" sx={{ verticalAlign: 'middle' }} />;
        case 'pending':
        default: return <HourglassEmpty fontSize="small" color="disabled" sx={{ verticalAlign: 'middle' }} />;
    }
};

interface SheetMappingTableProps {
  sheets: { [sheetName: string]: SheetProcessingState };
  tables: string[]; 
  localSelectedSheets: Record<string, boolean>; 
  localSkippedSheets: Record<string, boolean>; 
  onSheetSelectionToggle: (sheetName: string) => void;
  onTableSelection: (sheetName: string, tableName: string | null) => void; 
  onSelectAll: (selected: boolean) => void;
  onSkipSheet: (sheetName: string, skipped: boolean) => void;
  isProcessing: boolean; 
}

export const SheetMappingTable: React.FC<SheetMappingTableProps> = ({
  sheets,
  tables,
  localSelectedSheets,
  localSkippedSheets,
  onSheetSelectionToggle,
  onTableSelection,
  onSelectAll,
  onSkipSheet,
  isProcessing,
}) => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [sortConfig, setSortConfig] = useState<{ key: keyof SheetProcessingState | 'sheetName' | 'mappedPercent', direction: 'asc' | 'desc' } | null>(null);
  const [editableNewTableNames, setEditableNewTableNames] = useState<Record<string, string>>({});
  const storeUpdateNewTableName = useBatchImportStore(state => state.updateNewTableNameForSheet);

  const handleExpandClick = (sheetName: string) => {
    setExpandedRows(prev => ({ ...prev, [sheetName]: !prev[sheetName] }));
  };

  useEffect(() => {
    const initialEditableNames: Record<string, string> = {};
    Object.entries(sheets).forEach(([name, sheetState]) => {
        if (sheetState.isNewTable) {
            if (sheetState.selectedTable && sheetState.selectedTable.startsWith('new:') && sheetState.selectedTable.length > 4) {
                // User has already potentially typed a custom name or it was set
                initialEditableNames[name] = sheetState.selectedTable.substring(4);
            } else {
                // Default to SQL-friendly sheet name if no specific new name is set
                initialEditableNames[name] = toSqlFriendlyName(name);
                 // Also, ensure the store reflects this default if it's truly a new table being setup
                if (!sheetState.selectedTable || sheetState.selectedTable === 'CREATE_NEW_TABLE') {
                    storeUpdateNewTableName(name, toSqlFriendlyName(name));
                }
            }
        }
    });
    setEditableNewTableNames(prev => ({ ...prev, ...initialEditableNames }));
  }, [sheets, storeUpdateNewTableName]);

  const handleNewTableNameChange = (sheetName: string, newUiName: string) => {
      setEditableNewTableNames(prev => ({ ...prev, [sheetName]: newUiName }));
  };

  const handleNewTableNameBlur = (sheetName: string) => {
      const newName = editableNewTableNames[sheetName];
      const currentSheetState = sheets[sheetName];
      // Only update if the name is defined, it's a new table, and the name has actually changed from what's in the store
      if (newName !== undefined && currentSheetState.isNewTable) {
          const originalStoreName = currentSheetState.selectedTable?.startsWith('new:')
              ? currentSheetState.selectedTable.substring(4)
              : null;
          if (newName !== originalStoreName) {
              storeUpdateNewTableName(sheetName, newName);
          }
      }
  };

  const sortedSheetNames = useMemo(() => {
    const sheetEntries = Object.entries(sheets);
    if (!sortConfig) return sheetEntries.map(([name]) => name);

    sheetEntries.sort(([nameA, stateA], [nameB, stateB]) => {
      let valueA: any;
      let valueB: any;

      if (sortConfig.key === 'sheetName') {
        valueA = nameA;
        valueB = nameB;
      } else if (sortConfig.key === 'mappedPercent') {
          const mappingA = stateA.columnMappings || {};
          const mappedA = Object.values(mappingA).filter(m => m.mappedColumn || m.action === 'create').length;
          valueA = stateA.headers.length > 0 ? (mappedA / stateA.headers.length) * 100 : 0;

          const mappingB = stateB.columnMappings || {};
          const mappedB = Object.values(mappingB).filter(m => m.mappedColumn || m.action === 'create').length;
          valueB = stateB.headers.length > 0 ? (mappedB / stateB.headers.length) * 100 : 0;
      } else {
        valueA = stateA[sortConfig.key as keyof SheetProcessingState];
        valueB = stateB[sortConfig.key as keyof SheetProcessingState];
      }

      if (valueA < valueB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return sheetEntries.map(([name]) => name);
  }, [sheets, sortConfig]);

  const hasHighConfidenceSuggestions = useMemo(() => {
    return Object.values(sheets).some(sheetState => {
      const topExistingSuggestion = sheetState.tableSuggestions?.find(s => !s.isNewTableProposal);
      return topExistingSuggestion && topExistingSuggestion.confidenceLevel === 'High' &&
             !localSkippedSheets[sheetState.sheetName] &&
             !sheetState.selectedTable;
    });
  }, [sheets, localSkippedSheets]);

  const handleSort = (key: keyof SheetProcessingState | 'sheetName' | 'mappedPercent') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleBatchApprove = () => {
    Object.entries(sheets).forEach(([sheetName, sheetState]) => {
      const topExistingSuggestion = sheetState.tableSuggestions?.find(s => !s.isNewTableProposal);
      if (topExistingSuggestion && topExistingSuggestion.confidenceLevel === 'High' &&
          !localSkippedSheets[sheetName] && !sheetState.selectedTable) {
        if (!localSelectedSheets[sheetName]) {
            onSheetSelectionToggle(sheetName);
        }
        onTableSelection(sheetName, topExistingSuggestion.tableName);
      }
    });
  };

  const availableSheetNames = Object.keys(sheets).filter(name => !localSkippedSheets[name]);
  const allSelected = availableSheetNames.length > 0 && availableSheetNames.every(name => localSelectedSheets[name]);
  const someSelected = availableSheetNames.some(name => localSelectedSheets[name]);

  return (
    <TableContainer component={Paper} sx={{ mb: 4 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Tooltip title={allSelected ? "Deselect All Visible" : "Select All Visible"}>
                <span>
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onChange={(e) => onSelectAll(e.target.checked)}
                    disabled={availableSheetNames.length === 0}
                  />
                </span>
              </Tooltip>
            </TableCell>
            <TableCell sortDirection={sortConfig?.key === 'sheetName' ? sortConfig.direction : false}>
                <TableSortLabel
                    active={sortConfig?.key === 'sheetName'}
                    direction={sortConfig?.key === 'sheetName' ? sortConfig.direction : 'asc'}
                    onClick={() => handleSort('sheetName')}
                >
                    <strong>Excel Sheet</strong>
                </TableSortLabel>
            </TableCell>
            <TableCell sortDirection={sortConfig?.key === 'rowCount' ? sortConfig.direction : false}>
                 <TableSortLabel
                    active={sortConfig?.key === 'rowCount'}
                    direction={sortConfig?.key === 'rowCount' ? sortConfig.direction : 'asc'}
                    onClick={() => handleSort('rowCount')}
                >
                    <strong>Rows</strong>
                </TableSortLabel>
            </TableCell>
            <TableCell><strong>Columns</strong></TableCell>
            <TableCell><strong>Database Table</strong></TableCell>
            <TableCell sortDirection={sortConfig?.key === 'mappedPercent' ? sortConfig.direction : false}>
                 <TableSortLabel
                    active={sortConfig?.key === 'mappedPercent'}
                    direction={sortConfig?.key === 'mappedPercent' ? sortConfig.direction : 'asc'}
                    onClick={() => handleSort('mappedPercent')}
                >
                    <strong>Mapping Status</strong>
                </TableSortLabel>
            </TableCell>
            <TableCell><strong>Status</strong></TableCell>
            <TableCell align="center">
                <Tooltip title="Approve High Confidence Mappings">
                    <span>
                        <IconButton
                            size="small"
                            onClick={handleBatchApprove}
                            disabled={!hasHighConfidenceSuggestions || isProcessing}
                        >
                            <AutoFixHigh />
                        </IconButton>
                    </span>
                </Tooltip>
            </TableCell>
             <TableCell align="right"><strong>Actions</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedSheetNames.map(sheetName => {
            const sheetState = sheets[sheetName];
            if (!sheetState) return null; 

            const { headers, sampleData, rowCount, selectedTable, tableSuggestions, columnMappings, status, error, sheetReviewStatus, isNewTable } = sheetState;
            const isSkipped = localSkippedSheets[sheetName];
            const isSelected = localSelectedSheets[sheetName];

            const mapping = columnMappings || {};
            const mappedColumns = Object.values(mapping).filter(m => m.mappedColumn || m.action === 'create').length;
            const mappingPercent = headers.length > 0 ? Math.round((mappedColumns / headers.length) * 100) : 0;

            return (
              <React.Fragment key={sheetName}>
                <TableRow key={`${sheetName}-main`} sx={{ '& > *': { borderBottom: 'unset' } }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => onSheetSelectionToggle(sheetName)}
                      disabled={isSkipped}
                    />
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      <Typography
                        sx={{
                          textDecoration: isSkipped ? 'line-through' : 'none',
                          color: isSkipped ? 'text.disabled' : 'text.primary',
                          fontWeight: isSelected ? 'bold' : 'normal',
                        }}
                      >
                        {sheetName}
                      </Typography>
                      {selectedTable && (
                          <Chip
                              label={isNewTable ? "Creating New Table" : "Mapping to Existing Table"}
                              size="small"
                              color={isNewTable ? "primary" : "default"}
                              variant="outlined"
                              sx={{ ml: 1 }}
                          />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{rowCount}</TableCell>
                  <TableCell>{headers.length}</TableCell>
                  <TableCell sx={{ minWidth: 350 }}> {/* Adjusted minWidth for TextField and Select */}
                    {isNewTable ? (
                      <Box display="flex" alignItems="flex-start" flexDirection="column" gap={1}>
                        <Box display="flex" alignItems="center" gap={1} width="100%">
                            <Chip icon={<AddIcon />} label="New Table:" size="small" color="success" variant="outlined" sx={{flexShrink: 0}} />
                            <TextField
                                fullWidth
                                variant="outlined"
                                size="small"
                                value={editableNewTableNames[sheetName] || ''}
                                onChange={(e) => handleNewTableNameChange(sheetName, e.target.value)}
                                onBlur={() => handleNewTableNameBlur(sheetName)}
                                disabled={isSkipped || isProcessing}
                                placeholder="Enter new table name"
                                sx={{ flexGrow: 1 }}
                            />
                        </Box>
                        <FormControl fullWidth size="small" sx={{ mt: 0 }}> {/* Select for switching off new table mode */}
                          <Select
                            value={'create_new_placeholder'} // Always show this when isNewTable is true
                            onChange={(e) => {
                              const value = e.target.value as string;
                               if (value !== 'create_new_placeholder') { // User selected an existing table or re-selected create new
                                onTableSelection(sheetName, value); 
                              }
                              // If they selected "Create New" again, onTableSelection would be called by its menu item
                            }}
                            displayEmpty
                            disabled={isSkipped || isProcessing}
                            renderValue={() => <em>Switch to existing table or re-select "Create New"</em>}
                          >
                            <MenuItem value="create_new_placeholder" disabled><em>Switch to existing table...</em></MenuItem>
                            {/* "Create New Table" option */}
                            <MenuItem value={`new:${toSqlFriendlyName(sheetName)}`}>
                                <Box display="flex" alignItems="center">
                                    <Chip icon={<AddIcon />} label="New" size="small" color="success" variant="outlined" sx={{ mr: 1 }} />
                                    Create New Table (from sheet name)
                                </Box>
                            </MenuItem>
                            <Divider />
                            {tableSuggestions?.filter(s => !s.isNewTableProposal).map(suggestion => (
                              <MenuItem key={`sugg-exist-${suggestion.tableName}`} value={suggestion.tableName}>
                                <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
                                  <Typography variant="body2">{suggestion.tableName}</Typography>
                                  {suggestion.confidenceScore && (
                                    <Box display="flex" alignItems="center">
                                      <Typography variant="caption" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                        ({Math.round(suggestion.confidenceScore * 100)}%)
                                      </Typography>
                                      <ConfidenceIcon level={suggestion.confidenceLevel} />
                                    </Box>
                                  )}
                                </Box>
                              </MenuItem>
                            ))}
                            {tables.filter(t => !tableSuggestions?.some(s => s.tableName === t && !s.isNewTableProposal)).length > 0 && <Divider />}
                            {tables.filter(t => !tableSuggestions?.some(s => s.tableName === t && !s.isNewTableProposal)).map(tableName => (
                              <MenuItem key={`exist-${tableName}`} value={tableName}>{tableName}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>
                    ) : (
                      <FormControl fullWidth size="small">
                        <Select
                          value={selectedTable ?? ''}
                          onChange={(e) => {
                            const value = e.target.value as string;
                            onTableSelection(sheetName, value); // Handles both new (e.g. "new:...") and existing
                          }}
                          displayEmpty
                          disabled={isSkipped || isProcessing}
                          renderValue={(selectedValue) => {
                            if (!selectedValue) return <em>Select or Create...</em>;
                            const currentSuggestion = tableSuggestions?.find(s => s.tableName === selectedValue);
                            if (currentSuggestion?.isNewTableProposal) {
                              return (
                                <Box display="flex" alignItems="center">
                                  <Chip icon={<AddIcon />} label="New Table" size="small" color="success" variant="outlined" sx={{ mr: 1 }} />
                                  {selectedValue.substring(4)} {/* Display actual name part */}
                                </Box>
                              );
                            }
                            return (
                                <Box display="flex" alignItems="center">
                                    {selectedValue}
                                    {currentSuggestion && <ConfidenceIcon level={currentSuggestion.confidenceLevel} />}
                                </Box>
                            );
                          }}
                          MenuProps={{ PaperProps: { style: { maxHeight: 300 }}}}
                        >
                          <MenuItem value="" disabled><em>Select or Create...</em></MenuItem>
                          {/* "Create New Table" option */}
                          <MenuItem value={`new:${toSqlFriendlyName(sheetName)}`}>

                              <Box display="flex" alignItems="center">
                                  <Chip icon={<AddIcon />} label="New" size="small" color="success" variant="outlined" sx={{ mr: 1 }} />
                                  Create New Table
                              </Box>
                          </MenuItem>
                          {tableSuggestions?.filter(s => !s.isNewTableProposal).length > 0 && <Divider />}
                          {tableSuggestions?.filter(s => !s.isNewTableProposal).map(suggestion => (
                            <MenuItem key={`sugg-${suggestion.tableName}`} value={suggestion.tableName}>
                              <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
                                <Typography variant="body2">{suggestion.tableName}</Typography>
                                {suggestion.confidenceScore && (
                                  <Box display="flex" alignItems="center">
                                    <Typography variant="caption" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                      ({Math.round(suggestion.confidenceScore * 100)}%)
                                    </Typography>
                                    <ConfidenceIcon level={suggestion.confidenceLevel} />
                                  </Box>
                                )}
                              </Box>
                            </MenuItem>
                          ))}
                          {tables.filter(t => !tableSuggestions?.some(s => s.tableName === t && !s.isNewTableProposal)).length > 0 && <Divider />}
                          {tables.filter(t => !tableSuggestions?.some(s => s.tableName === t && !s.isNewTableProposal)).map(tableName => (
                            <MenuItem key={`exist-${tableName}`} value={tableName}>{tableName}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <LinearProgress
                            variant="determinate"
                            value={mappingPercent}
                            sx={{ width: '60px', height: '8px', borderRadius: '4px' }}
                            color={
                                sheetReviewStatus === 'approved' ? 'success' :
                                sheetReviewStatus === 'rejected' ? 'error' :
                                sheetReviewStatus === 'partiallyApproved' ? 'info' :
                                mappingPercent > 0 ? 'primary' : 'inherit'
                            }
                        />
                        <Typography variant="caption" sx={{ minWidth: '35px' }}>{mappingPercent}%</Typography>
                        <ReviewStatusIcon status={sheetReviewStatus} />
                    </Box>
                  </TableCell>
                  <TableCell>
                    {isProcessing && status === 'analyzing' ? (
                      <Chip label="Analyzing..." size="small" />
                    ) : error ? (
                      <Tooltip title={error}><Chip label="Error" color="error" size="small" /></Tooltip>
                    ) : status === 'ready' ? (
                      <Chip icon={<CheckCircle />} label="Ready" color="success" size="small" variant="outlined" />
                    ) : status === 'needsReview' ? (
                         <Chip icon={<Warning />} label="Needs Review" color="warning" size="small" variant="outlined" />
                    ) : (
                      <Chip label={status} size="small" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={isSkipped ? "Include Sheet" : "Skip Sheet"}>
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => onSkipSheet(sheetName, !isSkipped)}
                          disabled={isProcessing} // Disable if any global processing is happening
                        >
                          {isSkipped ? <SkipNext color="action"/> : <DoNotDisturb color="action"/>}
                        </IconButton>
                      </span>
                    </Tooltip>
                    <IconButton size="small" onClick={() => handleExpandClick(sheetName)} disabled={isSkipped}>
                      {expandedRows[sheetName] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </TableCell>
                </TableRow>
                <TableRow key={`${sheetName}-details`}>
                  <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={9}>
                    <Collapse in={expandedRows[sheetName] && !isSkipped} timeout="auto" unmountOnExit>
                      <Box margin={1}>
                        <Typography variant="subtitle2" gutterBottom component="div">
                          Sample Data ({headers.length} columns)
                        </Typography>
                        {sampleData && sampleData.length > 0 ? (
                           <SampleDataTable sampleData={sampleData.slice(0, 5)} headers={headers} />
                        ) : (
                          <Typography variant="caption">No sample data available or sheet is empty.</Typography>
                        )}
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
