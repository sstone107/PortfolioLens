import React, { useState } from 'react';
import {
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Select,
  MenuItem,
  Button,
  Typography,
  Tooltip,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  TableContainer,
  Grid,
  Divider
} from '@mui/material';
import { Check as CheckIcon, Warning as WarningIcon, Info as InfoIcon, Edit as EditIcon } from '@mui/icons-material';
import { SheetProcessingState, RankedTableSuggestion } from './types';
import { ColumnMappingDetailView } from './ColumnMappingDetailView';

interface SheetMappingOverviewProps {
  sheets: Record<string, SheetProcessingState>;
  availableTables: string[];
  onSheetTableMappingChange: (sheetName: string, tableName: string) => void;
  onApproveAllHighConfidence: () => void;
  onViewColumnMappings: (sheetName: string) => void;
}

/**
 * Displays a high-level overview of sheet-to-table mappings with confidence indicators
 * Allows batch approval of high-confidence matches
 */
export const SheetMappingOverview: React.FC<SheetMappingOverviewProps> = ({
  sheets,
  availableTables,
  onSheetTableMappingChange,
  onApproveAllHighConfidence,
  onViewColumnMappings
}) => {
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Count high confidence mappings
  const highConfidenceMappings = Object.values(sheets).filter(
    sheet => sheet.tableSuggestions.length > 0 &&
    sheet.tableSuggestions[0].confidenceLevel === 'High'
  ).length;

  // Handle viewing column mappings for a sheet
  const handleViewColumnMappings = (sheetName: string) => {
    setSelectedSheet(sheetName);
    onViewColumnMappings(sheetName);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  // Render confidence badge based on confidence level
  const renderConfidenceBadge = (confidenceLevel?: 'High' | 'Medium' | 'Low') => {
    switch (confidenceLevel) {
      case 'High':
        return (
          <Chip
            icon={<CheckIcon />}
            label="High Confidence"
            color="success"
            size="small"
          />
        );
      case 'Medium':
        return (
          <Chip
            icon={<InfoIcon />}
            label="Medium Confidence"
            color="warning"
            size="small"
          />
        );
      case 'Low':
        return (
          <Chip
            icon={<WarningIcon />}
            label="Low Confidence"
            color="error"
            size="small"
          />
        );
      default:
        return (
          <Chip
            label="No Match"
            color="default"
            size="small"
          />
        );
    }
  };

  // Render status chip
  const renderStatusChip = (status: string) => {
    let color: 'success' | 'warning' | 'error' | 'default' | 'primary' | 'secondary' | 'info' = 'default';
    
    switch (status) {
      case 'ready':
        color = 'success';
        break;
      case 'needsReview':
        color = 'warning';
        break;
      case 'error':
        color = 'error';
        break;
      case 'processing':
        color = 'info';
        break;
      default:
        color = 'default';
    }
    
    return <Chip label={status} color={color} size="small" />;
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6}>
          <Typography variant="h6">Sheet to Table Mapping</Typography>
        </Grid>
        <Grid item xs={6} sx={{ textAlign: 'right' }}>
          {highConfidenceMappings > 0 && (
            <Tooltip title="Approve all high-confidence mappings at once">
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckIcon />}
                onClick={onApproveAllHighConfidence}
              >
                Approve All High Confidence ({highConfidenceMappings})
              </Button>
            </Tooltip>
          )}
        </Grid>
      </Grid>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Excel Sheet</TableCell>
              <TableCell>Mapped Table</TableCell>
              <TableCell>Confidence</TableCell>
              <TableCell>Rows</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.entries(sheets).map(([sheetName, sheet]) => {
              const topSuggestion = sheet.tableSuggestions.length > 0 ?
                sheet.tableSuggestions[0] : null;
              
              return (
                <TableRow key={sheetName}>
                  <TableCell>{sheetName}</TableCell>
                  <TableCell>
                    <Select
                      value={sheet.selectedTable || ''}
                      onChange={(e) => onSheetTableMappingChange(sheetName, e.target.value as string)}
                      displayEmpty
                      size="small"
                      sx={{ minWidth: 200 }}
                    >
                      <MenuItem value="" disabled>Select table</MenuItem>
                      {availableTables.map(tableName => (
                        <MenuItem key={tableName} value={tableName}>
                          {tableName}
                        </MenuItem>
                      ))}
                      <Divider />
                      <MenuItem value="create-new-table" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                        ➕ Create New Table...
                      </MenuItem>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {renderConfidenceBadge(topSuggestion?.confidenceLevel)}
                  </TableCell>
                  <TableCell>{sheet.rowCount}</TableCell>
                  <TableCell>
                    {renderStatusChip(sheet.status)}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="View/Edit Column Mappings">
                      <IconButton
                        aria-label="View column mappings"
                        size="small"
                        onClick={() => handleViewColumnMappings(sheetName)}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {selectedSheet && dialogOpen && (
        <ColumnMappingDetailView
          open={dialogOpen}
          onClose={handleCloseDialog}
          sheetName={selectedSheet}
          sheetState={sheets[selectedSheet]}
          onColumnMappingChange={onViewColumnMappings}
        />
      )}
    </Box>
  );
};