import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  FormControl,
  Typography,
  Chip,
  Box,
  CircularProgress,
  Tooltip,
  IconButton,
  InputAdornment,
  TextField,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { SheetInfo, TableColumnInfo, ColumnMapping, TableInfo } from './types';
import { generateColumnMappings } from './mappingLogic';

interface ColumnMapperModalProps {
  open: boolean;
  onClose: () => void;
  sheetInfo: SheetInfo | null | undefined; // Accept SheetInfo object
  tableInfo: TableInfo | null | undefined; // Accept TableInfo object
  initialMappings?: Record<string, ColumnMapping>; // Optional initial mappings
  onSave: (mappings: Record<string, ColumnMapping>) => void;
  exampleData: Record<string, any[]>; // Keep for sample data display
}

/**
 * Modal component for mapping Excel columns to database table columns.
 * It now receives sheetInfo and tableInfo directly as props.
 */
export const ColumnMappingModal: React.FC<ColumnMapperModalProps> = ({
  open,
  onClose,
  sheetInfo, // Use sheetInfo prop
  tableInfo, // Use tableInfo prop
  initialMappings,
  onSave,
  exampleData
}) => {
  // State for current mappings
  const [mapping, setMapping] = useState<Record<string, ColumnMapping>>({});
  const [searchQuery, setSearchQuery] = useState('');

  // Initialize mappings when the modal opens or relevant props change
  useEffect(() => {
    if (open && initialMappings) {
      // Use provided initial mappings if available
      setMapping(initialMappings);
    } else if (open && sheetInfo && tableInfo) {
      // If no initial mappings, generate based on passed sheetInfo and tableInfo
      // Assuming generateColumnMappings exists and works with these types
      console.log("Generating initial mappings for:", sheetInfo.name, tableInfo.name);
      const generated = generateColumnMappings(sheetInfo, tableInfo, true);
      setMapping(generated);
    } else {
      setMapping({}); // Reset when closing or if necessary info is missing
      setSearchQuery(''); // Reset search on close/reset
    }
  }, [open, initialMappings, sheetInfo, tableInfo]);

  const handleMappingChange = (excelCol: string, dbCol: string) => {
    const targetColInfo = memoizedTargetColumns.find(c => c.columnName === dbCol);
    let type: 'string' | 'number' | 'boolean' | 'date' = 'string'; // Default type

    if (targetColInfo) {
        // Basic type mapping (expand as needed)
        if (['integer', 'bigint', 'numeric', 'real', 'double precision'].some(t => targetColInfo.dataType.includes(t))) {
            type = 'number';
        } else if (targetColInfo.dataType.includes('boolean')) {
            type = 'boolean';
        } else if (['date', 'timestamp'].some(t => targetColInfo.dataType.includes(t))) {
            type = 'date';
        }
    }

    setMapping(prev => ({
      ...prev,
      [excelCol]: { dbColumn: dbCol, type: type }
    }));
  };

  const handleUnmap = (excelCol: string) => {
    setMapping(prev => {
      const newMapping = { ...prev };
      delete newMapping[excelCol];
      return newMapping;
    });
  };

  // Memoize Excel headers derived from sheetInfo prop
  const memoizedExcelHeaders = useMemo(() => {
    if (!sheetInfo?.columns) return [];
    return sheetInfo.columns.filter(header =>
      header.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sheetInfo, searchQuery]);

  // Memoize target columns derived from tableInfo prop
  const memoizedTargetColumns = useMemo(() => {
     // Filter out common metadata columns unless specifically needed
     return (tableInfo?.columns || []).filter(col => {
       // Add checks for col and col.columnName before accessing toLowerCase()
       if (!col || typeof col.columnName !== 'string') {
         return false; // Exclude items that are undefined or lack a string columnName
       }
       return !['id', 'created_at', 'updated_at'].includes(col.columnName.toLowerCase());
     });
  }, [tableInfo]);

  const handleSave = () => {
    console.log("Saving mappings:", mapping);
    onSave(mapping);
    onClose(); // Close modal on save
  };

  // Show loading indicator if essential data isn't ready
  // BatchImporter should ideally prevent opening the modal until these are loaded
  if (open && (!sheetInfo || !tableInfo)) {
      return (
          <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
              <DialogTitle>Loading Mapping Information...</DialogTitle>
              <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
                  <CircularProgress />
              </DialogContent>
              <DialogActions>
                  <Button onClick={onClose}>Cancel</Button>
              </DialogActions>
          </Dialog>
      );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Map Columns for '{sheetInfo?.name}' to '{tableInfo?.name}' Table
      </DialogTitle>
      <DialogContent dividers>
         <TextField
            fullWidth
            variant="outlined"
            size="small"
            placeholder="Search Excel Columns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />
        <TableContainer sx={{ maxHeight: '60vh' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Excel Column</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Sample Data</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Mapped To (Database Column)</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>DB Type</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Required</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Ensure memoizedTargetColumns are available before mapping */}
              {memoizedTargetColumns.length > 0 && sheetInfo ? (
                 memoizedExcelHeaders.map(excelCol => {
                  const currentMapping = mapping[excelCol];
                  const isMapped = !!currentMapping?.dbColumn;
                  const targetColInfo = isMapped ? memoizedTargetColumns.find(col => col.columnName === currentMapping.dbColumn) : null;

                  // Get sample values using exampleData and excelCol
                  const sampleValues = (exampleData[sheetInfo?.name || ''] || [])
                    .map(row => row[excelCol])
                    .filter(val => val !== undefined && val !== null && val !== '')
                    .slice(0, 3); // Show top 3 non-empty values

                  return (
                    <TableRow key={excelCol} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      <TableCell component="th" scope="row">
                        <Typography variant="body2" noWrap> {excelCol} </Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={sampleValues.join('\n')} placement="top-start">
                             <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxWidth: 200 }}>
                                {sampleValues.length > 0 ? sampleValues.map((val, i) => (
                                    <Chip key={i} label={String(val).substring(0, 20)} size="small" variant="outlined" />
                                )) : <Chip label="-" size="small" variant="outlined" />}
                            </Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <FormControl fullWidth size="small" variant="outlined">
                          <Select
                            displayEmpty
                            value={ isMapped ? currentMapping.dbColumn : '' }
                            onChange={(e) => {
                              const dbCol = e.target.value;
                              if (dbCol) {
                                handleMappingChange(excelCol, dbCol);
                              } else {
                                handleUnmap(excelCol);
                              }
                            }}
                            renderValue={(selectedValue) => {
                                if (!selectedValue) {
                                  return <Typography variant="body2" color="textSecondary"><em>Not mapped</em></Typography>;
                                }
                                return selectedValue;
                              }}
                          >
                            <MenuItem value="">
                              <em>Not mapped</em>
                            </MenuItem>
                            {/* Map over memoizedTargetColumns */}
                            {memoizedTargetColumns
                              .map(col => (
                                <MenuItem
                                  key={col.columnName}
                                  value={col.columnName}
                                  // Disable if already mapped to a different Excel column
                                  disabled={Object.entries(mapping).some(([exCol, mapData]) => mapData.dbColumn === col.columnName && exCol !== excelCol)}
                                >
                                  {col.columnName}
                                </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        {targetColInfo ? (
                           <Tooltip title={`Data Type: ${targetColInfo.dataType}`}>
                             <Chip label={targetColInfo.dataType} size="small" variant="outlined" />
                           </Tooltip>
                        ) : (
                            <Chip label="-" size="small" />
                        )}
                      </TableCell>
                      <TableCell align="center">
                         {targetColInfo?.isNullable === false ? (
                             <Tooltip title="Column is required (NOT NULL)">
                                <Chip label="Yes" size="small" color="warning" variant="outlined"/>
                             </Tooltip>
                          ) : (
                            <Chip label="No" size="small" variant="outlined"/>
                          )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    {sheetInfo && memoizedTargetColumns.length === 0 && (
                         <Typography color="textSecondary">No target table columns available to map.</Typography>
                    )}
                     {!sheetInfo && (
                         <Typography color="textSecondary">Waiting for sheet information...</Typography>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" color="primary" disabled={!sheetInfo || !tableInfo}>
          Save Mapping
        </Button>
      </DialogActions>
    </Dialog>
  );
};
