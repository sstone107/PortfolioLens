import React from 'react';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  FormControl,
  Select,
  MenuItem,
  Divider,
  Paper,
  Chip,
  Tooltip,
  Typography,
  Box,
  IconButton,
} from '@mui/material';
// Import necessary icons and types
import { Warning, Add as AddIcon, CheckCircle, ErrorOutline, HelpOutline, Edit as EditIcon, RemoveCircleOutline as RemoveCircleOutlineIcon } from '@mui/icons-material';
import {
    ColumnType,
    TableColumn as TableColumnType,
    SheetProcessingState,
    BatchColumnMapping,
    RankedColumnSuggestion,
    ConfidenceLevel, // Added
    ReviewStatus // Added
} from './types';
// Removed ColumnMappingSuggestions import

interface ColumnMappingTableViewProps {
  excelHeaders: string[];
  mappings: Record<string, BatchColumnMapping>; // Expect full mapping
  targetColumns: TableColumnType[];
  sheetState: SheetProcessingState | null; // Keep for context if needed, but suggestions come from mappings
  isCreatingTable: boolean;
  getColumnSample: (columnName: string) => string;
  onMappingUpdate: (excelCol: string, changes: Partial<BatchColumnMapping>) => void; // New update handler
  // columnSuggestions: Record<string, ColumnMappingSuggestions | undefined>; // REMOVED
}

// Helper for confidence icons (can be shared or defined locally)
const ConfidenceIcon = ({ level }: { level?: ConfidenceLevel }) => {
    switch (level) {
        case 'High': return <CheckCircle fontSize="inherit" color="success" sx={{ ml: 0.5, verticalAlign: 'middle' }} />;
        case 'Medium': return <HelpOutline fontSize="inherit" color="warning" sx={{ ml: 0.5, verticalAlign: 'middle' }} />;
        case 'Low': return <ErrorOutline fontSize="inherit" color="error" sx={{ ml: 0.5, verticalAlign: 'middle' }} />;
        default: return null;
    }
};


export const ColumnMappingTableView: React.FC<ColumnMappingTableViewProps> = ({
  excelHeaders,
  mappings,
  targetColumns,
  sheetState,
  isCreatingTable,
  getColumnSample,
  onMappingUpdate, // Use new handler
  // columnSuggestions, // REMOVED
}) => {
  // Available data types for manual selection
  const availableDataTypes: ColumnType[] = ['string', 'number', 'boolean', 'date'];
  return (
    <Paper variant="outlined" sx={{ bgcolor: 'background.paper' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell width="25%"><strong>Excel Column</strong></TableCell>
            <TableCell width="30%"><strong>Sample Data</strong></TableCell>
            <TableCell width="30%"><strong>Database Column</strong></TableCell>
            <TableCell width="15%"><strong>Data Type</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {excelHeaders.map(excelCol => {
            // Get the full mapping object, provide a default if somehow missing
            const mapping: BatchColumnMapping = mappings[excelCol] || ({
                header: excelCol,
                action: 'skip',
                status: 'pending',
                reviewStatus: 'pending',
                mappedColumn: null,
                suggestedColumns: [],
                inferredDataType: null,
                sampleValue: null,
                confidenceScore: 0,
                confidenceLevel: 'Low',
            } as BatchColumnMapping);
            const suggestions = mapping.suggestedColumns || [];

            return (
            <TableRow key={excelCol}>
              <TableCell>
                <Tooltip title={excelCol}>
                  <Typography
                    variant="body2"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '180px'
                    }}
                  >
                    {excelCol}
                  </Typography>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip title={getColumnSample(excelCol)}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      fontStyle: 'italic',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '300px'
                    }}
                  >
                    {getColumnSample(excelCol)}
                  </Typography>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Box display="flex" alignItems="center" width="100%">
                  <FormControl sx={{ flex: '1 1 auto' }} size="small">
                    <Select
                      // Determine value based on action and mappedColumn from the full mapping object
                      value={
                          mapping.action === 'create' ? 'create-new-column' :
                          mapping.action === 'map' ? mapping.mappedColumn || '' :
                          mapping.action === 'skip' ? 'skip-column' : '' // Explicit 'skip-column' value
                      }
                      onChange={(e) => {
                          const selectedValue = e.target.value as string;
                          if (selectedValue === 'create-new-column') {
                              // For 'create-new-column', we need to pass a special flag to trigger the dialog
                              onMappingUpdate(excelCol, {
                                  action: 'create',
                                  openDialog: true // Add this flag to signal that the dialog should be opened
                              });
                          } else if (selectedValue === 'skip-column') { // Explicit skip action
                              onMappingUpdate(excelCol, { 
                                  action: 'skip', 
                                  mappedColumn: null, 
                                  newColumnProposal: undefined,
                                  reviewStatus: 'approved' // Mark as reviewed since it's explicitly skipped
                              });
                          } else if (!selectedValue) { // Empty value means skip (default)
                              onMappingUpdate(excelCol, { action: 'skip', mappedColumn: null, newColumnProposal: undefined });
                          } else { // Map to existing column
                              onMappingUpdate(excelCol, { 
                                  action: 'map', 
                                  mappedColumn: selectedValue, 
                                  newColumnProposal: undefined,
                                  reviewStatus: 'approved' // Mark as reviewed since it's explicitly mapped
                              });
                          }
                      }}
                      displayEmpty
                      sx={{
                        maxWidth: '300px',
                        '& .MuiSelect-select': {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }
                      }}
                      renderValue={(selectedValue) => {
                        if (mapping.action === 'skip' || selectedValue === 'skip-column' || !selectedValue) {
                          // Consistent styling for skipped columns
                          return <em style={{ color: '#888' }}>✕ Skipped Column</em>;
                        }
                        if (mapping.action === 'create') {
                          // Show the field name if available
                          const fieldName = mapping.newColumnProposal?.columnName || 
                                           mapping.mappedColumn || 
                                           'New Field';
                          return <span style={{ color: '#2196f3', fontWeight: 'bold' }}>✨ Create: {fieldName}</span>;
                        }
                        // For mapped columns, show the selected DB column name
                        return <span style={{ color: '#00796b' }}>{selectedValue}</span>;
                      }}
                    >
                      <MenuItem key={`${excelCol}-skip`} value="skip-column" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                        <RemoveCircleOutlineIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }}/> Skip This Column
                      </MenuItem>
                      <MenuItem key={`${excelCol}-create`} value="create-new-column" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                        <AddIcon fontSize="small" sx={{ mr: 1, color: 'primary.main' }}/> Create New Field...
                      </MenuItem>
                      <Divider key={`${excelCol}-div1`} />
                      {/* Suggestions from mapping object */}
                      {suggestions.length > 0 && (
                          <MenuItem key={`${excelCol}-suggestion-header`} disabled sx={{ fontStyle: 'italic', fontWeight:'bold' }}>
                            <Typography variant="body2">Suggestions:</Typography>
                          </MenuItem>
                      )}
                      {suggestions.map((suggestion) => (
                        <MenuItem key={`${excelCol}-sugg-${suggestion.columnName}`} value={suggestion.columnName}> {/* Made key more unique */}
                          <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
                             <Typography variant="body2">{suggestion.columnName}</Typography>
                             <Box display="flex" alignItems="center">
                                 <Typography variant="caption" sx={{
                                     fontStyle: 'italic',
                                     fontWeight: suggestion.confidenceScore > 0.8 ? 'bold' : 'normal',
                                     color: suggestion.confidenceScore > 0.8 ? 'success.main' : 
                                            suggestion.confidenceScore > 0.5 ? 'text.primary' : 'text.secondary',
                                     bgcolor: suggestion.confidenceScore > 0.8 ? 'success.50' : 'transparent',
                                     px: suggestion.confidenceScore > 0.8 ? 0.5 : 0,
                                     borderRadius: '4px'
                                 }}>
                                     Match: {Math.round(suggestion.confidenceScore * 100)}%
                                 </Typography>
                                <ConfidenceIcon level={suggestion.confidenceLevel} />
                                {!suggestion.isTypeCompatible && <Tooltip title="Potential type mismatch"><Warning fontSize="small" color="warning" sx={{ ml: 0.5 }} /></Tooltip>}
                             </Box>
                          </Box>
                        </MenuItem>
                      ))}
                      {suggestions.length > 0 && <Divider key={`${excelCol}-div2`} />}
                      {/* Existing DB Columns (if not creating table) */}
                      {!isCreatingTable && targetColumns.length > 0 && (
                          <MenuItem key={`${excelCol}-existing-header`} disabled sx={{ fontStyle: 'italic', fontWeight:'bold' }}>
                            <Typography variant="body2">Existing Columns:</Typography>
                          </MenuItem>
                      )}
                      {!isCreatingTable && targetColumns
                          .filter(col => !suggestions.some(s => s.columnName === col.columnName)) // Exclude suggestions
                          .map((col: TableColumnType) => (
                              <MenuItem key={`${excelCol}-existing-${col.columnName}`} value={col.columnName}> {/* Made key more unique */}
                                  {col.columnName} ({col.dataType})
                              </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </TableCell>
              {/* Data Type Cell - Now editable */}
              <TableCell>
                <Box display="flex" alignItems="center">
                  <FormControl size="small">
                    <Select
                      value={mapping.inferredDataType || 'string'}
                      onChange={(e) => {
                        const newType = e.target.value as ColumnType;
                        
                        // Create the update object
                        const updateObj: Partial<BatchColumnMapping> = {
                          inferredDataType: newType
                        };
                        
                        // If creating a new column, update the SQL type too
                        if (mapping.action === 'create' && mapping.newColumnProposal) {
                          updateObj.newColumnProposal = {
                            ...mapping.newColumnProposal,
                            sqlType: newType === 'string' ? 'TEXT' :
                                    newType === 'number' ? 'NUMERIC' :
                                    newType === 'boolean' ? 'BOOLEAN' :
                                    newType === 'date' ? 'TIMESTAMP WITH TIME ZONE' : 'TEXT'
                          };
                        }
                        
                        onMappingUpdate(excelCol, updateObj);
                      }}
                      size="small"
                      sx={{
                        minWidth: 100,
                        '& .MuiSelect-select': {
                          color: 'text.primary'
                        }
                      }}
                    >
                      {availableDataTypes.map(type => (
                        <MenuItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </TableCell>
            </TableRow>
          )})}
        </TableBody>
      </Table>
    </Paper>
  );
};