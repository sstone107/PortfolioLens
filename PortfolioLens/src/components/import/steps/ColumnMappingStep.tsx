/**
 * Column Mapping Step component
 * Handles mapping Excel columns to database fields
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  MenuItem,
  Stack,
  Select,
  SelectChangeEvent,
  InputAdornment,
  CircularProgress,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Tabs,
  Tab,
  Grid,
  FormControl,
  InputLabel,
  FormHelperText
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import SettingsIcon from '@mui/icons-material/Settings';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useBatchImportStore, SheetMapping, ColumnMapping } from '../../../store/batchImportStore';
import { useTableMetadata, useTableMatcher } from '../BatchImporterHooks';
import SampleDataTable from '../SampleDataTable';
import { SupabaseDataType } from '../dataTypeInference';

interface ColumnMappingStepProps {
  onSheetSelect: (sheetId: string | null) => void;
  onError: (error: string | null) => void;
}

/**
 * Step 3: Column-to-Field mapping component
 */
export const ColumnMappingStep: React.FC<ColumnMappingStepProps> = ({
  onSheetSelect,
  onError
}) => {
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'grouped' | 'original'>('grouped');
  const [showSettings, setShowSettings] = useState(false);
  
  // Access batch import store
  const {
    sheets,
    selectedSheetId,
    updateSheet,
    updateSheetColumn,
    setSelectedSheetId
  } = useBatchImportStore();
  
  // Filter non-skipped sheets
  const validSheets = useMemo(() => 
    sheets.filter(sheet => !sheet.skip), 
    [sheets]
  );
  
  // Get currently selected sheet
  const selectedSheet = useMemo(() => {
    if (selectedSheetId) {
      return sheets.find(sheet => sheet.id === selectedSheetId);
    }
    return validSheets[selectedSheetIndex] || null;
  }, [selectedSheetId, selectedSheetIndex, sheets, validSheets]);
  
  // Load database metadata
  const { tables } = useTableMetadata();
  
  // Get table schema for the selected sheet
  const tableSchema = useMemo(() => {
    if (!selectedSheet) return null;
    
    return tables.find(table => 
      table.name === selectedSheet.mappedName.toLowerCase()
    );
  }, [selectedSheet, tables]);
  
  // Group columns by data type
  const groupedColumns = useMemo(() => {
    if (!selectedSheet) return {};
    
    return selectedSheet.columns.reduce((groups: Record<string, ColumnMapping[]>, column) => {
      const type = column.dataType as string;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(column);
      return groups;
    }, {});
  }, [selectedSheet]);
  
  // Update selected sheet when index changes
  useEffect(() => {
    if (validSheets.length > 0 && selectedSheetIndex < validSheets.length) {
      const sheet = validSheets[selectedSheetIndex];
      setSelectedSheetId(sheet.id);
    }
  }, [selectedSheetIndex, validSheets, setSelectedSheetId]);
  
  // Handle tab change for sheet selection
  const handleSheetTabChange = (_event: React.SyntheticEvent, newIndex: number) => {
    setSelectedSheetIndex(newIndex);
  };
  
  // Handle data type change
  const handleDataTypeChange = (columnName: string, dataType: SupabaseDataType) => {
    if (!selectedSheet) return;
    
    updateSheetColumn(selectedSheet.id, columnName, {
      dataType,
      needsReview: true
    });
  };
  
  // Handle mapped name change
  const handleMappedNameChange = (columnName: string, mappedName: string) => {
    if (!selectedSheet) return;
    
    updateSheetColumn(selectedSheet.id, columnName, {
      mappedName,
      needsReview: true
    });
  };
  
  // Handle skip toggle
  const handleSkipToggle = (columnName: string, skip: boolean) => {
    if (!selectedSheet) return;
    
    updateSheetColumn(selectedSheet.id, columnName, {
      skip,
      needsReview: true
    });
  };
  
  // Handle approve all columns
  const handleApproveAll = () => {
    if (!selectedSheet) return;
    
    // Create a fresh copy of columns with approved status
    const approvedColumns = selectedSheet.columns.map(col => ({
      ...col,
      needsReview: false
    }));
    
    updateSheet(selectedSheet.id, {
      columns: approvedColumns,
      needsReview: false,
      approved: true,
      status: 'approved'
    });
  };
  
  // Get status metrics for the current sheet
  const getStatusMetrics = () => {
    if (!selectedSheet) return { total: 0, approved: 0, needsReview: 0, skipped: 0 };
    
    const total = selectedSheet.columns.length;
    const skipped = selectedSheet.columns.filter(col => col.skip).length;
    const needsReview = selectedSheet.columns.filter(col => !col.skip && col.needsReview).length;
    const approved = total - skipped - needsReview;
    
    return { total, approved, needsReview, skipped };
  };
  
  const metrics = getStatusMetrics();
  
  // Available data types for the dropdown
  const dataTypes: SupabaseDataType[] = [
    'text', 'numeric', 'integer', 'boolean', 'date', 'timestamp', 'uuid'
  ];
  
  if (!selectedSheet) {
    return (
      <Alert severity="warning">
        No sheets selected or all sheets are skipped. Please go back to the previous step.
      </Alert>
    );
  }
  
  return (
    <Box>
      {/* Sheet tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={selectedSheetIndex}
          onChange={handleSheetTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {validSheets.map((sheet, index) => (
            <Tab 
              key={sheet.id} 
              label={sheet.originalName} 
              icon={getSheetStatusIcon(sheet)}
              iconPosition="end"
            />
          ))}
        </Tabs>
      </Paper>
      
      {/* Mapping Controls */}
      <Card sx={{ mb: 3 }}>
        <CardHeader 
          title={`Column Mapping: ${selectedSheet.originalName} → ${selectedSheet.mappedName}`}
          subheader={`Map columns from Excel to database fields (${metrics.total} columns)`}
          action={
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                color="primary"
                onClick={() => setViewMode(viewMode === 'grouped' ? 'original' : 'grouped')}
                startIcon={viewMode === 'grouped' ? <VisibilityIcon /> : <InfoIcon />}
                size="small"
              >
                {viewMode === 'grouped' ? 'Original Order' : 'Group by Type'}
              </Button>
              
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => setShowSettings(!showSettings)}
                startIcon={<SettingsIcon />}
                size="small"
              >
                {showSettings ? 'Hide Settings' : 'Show Settings'}
              </Button>
              
              <Button
                variant="contained"
                color="success"
                onClick={handleApproveAll}
                startIcon={<CheckCircleIcon />}
                disabled={metrics.needsReview === 0}
                size="small"
              >
                Approve All
              </Button>
            </Stack>
          }
        />
        
        {/* Settings panel */}
        {showSettings && (
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={3}>
                <Typography variant="subtitle2">Type Thresholds:</Typography>
              </Grid>
              <Grid item xs={12} md={9}>
                <Stack direction="row" spacing={2}>
                  <TextField
                    label="Auto-approve"
                    type="number"
                    size="small"
                    defaultValue={95}
                    InputProps={{ 
                      endAdornment: <InputAdornment position="end">%</InputAdornment>,
                      inputProps: { min: 0, max: 100 }
                    }}
                  />
                  
                  <TextField
                    label="Suggest"
                    type="number"
                    size="small"
                    defaultValue={80}
                    InputProps={{ 
                      endAdornment: <InputAdornment position="end">%</InputAdornment>,
                      inputProps: { min: 0, max: 100 }
                    }}
                  />
                </Stack>
              </Grid>
              
              <Grid item xs={12}>
                <Divider />
              </Grid>
              
              <Grid item xs={12} md={3}>
                <Typography variant="subtitle2">Mapping Method:</Typography>
              </Grid>
              <Grid item xs={12} md={9}>
                <Stack direction="row" spacing={2}>
                  <FormControlLabel
                    control={<Switch defaultChecked />}
                    label="Use data samples"
                  />
                  <FormControlLabel
                    control={<Switch defaultChecked />}
                    label="Use column headers"
                  />
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        )}
        
        <Divider />
        
        <CardContent>
          <Stack direction="row" spacing={2}>
            <Chip 
              icon={<WarningIcon />} 
              label={`${metrics.needsReview} Need Review`}
              color="warning"
              variant={metrics.needsReview > 0 ? "filled" : "outlined"}
            />
            <Chip 
              icon={<CheckCircleIcon />} 
              label={`${metrics.approved} Approved`}
              color="success"
              variant={metrics.approved > 0 ? "filled" : "outlined"}
            />
            <Chip 
              label={`${metrics.skipped} Skipped`}
              color="default"
              variant={metrics.skipped > 0 ? "filled" : "outlined"}
            />
          </Stack>
        </CardContent>
      </Card>
      
      {/* Sample data preview */}
      <SampleDataTable 
        sheet={selectedSheet}
        maxRows={5}
        showDataTypes={true}
      />
      
      {/* Column mapping tables */}
      {viewMode === 'grouped' ? (
        // Grouped by data type view
        <>
          {Object.entries(groupedColumns).map(([dataType, columns]) => (
            <Box key={dataType} sx={{ mt: 3 }}>
              <Typography 
                variant="subtitle1" 
                gutterBottom
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  color: getDataTypeColor(dataType),
                  fontWeight: 'medium'
                }}
              >
                <Chip 
                  label={dataType.toUpperCase()}
                  size="small"
                  sx={{ bgcolor: getDataTypeColor(dataType), color: 'white' }}
                />
                {getDataTypeLabel(dataType)}
                <Typography variant="caption" color="text.secondary">
                  ({columns.length} columns)
                </Typography>
              </Typography>
              
              <ColumnMappingTable
                columns={columns}
                onDataTypeChange={handleDataTypeChange}
                onMappedNameChange={handleMappedNameChange}
                onSkipToggle={handleSkipToggle}
                dataTypes={dataTypes}
                tableSchema={tableSchema}
              />
            </Box>
          ))}
        </>
      ) : (
        // Original order view
        <Box sx={{ mt: 3 }}>
          <ColumnMappingTable
            columns={selectedSheet.columns}
            onDataTypeChange={handleDataTypeChange}
            onMappedNameChange={handleMappedNameChange}
            onSkipToggle={handleSkipToggle}
            dataTypes={dataTypes}
            tableSchema={tableSchema}
          />
        </Box>
      )}
    </Box>
  );
};

// Helper component for the column mapping table
interface ColumnMappingTableProps {
  columns: ColumnMapping[];
  onDataTypeChange: (columnName: string, dataType: SupabaseDataType) => void;
  onMappedNameChange: (columnName: string, mappedName: string) => void;
  onSkipToggle: (columnName: string, skip: boolean) => void;
  dataTypes: SupabaseDataType[];
  tableSchema: any;
}

const ColumnMappingTable: React.FC<ColumnMappingTableProps> = ({
  columns,
  onDataTypeChange,
  onMappedNameChange,
  onSkipToggle,
  dataTypes,
  tableSchema
}) => {
  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Source Column</TableCell>
            <TableCell>Database Field</TableCell>
            <TableCell>Data Type</TableCell>
            <TableCell>Confidence</TableCell>
            <TableCell>Skip</TableCell>
            <TableCell>Sample</TableCell>
          </TableRow>
        </TableHead>
        
        <TableBody>
          {columns.map((column) => (
            <TableRow 
              key={column.originalName}
              sx={{ 
                backgroundColor: column.skip ? 'rgba(0, 0, 0, 0.04)' : 'transparent',
                '&:nth-of-type(odd)': { 
                  backgroundColor: column.skip ? 'rgba(0, 0, 0, 0.06)' : 'rgba(0, 0, 0, 0.02)'
                },
                '&:hover': {
                  backgroundColor: 'action.hover',
                }
              }}
            >
              {/* Original column name */}
              <TableCell sx={{ 
                fontWeight: 'medium',
                color: column.skip ? 'text.disabled' : 'text.primary'
              }}>
                {column.originalName}
              </TableCell>
              
              {/* Mapped field name */}
              <TableCell>
                <TextField
                  size="small"
                  value={column.mappedName}
                  onChange={(e) => onMappedNameChange(column.originalName, e.target.value)}
                  disabled={column.skip}
                  fullWidth
                  error={!column.mappedName && !column.skip}
                  helperText={!column.mappedName && !column.skip ? "Required" : undefined}
                />
              </TableCell>
              
              {/* Data type selector */}
              <TableCell>
                <FormControl size="small" fullWidth disabled={column.skip}>
                  <Select
                    value={column.dataType}
                    onChange={(e) => onDataTypeChange(column.originalName, e.target.value as SupabaseDataType)}
                    renderValue={(value) => (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="inherit" noWrap>
                          {value}
                        </Typography>
                      </Box>
                    )}
                  >
                    {dataTypes.map((type) => (
                      <MenuItem key={type} value={type}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip 
                            label={type}
                            size="small"
                            sx={{ 
                              bgcolor: getDataTypeColor(type),
                              color: 'white',
                              width: 80,
                              fontSize: '0.7rem',
                              height: 20
                            }}
                          />
                          <Typography variant="body2">
                            {getDataTypeLabel(type)}
                          </Typography>
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </TableCell>
              
              {/* Confidence score */}
              <TableCell>
                <Box>
                  <Chip 
                    label={`${column.confidence}%`}
                    size="small"
                    color={getConfidenceColor(column.confidence)}
                  />
                </Box>
              </TableCell>
              
              {/* Skip toggle */}
              <TableCell>
                <FormControlLabel
                  control={
                    <Switch
                      checked={column.skip}
                      onChange={(e) => onSkipToggle(column.originalName, e.target.checked)}
                      size="small"
                    />
                  }
                  label={column.skip ? "Skip" : "Import"}
                  sx={{ m: 0 }}
                />
              </TableCell>
              
              {/* Sample values */}
              <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {column.sample && column.sample.length > 0 
                  ? String(column.sample[0]).substring(0, 30) + (String(column.sample[0]).length > 30 ? '...' : '')
                  : '—'
                }
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

// Helper function to get sheet status icon
const getSheetStatusIcon = (sheet: SheetMapping) => {
  if (sheet.error) return <WarningIcon color="error" />;
  if (sheet.approved) return <CheckCircleIcon color="success" />;
  if (sheet.needsReview) return <WarningIcon color="warning" />;
  return null;
};

// Helper function to get data type color
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

// Helper function to get confidence color
const getConfidenceColor = (confidence: number): 'success' | 'warning' | 'error' | 'default' => {
  if (confidence >= 90) return 'success';
  if (confidence >= 70) return 'warning';
  if (confidence < 70) return 'error';
  return 'default';
};

// Helper function to get descriptive data type label
const getDataTypeLabel = (dataType: string): string => {
  switch (dataType) {
    case 'text':
      return 'Text (String)';
    case 'numeric':
      return 'Numeric (Decimal)';
    case 'integer':
      return 'Integer (Whole Number)';
    case 'boolean':
      return 'Boolean (True/False)';
    case 'date':
      return 'Date (No Time)';
    case 'timestamp':
      return 'Timestamp (Date & Time)';
    case 'uuid':
      return 'UUID';
    default:
      return dataType;
  }
};

export default ColumnMappingStep;