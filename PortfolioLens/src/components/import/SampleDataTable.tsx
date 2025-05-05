import React from 'react';
import {
  TableContainer,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Typography,
  Box,
  Tooltip, // Revert to standard import
} from '@mui/material';

interface SampleDataTableProps {
  sampleData: Record<string, any>[];
}

/**
 * Displays sample data in a compact Material-UI table.
 */
const SampleDataTable: React.FC<SampleDataTableProps> = ({ sampleData }) => {
  if (!sampleData || sampleData.length === 0) {
    return <Typography variant="body2">No sample data available.</Typography>;
  }

  // Assuming all rows have the same keys (headers)
  const headers = Object.keys(sampleData[0]);

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300, overflow: 'auto', maxWidth: '100%' }}>
      <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow>
            {headers.map((header) => (
              <TableCell
                key={header}
                sx={{
                  fontWeight: 'bold',
                  backgroundColor: 'grey.200',
                  padding: '6px 8px',
                  fontSize: '0.75rem'
                }}
              >
                <Tooltip title={header} placement="top">
                  <Typography noWrap variant="subtitle2">
                    {header}
                  </Typography>
                </Tooltip>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sampleData.map((row, rowIndex) => (
            <TableRow key={rowIndex} hover>
              {headers.map((header) => {
                const cellValue = String(row[header] || '');
                return (
                  <TableCell
                    key={`${rowIndex}-${header}`}
                    sx={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '150px',
                      padding: '4px 8px',
                      fontSize: '0.75rem'
                    }}
                  >
                    <Tooltip title={cellValue} placement="top">
                      <Typography noWrap variant="body2">
                        {cellValue}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default SampleDataTable;