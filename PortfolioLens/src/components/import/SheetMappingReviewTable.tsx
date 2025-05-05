import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  Select,
  MenuItem,
  Tooltip,
  IconButton,
  Stack,
  Typography,
  Box,
  FormControl,
  InputLabel,
  SelectChangeEvent // Import SelectChangeEvent
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import EditIcon from '@mui/icons-material/Edit';
import { SheetProcessingState, RankedTableSuggestion, ConfidenceLevel, SheetReviewStatus } from './types';
import { AnalysisEngine } from './services/AnalysisEngine'; // Import AnalysisEngine

interface SheetMappingReviewTableProps {
  sheets: { [sheetName: string]: SheetProcessingState };
  availableTables: string[]; // Just the names for the dropdown
  onTableChange: (sheetName: string, newTableName: string | null) => void;
  onReviewSheet: (sheetName: string) => void; // Function to trigger detailed review
  onApproveSheet: (sheetName: string) => void;
  onRejectSheet: (sheetName: string) => void;
  onApproveAllHighConfidence: () => void;
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

const getReviewStatusColor = (status: SheetReviewStatus): 'success' | 'error' | 'warning' | 'default' => {
    switch (status) {
        case 'approved': return 'success';
        case 'rejected': return 'error';
        case 'partiallyApproved': return 'warning';
        case 'pending':
        default: return 'default';
    }
}

const SheetMappingReviewTable: React.FC<SheetMappingReviewTableProps> = ({
  sheets,
  availableTables,
  onTableChange,
  onReviewSheet,
  onApproveSheet,
  onRejectSheet,
  onApproveAllHighConfidence,
}) => {
  // Log received props with more detailed information
  console.log('[DEBUG SheetMappingReviewTable] Rendering with sheets:',
    Object.entries(sheets).map(([name, state]) => ({
      name,
      status: state.status,
      reviewStatus: state.sheetReviewStatus,
      selectedTable: state.selectedTable,
      suggestionsCount: state.tableSuggestions?.length ?? 0,
      topSuggestion: state.tableSuggestions?.[0] ? {
        tableName: state.tableSuggestions[0].tableName,
        confidenceScore: state.tableSuggestions[0].confidenceScore,
        confidenceLevel: state.tableSuggestions[0].confidenceLevel,
        isNewTableProposal: state.tableSuggestions[0].isNewTableProposal
      } : 'None',
      tableConfidenceScore: state.tableConfidenceScore
    }))
  );

  const sheetNames = Object.keys(sheets);
  const hasHighConfidencePending = sheetNames.some(name =>
    sheets[name].sheetReviewStatus === 'pending' &&
    sheets[name].tableConfidenceScore &&
    AnalysisEngine.getConfidenceLevel(sheets[name].tableConfidenceScore) === 'High'
  );

  const handleTableChange = (event: SelectChangeEvent<string>, sheetName: string) => {
    console.log(`[DEBUG SheetMappingReviewTable] handleTableChange: Sheet "${sheetName}", New Value: ${event.target.value}`);
    onTableChange(sheetName, event.target.value || null);
  };

  return (
    <Stack spacing={2} alignItems="stretch">
       <Box alignSelf="flex-end">
         {hasHighConfidencePending && (
            <Button variant="contained" color="success" size="small" onClick={onApproveAllHighConfidence}>
                Approve All High Confidence
            </Button>
         )}
       </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Sheet Name</TableCell>
              <TableCell>Suggested Table</TableCell>
              <TableCell>Confidence</TableCell>
              <TableCell>Selected Table</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sheetNames.map((sheetName) => {
              const sheetState = sheets[sheetName];
              // Log state for each row being rendered with more detailed information
              console.log(`[DEBUG SheetMappingReviewTable] Rendering row for "${sheetName}":`, {
                status: sheetState.status,
                reviewStatus: sheetState.sheetReviewStatus,
                selectedTable: sheetState.selectedTable,
                suggestionsCount: sheetState.tableSuggestions?.length ?? 0,
                tableSuggestions: sheetState.tableSuggestions?.map(s => ({
                  tableName: s.tableName,
                  confidenceScore: s.confidenceScore,
                  confidenceLevel: s.confidenceLevel,
                  isNewTableProposal: s.isNewTableProposal
                })),
                topSuggestion: sheetState.tableSuggestions?.[0]?.tableName,
                confidence: sheetState.tableConfidenceScore?.toFixed(2),
                confidenceLevel: sheetState.tableConfidenceScore
                  ? AnalysisEngine.getConfidenceLevel(sheetState.tableConfidenceScore)
                  : 'None'
              });

              // Get the top suggestion and log it for debugging
              const topSuggestion = sheetState.tableSuggestions?.[0];
              console.log(`[DEBUG SheetMappingReviewTable] Top suggestion for ${sheetName}:`,
                topSuggestion ? {
                  tableName: topSuggestion.tableName,
                  confidenceScore: topSuggestion.confidenceScore,
                  confidenceLevel: topSuggestion.confidenceLevel,
                  isNewTableProposal: topSuggestion.isNewTableProposal
                } : 'None'
              );
              
              // Use the confidence level from the top suggestion if available, otherwise calculate from the score
              let confidenceLevel: ConfidenceLevel | undefined;
              if (topSuggestion?.confidenceLevel) {
                confidenceLevel = topSuggestion.confidenceLevel;
              } else if (sheetState.tableConfidenceScore !== undefined) {
                confidenceLevel = AnalysisEngine.getConfidenceLevel(sheetState.tableConfidenceScore);
              }
              
              console.log(`[DEBUG SheetMappingReviewTable] Confidence level for ${sheetName}: ${confidenceLevel || 'undefined'}`);
              const confidenceIcon = getConfidenceIcon(confidenceLevel);
              const rowStyle = sheetState.sheetReviewStatus === 'rejected'
                ? { backgroundColor: 'rgba(255, 0, 0, 0.05)' }
                : sheetState.sheetReviewStatus === 'approved'
                ? { backgroundColor: 'rgba(0, 255, 0, 0.05)' }
                : {};

              return (
                <TableRow key={sheetName} sx={rowStyle}>
                  <TableCell>{sheetName}</TableCell>
                  <TableCell>
                    {topSuggestion && !topSuggestion.isNewTableProposal ? topSuggestion.tableName : (topSuggestion?.isNewTableProposal ? `New: ${topSuggestion.tableName}`: 'N/A')}
                  </TableCell>
                  <TableCell>
                    {/* Show confidence information if available from either source */}
                    {(sheetState.tableConfidenceScore !== undefined || topSuggestion?.confidenceScore !== undefined) && (
                      <Tooltip
                        title={`Score: ${
                          topSuggestion?.confidenceScore !== undefined
                            ? topSuggestion.confidenceScore.toFixed(2)
                            : sheetState.tableConfidenceScore !== undefined
                              ? sheetState.tableConfidenceScore.toFixed(2)
                              : 'N/A'
                        }`}
                        placement="top"
                      >
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          {confidenceIcon}
                          <Typography variant="body2" color={`${getConfidenceColor(confidenceLevel)}.main`}>
                            {confidenceLevel || 'Unknown'}
                          </Typography>
                        </Stack>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell sx={{ minWidth: 200 }}>
                    <FormControl fullWidth size="small">
                      {/* <InputLabel>Table</InputLabel> */}
                      <Select
                        value={sheetState.selectedTable ?? ''}
                        onChange={(e) => handleTableChange(e, sheetName)} // Use handler
                        disabled={sheetState.sheetReviewStatus === 'approved' || sheetState.sheetReviewStatus === 'rejected'}
                        displayEmpty
                      >
                        <MenuItem value="">-- Select Table --</MenuItem>
                        {/* Include proposed new table if applicable */}
                        {sheetState.tableSuggestions?.find(s => s.isNewTableProposal) && ( // Added null check for safety
                           <MenuItem value={sheetState.tableSuggestions.find(s => s.isNewTableProposal)?.tableName}>
                               New: {sheetState.tableSuggestions.find(s => s.isNewTableProposal)?.tableName}
                           </MenuItem>
                        )}
                        {availableTables.map((tableName) => (
                          <MenuItem key={tableName} value={tableName}>
                            {tableName}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                   <TableCell>
                      <Chip
                        label={sheetState.sheetReviewStatus}
                        color={getReviewStatusColor(sheetState.sheetReviewStatus)}
                        size="small"
                      />
                   </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Tooltip title="Review Details" placement="top">
                        <span> {/* Tooltip needs a span wrapper when button is disabled */}
                          <IconButton
                            size="small"
                            onClick={() => onReviewSheet(sheetName)}
                            disabled={!sheetState.selectedTable} // Disable if no table selected
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                       {sheetState.sheetReviewStatus === 'pending' && sheetState.selectedTable && (
                           <>
                              <Tooltip title="Approve Mapping" placement="top">
                                  <Button size="small" variant="contained" color="success" onClick={() => onApproveSheet(sheetName)}>
                                      Approve
                                  </Button>
                              </Tooltip>
                              <Tooltip title="Reject Mapping" placement="top">
                                  <Button size="small" variant="contained" color="error" onClick={() => onRejectSheet(sheetName)}>
                                      Reject
                                  </Button>
                              </Tooltip>
                           </>
                       )}
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
};

export default SheetMappingReviewTable;