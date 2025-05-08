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
  // Debug logging removed
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
          {/* Log the excelHeaders array for debugging */}
          {console.log('[DEBUG ColumnMappingTableView] excelHeaders:', excelHeaders, 'mappings keys:', Object.keys(mappings))}
          
          {/* First render a message if there are no headers at all */}
          {excelHeaders.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} align="center">
                {isCreatingTable ? (
                  <Box sx={{ py: 2 }}>
                    <Typography variant="body2" sx={{ color: 'info.main', fontWeight: 'medium' }}>
                      This is an empty sheet with no data or headers.
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                      Default columns will be created automatically. You can modify them below or add more columns as needed.
                    </Typography>
                    <Button 
                      variant="outlined" 
                      color="primary" 
                      size="small"
                      sx={{ mt: 2 }}
                      onClick={() => {
                        // Force refresh default columns
                        const defaultHeaders = ['id', 'name', 'description', 'created_date', 'status'];
                        defaultHeaders.forEach(header => {
                          // Create a default mapping for this header
                          onMappingUpdate(header, {
                            header: header,
                            action: 'create',
                            mappedColumn: header,
                            inferredDataType: header.includes('date') ? 'date' : 
                                             header === 'id' ? 'number' : 'string',
                            reviewStatus: 'pending',
                            status: 'pending',
                          });
                        });
                      }}
                    >
                      Create Default Columns
                    </Button>
                  </Box>
                ) : (
                  <Typography variant="body2" sx={{ py: 2, color: 'text.secondary' }}>
                    No columns found in this sheet. Please check that the sheet contains headers.
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          )}
          
          {/* Then map over all available headers */}
          {excelHeaders.map(excelCol => {
            // Get the full mapping object, provide a default if somehow missing
            const mapping: BatchColumnMapping = mappings[excelCol] || ({
                header: excelCol,
                action: isCreatingTable ? 'create' : 'skip', // Default to create for new tables
                status: 'pending',
                reviewStatus: 'pending',
                mappedColumn: isCreatingTable ? excelCol.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_') : null,
                suggestedColumns: [],
                inferredDataType: 'string', // Default type
                sampleValue: '',
                confidenceScore: isCreatingTable ? 1.0 : 0,
                confidenceLevel: isCreatingTable ? 'High' : 'Low',
                // Add newColumnProposal for create action
                newColumnProposal: isCreatingTable ? {
                  type: 'new_column' as const,
                  details: {
                    columnName: excelCol.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_'),
                    sqlType: 'TEXT', // Default
                    isNullable: true,
                    sourceSheet: sheetState?.sheetName || '',
                    sourceHeader: excelCol
                  }
                } : undefined
            } as BatchColumnMapping);
            
            // Log if mapping is missing unexpectedly
            if (!mappings[excelCol]) {
              console.log(`[DEBUG] Missing mapping for column ${excelCol}, using default`);
            }
            
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
                      // FIXED: Don't default to skip without an explicit 'skip' action, to prevent resetting
                      value={
                          mapping.action === 'create' ? 'create-new-column' :
                          mapping.action === 'map' && mapping.mappedColumn ? mapping.mappedColumn :
                          mapping.action === 'skip' ? 'skip-column' : 
                          // If no action or mappedColumn but inferredDataType exists, keep it mappable
                          (mapping.inferredDataType && !mapping.action && !mapping.mappedColumn) ? 'create-new-column' :
                          // Last fallback
                          '' 
                      }
                      // Add a key to force re-render when the mapping changes
                      key={`select-${excelCol}-${mapping.action}-${mapping.mappedColumn || 'none'}`}
                      onChange={(e) => {
                          try {
                              // Add explicit type safety and avoid potential issues with null/undefined
                              const selectedValue = e.target.value !== null && e.target.value !== undefined ? 
                                  String(e.target.value) : '';
                              
                              console.log(`[DEBUG] Column mapping changed for ${excelCol} to: ${selectedValue}`);
                              
                              if (selectedValue === 'create-new-column') {
                                  // For 'create-new-column', set the correct action first
                                  // We'll trigger the dialog separately in the parent component
                                  onMappingUpdate(excelCol, {
                                      action: 'create'
                                  });
                                  
                                  // Signal to parent component to open dialog via console
                                  console.log('[ColumnMappingTableView] Create new column requested for:', excelCol);
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
                          } catch (err) {
                              console.error(`[ERROR] Failed to update mapping for ${excelCol}:`, err);
                          }
                      }}
                      disabled={false} // Never disable the select to ensure it's always interactive
                      MenuProps={{
                        // Ensure menu appears above other elements
                        elevation: 3,
                        // Improve positioning to avoid cutoff
                        anchorOrigin: {
                          vertical: 'bottom',
                          horizontal: 'left',
                        },
                        transformOrigin: {
                          vertical: 'top',
                          horizontal: 'left',
                        },
                        // Add explicit styles to ensure the menu appears above other elements
                        PaperProps: {
                          style: {
                            zIndex: 9999,
                            maxHeight: '300px'
                          }
                        }
                      }}  
                      displayEmpty
                      sx={{
                        maxWidth: '300px',
                        // Add higher z-index for better selection
                        zIndex: 100,
                        position: 'relative',
                        '& .MuiSelect-select': {
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        },
                        // Improve dropdown visibility
                        '&.Mui-focused': {
                          zIndex: 9999
                        }
                      }}
                      renderValue={(selectedValue) => {
                        
                        if (mapping.action === 'skip' || selectedValue === 'skip-column' || !selectedValue) {
                          // Consistent styling for skipped columns
                          return <em style={{ color: '#888' }}>✕ Skip this field</em>;
                        }
                        if (mapping.action === 'create') {
                          // Show the field name if available, accessing through details object
                          const fieldName = mapping.newColumnProposal?.details?.columnName || 
                                            mapping.mappedColumn || 
                                            'New Field';
                          return <span style={{ color: '#2196f3', fontWeight: 'bold' }}>✨ Create: {fieldName}</span>;
                        }
                        // For mapped columns, show the selected DB column name
                        return <span style={{ color: '#00796b' }}>{String(selectedValue)}</span>;
                      }}
                    >
                      <MenuItem key={`${excelCol}-skip`} value="skip-column" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                        <RemoveCircleOutlineIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }}/> Skip This Field
                      </MenuItem>
                      <MenuItem key={`${excelCol}-create`} value="create-new-column" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                        <AddIcon fontSize="small" sx={{ mr: 1, color: 'primary.main' }}/> Create New Field...
                      </MenuItem>
                      <Divider key={`${excelCol}-div1`} />
                      
                      {/* Suggestions from mapping object */}
                      {mapping.suggestedColumns && mapping.suggestedColumns.length > 0 && (
                          <MenuItem key={`${excelCol}-suggestion-header`} disabled sx={{ fontStyle: 'italic', fontWeight:'bold' }}>
                            <Typography variant="body2">Suggestions:</Typography>
                          </MenuItem>
                      )}
                      {mapping.suggestedColumns && mapping.suggestedColumns.map((suggestion) => (
                        <MenuItem 
                          key={`${excelCol}-sugg-${suggestion.columnName}`} 
                          value={suggestion.columnName}
                          sx={{
                            bgcolor: suggestion.confidenceScore > 0.8 ? 'rgba(76, 175, 80, 0.05)' : 'transparent',
                            '&:hover': {
                              bgcolor: suggestion.confidenceScore > 0.8 ? 'rgba(76, 175, 80, 0.1)' : undefined
                            }
                          }}
                        >
                          <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
                             <Typography variant="body2">
                               {suggestion.confidenceScore > 0.8 && '✓ '}
                               {suggestion.columnName}
                             </Typography>
                             <Box display="flex" alignItems="center">
                                 <Chip
                                   size="small"
                                   label={suggestion.confidenceScore ? 
                                     `Match: ${Math.round(suggestion.confidenceScore * 100)}%` : 
                                     'No match score'}
                                   color={suggestion.confidenceScore > 0.8 ? 'success' : 
                                         suggestion.confidenceScore > 0.5 ? 'primary' : 'default'}
                                   variant={suggestion.confidenceScore > 0.7 ? 'filled' : 'outlined'}
                                   sx={{ 
                                     fontSize: '0.7rem',
                                     height: '20px',
                                     mr: 0.5
                                   }}
                                 />
                                <ConfidenceIcon level={suggestion.confidenceLevel} />
                                {!suggestion.isTypeCompatible && <Tooltip title="Potential type mismatch"><Warning fontSize="small" color="warning" sx={{ ml: 0.5 }} /></Tooltip>}
                             </Box>
                          </Box>
                        </MenuItem>
                      ))}
                      {mapping.suggestedColumns && mapping.suggestedColumns.length > 0 && <Divider key={`${excelCol}-div2`} />}
                      
                      {/* Existing DB Columns (if not creating table) */}
                      {!isCreatingTable && targetColumns.length > 0 && (
                          <MenuItem key={`${excelCol}-existing-header`} disabled sx={{ fontStyle: 'italic', fontWeight:'bold' }}>
                            <Typography variant="body2">Existing Columns:</Typography>
                          </MenuItem>
                      )}
                      {!isCreatingTable && targetColumns
                          .filter(col => !mapping.suggestedColumns?.some(s => s.columnName === col.columnName)) // Exclude suggestions
                          .map((col: TableColumnType) => (
                              <MenuItem key={`${excelCol}-existing-${col.columnName}`} value={col.columnName}>
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
                  <FormControl fullWidth variant="outlined" size="small" style={{ width: '100%' }}>
                    <Select
                      value={mapping.inferredDataType || 'string'}
                      MenuProps={{
                        anchorOrigin: {
                          vertical: 'bottom',
                          horizontal: 'left',
                        },
                        transformOrigin: {
                          vertical: 'top',
                          horizontal: 'left',
                        },
                        PaperProps: {
                          style: {
                            zIndex: 9999,
                            maxHeight: '300px'
                          }
                        }
                      }}
                      onChange={(e) => {
                        const newType = e.target.value as ColumnType;
                        
                        console.log(`[DEBUG TypeChange] Changing type for ${excelCol} from ${mapping.inferredDataType} to ${newType}`);
                        
                        // Create the update object
                        const updateObj: Partial<BatchColumnMapping> = {
                          inferredDataType: newType
                        };
                        
                        // If creating a new column, update the SQL type too
                        if (mapping.action === 'create' && mapping.newColumnProposal) {
                          // Import the mapColumnTypeToSql helper
                          const mapTypeToSql = (type: ColumnType): string => {
                            switch (type) {
                              case 'string': return 'TEXT';
                              case 'number': return 'NUMERIC';
                              case 'boolean': return 'BOOLEAN';
                              case 'date': return 'TIMESTAMP WITH TIME ZONE';
                              default: return 'TEXT';
                            }
                          };
                          
                          // Create a proper new column proposal with the details object
                          updateObj.newColumnProposal = {
                            ...mapping.newColumnProposal,
                            details: {
                              ...mapping.newColumnProposal.details,
                              sqlType: mapTypeToSql(newType)
                            }
                          };
                          
                        }
                        
                        // Update status to indicate user change
                        updateObj.status = 'userModified';
                        updateObj.reviewStatus = 'approved';
                        
                        onMappingUpdate(excelCol, updateObj);
                      }}
                      key={`select-${excelCol}-${mapping.inferredDataType || 'string'}-${Date.now()}`}
                      disabled={false} // Always enable the select
                      size="small"
                      sx={{
                        minWidth: 100,
                        '& .MuiSelect-select': {
                          color: 'text.primary'
                        },
                        '&.Mui-focused': {
                          zIndex: 9999
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