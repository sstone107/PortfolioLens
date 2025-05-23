/**
 * Enhanced Template Editor Dialog
 * Provides structured sheet-by-sheet review and editing of import templates
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Grid,
  Tabs,
  Tab,
  Typography,
  TextField,
  Button,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Switch,
  FormControlLabel,
  CircularProgress,
  IconButton,
  Tooltip,
  Stack,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListSubheader,
  Alert,
  AlertTitle
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import UndoIcon from '@mui/icons-material/Undo';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import InfoIcon from '@mui/icons-material/Info';
import TableChartIcon from '@mui/icons-material/TableChart';
import ErrorIcon from '@mui/icons-material/Error';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { MappingTemplate, SheetMapping, ColumnMapping } from '../../../store/batchImportStore';
import { editTemplate } from '../mappingLogic';
import { supabaseClient } from '../../../utility/supabaseClient';
import { recordMetadataService } from '../services/RecordMetadataService';
import { safeColumnName, needsColumnTransformation } from '../utils/columnNameUtils';
import { normalizeForDb } from '../utils/stringUtils';
import { normalizeDataType } from '../services/mappingEngine';

// Available data types
const dataTypes = [
  'text',
  'varchar',
  'char',
  'integer',
  'bigint',
  'smallint',
  'decimal',
  'numeric',
  'real',
  'float',
  'boolean',
  'date',
  'time',
  'timestamp',
  'timestamptz',
  'interval',
  'json',
  'jsonb',
  'uuid',
  'array'
];

interface TemplateEditorDialogProps {
  open: boolean;
  onClose: () => void;
  template: MappingTemplate | null;
  onSuccess: (updatedTemplate: MappingTemplate) => void;
}

/**
 * Enhanced template editor with sheet-by-sheet navigation
 */
const TemplateEditorDialog: React.FC<TemplateEditorDialogProps> = ({
  open,
  onClose,
  template,
  onSuccess
}) => {
  // Template metadata state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [filePattern, setFilePattern] = useState('');
  const [servicerId, setServicerId] = useState<string>('');
  
  // State for template sheets and columns
  const [sheets, setSheets] = useState<SheetMapping[]>([]);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  
  // Track changes for version management
  const [hasChanges, setHasChanges] = useState(false);
  const [originalTemplate, setOriginalTemplate] = useState<MappingTemplate | null>(null);
  
  // Loading and error state
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  
  // Available servicers
  const [servicers, setServicers] = useState<any[]>([]);
  const [loadingServicers, setLoadingServicers] = useState(false);
  
  // Reset and initialize form when template changes
  useEffect(() => {
    if (template) {
      // Store the original template for change detection
      setOriginalTemplate(JSON.parse(JSON.stringify(template)));
      
      // Basic template metadata
      setName(template.name || '');
      setDescription(template.description || '');
      setFilePattern(template.filePattern || '');
      setServicerId(template.servicerId || '');
      
      // Process sheet mappings with enhanced parsing
      let sheetMappings: SheetMapping[] = [];
      
      console.log('Raw template sheetMappings:', template.sheetMappings);
      
      // Handle different formats of sheet mappings in template
      if (template.sheetMappings) {
        // If sheetMappings is already an array, use it directly
        if (Array.isArray(template.sheetMappings)) {
          console.log('SheetMappings is already an array');
          sheetMappings = template.sheetMappings;
        } 
        // If sheetMappings is an object with a 'sheets' key (nested object format)
        else if (typeof template.sheetMappings === 'object' && 'sheets' in template.sheetMappings) {
          console.log('SheetMappings is an object with sheets key');
          sheetMappings = template.sheetMappings.sheets;
        }
        // If sheetMappings is a string, try to parse it
        else if (typeof template.sheetMappings === 'string') {
          try {
            console.log('SheetMappings is a string, attempting to parse');
            const parsed = JSON.parse(template.sheetMappings);
            // Check if the parsed result is an array or has a sheets key
            if (Array.isArray(parsed)) {
              sheetMappings = parsed;
            } else if (parsed && typeof parsed === 'object' && 'sheets' in parsed) {
              sheetMappings = parsed.sheets;
            }
          } catch (e) {
            console.error('Failed to parse sheetMappings string:', e);
          }
        }
        // If sheetMappings is another object type, try to extract array data
        else if (typeof template.sheetMappings === 'object') {
          console.log('SheetMappings is an object without sheets key');
          // As a fallback, try to convert the object to an array if it's iterable
          try {
            const entries = Object.entries(template.sheetMappings);
            if (entries.length > 0) {
              // Check if the entries look like array indices
              const possibleArray = entries.every(([key]) => !isNaN(Number(key)));
              if (possibleArray) {
                sheetMappings = entries.map(([_, value]) => value as SheetMapping);
                console.log('Converted object to array:', sheetMappings);
              }
            }
          } catch (e) {
            console.error('Failed to extract array from sheetMappings object:', e);
          }
        }
      }
      
      console.log('Processed sheetMappings:', sheetMappings);
      
      // Ensure sheetMappings is always an array
      if (!Array.isArray(sheetMappings)) {
        console.warn('SheetMappings is still not an array after processing, using empty array');
        sheetMappings = [];
      }
      
      // Process and normalize the loaded sheets
      const normalizedSheets = sheetMappings.map(sheet => {
        // Create a copy of the sheet to avoid mutating the original
        const processedSheet = {...sheet};
        
        // Process columns if they exist
        if (Array.isArray(processedSheet.columns)) {
          processedSheet.columns = processedSheet.columns.map(column => {
            // Create a copy of the column
            const processedColumn = {...column};
            
            // Normalize the data type to ensure it's compatible with the UI dropdown
            if (processedColumn.dataType) {
              const normalizedType = normalizeDataType(processedColumn.dataType);
              
              // Log if the type was normalized for debugging
              if (normalizedType !== processedColumn.dataType) {
                console.log(`Normalized data type: ${processedColumn.dataType} -> ${normalizedType}`);
              }
              
              // Update the column with the normalized type
              processedColumn.dataType = normalizedType;
            }
            
            // Handle invalid or out-of-range values
            // Check for out-of-range data types
            if (processedColumn.dataType) {
              processedColumn.outOfRangeMapping = !dataTypes.includes(processedColumn.dataType);
            }
            
            // Check for custom field names not in standard list
            if (processedColumn.mappedName && processedColumn.mappedName !== '_create_new_') {
              const standardFields = ["", "_create_new_", "id", "name", "description", "amount", "status", "created_at", "updated_at"];
              processedColumn.customFieldMapping = !standardFields.includes(processedColumn.mappedName);
            }
            
            return processedColumn;
          });
        }
        
        return processedSheet;
      });
      
      console.log('Normalized sheets:', normalizedSheets);
      
      setSheets(normalizedSheets);
      setSelectedSheetIndex(normalizedSheets.length > 0 ? 0 : -1);
      
      // Reset state
      setHasChanges(false);
      setError(null);
      setValidationErrors({});
      
      // Load servicers
      loadServicers();
    }
  }, [template]);
  
  // Load available servicers
  const loadServicers = async () => {
    try {
      setLoadingServicers(true);
      const { data, error } = await supabaseClient
        .from('servicers')
        .select('*')
        .eq('active', true)
        .order('name');
        
      if (error) throw error;
      
      setServicers(data || []);
    } catch (err) {
      console.error('Error loading servicers:', err);
    } finally {
      setLoadingServicers(false);
    }
  };
  
  // Handle sheet selection
  const handleSheetSelect = (index: number) => {
    setSelectedSheetIndex(index);
  };
  
  // Handle updating a sheet property
  const handleSheetUpdate = (sheetIndex: number, field: string, value: any) => {
    const updatedSheets = [...sheets];
    
    // Update the specific field
    updatedSheets[sheetIndex] = {
      ...updatedSheets[sheetIndex],
      [field]: value
    };
    
    setSheets(updatedSheets);
    setHasChanges(true);
  };
  
  // Handle updating a column property
  const handleColumnUpdate = (sheetIndex: number, columnIndex: number, field: string, value: any) => {
    const updatedSheets = [...sheets];
    
    // Get the current column
    const currentColumn = { ...updatedSheets[sheetIndex].columns[columnIndex] };
    
    // Update the specific field
    currentColumn[field] = value;
    
    // Special handling for mappedName field
    if (field === 'mappedName') {
      // If it's a new field (create new), set the createNewValue
      if (value === '_create_new_') {
        // Generate a normalized field name from the original name
        currentColumn.createNewValue = normalizeForDb(currentColumn.originalName);
      } else {
        // Clear the createNewValue if not creating a new field
        currentColumn.createNewValue = undefined;
      }
      
      // Check if the field name is valid for DB
      validateFieldName(currentColumn, sheetIndex, columnIndex);
    }
    
    // Special handling for createNewValue - validate it
    if (field === 'createNewValue') {
      validateFieldName(currentColumn, sheetIndex, columnIndex);
    }
    
    // Update the column in the sheets array
    updatedSheets[sheetIndex].columns[columnIndex] = currentColumn;
    
    setSheets(updatedSheets);
    setHasChanges(true);
  };
  
  // Validate a field name
  const validateFieldName = (column: any, sheetIndex: number, columnIndex: number) => {
    // Skip validation if not creating a new field
    if (column.mappedName !== '_create_new_' || !column.createNewValue) {
      // Remove any existing validation error
      if (validationErrors[`${sheetIndex}-${columnIndex}`]) {
        const newErrors = { ...validationErrors };
        delete newErrors[`${sheetIndex}-${columnIndex}`];
        setValidationErrors(newErrors);
      }
      return;
    }
    
    // Check if the field name matches the database naming pattern
    const pattern = /^[a-z][a-z0-9_]*$/;
    if (!pattern.test(column.createNewValue)) {
      setValidationErrors(prev => ({
        ...prev,
        [`${sheetIndex}-${columnIndex}`]: 'Field name must start with a letter and contain only lowercase letters, numbers, and underscores'
      }));
    } else {
      // Remove the error if it's valid
      const newErrors = { ...validationErrors };
      delete newErrors[`${sheetIndex}-${columnIndex}`];
      setValidationErrors(newErrors);
    }
  };
  
  // State for success notification
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Save template changes
  const handleSave = async () => {
    // Validate required fields
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }
    
    // Check for any validation errors
    if (Object.keys(validationErrors).length > 0) {
      setError('Please fix validation errors before saving');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSaveSuccess(false);
    
    try {
      // Prepare updated template object
      const updatedTemplate: Partial<MappingTemplate> = {
        id: template?.id,
        name,
        description,
        filePattern,
        servicerId: servicerId || undefined,
        headerRow: template?.headerRow || 0,
        tablePrefix: template?.tablePrefix,
        sheetMappings: sheets,
        version: (template?.version || 1) + (hasChanges ? 1 : 0) // Increment version if changes were made
      };
      
      console.log('Saving template with data:', updatedTemplate);
      
      // Call API to update the template
      const result = await editTemplate(template?.id || '', updatedTemplate);
      
      // Record the edit in audit log
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user && hasChanges) {
          await recordMetadataService.createAuditRecord({
            userId: user.id,
            action: 'template_edit',
            entityType: 'template',
            entityId: template?.id || '',
            entityName: name,
            details: {
              previousVersion: template?.version || 1,
              newVersion: updatedTemplate.version,
              updatedAt: new Date().toISOString()
            }
          });
        }
      } catch (auditError) {
        console.warn('Failed to create audit record:', auditError);
        // Non-critical error, continue
      }
      
      // Show success message briefly before closing
      setSaveSuccess(true);
      console.log('Template saved successfully:', result);
      
      // Update the displayed template data
      if (template) {
        setOriginalTemplate(result);
        // Update sheets from the result to ensure we display what was actually saved
        if (result.sheetMappings) {
          // Apply the same parsing logic used in the useEffect
          let resultSheetMappings: SheetMapping[] = [];
          
          if (Array.isArray(result.sheetMappings)) {
            resultSheetMappings = result.sheetMappings;
          } else if (typeof result.sheetMappings === 'object' && 'sheets' in result.sheetMappings) {
            resultSheetMappings = result.sheetMappings.sheets;
          } else if (typeof result.sheetMappings === 'string') {
            try {
              const parsed = JSON.parse(result.sheetMappings);
              if (Array.isArray(parsed)) {
                resultSheetMappings = parsed;
              } else if (parsed && typeof parsed === 'object' && 'sheets' in parsed) {
                resultSheetMappings = parsed.sheets;
              }
            } catch (e) {
              console.error('Failed to parse result sheetMappings:', e);
            }
          }
          
          setSheets(resultSheetMappings);
        }
      }
      
      // Reset the hasChanges flag
      setHasChanges(false);
      
      // Delay closing to show success message
      setTimeout(() => {
        onSuccess(result);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error saving template:', err);
      setError(err instanceof Error ? err.message : 'Failed to update template');
    } finally {
      setLoading(false);
    }
  };
  
  // Render the sheet navigation sidebar
  const renderSheetNavigation = () => {
    if (!sheets.length) {
      return (
        <Alert severity="info" sx={{ mt: 2 }}>
          No sheets found in this template
        </Alert>
      );
    }
    
    return (
      <List
        component={Paper}
        variant="outlined"
        sx={{ 
          maxHeight: '400px',
          overflow: 'auto',
          width: '100%'
        }}
        subheader={
          <ListSubheader component="div">
            Template Sheets
          </ListSubheader>
        }
      >
        {sheets.map((sheet, index) => (
          <ListItem
            key={sheet.id || index}
            button
            selected={selectedSheetIndex === index}
            onClick={() => handleSheetSelect(index)}
            secondaryAction={
              sheet.skip ? (
                <Chip
                  size="small"
                  label="Skipped"
                  color="default"
                  icon={<SkipNextIcon />}
                />
              ) : sheet.needsReview ? (
                <Chip
                  size="small"
                  label="Needs Review"
                  color="warning"
                  icon={<WarningIcon />}
                />
              ) : (
                <Chip
                  size="small"
                  label="Approved"
                  color="success"
                  icon={<CheckCircleIcon />}
                />
              )
            }
          >
            <ListItemIcon>
              <TableChartIcon color="primary" />
            </ListItemIcon>
            <ListItemText
              primary={sheet.originalName}
              secondary={`→ ${sheet.mappedName || 'Not mapped'}`}
              primaryTypographyProps={{ variant: 'body2' }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </ListItem>
        ))}
      </List>
    );
  };
  
  // Render sheet editor panel
  const renderSheetEditor = () => {
    if (selectedSheetIndex === -1 || !sheets[selectedSheetIndex]) {
      return (
        <Alert severity="info">
          <AlertTitle>No Sheet Selected</AlertTitle>
          Select a sheet from the sidebar to view and edit its mappings
        </Alert>
      );
    }
    
    const selectedSheet = sheets[selectedSheetIndex];
    
    return (
      <Box>
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            Sheet: {selectedSheet.originalName}
          </Typography>
          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={!selectedSheet.skip}
                  onChange={(e) => handleSheetUpdate(selectedSheetIndex, 'skip', !e.target.checked)}
                  color="primary"
                />
              }
              label="Include in Import"
            />
          </Box>
        </Box>
        
        <Box sx={{ mb: 2 }}>
          <TextField
            label="Mapped Table Name"
            value={selectedSheet.mappedName || ''}
            onChange={(e) => handleSheetUpdate(selectedSheetIndex, 'mappedName', e.target.value)}
            size="small"
            fullWidth
            helperText="The database table this sheet will be imported into"
          />
        </Box>
        
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Original Column</TableCell>
                <TableCell>Mapped Field</TableCell>
                <TableCell>Data Type</TableCell>
                <TableCell width={120}>Import</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {selectedSheet.columns?.map((column, colIndex) => {
                const isNewField = column.mappedName === '_create_new_';
                const hasError = !!validationErrors[`${selectedSheetIndex}-${colIndex}`];
                
                return (
                  <TableRow key={column.originalIndex || colIndex}
                            sx={{ backgroundColor: (column.outOfRangeMapping || column.customFieldMapping) ? 'rgba(255, 243, 224, 0.2)' : 'inherit' }}
                  >
                    <TableCell>{column.originalName}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {/* Field mapping dropdown or text field for new field creation */}
                        <FormControl 
                          fullWidth 
                          size="small"
                          error={hasError}
                          sx={{ borderColor: column.customFieldMapping ? 'info.main' : undefined }}
                        >
                          <Select
                            value={column.mappedName || ''}
                            onChange={(e) => handleColumnUpdate(selectedSheetIndex, colIndex, 'mappedName', e.target.value)}
                            displayEmpty
                            renderValue={(selected) => {
                              // Handle custom field names that might not be in dropdown options
                              const standardFields = ["", "_create_new_", "id", "name", "description", "amount", "status", "created_at", "updated_at"];
                              
                              if (selected && !standardFields.includes(selected)) {
                                // Set the customFieldMapping flag for visual indication
                                if (!column.customFieldMapping) {
                                  setTimeout(() => {
                                    handleColumnUpdate(selectedSheetIndex, colIndex, 'customFieldMapping', true);
                                  }, 0);
                                }
                                
                                return (
                                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Typography variant="body2" sx={{ mr: 1 }}>{selected}</Typography>
                                    {needsColumnTransformation(selected) && (
                                      <Tooltip title={`Will be saved as: ${safeColumnName(selected)}`}>
                                        <WarningIcon fontSize="small" color="warning" sx={{ ml: 0.5 }} />
                                      </Tooltip>
                                    )}
                                    <Tooltip title="Custom field, not in standard list">
                                      <InfoIcon fontSize="small" color="info" />
                                    </Tooltip>
                                  </Box>
                                );
                              }
                              
                              if (selected === "") return <em>Select field...</em>;
                              if (selected === "_create_new_") return <em>Create New Field</em>;
                              
                              // Check if the selected field needs transformation
                              if (needsColumnTransformation(selected)) {
                                return (
                                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Typography variant="body2">{selected}</Typography>
                                    <Tooltip title={`Will be saved as: ${safeColumnName(selected)}`}>
                                      <WarningIcon fontSize="small" color="warning" sx={{ ml: 0.5 }} />
                                    </Tooltip>
                                  </Box>
                                );
                              }
                              
                              return selected;
                            }}
                          >
                            <MenuItem value="">
                              <em>Select field...</em>
                            </MenuItem>
                            <MenuItem value="_create_new_">
                              <em>Create New Field</em>
                            </MenuItem>
                            {/* Here you would add existing fields from database schema */}
                            <MenuItem value="id">id</MenuItem>
                            <MenuItem value="name">name</MenuItem>
                            <MenuItem value="description">description</MenuItem>
                            <MenuItem value="amount">amount</MenuItem>
                            <MenuItem value="status">status</MenuItem>
                            <MenuItem value="created_at">created_at</MenuItem>
                            <MenuItem value="updated_at">updated_at</MenuItem>
                          </Select>
                        </FormControl>
                        
                        {/* Custom field indicator */}
                        {column.customFieldMapping && !isNewField && (
                          <Tooltip title="Custom field name, not from standard list">
                            <InfoIcon color="info" sx={{ ml: 1, fontSize: '1.2rem' }} />
                          </Tooltip>
                        )}
                        
                        {/* New field name input */}
                        {isNewField && (
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                            <TextField
                              value={column.createNewValue || ''}
                              onChange={(e) => handleColumnUpdate(selectedSheetIndex, colIndex, 'createNewValue', e.target.value)}
                              size="small"
                              error={hasError}
                              helperText={
                                hasError 
                                  ? validationErrors[`${selectedSheetIndex}-${colIndex}`] 
                                  : (column.createNewValue && needsColumnTransformation(column.createNewValue)
                                      ? `Will be saved as: ${safeColumnName(column.createNewValue)}`
                                      : '')
                              }
                              placeholder="new_field_name"
                              sx={{ mt: hasError ? 3 : 0 }}
                            />
                            {column.createNewValue && needsColumnTransformation(column.createNewValue) && (
                              <Tooltip title="Column name will be transformed to be PostgreSQL-compatible">
                                <WarningIcon fontSize="small" color="warning" sx={{ mt: 1 }} />
                              </Tooltip>
                            )}
                          </Box>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, position: 'relative' }}>
                        <FormControl 
                          fullWidth 
                          size="small"
                          error={column.outOfRangeMapping}
                        >
                          <Select
                            value={dataTypes.includes(column.dataType || 'text') ? column.dataType || 'text' : 'text'}
                            onChange={(e) => handleColumnUpdate(selectedSheetIndex, colIndex, 'dataType', e.target.value)}
                            disabled={!isNewField} // Only allow editing for new fields
                          >
                            {dataTypes.map(type => (
                              <MenuItem key={type} value={type}>
                                {type}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        {column.outOfRangeMapping && (
                          <Tooltip title={`Original data type '${column.dataType}' is not in standard list. Using normalized value.`}>
                            <WarningIcon color="warning" sx={{ ml: 1, fontSize: '1.2rem' }} />
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <FormControlLabel
                        control={
                          <Switch
                            checked={!column.skip}
                            onChange={(e) => handleColumnUpdate(selectedSheetIndex, colIndex, 'skip', !e.target.checked)}
                            color="primary"
                          />
                        }
                        label=""
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };
  
  return (
    <Dialog 
      open={open} 
      onClose={loading ? undefined : onClose} 
      maxWidth="lg" 
      fullWidth
    >
      <DialogTitle>
        Edit Template: {template?.name}
        {hasChanges && (
          <Chip
            label="Unsaved Changes"
            color="warning"
            size="small"
            sx={{ ml: 2 }}
          />
        )}
      </DialogTitle>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {saveSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Template saved successfully! (Version {(template?.version || 1) + 1})
          </Alert>
        )}
        
        {/* Show info message if any fields have custom/out-of-range values */}
        {sheets.some(sheet => 
          sheet.columns?.some(col => col.outOfRangeMapping || col.customFieldMapping)
        ) && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <AlertTitle>Template contains non-standard fields</AlertTitle>
            <Typography variant="body2">
              Some fields in this template use non-standard data types or custom field names. 
              These are highlighted with <WarningIcon color="warning" sx={{ fontSize: '1rem', verticalAlign: 'middle' }} /> 
              and <InfoIcon color="info" sx={{ fontSize: '1rem', verticalAlign: 'middle' }} /> icons.
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Yellow background indicates fields that required normalization. 
              All values have been automatically adjusted to ensure compatibility.
            </Typography>
          </Alert>
        )}
        
        {/* Template Header Section */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Template Name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setHasChanges(true);
                }}
                fullWidth
                required
                error={!name.trim()}
                helperText={!name.trim() ? "Template name is required" : ""}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                label="File Pattern"
                value={filePattern}
                onChange={(e) => {
                  setFilePattern(e.target.value);
                  setHasChanges(true);
                }}
                fullWidth
                placeholder="e.g., *_monthly_report.xlsx"
                helperText="Pattern to match filenames (e.g., 'remittance_*.xlsx')"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setHasChanges(true);
                }}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth disabled={loadingServicers}>
                <InputLabel>Servicer</InputLabel>
                <Select
                  value={servicerId}
                  onChange={(e) => {
                    setServicerId(e.target.value);
                    setHasChanges(true);
                  }}
                  label="Servicer"
                >
                  <MenuItem value="">
                    <em>None (All Servicers)</em>
                  </MenuItem>
                  {servicers.map((servicer) => (
                    <MenuItem key={servicer.id} value={servicer.id}>
                      {servicer.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Template ID: {template?.id}
                </Typography>
                <Typography variant="subtitle2" color="text.secondary">
                  Version: {template?.version || 1}
                  {hasChanges && (
                    <Chip
                      label={`→ ${(template?.version || 1) + 1}`}
                      color="primary"
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  )}
                </Typography>
                <Typography variant="subtitle2" color="text.secondary">
                  Created: {template?.createdAt ? new Date(template.createdAt).toLocaleString() : 'N/A'}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>
        
        {/* Sheet Editing Section */}
        <Grid container spacing={2}>
          {/* Sheet Navigation */}
          <Grid item xs={12} md={3}>
            {renderSheetNavigation()}
          </Grid>
          
          {/* Sheet Editor */}
          <Grid item xs={12} md={9}>
            {renderSheetEditor()}
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          color="primary"
          disabled={loading || !name.trim() || Object.keys(validationErrors).length > 0}
          startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
        >
          {loading ? 'Saving...' : (hasChanges ? `Save as v${(template?.version || 1) + 1}` : 'Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TemplateEditorDialog;