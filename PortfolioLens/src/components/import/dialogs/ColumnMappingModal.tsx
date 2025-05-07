import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  FormControl,
  Select,
  MenuItem,
  ListSubheader,
  Chip,
  Tooltip,
  CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import { ColumnMapping } from '../types';
import { inferDataType } from '../dataTypeInference';

/**
 * Column Mapping Modal Component
 * Allows users to map Excel columns to database columns
 */
export const ColumnMappingModal: React.FC<{
  open: boolean;
  onClose: () => void;
  sheetName: string;
  tableName: string;
  sampleData: any[];
  availableColumns: string[];
  existingMappings?: Record<string, any>;
  onSaveMappings: (mappings: Record<string, any>) => void;
  isNewTable: boolean;
  isLoadingColumns?: boolean;
}> = ({
  open,
  onClose,
  sheetName,
  tableName,
  sampleData,
  availableColumns,
  existingMappings = {},
  onSaveMappings,
  isNewTable,
  isLoadingColumns = false
}) => {
  // State for the working mappings
  const [mappings, setMappings] = useState<Record<string, any>>({});
  
  // State to track whether initial setup has been completed
  const [initialSetupDone, setInitialSetupDone] = useState(false);
  
  // Helper function to normalize strings for comparison
  const normalizeString = (str: string): string => {
    return str.toLowerCase()
      .replace(/[\s\-_]+/g, '_') // Replace spaces, hyphens, and underscores with underscore
      .replace(/[^a-z0-9_]/g, ''); // Remove other special characters
  };
  
  // Calculate the suggestion score for a candidate column
  const calculateSuggestionScore = useCallback((sourceColumn: string, candidateColumn: string): number => {
    const normalizedSource = normalizeString(sourceColumn);
    const normalizedCandidate = normalizeString(candidateColumn);
    
    // Exact normalized match
    if (normalizedCandidate === normalizedSource) {
      return 1.0;
    }
    
    // Partial match (one contains the other)
    if (normalizedCandidate.includes(normalizedSource) || normalizedSource.includes(normalizedCandidate)) {
      // Score based on the relative lengths (percentage of overlap)
      const sourceLen = normalizedSource.length;
      const targetLen = normalizedCandidate.length;
      const maxLen = Math.max(sourceLen, targetLen);
      const minLen = Math.min(sourceLen, targetLen);
      return 0.7 + (0.3 * (minLen / maxLen)); // Score between 0.7 and 1.0
    }
    
    // Initial letter match with some similarity
    if (normalizedCandidate.charAt(0) === normalizedSource.charAt(0)) {
      // Calculate a basic similarity score
      let commonChars = 0;
      const maxLen = Math.max(normalizedSource.length, normalizedCandidate.length);
      const minLen = Math.min(normalizedSource.length, normalizedCandidate.length);
      
      for (let i = 0; i < minLen; i++) {
        if (normalizedSource.charAt(i) === normalizedCandidate.charAt(i)) {
          commonChars++;
        }
      }
      
      return 0.3 + (0.4 * (commonChars / maxLen)); // Score between 0.3 and 0.7
    }
    
    return 0.0; // No match
  }, [normalizeString]);

  // Find the best match in availableColumns for a given source column
  const findBestMatch = useCallback((sourceColumn: string): string | null => {
    // If no available columns, return null or create a normalized version for new tables
    if (!availableColumns || availableColumns.length === 0) {
      if (isNewTable) {
        return normalizeString(sourceColumn);
      }
      return null;
    }
    
    // Check for an exact case-insensitive match
    const exactMatch = availableColumns.find(col => 
      col.toLowerCase() === sourceColumn.toLowerCase()
    );
    if (exactMatch) {
      console.log(`[DEBUG] Found exact match for ${sourceColumn}: ${exactMatch}`);
      return exactMatch;
    }
    
    // Check for a normalized match
    const normalizedSource = normalizeString(sourceColumn);
    const normalizedMatch = availableColumns.find(col => 
      normalizeString(col) === normalizedSource
    );
    if (normalizedMatch) {
      console.log(`[DEBUG] Found normalized match for ${sourceColumn}: ${normalizedMatch}`);
      return normalizedMatch;
    }
    
    // Calculate scores for all available columns
    const scoredColumns = availableColumns.map(col => ({
      column: col,
      score: calculateSuggestionScore(sourceColumn, col)
    }));
    
    // Sort by score (highest first) and get highest score
    scoredColumns.sort((a, b) => b.score - a.score);
    
    // Use the highest scoring column if it's good enough
    if (scoredColumns.length > 0 && scoredColumns[0].score >= 0.7) {
      console.log(`[DEBUG] Found high confidence match for ${sourceColumn}: ${scoredColumns[0].column} (score: ${scoredColumns[0].score})`);
      return scoredColumns[0].column;
    }
    
    // For new tables, always use the normalized column name
    if (isNewTable) {
      return normalizeString(sourceColumn);
    }
    
    return null;
  }, [availableColumns, isNewTable, normalizeString, calculateSuggestionScore]);
  
  // Get all suggestions for a source column with confidence scores
  const getSuggestions = useCallback((sourceColumn: string): Array<{column: string, score: number}> => {
    if (!availableColumns || availableColumns.length === 0) {
      if (isNewTable) {
        const normalizedCol = normalizeString(sourceColumn);
        return [{column: normalizedCol, score: 1.0}];
      }
      return [];
    }
    
    // Calculate scores for all available columns using the same function as findBestMatch
    const suggestions = availableColumns.map(col => ({
      column: col,
      score: calculateSuggestionScore(sourceColumn, col)
    }))
    .filter(suggestion => suggestion.score > 0); // Remove zero-score suggestions
    
    // For new tables, always include the normalized version of the column name with high score
    if (isNewTable) {
      const normalizedCol = normalizeString(sourceColumn);
      if (!suggestions.some(s => s.column === normalizedCol)) {
        suggestions.push({column: normalizedCol, score: 0.95});
      }
    }
    
    // Sort by score (highest first)
    return suggestions.sort((a, b) => b.score - a.score);
  }, [availableColumns, isNewTable, normalizeString, calculateSuggestionScore]);
  
  // Reference to track last available columns count
  const prevAvailableColumnsCountRef = useRef(0);
  
  // Initialize mappings when the modal opens or available columns are loaded
  useEffect(() => {
    // Reset the initialization flag if modal reopens
    if (!open && initialSetupDone) {
      console.log(`[DEBUG] Modal closed, resetting initialization state`);
      setInitialSetupDone(false);
      prevAvailableColumnsCountRef.current = 0;
      return;
    }
    
    // Check if we should initialize or reinitialize
    const shouldInitialize = open && (
      !initialSetupDone || 
      (availableColumns && 
       availableColumns.length > 0 && 
       availableColumns.length !== prevAvailableColumnsCountRef.current)
    );
    
    if (!shouldInitialize) return;
    
    // Update columns count reference
    if (availableColumns) {
      prevAvailableColumnsCountRef.current = availableColumns.length;
    }
    
    console.log(`[DEBUG] Initializing mappings for ${sheetName}. Available columns:`, 
      availableColumns ? availableColumns.length : 0);
    
    // Function to create and validate mappings
    const createMappings = () => {
      let newMappings: Record<string, any> = {};
      
      // Check for existing mappings
      if (existingMappings && Object.keys(existingMappings).length > 0) {
        // Use existing mappings with validation
        console.log(`[DEBUG] Using existing mappings with validation:`, existingMappings);
        newMappings = JSON.parse(JSON.stringify(existingMappings)); // Deep clone
        
        // Validate each existing mapping
        Object.keys(newMappings).forEach(sourceCol => {
          try {
            const mapping = newMappings[sourceCol];
            if (!mapping) return;
            
            // Handle skipped columns
            if (mapping.skipped) {
              mapping.dbColumn = '';
              mapping.mapped = false;
              return;
            }
            
            // Handle empty mappings
            if (!mapping.dbColumn) {
              // Try to find a best match
              const bestMatch = findBestMatch(sourceCol);
              if (bestMatch) {
                mapping.dbColumn = bestMatch;
                mapping.mapped = true;
                console.log(`[DEBUG] Found match for unmapped column ${sourceCol}: ${bestMatch}`);
              } else if (isNewTable) {
                mapping.dbColumn = normalizeString(sourceCol);
                mapping.mapped = true;
              }
              return;
            }
            
            // Handle special values
            if (mapping.dbColumn === '__skip__' || mapping.dbColumn === '__new_column__') {
              // These are always valid
              return;
            }
            
            // Check if the column is valid for the table
            const isValidColumn = availableColumns && availableColumns.includes(mapping.dbColumn);
            const isValidNewTableColumn = isNewTable && mapping.dbColumn === normalizeString(sourceCol);
            
            if (isValidColumn || isValidNewTableColumn) {
              // Valid mapping, ensure status is correct
              mapping.mapped = true;
            } else {
              console.warn(`[DEBUG] Invalid mapping found: ${sourceCol} -> ${mapping.dbColumn}`);
              // Invalid mapping, reset to empty and find best match
              if (isNewTable) {
                mapping.dbColumn = normalizeString(sourceCol);
                mapping.mapped = true;
              } else {
                const bestMatch = findBestMatch(sourceCol);
                if (bestMatch) {
                  mapping.dbColumn = bestMatch;
                  mapping.mapped = true;
                  console.log(`[DEBUG] Updated invalid mapping ${sourceCol} from ${mapping.dbColumn} to ${bestMatch}`);
                } else {
                  mapping.dbColumn = '';
                  mapping.mapped = false;
                }
              }
            }
          } catch (error) {
            console.error(`[ERROR] Error validating mapping for ${sourceCol}:`, error);
          }
        });
      } 
      // Create new mappings from sample data
      else if (sampleData && sampleData.length > 0 && sampleData[0]) {
        const firstRow = sampleData[0];
        
        Object.keys(firstRow || {}).forEach(sourceCol => {
          if (!sourceCol) return; // Skip undefined/null column names
          
          try {
            // Infer data type
            const columnSamples = sampleData
              .map(row => row && row[sourceCol])
              .filter(val => val !== undefined && val !== null);
            const inferredType = inferDataType(columnSamples, sourceCol);
            
            // Find best match or create new column for new tables
            let bestMatch = '';
            let isMapped = false;
            
            // For new tables, always use normalized column name
            if (isNewTable) {
              bestMatch = normalizeString(sourceCol);
              isMapped = true;
            } 
            // For existing tables, try to find a match in available columns
            else if (availableColumns && availableColumns.length > 0) {
              const match = findBestMatch(sourceCol);
              if (match) {
                bestMatch = match;
                isMapped = true;
                console.log(`[DEBUG] Auto-matched column ${sourceCol} -> ${bestMatch}`);
              }
            }
            
            // Create the mapping
            newMappings[sourceCol] = {
              excelColumn: sourceCol,
              dbColumn: bestMatch,
              type: inferredType,
              mapped: isMapped,
              skipped: false
            };
          } catch (error) {
            console.error(`[ERROR] Failed to create mapping for ${sourceCol}:`, error);
            // Create minimal mapping
            newMappings[sourceCol] = {
              excelColumn: sourceCol,
              dbColumn: isNewTable ? normalizeString(sourceCol) : '',
              type: 'string',
              mapped: isNewTable,
              skipped: false
            };
          }
        });
      }
      
      console.log('[DEBUG] Final mappings:', newMappings);
      return newMappings;
    };
    
    // Start the initialization process
    const initialize = () => {
      try {
        if (isLoadingColumns && !isNewTable) {
          console.log(`[DEBUG] Columns still loading, waiting...`);
          return;
        }
        
        // Create and validate mappings
        const newMappings = createMappings();
        setMappings(newMappings);
        setInitialSetupDone(true);
        console.log('[DEBUG] Mapping initialization complete');
      } catch (error) {
        console.error('[ERROR] Failed to initialize mappings:', error);
      }
    };
    
    // Start initialization with a small delay
    console.log(`[DEBUG] Starting mapping initialization`);
    setTimeout(initialize, 300);
    
  }, [open, availableColumns, existingMappings, sampleData, isNewTable, isLoadingColumns, sheetName, initialSetupDone, findBestMatch, normalizeString]);
  
  // Handle changing the mapping for a column
  const handleMappingChange = (sourceColumn: string, targetColumn: string) => {
    if (targetColumn === '__new_column__') {
      // Automatically create a new column based on the source column name
      const dbSafeColName = normalizeString(sourceColumn);
      
      // Set the mapping to use this newly created column
      setMappings(prev => ({
        ...prev,
        [sourceColumn]: {
          ...prev[sourceColumn],
          dbColumn: dbSafeColName,
          mapped: true,
          skipped: false
        }
      }));
      
      return;
    }
    
    if (targetColumn === '__skip__') {
      // Skip this column
      setMappings(prev => ({
        ...prev,
        [sourceColumn]: {
          ...prev[sourceColumn],
          dbColumn: '',
          mapped: false,
          skipped: true
        }
      }));
      return;
    }
    
    // Normal mapping to an existing column
    setMappings(prev => ({
      ...prev,
      [sourceColumn]: {
        ...prev[sourceColumn],
        dbColumn: targetColumn,
        mapped: true,
        skipped: false
      }
    }));
  };
  
  // Handle changing the data type for a column
  const handleDataTypeChange = (sourceColumn: string, dataType: string) => {
    setMappings(prev => ({
      ...prev,
      [sourceColumn]: {
        ...prev[sourceColumn],
        type: dataType === 'timestamp' ? 'date' : 
              dataType === 'numeric' ? 'number' : 
              dataType === 'boolean' ? 'boolean' : 'string'
      }
    }));
  };
  
  // Function to handle mapping save from modal
  const handleSave = () => {
    console.log('[DEBUG] Saving mappings:', mappings);
    // Validate mappings before saving
    const validatedMappings = { ...mappings };
    
    // Ensure all mappings have valid options
    Object.entries(validatedMappings).forEach(([sourceCol, mapping]) => {
      if (!mapping) return;
      
      // Handle special cases
      if (mapping.skipped) {
        mapping.dbColumn = '';
        mapping.mapped = false;
        return;
      }
      
      // If a column has an invalid dbColumn value, reset it
      const validOptions = [
        '',
        '__new_column__',
        '__skip__',
        ...(isNewTable ? [normalizeString(sourceCol)] : []),
        ...getSuggestions(sourceCol).map(s => s.column),
        ...(availableColumns || [])
      ];
      
      if (mapping.dbColumn && !validOptions.includes(mapping.dbColumn)) {
        console.warn(`[WARN] Invalid mapping for ${sourceCol}: ${mapping.dbColumn}`);
        // For new tables, set to normalized column name
        if (isNewTable) {
          mapping.dbColumn = normalizeString(sourceCol);
          mapping.mapped = true;
        } else {
          // For existing tables, check if we can find a valid match
          const bestMatch = findBestMatch(sourceCol);
          if (bestMatch) {
            mapping.dbColumn = bestMatch;
            mapping.mapped = true;
          } else {
            mapping.dbColumn = '';
            mapping.mapped = false;
          }
        }
      }
      
      // Handle __new_column__ special value
      if (mapping.dbColumn === '__new_column__') {
        mapping.dbColumn = normalizeString(sourceCol);
        mapping.mapped = true;
      }
    });
    
    onSaveMappings(validatedMappings);
    onClose();
  };
  
  // Function to get match confidence level for a pair of columns
  const getMatchConfidence = useCallback((sourceColumn: string, targetColumn: string): number => {
    // For normalized column names in new tables
    if (isNewTable && targetColumn === normalizeString(sourceColumn)) {
      return 1.0; // Perfect match for new tables
    }
    
    // For existing tables, calculate match score
    return calculateSuggestionScore(sourceColumn, targetColumn);
  }, [isNewTable, normalizeString, calculateSuggestionScore]);
  
  // Get confidence label based on score
  const getMatchConfidenceLabel = useCallback((sourceColumn: string, targetColumn: string): string => {
    const score = getMatchConfidence(sourceColumn, targetColumn);
    
    if (score >= 0.9) return "High Match";
    if (score >= 0.7) return "Good Match";
    if (score >= 0.5) return "Possible Match";
    if (score > 0) return "Weak Match";
    return "Manual";
  }, [getMatchConfidence]);
  
  // Get color based on match confidence
  const getMatchConfidenceColor = useCallback((sourceColumn: string, targetColumn: string): "success" | "primary" | "info" | "warning" | "default" => {
    const score = getMatchConfidence(sourceColumn, targetColumn);
    
    if (score >= 0.9) return "success";
    if (score >= 0.7) return "primary";
    if (score >= 0.5) return "info";
    if (score > 0) return "warning";
    return "default";
  }, [getMatchConfidence]);
  
  // Get counts for UI display with defensive programming
  const totalColumns = mappings ? Object.keys(mappings).length : 0;
  const mappedColumns = mappings ? Object.values(mappings).filter(m => m && m.mapped).length : 0;
  const skippedColumns = mappings ? Object.values(mappings).filter(m => m && m.skipped).length : 0;
  
  // Check if we have all the necessary data
  // If not, render a fallback that won't crash
  if (!sampleData || !Array.isArray(sampleData) || !mappings) {
    return (
      <Dialog 
        open={open} 
        onClose={() => {
          setInitialSetupDone(false);
          onClose();
        }} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>Column Mapping</DialogTitle>
        <DialogContent>
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography variant="h6">Loading mapping data...</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Please wait while we prepare the column mapping interface
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setInitialSetupDone(false);
            onClose();
          }}>Cancel</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{ sx: { height: '90vh' } }}
    >
      <DialogTitle>
        Column Mapping: {sheetName || 'Sheet'} → {tableName || 'Table'}
      </DialogTitle>
      
      <DialogContent dividers>
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="subtitle1">
              Map Excel columns to database columns
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {(sampleData && Array.isArray(sampleData) ? sampleData.length : 0)} sample rows loaded
            </Typography>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip 
              icon={<CheckCircleIcon />} 
              label={`${mappedColumns} of ${totalColumns} columns mapped`} 
              color="primary" 
              variant="outlined" 
            />
            {skippedColumns > 0 && (
              <Chip 
                icon={<WarningIcon />} 
                label={`${skippedColumns} columns skipped`} 
                color="warning" 
                variant="outlined" 
              />
            )}
          </Box>
        </Box>
        
        <TableContainer component={Paper} sx={{ maxHeight: 'calc(90vh - 250px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell width="25%">Excel Column</TableCell>
                <TableCell width="50%">Database Column</TableCell>
                <TableCell width="25%">Data Type</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mappings && Object.entries(mappings).map(([sourceColumn, mapping]) => {
                // Crucial: Skip if mapping or sourceColumn is falsy
                if (!mapping || !sourceColumn) return null;
                
                try {
                  // Get sample values for display (with defensive programming)
                  const samples = (sampleData && Array.isArray(sampleData) ? sampleData.slice(0, 3) : [])
                    .map(row => 
                      row && sourceColumn && row[sourceColumn] !== undefined && row[sourceColumn] !== null 
                        ? String(row[sourceColumn])
                        : 'null'
                    );
                  
                  // Get suggestions for this column
                  let suggestions = [];
                  try {
                    suggestions = sourceColumn ? getSuggestions(sourceColumn) : [];
                  } catch (error) {
                    console.error(`[ERROR] Failed to get suggestions for column ${sourceColumn}:`, error);
                    suggestions = [];
                  }
                  
                  const highConfidenceSuggestions = suggestions.filter(s => s && s.score >= 0.9);
                  const mediumConfidenceSuggestions = suggestions.filter(s => s && s.score >= 0.7 && s.score < 0.9);
                  const lowConfidenceSuggestions = suggestions.filter(s => s && s.score < 0.7);
                  
                  // Get all suggested column names
                  const allSuggestedColumnNames = suggestions.map(s => s && s.column).filter(Boolean);
                  
                  // Get any remaining columns that aren't in the suggestions
                  const remainingColumns = (availableColumns && Array.isArray(availableColumns) ? availableColumns : [])
                    .filter(col => col && !allSuggestedColumnNames.includes(col));
                  
                  return (
                    <TableRow key={sourceColumn} hover>
                      <TableCell>
                        <Typography variant="body2">
                          {sourceColumn}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <FormControl size="small" fullWidth>
                          {isLoadingColumns && !isNewTable ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', p: 1 }}>
                              <CircularProgress size={20} sx={{ mr: 2 }} />
                              <Typography variant="body2">Loading columns...</Typography>
                            </Box>
                          ) : (
                            <Select
                              value={mapping.skipped ? '__skip__' : (mapping.dbColumn || '')}
                              onChange={(e) => handleMappingChange(sourceColumn, e.target.value)}
                              displayEmpty
                              renderValue={(selected) => {
                                // Custom render logic for the selected value display
                                return (
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                    <Typography>
                                      {mapping.dbColumn || <em>Select a target column</em>}
                                    </Typography>
                                    {mapping.dbColumn && mapping.mapped && (
                                      <Chip
                                        label={getMatchConfidenceLabel(sourceColumn, mapping.dbColumn)}
                                        size="small" 
                                        color={getMatchConfidenceColor(sourceColumn, mapping.dbColumn)}
                                        variant="outlined"
                                        sx={{ ml: 1, fontSize: '0.7rem', height: 20 }}
                                      />
                                    )}
                                  </Box>
                                );
                              }}
                              MenuProps={{
                                PaperProps: {
                                  style: {
                                    maxHeight: 300
                                  }
                                }
                              }}
                            >
                              {/* Empty option */}
                              <MenuItem value="">
                                <em>Select a target column</em>
                              </MenuItem>
                              
                              {/* Always show the auto-created column option for new tables */}
                              {isNewTable && sourceColumn && (
                                <MenuItem value={normalizeString(sourceColumn)}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                                    <Typography>
                                      {normalizeString(sourceColumn)}
                                    </Typography>
                                    <Chip
                                      label="Auto-created" 
                                      size="small" 
                                      color="success"
                                      sx={{ ml: 1, fontSize: '0.7rem', height: 20 }}
                                    />
                                  </Box>
                                </MenuItem>
                              )}
                              
                              {/* Create New Column option */}
                              <MenuItem 
                                value="__new_column__"
                                sx={{
                                  borderBottom: '1px solid',
                                  borderColor: 'divider',
                                  color: 'primary.main',
                                  fontWeight: 'medium'
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  <AddIcon fontSize="small" sx={{ mr: 1 }} />
                                  Create New Column: {sourceColumn ? normalizeString(sourceColumn) : 'new_column'}
                                </Box>
                              </MenuItem>
                              
                              {/* Skip Column option */}
                              <MenuItem 
                                value="__skip__"
                                sx={{
                                  borderBottom: '1px solid',
                                  borderColor: 'divider',
                                  color: 'text.secondary'
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                  <Typography>Skip this column</Typography>
                                </Box>
                              </MenuItem>
                              
                              {/* High confidence suggestions */}
                              {highConfidenceSuggestions.length > 0 && (
                                <>
                                  <ListSubheader component="li" sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'success.dark', bgcolor: 'success.light', py: 0.5, pl: 2 }}>
                                    Best Matches
                                  </ListSubheader>
                                  {highConfidenceSuggestions.map(suggestion => suggestion && (
                                    <MenuItem key={suggestion.column} value={suggestion.column}>
                                      <Box sx={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Typography>{suggestion.column}</Typography>
                                        <Chip
                                          label="High Match"
                                          size="small"
                                          color="success"
                                          variant="outlined"
                                          sx={{ ml: 1, fontSize: '0.7rem', height: 20 }}
                                        />
                                      </Box>
                                    </MenuItem>
                                  ))}
                                </>
                              )}
                              
                              {/* Medium confidence suggestions */}
                              {mediumConfidenceSuggestions.length > 0 && (
                                <>
                                  <ListSubheader component="li" sx={{ fontSize: '0.75rem', fontWeight: 'medium', color: 'primary.main', bgcolor: 'primary.lighter', py: 0.5, pl: 2, borderTop: highConfidenceSuggestions.length > 0 ? '1px solid' : 'none', borderColor: 'divider' }}>
                                    Good Matches
                                  </ListSubheader>
                                  {mediumConfidenceSuggestions.map(suggestion => suggestion && (
                                    <MenuItem key={suggestion.column} value={suggestion.column}>
                                      <Box sx={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Typography>{suggestion.column}</Typography>
                                        <Chip
                                          label="Good Match"
                                          size="small"
                                          color="primary"
                                          variant="outlined"
                                          sx={{ ml: 1, fontSize: '0.7rem', height: 20 }}
                                        />
                                      </Box>
                                    </MenuItem>
                                  ))}
                                </>
                              )}
                              
                              {/* Low confidence suggestions */}
                              {lowConfidenceSuggestions.length > 0 && (
                                <>
                                  <ListSubheader component="li" sx={{ fontSize: '0.75rem', fontWeight: 'medium', color: 'text.secondary', bgcolor: 'grey.100', py: 0.5, pl: 2, borderTop: (highConfidenceSuggestions.length > 0 || mediumConfidenceSuggestions.length > 0) ? '1px solid' : 'none', borderColor: 'divider' }}>
                                    Possible Matches
                                  </ListSubheader>
                                  {lowConfidenceSuggestions.map(suggestion => suggestion && (
                                    <MenuItem key={suggestion.column} value={suggestion.column}>
                                      <Box sx={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Typography>{suggestion.column}</Typography>
                                        <Chip
                                          label="Possible Match"
                                          size="small"
                                          color="warning"
                                          variant="outlined"
                                          sx={{ ml: 1, fontSize: '0.7rem', height: 20 }}
                                        />
                                      </Box>
                                    </MenuItem>
                                  ))}
                                </>
                              )}
                              
                              {/* Other columns */}
                              {remainingColumns.length > 0 && (
                                <>
                                  <ListSubheader component="li" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 'medium', bgcolor: 'grey.200', py: 0.5, pl: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                                    Other Columns
                                  </ListSubheader>
                                  {remainingColumns.map(column => column && (
                                    <MenuItem key={column} value={column}>
                                      {column}
                                    </MenuItem>
                                  ))}
                                </>
                              )}
                              
                            </Select>
                          )}
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={
                              mapping.type === 'date' ? 'timestamp' :
                              mapping.type === 'number' ? 'numeric' :
                              mapping.type === 'boolean' ? 'boolean' : 'text'
                            }
                            onChange={(e) => handleDataTypeChange(sourceColumn, e.target.value)}
                          >
                            <MenuItem value="text">Text</MenuItem>
                            <MenuItem value="numeric">Number</MenuItem>
                            <MenuItem value="timestamp">Date/Time</MenuItem>
                            <MenuItem value="boolean">Boolean</MenuItem>
                            <MenuItem value="json">JSON</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                    </TableRow>
                  );
                } catch (error) {
                  console.error(`[ERROR] Failed to render row for column ${sourceColumn}:`, error);
                  return null; // Skip this row on error
                }
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={() => {
          // Reset state before closing to prevent stale state issues
          setInitialSetupDone(false);
          onClose();
        }}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          color="primary"
          disabled={mappedColumns === 0}
        >
          Save Mappings
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ColumnMappingModal;