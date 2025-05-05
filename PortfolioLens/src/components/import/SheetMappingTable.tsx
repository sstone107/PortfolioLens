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
  Divider,
  Collapse, // Added for sample data
  TableSortLabel, // Added for sorting
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
  Add as AddIcon, // Added for create indicator
  ThumbUpAlt, // High confidence
  HelpOutline, // Medium confidence
  ErrorOutline, // Low confidence
  PlaylistAddCheck, // Approved
  EditNotifications, // Modified
  ReportProblem, // Rejected
  HourglassEmpty, // Pending review
} from '@mui/icons-material';
import { SheetProcessingState, RankedTableSuggestion, ConfidenceLevel, SheetReviewStatus } from './types'; // Updated types
import SampleDataTable from './SampleDataTable'; // Import the new component

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
        case 'partiallyApproved': // Or 'modified' if that's the state used
        case 'modified': return <EditNotifications fontSize="small" color="info" sx={{ verticalAlign: 'middle' }} />;
        case 'pending':
        default: return <HourglassEmpty fontSize="small" color="disabled" sx={{ verticalAlign: 'middle' }} />;
    }
};


// Define the props based on the parent component (BatchImporter) passing store state
interface SheetMappingTableProps {
  sheets: { [sheetName: string]: SheetProcessingState };
  tables: string[]; // List of existing table names
  localSelectedSheets: Record<string, boolean>; // UI state for selection
  localSkippedSheets: Record<string, boolean>; // UI state for skipping
  onSheetSelectionToggle: (sheetName: string) => void;
  onTableSelection: (sheetName: string, tableName: string | null) => void; // Allow null for reset
  onSelectAll: (selected: boolean) => void;
  onSkipSheet: (sheetName: string, skipped: boolean) => void;
  isProcessing: boolean; // Global processing state (e.g., worker running)
}

/**
 * Table component for mapping Excel sheets to database tables, integrated with Zustand store state.
 */
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

  const handleExpandClick = (sheetName: string) => {
    setExpandedRows(prev => ({ ...prev, [sheetName]: !prev[sheetName] }));
  };

  // Sorting logic
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

      // Basic comparison, can be enhanced for different types
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
      // Find the top *existing* table suggestion
      const topExistingSuggestion = sheetState.tableSuggestions?.find(s => !s.isNewTableProposal);

      if (topExistingSuggestion && topExistingSuggestion.confidenceLevel === 'High' &&
          !localSkippedSheets[sheetName] &&
          !sheetState.selectedTable) { // Only approve if not already mapped
        // Select the sheet if not already selected
        if (!localSelectedSheets[sheetName]) {
            onSheetSelectionToggle(sheetName);
        }
        // Apply the high confidence table mapping
        onTableSelection(sheetName, topExistingSuggestion.tableName);
      }
    });
};


  // Check if all or some sheets are selected (considering only non-skipped sheets)
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
            if (!sheetState) return null; // Should not happen if sortedSheetNames is derived from sheets

            const { headers, sampleData, rowCount, selectedTable, tableSuggestions, columnMappings, status, error, sheetReviewStatus } = sheetState; // Added sheetReviewStatus
            const isSkipped = localSkippedSheets[sheetName];
            const isSelected = localSelectedSheets[sheetName];

            // Determine if the selected table is a new proposal
            const selectedSuggestion = tableSuggestions?.find(s => s.tableName === selectedTable);
            const isCreating = selectedSuggestion?.isNewTableProposal ?? false;
            // const actualTableName = isCreating ? selectedTable : selectedTable; // No need to substring if using suggestion

            const mapping = columnMappings || {};
            const mappedColumns = Object.values(mapping).filter(m => m.mappedColumn || m.action === 'create').length;
            const mappingPercent = headers.length > 0 ? Math.round((mappedColumns / headers.length) * 100) : 0;

            // const topSuggestion = tableSuggestions?.[0]; // Not directly used here anymore

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
                              label={isCreating ? "Creating New Table" : "Mapping to Existing Table"}
                              size="small"
                              color={isCreating ? "primary" : "default"}
                              variant="outlined"
                              sx={{ ml: 1 }}
                          />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{rowCount}</TableCell>
                  <TableCell>{headers.length}</TableCell>
                  <TableCell sx={{ minWidth: 300 }}> {/* Increased minWidth */}
                    <FormControl fullWidth size="small">
                      <Select
                        value={selectedTable ?? ''}
                        onChange={(e) => onTableSelection(sheetName, e.target.value as string)}
                        displayEmpty
                        disabled={isSkipped || isProcessing}
                        renderValue={(selectedValue) => {
                          if (!selectedValue) return <em>Select or Create...</em>;

                          // Find the suggestion corresponding to the selected value
                          const selectedSuggestion = tableSuggestions?.find(s => s.tableName === selectedValue);

                          // Handle rendering for new table proposals
                          if (selectedSuggestion?.isNewTableProposal) {
                            return (
                              <Box display="flex" alignItems="center">
                                <Chip icon={<AddIcon />} label="New Table" size="small" color="success" variant="outlined" sx={{ mr: 1 }} />
                                {selectedValue} {/* Display proposed name */}
                              </Box>
                            );
                          }
                          // Handle rendering for existing tables
                          return (
                              <Box display="flex" alignItems="center">
                                  {selectedValue}
                                  {/* Show confidence of the *selected* mapping */}
                                  {selectedSuggestion && <ConfidenceIcon level={selectedSuggestion.confidenceLevel} />}
                              </Box>
                          );
                        }}
                        MenuProps={{
                          PaperProps: {
                            style: {
                              maxHeight: 300,
                            },
                          },
                        }}
                      >
                        <MenuItem value="" disabled><em>Select or Create...</em></MenuItem>
                        {/* Suggestions */}
                        {tableSuggestions && tableSuggestions.length > 0 && (
                          <MenuItem key="suggestion-header" disabled sx={{ fontStyle: 'italic', fontWeight: 'bold' }}>Suggestions:</MenuItem>
                        )}
                        {tableSuggestions?.map(suggestion => (
                          <MenuItem key={`sugg-${suggestion.tableName}`} value={suggestion.tableName}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
                              <Box display="flex" alignItems="center">
                                {suggestion.isNewTableProposal && <Chip icon={<AddIcon />} label="New" size="small" color="success" variant="outlined" sx={{ mr: 1 }} />}
                                <Typography variant="body2">{suggestion.tableName}</Typography>
                              </Box>
                              {/* Show confidence for the suggestion in the list */}
                              {!suggestion.isNewTableProposal && (
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
                        {tableSuggestions && tableSuggestions.length > 0 && <Divider />}
                        {/* All Existing Tables */}
                        <MenuItem key="all-tables-header" disabled sx={{ fontStyle: 'italic', fontWeight: 'bold' }}>All Existing Tables:</MenuItem>
                        {tables
                          .filter(t => !tableSuggestions?.some(s => s.tableName === t && !s.isNewTableProposal)) // Exclude existing suggestions
                          .sort()
                          .map(table => (
                            <MenuItem key={table} value={table}>{table}</MenuItem>
                          ))}
                        {/* Create New Table Option (if not already suggested) */}
                        {!tableSuggestions?.some(s => s.isNewTableProposal) && (
                            <>
                              <Divider />
                              <MenuItem value="create-new-table" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                <AddIcon fontSize="small" sx={{ mr: 1 }}/> Create New Table...
                              </MenuItem>
                            </>
                        )}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    {selectedTable ? (
                      <Tooltip title={`${mappedColumns} of ${headers.length} columns mapped`}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <LinearProgress
                            variant="determinate"
                            value={mappingPercent}
                            color={mappingPercent === 100 ? 'success' : 'primary'}
                            sx={{ flexGrow: 1, mr: 1, height: 8, borderRadius: 4 }}
                          />
                          <Typography variant="body2">{mappingPercent}%</Typography>
                        </Box>
                      </Tooltip>
                    ) : (
                      <Typography variant="body2" color="text.secondary">N/A</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                      {/* Display Sheet Processing Status */}
                      <Tooltip title={`Processing: ${status}`}>
                          <Chip
                              label={status}
                              size="small"
                              color={
                                  status === 'committed' ? 'success' :
                                  status === 'error' ? 'error' :
                                  status === 'needsReview' ? 'warning' :
                                  status === 'analyzing' || status === 'processing' || status === 'committing' ? 'info' : // Added analyzing
                                  'default'
                              }
                              icon={
                                  status === 'committed' ? <CheckCircle /> :
                                  status === 'error' ? <Warning /> :
                                  undefined
                              }
                              variant="outlined"
                          />
                      </Tooltip>
                      {/* Display Sheet Review Status */}
                      <Tooltip title={`Review: ${sheetReviewStatus || 'pending'}`}>
                          <IconButton size="small" sx={{ ml: 0.5 }}>
                              <ReviewStatusIcon status={sheetReviewStatus} />
                          </IconButton>
                      </Tooltip>
                      {error && <Tooltip title={error}><Warning color="error" fontSize="small" sx={{ ml: 0.5, verticalAlign: 'middle' }}/></Tooltip>}
                  </TableCell>
                   <TableCell align="right">
                     <Tooltip title={isSkipped ? "Include this sheet" : "Skip this sheet"}>
                       <IconButton size="small" onClick={() => onSkipSheet(sheetName, !isSkipped)}>
                         {isSkipped ? <SkipNext /> : <DoNotDisturb />}
                       </IconButton>
                     </Tooltip>
                     <Tooltip title={expandedRows[sheetName] ? "Hide Sample Data" : "Show Sample Data"}>
                       <IconButton size="small" onClick={() => handleExpandClick(sheetName)}>
                         {expandedRows[sheetName] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                       </IconButton>
                     </Tooltip>
                   </TableCell>
                </TableRow>
                {/* Collapsible Row for Sample Data */}
                <TableRow key={`${sheetName}-collapse`}>
                   <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
                     <Collapse in={expandedRows[sheetName]} timeout="auto" unmountOnExit>
                       <Box sx={{ margin: 1, padding: 1, backgroundColor: 'grey.100', borderRadius: 1 }}>
                         <Typography variant="caption" gutterBottom component="div">
                           Sample Data (First 5 Rows):
                         </Typography>
                        <SampleDataTable sampleData={sampleData} />
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
