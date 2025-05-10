/**
 * SampleDataTable component to display previews of Excel data
 */
import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Typography,
  Chip,
  Alert,
  Skeleton
} from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { SheetMapping } from '../../store/batchImportStore';

interface SampleDataTableProps {
  sheet: SheetMapping;
  loading?: boolean;
  headerRow?: number;
  maxRows?: number;
  showDataTypes?: boolean;
}

/**
 * Display sample data from Excel sheets
 */
export const SampleDataTable: React.FC<SampleDataTableProps> = ({
  sheet,
  loading = false,
  headerRow = 0,
  maxRows = 5,
  showDataTypes = true
}) => {
  // If sheet has error, display error message
  if (sheet.error) {
    return (
      <Alert severity="error" icon={<ErrorOutlineIcon />} sx={{ mb: 2 }}>
        <Typography variant="subtitle2">Error in sheet: {sheet.originalName}</Typography>
        <Typography variant="body2">{sheet.error}</Typography>
      </Alert>
    );
  }
  
  // If no data or loading, show skeleton
  if (loading || !sheet.firstRows || sheet.firstRows.length === 0) {
    return (
      <Box sx={{ width: '100%', mb: 2 }}>
        <Skeleton variant="rectangular" height={40} />
        <Skeleton variant="rectangular" height={200} sx={{ mt: 1 }} />
      </Box>
    );
  }
  
  // Limit the number of rows displayed
  const displayRows = sheet.firstRows.slice(0, maxRows);
  
  // Get columns (either from the sheet or from the first row if not explicitly defined)
  const columns = sheet.columns.length > 0 
    ? sheet.columns 
    : (sheet.firstRows[0] || []).map((header, index) => ({
        originalName: String(header || `Column_${index + 1}`),
        mappedName: String(header || `column_${index + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        dataType: 'text',
        confidence: 0,
        skip: false,
        originalIndex: index
      }));
  
  return (
    <Paper sx={{ mb: 2, overflow: 'hidden' }}>
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle1" fontWeight="medium">
          Sample Data: {sheet.originalName}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Showing {displayRows.length} of {sheet.firstRows.length} rows
        </Typography>
      </Box>
      
      <TableContainer sx={{ maxHeight: 400 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {/* Row index column */}
              <TableCell sx={{ bgcolor: 'grey.100', width: 60, fontWeight: 'bold' }}>
                Row
              </TableCell>
              
              {/* Data columns */}
              {columns.map((column, colIndex) => (
                <TableCell 
                  key={colIndex}
                  sx={{ 
                    minWidth: 120,
                    whiteSpace: 'nowrap',
                    bgcolor: column.skip ? 'grey.200' : 'primary.light',
                    color: column.skip ? 'text.secondary' : 'primary.contrastText'
                  }}
                >
                  <Box>
                    <Typography variant="caption" fontWeight="bold" display="block">
                      {column.originalName}
                    </Typography>
                    
                    {showDataTypes && (
                      <Chip 
                        label={column.dataType}
                        size="small"
                        sx={{ 
                          height: 20, 
                          '& .MuiChip-label': { 
                            px: 1, 
                            fontSize: '0.625rem' 
                          },
                          backgroundColor: getDataTypeColor(column.dataType),
                          color: 'white'
                        }}
                      />
                    )}
                  </Box>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          
          <TableBody>
            {displayRows.map((row, rowIndex) => (
              <TableRow 
                key={rowIndex}
                sx={{ '&:nth-of-type(odd)': { bgcolor: 'rgba(0, 0, 0, 0.02)' } }}
              >
                {/* Row index */}
                <TableCell sx={{ bgcolor: 'grey.100', width: 60 }}>
                  {rowIndex + headerRow + 1}
                </TableCell>
                
                {/* Row data */}
                {columns.map((column, colIndex) => (
                  <TableCell key={colIndex} sx={{ 
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    ...(column.skip && { color: 'text.disabled' })
                  }}>
                    {formatCellValue(row[column.originalIndex])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

/**
 * Format cell value for display
 */
const formatCellValue = (value: any): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  
  if (typeof value === 'object') {
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    
    try {
      return JSON.stringify(value);
    } catch {
      return '[Object]';
    }
  }
  
  return String(value);
};

/**
 * Get background color for data type chips
 */
const getDataTypeColor = (dataType: string): string => {
  switch (dataType) {
    case 'text':
      return '#4CAF50'; // Green
    case 'numeric':
      return '#2196F3'; // Blue
    case 'integer':
      return '#3F51B5'; // Indigo
    case 'boolean':
      return '#FF5722'; // Deep Orange
    case 'date':
      return '#9C27B0'; // Purple
    case 'timestamp':
      return '#673AB7'; // Deep Purple
    case 'uuid':
      return '#795548'; // Brown
    default:
      return '#607D8B'; // Blue Grey
  }
};

export default SampleDataTable;