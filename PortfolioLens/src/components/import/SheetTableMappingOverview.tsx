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
  Modal,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  Stack,
  Divider,
  LinearProgress,
  FormControl,
  InputLabel,
  Paper
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import EditIcon from '@mui/icons-material/Edit';
import { SheetProcessingState, RankedTableSuggestion } from './types';
import { ColumnMappingDetailView } from './ColumnMappingDetailView';

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

interface SheetTableMappingOverviewProps {
  sheets: { [sheetName: string]: SheetProcessingState };
  onTableSelect: (sheetName: string, tableName: string) => void;
  onBatchApprove: (sheetNames: string[]) => void;
  onViewColumnMapping: (sheetName: string) => void;
}

export const SheetTableMappingOverview: React.FC<SheetTableMappingOverviewProps> = ({
  sheets,
  onTableSelect,
  onBatchApprove,
  onViewColumnMapping
}) => {
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [filterConfidence, setFilterConfidence] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentSheet, setCurrentSheet] = useState<string | null>(null);

  // Filter sheets based on confidence level
  const filteredSheets = Object.entries(sheets).filter(([_, sheet]) => {
    if (filterConfidence === 'all') return true;
    
    const score = sheet.tableConfidenceScore || 0;
    
    if (filterConfidence === 'high') {
      return score >= 0.8;
    } else if (filterConfidence === 'medium') {
      return score >= 0.5 && score < 0.8;
    } else if (filterConfidence === 'low') {
      return score < 0.5;
    }
    
    return false;
  });

  // Count sheets by confidence level
  const confidenceCounts = {
    high: Object.values(sheets).filter(s => s.tableConfidenceScore && s.tableConfidenceScore >= 0.8).length,
    medium: Object.values(sheets).filter(s => s.tableConfidenceScore && s.tableConfidenceScore >= 0.5 && s.tableConfidenceScore < 0.8).length,
    low: Object.values(sheets).filter(s => s.tableConfidenceScore && s.tableConfidenceScore < 0.5).length,
    total: Object.values(sheets).length
  };

  // Handle select all checkbox
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedSheets(filteredSheets.map(([name]) => name));
    } else {
      setSelectedSheets([]);
    }
  };

  // Handle individual sheet selection
  const handleSelectSheet = (sheetName: string, isChecked: boolean) => {
    if (isChecked) {
      setSelectedSheets([...selectedSheets, sheetName]);
    } else {
      setSelectedSheets(selectedSheets.filter(name => name !== sheetName));
    }
  };

  // Handle table selection for a sheet
  const handleTableSelect = (sheetName: string, tableName: string) => {
    onTableSelect(sheetName, tableName);
  };

  // Open column mapping detail view
  const openColumnMapping = (sheetName: string) => {
    setCurrentSheet(sheetName);
    setIsModalOpen(true);
  };

  // Handle batch approval of selected sheets
  const handleBatchApprove = () => {
    onBatchApprove(selectedSheets);
    setSelectedSheets([]);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight="bold">Sheet to Table Mapping</Typography>
        <Stack direction="row" spacing={2}>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel id="confidence-filter-label">Filter</InputLabel>
            <Select
              labelId="confidence-filter-label"
              value={filterConfidence}
              onChange={(e) => setFilterConfidence(e.target.value as string)}
              label="Filter"
              size="small"
            >
              <MenuItem value="all">All Sheets ({confidenceCounts.total})</MenuItem>
              <MenuItem value="high">High Confidence ({confidenceCounts.high})</MenuItem>
              <MenuItem value="medium">Medium Confidence ({confidenceCounts.medium})</MenuItem>
              <MenuItem value="low">Low Confidence ({confidenceCounts.low})</MenuItem>
            </Select>
          </FormControl>
          <Button 
            variant="contained" 
            color="success" 
            disabled={selectedSheets.length === 0}
            onClick={handleBatchApprove}
          >
            Approve Selected ({selectedSheets.length})
          </Button>
        </Stack>
      </Box>

      <Paper variant="outlined" sx={{ width: '100%', mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell padding="checkbox">
                <Checkbox 
                  checked={selectedSheets.length === filteredSheets.length && filteredSheets.length > 0}
                  indeterminate={selectedSheets.length > 0 && selectedSheets.length < filteredSheets.length}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell>Excel Sheet</TableCell>
              <TableCell>Suggested Table</TableCell>
              <TableCell sx={{ width: 120 }}>Confidence</TableCell>
              <TableCell sx={{ width: 120 }}>Columns</TableCell>
              <TableCell sx={{ width: 120 }}>Status</TableCell>
              <TableCell sx={{ width: 100 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredSheets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 2 }}>
                  <Typography variant="body2">No sheets found matching the selected filter.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredSheets.map(([sheetName, sheet]) => {
                const confidenceProps = getConfidenceChipProps(
                  sheet.tableConfidenceScore ? 
                    (sheet.tableConfidenceScore >= 0.8 ? 'High' : 
                     sheet.tableConfidenceScore >= 0.5 ? 'Medium' : 'Low') : 
                    undefined
                );
                
                // Count mapped columns
                const mappedColumns = Object.values(sheet.columnMappings).filter(
                  col => col.mappedColumn !== null && col.action !== 'skip'
                ).length;
                
                // Calculate column mapping percentage
                const totalColumns = Object.keys(sheet.columnMappings).length;
                const mappingPercentage = totalColumns > 0 ? 
                  Math.round((mappedColumns / totalColumns) * 100) : 0;
                
                return (
                  <TableRow key={sheetName} hover>
                    <TableCell padding="checkbox">
                      <Checkbox 
                        checked={selectedSheets.includes(sheetName)}
                        onChange={(e) => handleSelectSheet(sheetName, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 'medium' }}>{sheetName}</TableCell>
                    <TableCell>
                      <FormControl size="small" sx={{ minWidth: 200 }}>
                        <Select 
                          value={sheet.selectedTable || ''}
                          onChange={(e) => handleTableSelect(sheetName, e.target.value as string)}
                          displayEmpty
                        >
                          <MenuItem value="" disabled>Select table...</MenuItem>
                          {sheet.tableSuggestions.map((suggestion: RankedTableSuggestion) => (
                            <MenuItem key={suggestion.tableName} value={suggestion.tableName}>
                              {suggestion.tableName} 
                              {suggestion.similarityScore > 0.5 ? 
                                ` (${Math.round(suggestion.similarityScore * 100)}% match)` : ''}
                            </MenuItem>
                          ))}
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
                      <Tooltip title={`${mappedColumns} of ${totalColumns} columns mapped`}>
                        <Box>
                          <Typography variant="caption" display="block" gutterBottom>
                            {mappedColumns}/{totalColumns} mapped
                          </Typography>
                          <LinearProgress 
                            variant="determinate" 
                            value={mappingPercentage} 
                            color={
                              mappingPercentage >= 80 ? "success" : 
                              mappingPercentage >= 50 ? "warning" : "error"
                            }
                            sx={{ height: 6, borderRadius: 3 }}
                          />
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        color={
                          sheet.status === 'ready' ? 'success' :
                          sheet.status === 'needsReview' ? 'warning' :
                          sheet.status === 'error' ? 'error' : 'info'
                        }
                        label={sheet.status}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Edit Column Mappings">
                        <IconButton
                          aria-label="Edit column mappings"
                          size="small"
                          onClick={() => openColumnMapping(sheetName)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Paper>

      {/* Column Mapping Detail Modal */}
      <Dialog 
        open={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle>
          Column Mapping: {currentSheet && sheets[currentSheet]?.selectedTable 
            ? `${currentSheet} → ${sheets[currentSheet]?.selectedTable}` 
            : currentSheet}
        </DialogTitle>
        <DialogContent dividers sx={{ overflowY: 'auto' }}>
          {currentSheet && (
            <ColumnMappingDetailView
              sheetState={sheets[currentSheet]}
              onViewColumnMapping={() => onViewColumnMapping(currentSheet)}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsModalOpen(false)} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};