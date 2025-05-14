/**
 * Table Mapping Step component
 * Handles mapping Excel sheets to database tables
 */
import React, { useState, useEffect, useCallback } from 'react';
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
  Dialog,
  DialogContent,
  DialogTitle,
  LinearProgress
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useBatchImportStore, SheetMapping } from '../../../store/batchImportStore';
import { useTableMetadata, useTableMatcher } from '../BatchImporterHooks';
import SampleDataTable from '../SampleDataTable';
import { normalizeTableName, calculateSimilarity, normalizeName } from '../utils/stringUtils';

interface TableMappingStepProps {
  onSheetSelect: (sheetId: string | null) => void;
  onError: (error: string | null) => void;
}

/**
 * Step 2: Sheet-to-Table mapping component
 */
export const TableMappingStep: React.FC<TableMappingStepProps> = ({
  onSheetSelect,
  onError
}) => {
  const [selectedSheet, setSelectedSheet] = useState<SheetMapping | null>(null);
  const [showAllSamples, setShowAllSamples] = useState(false);
  const [headerRowEdits, setHeaderRowEdits] = useState<Record<string, number>>({});
  const [initialAutoMapComplete, setInitialAutoMapComplete] = useState(false);
  
  // Access batch import store
  const {
    sheets,
    headerRow: globalHeaderRow,
    tablePrefix,
    progress,
    setProgress,
    updateSheet,
    setHeaderRow: setGlobalHeaderRow,
    setTablePrefix: setGlobalTablePrefix,
  } = useBatchImportStore();
  
  // Load database metadata
  const { tables, loading: tablesLoading, error: tablesError } = useTableMetadata();

  // Table matching utility
  const { findBestMatchingTable } = useTableMatcher(tables);

  // Track if initial auto-mapping has been attempted to prevent infinite loops
  const [autoMapAttempted, setAutoMapAttempted] = useState(false);

  // Add safety timer to prevent getting stuck in loading state
  useEffect(() => {
    // First safety timer - short timeout
    const quickTimer = setTimeout(() => {
      if (!initialAutoMapComplete) {
        console.log('Quick safety timeout: first attempt to exit loading state');
        setInitialAutoMapComplete(true);
      }
    }, 2000);

    // Second safety timer - longer timeout as backup
    const backupTimer = setTimeout(() => {
      console.log('Backup safety timeout: forcing exit from loading state');
      setInitialAutoMapComplete(true);

      // Force reset progress too
      setProgress({
        stage: 'idle',
        message: 'Auto-mapping complete (timeout)',
        percent: 100
      });
    }, 5000);

    // Clean up timers
    return () => {
      clearTimeout(quickTimer);
      clearTimeout(backupTimer);
    };
  }, [initialAutoMapComplete, setProgress]);

  // Auto-map tables when component loads
  useEffect(() => {
    // Only try auto-mapping once to prevent infinite loops
    if (autoMapAttempted) {
      return;
    }

    if (tables.length > 0 && !tablesLoading) {
      console.log('Tables loaded in TableMappingStep:', tables.length);
      console.log('Sample tables:', tables.slice(0, 3));

      // Mark that we've attempted auto-mapping
      setAutoMapAttempted(true);

      // Check if we have unmapped sheets that need auto-mapping
      const unmappedSheets = sheets.filter(s => !s.skip &&
        (!s.mappedName || s.mappedName === '' || !s.approved));

      if (unmappedSheets.length > 0) {
        console.log('Auto-mapping on component load for', unmappedSheets.length, 'sheets');
        // Set progress to analyzing state to show loading
        setProgress({
          stage: 'analyzing',
          message: 'Auto-mapping sheets to tables...',
          percent: 50
        });

        // Use setTimeout to allow UI to update with progress indicator
        setTimeout(() => {
          try {
            // Run auto-mapping
            handleAutoMapInternal();
          } catch (error) {
            // Log any errors but don't let them prevent UI from updating
            console.error('Error during auto-mapping:', error);
          } finally {
            // Always reset progress when done, even if there was an error
            setProgress({
              stage: 'idle',
              message: 'Auto-mapping complete',
              percent: 100
            });

            // Always mark initial auto-mapping as complete to exit loading state
            setInitialAutoMapComplete(true);
          }
        }, 300); // Slightly longer timeout for better UX
      } else {
        // If no sheets to map, still mark as complete
        setInitialAutoMapComplete(true);
      }
    } else if (!tables.length && !tablesLoading) {
      // No tables but not loading, so we must be done
      setAutoMapAttempted(true);
      setInitialAutoMapComplete(true);
    }
  }, [tables, tablesLoading, sheets, setProgress, autoMapAttempted, findBestMatchingTable, updateSheet, setSelectedSheet, onSheetSelect]);

  // Set error if tables failed to load
  useEffect(() => {
    if (tablesError) {
      console.error('Table loading error:', tablesError);
      onError(tablesError);
    } else {
      onError(null);
    }
  }, [tablesError, onError]);
  
  // Find and set selected sheet
  const handleSelectSheet = (sheetId: string) => {
    const sheet = sheets.find(s => s.id === sheetId);
    if (sheet) {
      setSelectedSheet(sheet);
      onSheetSelect(sheetId);
    }
  };
  
  // Handle sheet name change
  const handleMappedNameChange = (sheetId: string, name: string) => {
    console.log(`Mapping sheet ${sheetId} to table:`, name);

    // Special case for "Create new table" option
    if (name === '_create_new_') {
      console.log(`Using 'create new' mode for sheet ${sheetId}`);

      // Find the sheet to get the original name for a suggestion
      const sheet = sheets.find(s => s.id === sheetId);
      if (sheet) {
        // Generate a suggested table name from the sheet name
        const suggestedName = normalizeTableName(sheet.originalName);

        // Always apply ln_ prefix to suggested new tables
        const prefixedSuggestion = `ln_${suggestedName}`;

        // Store the suggested name as a custom property for the text field to use
        updateSheet(sheetId, {
          mappedName: '_create_new_',
          needsReview: true,
          // Use a temporary property to store the suggested name
          // @ts-ignore - Custom property
          suggestedName: prefixedSuggestion
        });
      } else {
        updateSheet(sheetId, {
          mappedName: '_create_new_',
          needsReview: true
        });
      }
      return;
    }

    // If user enters a custom name when in "create new" mode
    if (name !== '' && name !== '_create_new_') {
      // Apply prefix only if we're coming from "Create New" mode
      // Get the previous state to determine the context
      const sheet = sheets.find(s => s.id === sheetId);
      const isNewTable = sheet?.mappedName === '_create_new_';

      // Apply table prefix only if creating a new table
      let effectiveName = name;
      if (isNewTable) {
        effectiveName = `ln_${name}`;
        console.log(`Applying ln_ prefix to new table: ln_${name}`);
      }

      const normalizedName = normalizeTableName(effectiveName);
      console.log(`Normalized table name: ${effectiveName} → ${normalizedName}`);

      // Validate the name is unique among available table options
      const availableOptions = getSortedTableSuggestions(
        sheets.find(s => s.id === sheetId)?.originalName || '',
        tables,
        '' // Don't apply prefix during validation - we'll handle it separately
      );
      const isValidOption = availableOptions.some(option => option.name === normalizedName);

      console.log(`Table name is ${isValidOption ? 'valid' : 'not valid'} in available options`);

      // Check if this is a 100% confidence match to auto-approve
      let matchConfidence = 0;
      const matchedOption = availableOptions.find(option => normalizeName(option.name) === normalizeName(normalizedName));
      if (matchedOption) {
        matchConfidence = matchedOption.confidence;
      }

      // Auto-approve if it's an exact match (100% confidence)
      const autoApprove = matchConfidence === 100;
      console.log(`Match confidence: ${matchConfidence}%, Auto-approve: ${autoApprove}`);

      updateSheet(sheetId, {
        mappedName: normalizedName,
        needsReview: !autoApprove, // No review needed for 100% match
        approved: autoApprove,     // Auto-approve 100% matches
        status: autoApprove ? 'approved' : 'mapping', // Set status accordingly
        // Mark this table as manually created so we can update its prefix later
        // @ts-ignore - Custom property
        wasCreatedNew: isNewTable,
        // Store the last value used (for prefix updates)
        // @ts-ignore - Custom property
        lastEnteredValue: name
      });
    } else {
      // Just set the raw value if empty or special
      console.log(`Using empty/special value for sheet ${sheetId}`);
      updateSheet(sheetId, {
        mappedName: name,
        needsReview: true
      });
    }
  };
  
  // Handle skip toggle
  const handleSkipToggle = (sheetId: string, skip: boolean) => {
    updateSheet(sheetId, { 
      skip, 
      needsReview: true,
      status: skip ? 'pending' : 'mapping'
    });
  };
  
  // Handle sheet approval
  const handleApprove = (sheetId: string) => {
    updateSheet(sheetId, {
      approved: true,
      needsReview: false,
      status: 'approved'
    });
  };
  
  // Internal auto-mapping function (used by both manual and automatic mapping)
  const handleAutoMapInternal = useCallback(() => {
    console.log("Starting auto-mapping...");
    console.log("Available tables:", tables);

    // Only map sheets that aren't skipped and aren't already approved
    const sheetsToMap = sheets.filter(s => !s.skip && !s.approved);
    console.log("Sheets to map:", sheetsToMap.map(s => s.originalName));

    let matchCount = 0;
    let suggestCount = 0;
    let noMatchCount = 0;

    sheetsToMap.forEach(sheet => {
      const bestMatch = findBestMatchingTable(sheet.originalName);
      console.log(`Match for "${sheet.originalName}":`, bestMatch);

      if (bestMatch) {
        if (bestMatch.confidence === 100) {
          // Always auto-approve perfect (100%) matches without requiring any manual review
          console.log(`Auto-approving exact match: ${sheet.originalName} → ${bestMatch.tableName} (${bestMatch.confidence}%)`);

          // Don't apply prefix to existing tables - use the table name as-is
          const safeTableName = normalizeTableName(bestMatch.tableName);

          console.log(`Using safe table name: ${bestMatch.tableName} → ${safeTableName}`);
          console.log(`Perfect match auto-mapping debug:`, {
            sheetName: sheet.originalName,
            matchedTable: bestMatch.tableName,
            safeTableName,
            confidence: bestMatch.confidence
          });

          updateSheet(sheet.id, {
            mappedName: safeTableName,
            approved: true,
            needsReview: false,
            status: 'approved'
          });

          matchCount++;
        }
        else if (bestMatch.confidence >= 95) {
          // Auto-approve high confidence matches (≥95% but not perfect) with review
          console.log(`Auto-approving high confidence match: ${sheet.originalName} → ${bestMatch.tableName} (${bestMatch.confidence}%)`);

          // Don't apply prefix to existing tables - use the table name as-is
          const safeTableName = normalizeTableName(bestMatch.tableName);

          console.log(`Using safe table name: ${bestMatch.tableName} → ${safeTableName}`);

          updateSheet(sheet.id, {
            mappedName: safeTableName,
            approved: true,
            needsReview: false,
            status: 'approved'
          });

          matchCount++;
        } else {
          // For matches below 95% confidence, suggest "Create New Table" instead
          console.log(`No high confidence match found for: ${sheet.originalName}, suggesting new table creation`);

          // Generate a suggested table name from the sheet name
          const suggestedName = normalizeTableName(sheet.originalName);

          // Always apply ln_ prefix to suggested new tables
          const prefixedSuggestion = `ln_${suggestedName}`;

          updateSheet(sheet.id, {
            mappedName: '_create_new_',
            needsReview: true,
            status: 'mapping',
            // Use a temporary property to store the suggested name
            // @ts-ignore - Custom property
            suggestedName: prefixedSuggestion
          });

          noMatchCount++;
        }
      } else {
        // No match at all case
        console.log(`No match found for: ${sheet.originalName}, suggesting new table creation`);

        // Generate a suggested table name from the sheet name
        const suggestedName = normalizeTableName(sheet.originalName);

        // Always apply ln_ prefix to suggested new tables
        const prefixedSuggestion = `ln_${suggestedName}`;

        updateSheet(sheet.id, {
          mappedName: '_create_new_',
          needsReview: true,
          status: 'mapping',
          // Use a temporary property to store the suggested name
          // @ts-ignore - Custom property
          suggestedName: prefixedSuggestion
        });

        noMatchCount++;
      }
    });

    console.log(`Auto-mapping complete: ${matchCount} auto-approved, ${suggestCount} suggested, ${noMatchCount} no match`);

    // Select the first sheet that needs review, if any
    // Even though suggestCount might be 0, we still look for sheets needing review
    const firstNeedsReview = sheets.find(s => !s.skip && s.needsReview);
    if (firstNeedsReview) {
      setSelectedSheet(firstNeedsReview);
      onSheetSelect(firstNeedsReview.id);
    }

    return { matchCount, suggestCount, noMatchCount };
  }, [sheets, tables, findBestMatchingTable, updateSheet, setSelectedSheet, onSheetSelect]);

  // Public auto-mapping function (for the button)
  const handleAutoMap = () => {
    // Show progress indicator
    setProgress({
      stage: 'analyzing',
      message: 'Auto-mapping sheets to tables...',
      percent: 50
    });

    // Use setTimeout to ensure the progress indicator shows
    setTimeout(() => {
      try {
        // Run auto-mapping
        handleAutoMapInternal();
      } catch (error) {
        // Log any errors but don't let them prevent UI from updating
        console.error('Error during manual auto-mapping:', error);
      } finally {
        // Always reset progress when done, even if there was an error
        setProgress({
          stage: 'idle',
          message: 'Auto-mapping complete',
          percent: 100
        });
      }
    }, 100);
  };
  
  // Handle header row change for a specific sheet
  const handleHeaderRowChange = (sheetId: string, row: number) => {
    setHeaderRowEdits(prev => ({ ...prev, [sheetId]: row }));
    updateSheet(sheetId, { 
      headerRow: row,
      needsReview: true 
    });
  };
  
  // Handle global header row change (converts from 1-based UI to 0-based internal)
  const handleGlobalHeaderRowChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uiRowNumber = parseInt(e.target.value, 10);
    // Convert from 1-based (UI) to 0-based (internal)
    const internalRow = uiRowNumber - 1;

    if (!isNaN(uiRowNumber) && uiRowNumber >= 1) {
      console.log(`Setting header row: UI=${uiRowNumber}, Internal=${internalRow}`);
      setGlobalHeaderRow(internalRow);

      // Update all sheets with the 0-based row index
      sheets.forEach(sheet => {
        updateSheet(sheet.id, {
          headerRow: internalRow,
          needsReview: true
        });
      });
    }
  };
  
  // Handle global table prefix change
  const handleGlobalTablePrefixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const prefix = e.target.value;
    const oldPrefix = tablePrefix;

    // Store the prefix globally
    setGlobalTablePrefix(prefix);

    // Update names for all sheets based on their current state
    sheets.forEach(sheet => {
      // For sheets in "Create New" mode
      if (sheet.mappedName === '_create_new_') {
        // Get the base name without any existing prefix
        let baseName = sheet.originalName;

        // Get the current user-entered value, if available
        // @ts-ignore - Custom property
        const userEnteredValue = sheet.createNewValue;

        if (userEnteredValue) {
          // If user was editing a name, remove old prefix if present and add new one
          let cleanValue = userEnteredValue;
          if (oldPrefix && cleanValue.startsWith(oldPrefix)) {
            cleanValue = cleanValue.substring(oldPrefix.length);
          }
          const prefixedValue = prefix ? `${prefix}${cleanValue}` : cleanValue;

          console.log(`Updating user-entered value from ${userEnteredValue} to ${prefixedValue}`);

          // Update with new prefixed value while preserving create new mode
          updateSheet(sheet.id, {
            // @ts-ignore - Custom property
            createNewValue: prefixedValue,
            mappedName: '_create_new_'
          });
        }

        // Also update the suggested name for newly created fields
        if (typeof sheet.suggestedName === 'string') {
          // @ts-ignore - Custom property
          baseName = sheet.suggestedName.replace(oldPrefix || '', '');
        } else {
          baseName = normalizeTableName(sheet.originalName);
        }

        // Apply the new prefix
        const newSuggestion = prefix ? `${prefix}${baseName}` : baseName;

        // Update the sheet with the new suggested name
        updateSheet(sheet.id, {
          // @ts-ignore - Custom property
          suggestedName: newSuggestion
        });
      }
      // For sheets with actual table names that were manually created (not mapped to existing)
      // @ts-ignore - Custom property
      else if (sheet.mappedName && sheet.wasCreatedNew) {
        // Remove old prefix if present
        let baseName = sheet.mappedName;
        if (oldPrefix && baseName.startsWith(oldPrefix)) {
          baseName = baseName.substring(oldPrefix.length);
        }

        // Apply new prefix
        const newName = prefix ? `${prefix}${baseName}` : baseName;

        console.log(`Updating custom table name from ${sheet.mappedName} to ${newName}`);

        // Update with new prefixed name
        updateSheet(sheet.id, {
          mappedName: newName,
          needsReview: true
        });
      }
    });

    console.log(`Updated global table prefix to ${prefix || '(none)'}`);
  };
  
  // Group sheets by status, taking into account both actual approval
  // and effective approval (high confidence matches)
  const pendingSheets = sheets.filter(s => {
    if (s.skip) return false;

    // Using imported normalizeName function

    // Calculate if this sheet has a high confidence match
    const availableOptions = getSortedTableSuggestions(s.originalName, tables, '');
    const matchedOption = availableOptions.find(option => {
      // Compare with normalization to make matching prefix-agnostic
      return normalizeName(option.name) === normalizeName(s.mappedName);
    });
    const matchConfidence = matchedOption?.confidence || 0;
    const hasPerfectMatch = s.mappedName && matchConfidence === 100 && s.mappedName !== '_create_new_';
    const hasHighConfidenceMatch = s.mappedName && matchConfidence >= 95 && matchConfidence < 100 && s.mappedName !== '_create_new_';
    const effectivelyApproved = s.approved || hasHighConfidenceMatch || hasPerfectMatch;

    // Only count as pending if not effectively approved
    return !effectivelyApproved && s.needsReview;
  });

  const approvedSheets = sheets.filter(s => {
    if (s.skip) return false;

    // Using imported normalizeName function

    // Calculate if this sheet has a high confidence match
    const availableOptions = getSortedTableSuggestions(s.originalName, tables, '');
    const matchedOption = availableOptions.find(option => {
      // Compare with normalization to make matching prefix-agnostic
      return normalizeName(option.name) === normalizeName(s.mappedName);
    });
    const matchConfidence = matchedOption?.confidence || 0;
    const hasPerfectMatch = s.mappedName && matchConfidence === 100 && s.mappedName !== '_create_new_';
    const hasHighConfidenceMatch = s.mappedName && matchConfidence >= 95 && matchConfidence < 100 && s.mappedName !== '_create_new_';

    // Count as approved if actually approved or has high/perfect confidence
    return s.approved || hasHighConfidenceMatch || hasPerfectMatch;
  });

  const skippedSheets = sheets.filter(s => s.skip);
  
  // Enhanced loading state that completely masks the UI during processing
  // Add a forced override to bypass loading screen if we're stuck for some reason
  const forceBypassLoading = autoMapAttempted && tables.length > 0;
  if ((!initialAutoMapComplete || progress.stage === 'analyzing' || progress.stage === 'reading') && !forceBypassLoading) {
    // Full screen loading state that blocks UI completely
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          textAlign: 'center',
          p: 3,
          backgroundColor: 'background.paper',
          zIndex: 9999
        }}
      >
        <AutoAwesomeIcon
          sx={{
            color: '#4caf50', // medium green to match progress bar
            fontSize: 80,
            mb: 4,
            animation: 'pulse 1.5s infinite ease-in-out',
            '@keyframes pulse': {
              '0%': { opacity: 0.6, transform: 'scale(0.9)' },
              '50%': { opacity: 1, transform: 'scale(1.1)' },
              '100%': { opacity: 0.6, transform: 'scale(0.9)' }
            }
          }}
        />

        <Typography variant="h4" gutterBottom fontWeight="medium" sx={{ color: '#4caf50' }}>
          Processing Your Data
        </Typography>

        <Typography variant="h6" gutterBottom sx={{ maxWidth: 600, mb: 4 }}>
          Please wait while we analyze and map your spreadsheet
        </Typography>

        <Typography variant="body1" gutterBottom sx={{ maxWidth: 500, mb: 4 }}>
          {progress.message || "Analyzing your data and matching to database tables..."}
        </Typography>

        <Box sx={{ width: '100%', maxWidth: 500, mb: 4 }}>
          {/* Animated green progress bar */}
          <Box sx={{
            position: 'relative',
            height: 16,
            borderRadius: 3,
            backgroundColor: '#e8f5e9', // light green background
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            {/* Custom animation for indeterminate progress */}
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                height: '100%',
                borderRadius: 3,
                overflow: 'hidden'
              }}
            >
              {/* First moving gradient */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: '50%',
                  backgroundImage: 'linear-gradient(90deg, #43a047, #66bb6a)',
                  boxShadow: '0 0 8px rgba(76,175,80,0.5)',
                  borderRadius: 3,
                  animation: 'gradient-slide1 1.6s infinite ease-in-out',
                  '@keyframes gradient-slide1': {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(200%)' }
                  }
                }}
              />

              {/* Second moving gradient (slightly delayed) */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: '-25%',
                  height: '100%',
                  width: '40%',
                  backgroundImage: 'linear-gradient(90deg, #66bb6a, #81c784)',
                  boxShadow: '0 0 8px rgba(76,175,80,0.5)',
                  borderRadius: 3,
                  animation: 'gradient-slide2 1.6s 0.3s infinite ease-in-out',
                  '@keyframes gradient-slide2': {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(300%)' }
                  }
                }}
              />

              {/* Shimmer effect for extra polish */}
              <Box sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                animation: 'shimmer 2s infinite',
                '@keyframes shimmer': {
                  '0%': { transform: 'translateX(-100%)' },
                  '100%': { transform: 'translateX(100%)' }
                }
              }} />
            </Box>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Only tables with ≥95% confidence will be suggested for mapping
        </Typography>
      </Box>
    );
  }

  // Main UI - only shown after initial mapping is complete
  return (
    <Box>
      <Card sx={{ mb: 4 }}>
        <CardHeader
          title="Sheet to Table Mapping"
          subheader={
            progress && progress.stage === 'analyzing'
              ? "Auto-mapping sheets to tables... (Only ≥95% confidence matches will be suggested)"
              : "Map each Excel sheet to a database table"
          }
          action={
            progress && progress.stage === 'analyzing' && (
              <CircularProgress size={24} sx={{ mr: 2 }} />
            )
          }
        />
        <Divider />
        <CardContent>
          <Stack spacing={3}>
            {/* Global settings */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                Global Settings
              </Typography>
              
              <Stack direction="row" spacing={2} alignItems="center">
                <TextField
                  label="Header Row"
                  type="number"
                  size="small"
                  // Display 1-based for user
                  value={globalHeaderRow + 1}
                  onChange={handleGlobalHeaderRowChange}
                  InputProps={{ inputProps: { min: 1 } }}
                  helperText="Row number starts at 1"
                  sx={{ width: 140 }}
                />
                
                <TextField
                  label="Table Prefix"
                  size="small"
                  value={tablePrefix}
                  onChange={handleGlobalTablePrefixChange}
                  placeholder="e.g., import_"
                  helperText="Optional prefix for new tables only"
                  sx={{ width: 240 }}
                />
                
                <Button 
                  variant="outlined" 
                  onClick={handleAutoMap}
                  disabled={tablesLoading || pendingSheets.length === 0}
                  startIcon={tablesLoading ? <CircularProgress size={16} /> : undefined}
                >
                  Auto-Map Sheets
                </Button>
              </Stack>
            </Box>
            
            {/* Summary */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Mapping Summary
              </Typography>
              
              <Stack direction="row" spacing={2}>
                <Chip 
                  icon={<WarningIcon />} 
                  label={`${pendingSheets.length} Need Review`}
                  color="warning"
                  variant={pendingSheets.length > 0 ? "filled" : "outlined"}
                />
                
                <Chip 
                  icon={<CheckCircleIcon />} 
                  label={`${approvedSheets.length} Approved`}
                  color="success"
                  variant={approvedSheets.length > 0 ? "filled" : "outlined"}
                />
                
                <Chip 
                  label={`${skippedSheets.length} Skipped`}
                  color="default"
                  variant={skippedSheets.length > 0 ? "filled" : "outlined"}
                />
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
      
      {/* Sheets mapping table */}
      <TableContainer component={Paper} sx={{ mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Sheet Name</TableCell>
              <TableCell>Database Table</TableCell>
              <TableCell>Header Row</TableCell>
              <TableCell sx={{
                pr: 2,
                pl: 2,
                textAlign: 'center',
                backgroundColor: 'transparent',
                width: 100, // Give it a fixed width like ColumnMappingStep
              }}>
                Skip
              </TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          
          <TableBody>
            {sheets.map((sheet) => (
              <TableRow
                key={sheet.id}
                sx={{ // Apply alternating row styling like ColumnMappingStep
                  backgroundColor: sheet.skip ? 'rgba(0, 0, 0, 0.04)' : 'transparent',
                  '&:nth-of-type(odd)': {
                    backgroundColor: sheet.skip ? 'rgba(0, 0, 0, 0.06)' : 'rgba(0, 0, 0, 0.02)'
                  },
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                  // Add colored left border based on effective status
                  borderLeft: (() => {
                    // Calculate if this sheet has a high confidence match
                    const availableOptions = getSortedTableSuggestions(sheet.originalName, tables, '');
                    const matchedOption = availableOptions.find(option => {
                      // Compare with normalization to make matching prefix-agnostic
                      return normalizeName(option.name) === normalizeName(sheet.mappedName);
                    });
                    const matchConfidence = matchedOption?.confidence || 0;
                    const hasPerfectMatch = sheet.mappedName && matchConfidence === 100 && sheet.mappedName !== '_create_new_';
                    const hasHighConfidenceMatch = sheet.mappedName && matchConfidence >= 95 && matchConfidence < 100 && sheet.mappedName !== '_create_new_';
                    const effectivelyApproved = sheet.approved || hasHighConfidenceMatch || hasPerfectMatch;

                    if (sheet.skip) return 'none';
                    return '4px solid';
                  })(),
                  borderLeftColor: (() => {
                    // Calculate if this sheet has a high confidence match
                    const availableOptions = getSortedTableSuggestions(sheet.originalName, tables, '');
                    const matchedOption = availableOptions.find(option => {
                      // Compare with normalization to make matching prefix-agnostic
                      return normalizeName(option.name) === normalizeName(sheet.mappedName);
                    });
                    const matchConfidence = matchedOption?.confidence || 0;
                    const hasPerfectMatch = sheet.mappedName && matchConfidence === 100 && sheet.mappedName !== '_create_new_';
                    const hasHighConfidenceMatch = sheet.mappedName && matchConfidence >= 95 && matchConfidence < 100 && sheet.mappedName !== '_create_new_';
                    const effectivelyApproved = sheet.approved || hasHighConfidenceMatch || hasPerfectMatch;

                    if (sheet.skip) return 'transparent';
                    if (effectivelyApproved) return 'success.light';
                    if (sheet.needsReview) return 'warning.light';
                    return 'transparent';
                  })()
                }}
              >
                {/* Sheet Name */}
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {(() => {
                      // Calculate if this sheet has a high confidence match
                      const availableOptions = getSortedTableSuggestions(sheet.originalName, tables, '');
                      const matchedOption = availableOptions.find(option => {
                        // Use normalizeName to compare without the ln_ prefix for better matching
                        return normalizeName(option.name) === normalizeName(sheet.mappedName);
                      });
                      const matchConfidence = matchedOption?.confidence || 0;
                      const hasPerfectMatch = sheet.mappedName && matchConfidence === 100 && sheet.mappedName !== '_create_new_';
                      const hasHighConfidenceMatch = sheet.mappedName && matchConfidence >= 95 && matchConfidence < 100 && sheet.mappedName !== '_create_new_';
                      const effectivelyApproved = sheet.approved || hasHighConfidenceMatch || hasPerfectMatch;

                      if (!effectivelyApproved && sheet.needsReview && !sheet.skip) {
                        return (
                          <Tooltip title="Table mapping needs review">
                            <WarningIcon color="warning" fontSize="small" sx={{ mr: 1, opacity: 0.7 }} />
                          </Tooltip>
                        );
                      } else if (effectivelyApproved && !sheet.skip) {
                        if (hasPerfectMatch) {
                          // Special case for perfect matches - they're automatically approved
                          return (
                            <Tooltip title={`Perfect match auto-approved (${matchConfidence}% confidence)`}>
                              <CheckCircleIcon color="success" fontSize="small" sx={{ mr: 1, opacity: 1 }} />
                            </Tooltip>
                          );
                        } else {
                          return (
                            <Tooltip title={hasHighConfidenceMatch ? `Table mapping auto-approved (${matchConfidence}% confidence)` : "Table mapping approved"}>
                              <CheckCircleIcon color="success" fontSize="small" sx={{ mr: 1, opacity: 0.7 }} />
                            </Tooltip>
                          );
                        }
                      }
                      return null;
                    })()}
                    <Typography fontWeight={sheet.id === selectedSheet?.id ? 'bold' : 'normal'}>
                      {sheet.originalName}
                    </Typography>
                  </Box>
                  {sheet.error && (
                    <Typography variant="caption" color="error">
                      Error: {sheet.error}
                    </Typography>
                  )}
                </TableCell>
                
                {/* Mapped Table Name */}
                <TableCell>
                  {sheet.mappedName === '_create_new_' ? (
                    // Create new table mode with ability to go back to selection
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                      <TextField
                        size="small"
                        placeholder="Enter new table name"
                        // Use the current create value, or suggested name if available
                        value={
                          // @ts-ignore - Custom properties
                          sheet.createNewValue ||
                          sheet.suggestedName ||
                          normalizeTableName(sheet.originalName)
                        }
                        onChange={(e) => {
                          // Get the entered value
                          const enteredValue = e.target.value;

                          // Check if it's empty, then default back to _create_new_
                          if (!enteredValue.trim()) {
                            updateSheet(sheet.id, {
                              mappedName: '_create_new_',
                              needsReview: true
                            });
                          } else {
                            // Use a custom handler for the create new mode
                            const normalizedName = normalizeTableName(enteredValue);
                            updateSheet(sheet.id, {
                              // Store both the createNewValue and mappedName
                              // @ts-ignore - Custom property
                              createNewValue: enteredValue,
                              // Keep mappedName as _create_new_ to maintain the create mode
                              // until the user hits enter or the field loses focus
                              mappedName: '_create_new_',
                              needsReview: true
                            });
                          }
                        }}
                        disabled={sheet.skip}
                        fullWidth
                        error={!sheet.mappedName || sheet.mappedName === '_create_new_'}
                        helperText={(!sheet.mappedName || sheet.mappedName === '_create_new_') && !sheet.skip ? "Required" : ""}
                        sx={{ minWidth: 200 }}
                        // Add onBlur handler to commit the value when field loses focus
                        onBlur={(e) => {
                          // @ts-ignore - Custom property
                          const finalValue = sheet.createNewValue;
                          if (finalValue && typeof finalValue === 'string') {
                            // Commit the change, converting from _create_new_ mode to a specific table name
                            handleMappedNameChange(sheet.id, finalValue);
                          }
                        }}
                        // Add onKeyDown handler to commit on Enter key
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            // @ts-ignore - Custom property
                            const finalValue = sheet.createNewValue;
                            if (finalValue && typeof finalValue === 'string') {
                              // Commit the change, converting from _create_new_ mode to a specific table name
                              handleMappedNameChange(sheet.id, finalValue);
                              // Blur the field to prevent further edit
                              e.currentTarget.blur();
                            }
                          }
                        }}
                      />
                      <Tooltip title="Back to table selection">
                        <IconButton
                          size="small"
                          onClick={() => handleMappedNameChange(sheet.id, '')}
                          sx={{ ml: 1, mt: 1 }}
                        >
                          <ArrowBackIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ) : (
                    // Table selection mode with dropdown
                    <Select
                      size="small"
                      value={(() => {
                        const validValue = getValidSelectValue(
                          sheet.mappedName, 
                          getSortedTableSuggestions(sheet.originalName, tables, '')
                        );
                        // Debug select dropdown values
                        console.log(`Select dropdown for ${sheet.originalName}:`, {
                          mappedName: sheet.mappedName,
                          validValue
                        });
                        return validValue;
                      })()}
                      onChange={(e) => handleMappedNameChange(sheet.id, e.target.value)}
                      disabled={sheet.skip}
                      error={!sheet.mappedName && !sheet.skip}
                      displayEmpty
                      fullWidth
                      sx={{ minWidth: 200 }}
                    >
                      <MenuItem value="">
                        <em>Select a table</em>
                      </MenuItem>
                      
                      <MenuItem value="_create_new_">
                        <Typography color="primary">+ Create New Table</Typography>
                      </MenuItem>
                      
                      <Divider />
                      
                      <MenuItem disabled>
                        <Typography variant="caption" color="text.secondary">
                          Existing Tables (by match confidence)
                        </Typography>
                      </MenuItem>
                      
                      {/* Table suggestions sorted by confidence */}
                      {getSortedTableSuggestions(sheet.originalName, tables, '').map((suggestion) => (
                        <MenuItem key={suggestion.name} value={suggestion.name}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <Typography>
                              {/* Always display normalized name (without ln_ prefix) */}
                              {normalizeName(suggestion.originalName)}
                            </Typography>
                            <Chip
                              label={`${suggestion.confidence}%`}
                              size="small"
                              color={getConfidenceColor(suggestion.confidence)}
                              sx={{ ml: 1 }}
                            />
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                </TableCell>
                
                {/* Header Row */}
                <TableCell>
                  <TextField
                    type="number"
                    size="small"
                    // Display 1-based for user
                    value={(headerRowEdits[sheet.id] !== undefined ? headerRowEdits[sheet.id] : sheet.headerRow) + 1}
                    onChange={(e) => {
                      // Convert from 1-based (UI) to 0-based (internal)
                      const uiValue = parseInt(e.target.value, 10);
                      const internalValue = uiValue - 1;
                      if (!isNaN(uiValue) && uiValue >= 1) {
                        handleHeaderRowChange(sheet.id, internalValue);
                      }
                    }}
                    disabled={sheet.skip}
                    InputProps={{ inputProps: { min: 1 } }}
                    sx={{ width: 80 }}
                  />
                </TableCell>
                
                {/* Skip Toggle - Styled to match ColumnMappingStep */}
                <TableCell sx={{
                  pr: 2,
                  pl: 2,
                  textAlign: 'center',
                  backgroundColor: sheet.skip ? 'rgba(0, 0, 0, 0.04)' : 'transparent',
                  width: 100, // Give it a fixed width like ColumnMappingStep
                }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={sheet.skip}
                        onChange={(e) => handleSkipToggle(sheet.id, e.target.checked)}
                        size="small"
                        color={sheet.skip ? "default" : "success"} // Match dynamic color
                        sx={{ // Match custom switch styling
                          '& .MuiSwitch-switchBase': {
                            padding: '3px'
                          },
                          '& .MuiSwitch-thumb': {
                            width: 16,
                            height: 16
                          },
                          '& .MuiSwitch-track': {
                            borderRadius: 10,
                            opacity: 0.8,
                            backgroundColor: sheet.skip ? '#bdbdbd' : undefined
                          },
                          mr: 0.5 // Keep slight margin before label
                        }}
                      />
                    }
                    label={
                      <Typography
                        variant="caption"
                        sx={{ // Match custom label styling
                          fontSize: '0.7rem',
                          whiteSpace: 'nowrap',
                          fontWeight: 'medium',
                          color: sheet.skip ? 'text.secondary' : 'success.main'
                        }}
                      >
                        {sheet.skip ? "Skipped" : "Import"}
                      </Typography>
                    }
                    sx={{ 
                      m: 0, // Remove default margins
                      display: 'inline-flex', // Ensure proper alignment
                      alignItems: 'center',
                    }}
                  />
                </TableCell>
                
                {/* Status */}
                <TableCell>
                  {(() => {
                    // Calculate if this sheet has a high confidence match
                    const availableOptions = getSortedTableSuggestions(sheet.originalName, tables, '');
                    const matchedOption = availableOptions.find(option => {
                      // Compare with normalization to make matching prefix-agnostic
                      return normalizeName(option.name) === normalizeName(sheet.mappedName);
                    });
                    const matchConfidence = matchedOption?.confidence || 0;
                    const hasPerfectMatch = sheet.mappedName && matchConfidence === 100 && sheet.mappedName !== '_create_new_';
                    const hasHighConfidenceMatch = sheet.mappedName && matchConfidence >= 95 && matchConfidence < 100 && sheet.mappedName !== '_create_new_';
                    const effectivelyApproved = sheet.approved || hasHighConfidenceMatch || hasPerfectMatch;

                    if (!effectivelyApproved && sheet.needsReview) {
                      return (
                        <Tooltip
                          title="Table mapping needs review"
                          placement="top"
                        >
                          <Chip
                            label="Needs Review"
                            color="warning"
                            icon={<WarningIcon fontSize="small" />}
                            size="small"
                          />
                        </Tooltip>
                      );
                    } else if (effectivelyApproved) {
                      return (
                        <Tooltip
                          title={hasPerfectMatch ? `Perfect match auto-approved (100% confidence)` : hasHighConfidenceMatch ? `Auto-approved (${matchConfidence}% match)` : "Approved"}
                          placement="top"
                        >
                          <Chip
                            label="Approved"
                            color="success"
                            icon={<CheckCircleIcon fontSize="small" />}
                            size="small"
                          />
                        </Tooltip>
                      );
                    } else {
                      return (
                        <Chip
                          label={getStatusLabel(sheet)}
                          color={getStatusColor(sheet)}
                          size="small"
                        />
                      );
                    }
                  })()}
                </TableCell>
                
                {/* Actions */}
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    <Tooltip title="View Sample Data">
                      <IconButton
                        size="small"
                        onClick={() => handleSelectSheet(sheet.id)}
                      >
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    
                    {(() => {
                      // Calculate if this sheet has a high confidence match
                      const availableOptions = getSortedTableSuggestions(sheet.originalName, tables, '');
                      const matchedOption = availableOptions.find(option => {
                        // Compare with normalization to make matching prefix-agnostic
                        return normalizeName(option.name) === normalizeName(sheet.mappedName);
                      });
                      const matchConfidence = matchedOption?.confidence || 0;
                      const hasPerfectMatch = sheet.mappedName && matchConfidence === 100 && sheet.mappedName !== '_create_new_';
                      const hasHighConfidenceMatch = sheet.mappedName && matchConfidence >= 95 && matchConfidence < 100 && sheet.mappedName !== '_create_new_';
                      const effectivelyApproved = sheet.approved || hasHighConfidenceMatch || hasPerfectMatch;

                      // Only show approval button if not effectively approved and needs review
                      if (!effectivelyApproved && sheet.needsReview && !sheet.skip) {
                        return (
                          <Tooltip title="Approve Mapping">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => handleApprove(sheet.id)}
                              disabled={!sheet.mappedName || sheet.mappedName === '_create_new_'}
                            >
                              <CheckCircleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        );
                      }
                      return null;
                    })()}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      
      {/* Selected sheet preview */}
      {selectedSheet && (
        <Box>
          <Typography variant="subtitle1" gutterBottom>
            Preview: {selectedSheet.originalName}
          </Typography>
          
          <SampleDataTable 
            sheet={selectedSheet} 
            headerRow={selectedSheet.headerRow} 
            showDataTypes={true}
          />
        </Box>
      )}
      
      {/* No selection prompt */}
      {!selectedSheet && sheets.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Click the view icon on a sheet to preview its data
        </Alert>
      )}
      
      {/* Show all samples toggle */}
      {sheets.length > 0 && (
        <Button 
          variant="outlined" 
          onClick={() => setShowAllSamples(!showAllSamples)}
          sx={{ mt: 2 }}
        >
          {showAllSamples ? 'Hide All Samples' : 'Show All Samples'}
        </Button>
      )}
      
      {/* All sheet previews */}
      {showAllSamples && (
        <Box sx={{ mt: 2 }}>
          {sheets.map((sheet) => (
            <Box key={sheet.id} sx={{ mt: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                {sheet.originalName} {sheet.skip ? '(Skipped)' : `→ ${normalizeName(sheet.mappedName || '')}`}
              </Typography>
              
              <SampleDataTable 
                sheet={sheet} 
                headerRow={sheet.headerRow} 
                showDataTypes={true}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

// Helper function to get row background color based on status
const getRowBackground = (sheet: SheetMapping): string => {
  if (sheet.error) return 'rgba(244, 67, 54, 0.08)';
  if (sheet.skip) return 'rgba(0, 0, 0, 0.04)';
  if (sheet.approved) return 'rgba(76, 175, 80, 0.08)';
  if (sheet.needsReview) return 'rgba(255, 152, 0, 0.08)';
  return 'transparent';
};

// Helper function to get status label
const getStatusLabel = (sheet: SheetMapping): string => {
  if (sheet.error) return 'Error';
  if (sheet.skip) return 'Skipped';
  if (sheet.approved) return 'Approved';
  if (sheet.needsReview) return 'Needs Review';
  return 'Pending';
};

// Helper function to get status color
const getStatusColor = (sheet: SheetMapping): 'success' | 'warning' | 'error' | 'default' => {
  if (sheet.error) return 'error';
  if (sheet.skip) return 'default';
  if (sheet.approved) return 'success';
  if (sheet.needsReview) return 'warning';
  return 'default';
};

// Helper function to get confidence color
const getConfidenceColor = (confidence: number): 'success' | 'warning' | 'error' | 'default' => {
  if (confidence >= 95) return 'success';
  if (confidence >= 70) return 'warning';
  if (confidence > 0) return 'error';
  return 'default';
};

// Helper function to ensure the Select value is valid (part of the available options)
const getValidSelectValue = (
  currentValue: string | undefined,
  availableOptions: { name: string }[]
): string => {
  if (!currentValue) return '';
  if (currentValue === '_create_new_') return '_create_new_';

  // First try exact match
  const exactMatch = availableOptions.find(option => option.name === currentValue);
  if (exactMatch) {
    return currentValue;
  }

  // If no exact match, try normalized comparison (prefix-agnostic)
  const normalizedMatch = availableOptions.find(option => 
    normalizeName(option.name) === normalizeName(currentValue)
  );
  
  // If we found a match with normalization, use that option's name
  if (normalizedMatch) {
    console.log(`Found normalized match: ${currentValue} → ${normalizedMatch.name}`);
    return normalizedMatch.name;
  }

  // If neither exact nor normalized match found, default to create new
  return '_create_new_';
};

// Helper function to get sorted table suggestions
const getSortedTableSuggestions = (
  sheetName: string,
  tables: any[],
  prefix: string = ''
): { name: string, originalName: string, confidence: number }[] => {
  if (!tables || tables.length === 0) {
    return [];
  }

  // Using the imported normalizeName function

  // Calculate confidence for all tables
  const suggestions = tables.filter(table => table && table.name).map(table => {
    try {
      // Strip ln_ prefix for similarity comparison
      const normalizedTableName = normalizeName(table.name);
      
      // Calculate similarity between sheet name and normalized table name
      const similarity = calculateSimilarity(sheetName, normalizedTableName);

      // For existing tables in dropdown, DON'T apply prefix - they are existing DB tables
      const tableName = table.name;

      // Make sure we're using a normalized table name that won't conflict with reserved words
      const safeTableName = normalizeTableName(tableName);

      // For display purposes, show normalized name (without ln_ prefix)
      const displayName = normalizeName(table.name);

      return {
        name: safeTableName,      // Safe name for database operations
        originalName: displayName, // Display name (without ln_ prefix)
        confidence: similarity
      };
    } catch (err) {
      console.error('Error processing table suggestion:', err, table);
      // Return a default entry with minimal information to prevent crashes
      return {
        name: 'invalid_table',
        originalName: 'Invalid Table Entry',
        confidence: 0
      };
    }
  });

  // Sort by confidence descending
  return suggestions.sort((a, b) => b.confidence - a.confidence);
};

export default TableMappingStep;