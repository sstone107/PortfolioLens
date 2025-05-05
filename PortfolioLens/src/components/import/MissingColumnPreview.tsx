import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
  Check as CheckIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { MissingColumnInfo } from './types';

interface MissingColumnPreviewProps {
  open: boolean;
  missingColumns: Record<string, MissingColumnInfo[]>;
  previewData: Record<string, any[]>;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Dialog to preview and confirm creation of missing columns
 */
export const MissingColumnPreview: React.FC<MissingColumnPreviewProps> = ({
  open,
  missingColumns,
  previewData,
  onClose,
  onConfirm
}) => {
  // Calculate stats
  const totalSheets = Object.keys(missingColumns).length;
  const totalColumns = Object.values(missingColumns).flat().length;
  
  // Get sample data for a column
  const getSampleData = (sheetName: string, columnName: string): any[] => {
    const sheetData = previewData[sheetName] || [];
    // Return up to 5 non-null values
    return sheetData
      .filter(row => row[columnName] !== null && row[columnName] !== undefined)
      .slice(0, 5)
      .map(row => row[columnName]);
  };
  
  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" alignItems="center">
          <WarningIcon color="warning" sx={{ mr: 1 }} />
          Missing Database Columns
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Typography variant="body1" paragraph>
          The system detected <strong>{totalColumns}</strong> columns in your Excel file that don't exist in the target database tables.
          These columns will be automatically created before importing the data.
        </Typography>
        
        <Typography variant="body2" color="text.secondary" paragraph>
          Review the column details below before proceeding. The system will suggest appropriate data types based on the data.
        </Typography>
        
        {Object.entries(missingColumns).map(([sheetName, columns]) => (
          <Accordion key={sheetName} sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight="bold">
                {sheetName} <Chip size="small" label={`${columns.length} columns`} sx={{ ml: 1 }} />
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Column Name</strong></TableCell>
                      <TableCell><strong>Data Type</strong></TableCell>
                      <TableCell><strong>Sample Data</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {columns.map((column, index) => {
                      const sampleData = getSampleData(sheetName, column.columnName);
                      return (
                        <TableRow key={index}>
                          <TableCell>{column.columnName}</TableCell>
                          <TableCell>
                            <Chip 
                              size="small" 
                              label={column.suggestedType} 
                              color="primary" 
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            {sampleData.length > 0 ? (
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {sampleData.map((value, i) => (
                                  <Chip 
                                    key={i} 
                                    size="small" 
                                    label={String(value).substring(0, 20) + (String(value).length > 20 ? '...' : '')} 
                                    variant="outlined"
                                  />
                                ))}
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                No sample data available
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        ))}
        
        <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(0, 128, 0, 0.05)', borderRadius: 1, border: '1px solid rgba(0, 128, 0, 0.1)' }}>
          <Typography variant="body2" display="flex" alignItems="center">
            <CheckIcon color="success" fontSize="small" sx={{ mr: 1 }} />
            These columns will be automatically created with appropriate data types.
          </Typography>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button 
          onClick={onConfirm} 
          variant="contained" 
          color="primary" 
          startIcon={<CheckIcon />}
        >
          Create Columns & Import
        </Button>
      </DialogActions>
    </Dialog>
  );
};
