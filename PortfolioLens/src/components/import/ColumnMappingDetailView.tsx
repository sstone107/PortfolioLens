import React, { useState } from 'react';
import {
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Select,
  MenuItem,
  Chip,
  Typography,
  Tooltip,
  IconButton,
  Checkbox,
  Stack,
  Divider,
  LinearProgress,
  FormControl,
  InputLabel,
  Paper,
  TextField,
  Switch,
  FormControlLabel,
  Grid
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { SheetProcessingState, BatchColumnMapping, ColumnType } from './types';

// Helper function to get chip color based on confidence level
const getConfidenceChipProps = (confidenceLevel: 'High' | 'Medium' | 'Low' | undefined) => {
  switch (confidenceLevel) {
    case 'High':
      return { color: 'success' as const, icon: <CheckCircleIcon fontSize="small" />, text: 'High' };
    case 'Medium':
      return { color: 'warning' as const, icon: <InfoIcon fontSize="small" />, text: 'Medium' };
    case 'Low':
      return { color: 'error' as const, icon: <WarningIcon fontSize="small" />, text: 'Low' };
    default:
      return { color: 'default' as const, icon: <InfoIcon fontSize="small" />, text: 'Unknown' };
  }
};

// Helper function to get data type display
const getDataTypeDisplay = (type: ColumnType | null) => {
  switch (type) {
    case 'string':
      return 'Text';
    case 'number':
      return 'Number';
    case 'boolean':
      return 'Boolean';
    case 'date':
      return 'Date';
    default:
      return 'Unknown';
  }
};

interface ColumnMappingDetailViewProps {
  sheetState: SheetProcessingState;
  onViewColumnMapping: () => void;
}

export const ColumnMappingDetailView: React.FC<ColumnMappingDetailViewProps> = ({
  sheetState,
  onViewColumnMapping
}) => {
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filterConfidence, setFilterConfidence] = useState<string>('all');
  const [batchAction, setBatchAction] = useState<string>('');

  // Get column mappings as array for easier filtering and sorting
  const columnMappings = Object.entries(sheetState.columnMappings).map(
    ([headerKey, mapping]) => ({ header: headerKey, ...mapping })
  );

  // Filter columns based on confidence level
  const filteredColumns = columnMappings.filter(mapping => {
    if (filterConfidence === 'all') return true;
    
    const level = mapping.confidenceLevel || 'Low';
    return filterConfidence === level.toLowerCase();
  });

  // Count columns by confidence level
  const confidenceCounts = {
    high: columnMappings.filter(m => m.confidenceLevel === 'High').length,
    medium: columnMappings.filter(m => m.confidenceLevel === 'Medium').length,
    low: columnMappings.filter(m => m.confidenceLevel === 'Low').length,
    total: columnMappings.length
  };

  // Handle select all checkbox
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedColumns(filteredColumns.map(col => col.header));
    } else {
      setSelectedColumns([]);
    }
  };

  // Handle individual column selection
  const handleSelectColumn = (header: string, isChecked: boolean) => {
    if (isChecked) {
      setSelectedColumns([...selectedColumns, header]);
    } else {
      setSelectedColumns(selectedColumns.filter(h => h !== header));
    }
  };

  // Handle batch action
  const handleBatchAction = () => {
    if (!batchAction || selectedColumns.length === 0) return;
    
    // Here you would implement the batch action logic
    // For example, approving all selected columns or changing their action
    
    // Reset selection after action
    setSelectedColumns([]);
    setBatchAction('');
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Column Mapping for {sheetState.sheetName} 
          {sheetState.selectedTable && ` → ${sheetState.selectedTable}`}
        </Typography>
        
        <Stack direction="row" spacing={2}>
          <FormControl sx={{ minWidth: 150 }}>
            <InputLabel id="confidence-filter-label">Filter</InputLabel>
            <Select
              labelId="confidence-filter-label"
              value={filterConfidence}
              onChange={(e) => setFilterConfidence(e.target.value as string)}
              label="Filter"
              size="small"
            >
              <MenuItem value="all">All Columns ({confidenceCounts.total})</MenuItem>
              <MenuItem value="high">High Confidence ({confidenceCounts.high})</MenuItem>
              <MenuItem value="medium">Medium Confidence ({confidenceCounts.medium})</MenuItem>
              <MenuItem value="low">Low Confidence ({confidenceCounts.low})</MenuItem>
            </Select>
          </FormControl>
          
          {selectedColumns.length > 0 && (
            <>
              <FormControl sx={{ minWidth: 150 }}>
                <InputLabel id="batch-action-label">Batch Action</InputLabel>
                <Select
                  labelId="batch-action-label"
                  value={batchAction}
                  onChange={(e) => setBatchAction(e.target.value as string)}
                  label="Batch Action"
                  size="small"
                >
                  <MenuItem value="approve">Approve Mappings</MenuItem>
                  <MenuItem value="skip">Skip Columns</MenuItem>
                  <MenuItem value="create">Create New Fields</MenuItem>
                </Select>
              </FormControl>
              
              <Button 
                variant="contained" 
                color="primary" 
                disabled={!batchAction}
                onClick={handleBatchAction}
              >
                Apply to {selectedColumns.length} Selected
              </Button>
            </>
          )}
        </Stack>
      </Box>

      <Paper variant="outlined" sx={{ width: '100%', mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell padding="checkbox">
                <Checkbox 
                  checked={selectedColumns.length === filteredColumns.length && filteredColumns.length > 0}
                  indeterminate={selectedColumns.length > 0 && selectedColumns.length < filteredColumns.length}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell>Excel Column</TableCell>
              <TableCell>Sample Value</TableCell>
              <TableCell>Data Type</TableCell>
              <TableCell>Mapped To</TableCell>
              <TableCell>Confidence</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredColumns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 2 }}>
                  <Typography variant="body2">No columns found matching the selected filter.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredColumns.map((column) => {
                const confidenceProps = getConfidenceChipProps(column.confidenceLevel);
                
                return (
                  <TableRow key={column.header} hover>
                    <TableCell padding="checkbox">
                      <Checkbox 
                        checked={selectedColumns.includes(column.header)}
                        onChange={(e) => handleSelectColumn(column.header, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 'medium' }}>{column.header}</TableCell>
                    <TableCell>
                      <Tooltip title={String(column.sampleValue)}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                          {String(column.sampleValue)}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {getDataTypeDisplay(column.inferredDataType)}
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" sx={{ minWidth: 180 }}>
                        <Select 
                          value={column.mappedColumn || ''}
                          onChange={(e) => {
                            // Handle column mapping change
                            // This would update the state in a real implementation
                          }}
                          displayEmpty
                        >
                          <MenuItem value="" disabled>Select field...</MenuItem>
                          {column.suggestedColumns.map((suggestion) => (
                            <MenuItem 
                              key={suggestion.columnName} 
                              value={suggestion.columnName}
                            >
                              {suggestion.columnName}
                              {suggestion.similarityScore > 0.5 ? 
                                ` (${Math.round(suggestion.similarityScore * 100)}% match)` : ''}
                            </MenuItem>
                          ))}
                          <Divider />
                          <MenuItem value="__new__">
                            <AddIcon fontSize="small" sx={{ mr: 1 }} />
                            Create New Field
                          </MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        color={confidenceProps.color}
                        icon={confidenceProps.icon}
                        label={confidenceProps.text}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        color={
                          column.action === 'map' ? 'primary' :
                          column.action === 'create' ? 'success' :
                          'default'
                        }
                        label={column.action.toUpperCase()}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        color={
                          column.status === 'suggested' ? 'info' :
                          column.status === 'userModified' ? 'success' :
                          column.status === 'error' ? 'error' : 'default'
                        }
                        label={column.status}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button 
          variant="contained" 
          color="primary"
          onClick={onViewColumnMapping}
        >
          Apply Mappings
        </Button>
      </Box>
    </Box>
  );
};