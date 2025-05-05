import React from 'react';
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
  Paper,
  Select,
  MenuItem,
  Chip,
  Tooltip,
  Typography,
  Stack,
  FormControl,
  InputLabel,
  TextField, // For creating new field name
  Checkbox, // For nullable option
  FormControlLabel,
  SelectChangeEvent,
  Box
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { SheetProcessingState, BatchColumnMapping, RankedColumnSuggestion, ConfidenceLevel, ReviewStatus, NewColumnProposal, CachedDbTable, NewTableProposal } from './types';
import { AnalysisEngine } from './services/AnalysisEngine'; // Import AnalysisEngine

interface ColumnMappingReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheetState: SheetProcessingState | null;
  selectedTableInfo: CachedDbTable | NewTableProposal | null; // Pass full table info or proposal
  onMappingChange: (sheetName: string, header: string, changes: Partial<BatchColumnMapping>) => void;
  onApproveAllColumns: (sheetName: string) => void;
  onRejectAllColumns: (sheetName: string) => void;
  // Potentially add functions for individual column approve/reject if needed later
}

const getConfidenceColor = (level?: ConfidenceLevel): 'success' | 'warning' | 'error' | 'default' => {
  switch (level) {
    case 'High': return 'success';
    case 'Medium': return 'warning';
    case 'Low': return 'error';
    default: return 'default';
  }
};

const getConfidenceIcon = (level?: ConfidenceLevel) => {
  switch (level) {
    case 'High': return <CheckCircleIcon fontSize="small" color="success" />;
    case 'Medium': return <InfoIcon fontSize="small" color="warning" />;
    case 'Low': return <WarningIcon fontSize="small" color="error" />;
    default: return <InfoIcon fontSize="small" color="disabled" />;
  }
};

const getReviewStatusColor = (status: ReviewStatus): 'success' | 'error' | 'warning' | 'default' => {
    switch (status) {
        case 'approved': return 'success';
        case 'rejected': return 'error';
        case 'modified': return 'warning'; // Use warning for modified
        case 'pending':
        default: return 'default';
    }
}

const ColumnMappingReviewModal: React.FC<ColumnMappingReviewModalProps> = ({
  isOpen,
  onClose,
  sheetState,
  selectedTableInfo,
  onMappingChange,
  onApproveAllColumns,
  onRejectAllColumns,
}) => {
  if (!sheetState) return null;

  const { sheetName, columnMappings, sheetReviewStatus } = sheetState;
  const headers = Object.keys(columnMappings);

  const isNewTable = selectedTableInfo && 'sourceSheet' in selectedTableInfo;
  const availableColumns = selectedTableInfo && !isNewTable ? (selectedTableInfo as CachedDbTable).columns.map(c => c.columnName) : [];

  const handleActionChange = (event: SelectChangeEvent<string>, header: string) => {
    const newAction = event.target.value as 'map' | 'skip' | 'create';
    const currentMapping = columnMappings[header];
    let changes: Partial<BatchColumnMapping> = { action: newAction, reviewStatus: 'modified' };

    if (newAction === 'create') {
        const sanitizedName = AnalysisEngine.sanitizeColumnName(header); // Use static method
        const sqlType = AnalysisEngine.getSqlTypeFromInferredType(currentMapping.inferredDataType); // Use static method
        changes.newColumnProposal = {
            columnName: sanitizedName,
            sqlType: sqlType,
            isNullable: true,
            sourceSheet: sheetName,
            sourceHeader: header,
        };
        changes.mappedColumn = sanitizedName; // Tentatively map to new proposal
    } else if (newAction === 'map') {
        // If switching back to map, try to select the top suggestion if available
        changes.mappedColumn = currentMapping.suggestedColumns?.[0]?.columnName || null;
        changes.newColumnProposal = undefined; // Clear proposal
    } else { // skip
        changes.mappedColumn = null;
        changes.newColumnProposal = undefined; // Clear proposal
    }
    onMappingChange(sheetName, header, changes);
  };

  const handleMappedColumnChange = (event: SelectChangeEvent<string>, header: string) => {
    onMappingChange(sheetName, header, { mappedColumn: event.target.value || null, reviewStatus: 'modified' });
  };

  const handleNewColumnNameChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, header: string) => {
     const currentMapping = columnMappings[header];
     if (currentMapping.action === 'create' && currentMapping.newColumnProposal) {
        onMappingChange(sheetName, header, {
            newColumnProposal: { ...currentMapping.newColumnProposal, columnName: event.target.value },
            mappedColumn: event.target.value, // Keep mappedColumn in sync
            reviewStatus: 'modified'
        });
     }
  };

   const handleNewColumnTypeChange = (event: SelectChangeEvent<string>, header: string) => {
     const currentMapping = columnMappings[header];
     if (currentMapping.action === 'create' && currentMapping.newColumnProposal) {
        onMappingChange(sheetName, header, {
            newColumnProposal: { ...currentMapping.newColumnProposal, sqlType: event.target.value },
            reviewStatus: 'modified'
        });
     }
  };

  // Basic SQL types - could be expanded or fetched
  const basicSqlTypes = ['TEXT', 'VARCHAR(255)', 'INTEGER', 'BIGINT', 'NUMERIC', 'DECIMAL', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'TIMESTAMPTZ', 'JSON', 'JSONB'];


  return (
    <Dialog open={isOpen} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>Review Column Mappings for "{sheetName}"</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={2} mb={2} justifyContent="flex-end">
            <Button onClick={() => onApproveAllColumns(sheetName)} color="success" variant="outlined" size="small" disabled={sheetReviewStatus === 'approved'}>Approve All</Button>
            <Button onClick={() => onRejectAllColumns(sheetName)} color="error" variant="outlined" size="small" disabled={sheetReviewStatus === 'rejected'}>Reject All</Button>
        </Stack>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Source Header</TableCell>
                <TableCell>Sample Value</TableCell>
                <TableCell>Inferred Type</TableCell>
                <TableCell>Suggestion</TableCell>
                <TableCell>Confidence</TableCell>
                <TableCell sx={{ minWidth: 150 }}>Action</TableCell>
                <TableCell sx={{ minWidth: 250 }}>Target Column / New Field Details</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {headers.map((header) => {
                const mapping = columnMappings[header];
                const topSuggestion = mapping.suggestedColumns?.[0];
                const confidenceLevel = mapping.confidenceLevel;
                const confidenceIcon = getConfidenceIcon(confidenceLevel);
                const isApproved = mapping.reviewStatus === 'approved';
                const isRejected = mapping.reviewStatus === 'rejected';
                const isDisabled = isApproved || isRejected;

                return (
                  <TableRow key={header} sx={isRejected ? { backgroundColor: 'rgba(255, 0, 0, 0.05)' } : isApproved ? { backgroundColor: 'rgba(0, 255, 0, 0.05)' } : {}}>
                    <TableCell>{header}</TableCell>
                    <TableCell>
                        <Tooltip title={String(mapping.sampleValue)} placement="top">
                            <Typography variant="body2" noWrap sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {String(mapping.sampleValue)}
                            </Typography>
                        </Tooltip>
                    </TableCell>
                    <TableCell>{mapping.inferredDataType || 'N/A'}</TableCell>
                    <TableCell>{topSuggestion?.columnName || 'N/A'}</TableCell>
                    <TableCell>
                      {mapping.confidenceScore !== undefined && (
                        <Tooltip title={`Score: ${mapping.confidenceScore.toFixed(2)}`} placement="top">
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            {confidenceIcon}
                            <Typography variant="body2" color={`${getConfidenceColor(confidenceLevel)}.main`}>
                              {confidenceLevel}
                            </Typography>
                          </Stack>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                       <FormControl size="small" fullWidth disabled={isDisabled}>
                           <Select
                             value={mapping.action}
                             onChange={(e) => handleActionChange(e, header)}
                           >
                             <MenuItem value="map">Map</MenuItem>
                             <MenuItem value="skip">Skip</MenuItem>
                             <MenuItem value="create">Create New Field</MenuItem>
                           </Select>
                       </FormControl>
                    </TableCell>
                    <TableCell>
                      {mapping.action === 'map' && !isNewTable && (
                        <FormControl size="small" fullWidth disabled={isDisabled}>
                          <Select
                            value={mapping.mappedColumn ?? ''}
                            onChange={(e) => handleMappedColumnChange(e, header)}
                            displayEmpty
                          >
                            <MenuItem value="">-- Select Column --</MenuItem>
                            {/* Show suggestions first */}
                            {mapping.suggestedColumns.map(s => (
                                <MenuItem key={s.columnName} value={s.columnName}>
                                    {s.columnName} ({s.confidenceScore.toFixed(2)})
                                </MenuItem>
                            ))}
                            <MenuItem disabled>──────────</MenuItem>
                            {/* Then show remaining available columns */}
                            {availableColumns
                                .filter(col => !mapping.suggestedColumns.some(s => s.columnName === col))
                                .map(colName => (
                                    <MenuItem key={colName} value={colName}>{colName}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                      {mapping.action === 'create' && mapping.newColumnProposal && (
                        <Stack direction="row" spacing={1} alignItems="center">
                           <TextField
                             label="Field Name"
                             size="small"
                             value={mapping.newColumnProposal.columnName}
                             onChange={(e) => handleNewColumnNameChange(e, header)}
                             disabled={isDisabled}
                             sx={{ flexGrow: 1 }}
                           />
                           <FormControl size="small" sx={{ minWidth: 120 }} disabled={isDisabled}>
                               <InputLabel>Type</InputLabel>
                               <Select
                                 value={mapping.newColumnProposal.sqlType}
                                 label="Type"
                                 onChange={(e) => handleNewColumnTypeChange(e, header)}
                               >
                                 {basicSqlTypes.map(type => (
                                     <MenuItem key={type} value={type}>{type}</MenuItem>
                                 ))}
                               </Select>
                           </FormControl>
                           {/* Add Nullable/Default options if needed */}
                        </Stack>
                      )}
                       {mapping.action === 'skip' && (
                           <Typography variant="caption" color="text.secondary">Column will be skipped</Typography>
                       )}
                    </TableCell>
                     <TableCell>
                        <Chip
                          label={mapping.reviewStatus}
                          color={getReviewStatusColor(mapping.reviewStatus)}
                          size="small"
                        />
                     </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {/* Add Save/Confirm button if needed */}
      </DialogActions>
    </Dialog>
  );
};

export default ColumnMappingReviewModal;