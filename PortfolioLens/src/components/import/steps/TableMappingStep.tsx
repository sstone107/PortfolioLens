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

// Convert sheet name to SQL-friendly format
const toSqlFriendlyName = (sheetName: string): string => {
  return sheetName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
};

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
    // ULTRA AGGRESSIVE immediate safety timer (100ms) to immediately exit loading state
    // This ensures we always show the editable field right away
    const immediateTimer = setTimeout(() => {
      // // console.log('IMMEDIATE safety timeout: forcing exit from loading state');
      setInitialAutoMapComplete(true);

      // Force reset progress too
      setProgress({
        stage: 'idle',
        message: 'Ready to edit table names',
        percent: 100
      });
    }, 100);

    // Second safety timer as backup
    const backupTimer = setTimeout(() => {
      // // console.log('Backup safety timeout: forcing exit from loading state');
      setInitialAutoMapComplete(true);

      // Force reset progress too
      setProgress({
        stage: 'idle',
        message: 'Auto-mapping complete (timeout)',
        percent: 100
      });
    }, 1000);

    // Clean up timers
    return () => {
      clearTimeout(immediateTimer);
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
      // // console.log('Tables loaded in TableMappingStep:', tables.length);
      // // console.log('Sample tables:', tables.slice(0, 3));

      // Mark that we've attempted auto-mapping
      setAutoMapAttempted(true);

      // Check if we have unmapped sheets that need auto-mapping
      const unmappedSheets = sheets.filter(s => !s.skip &&
        (!s.mappedName || s.mappedName === '' || !s.approved));

      if (unmappedSheets.length > 0) {
        // // console.log('Auto-mapping on component load for', unmappedSheets.length, 'sheets');
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
            // // console.error('Error during auto-mapping:', error);
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
      // // console.error('Table loading error:', tablesError);
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
  const handleMappedNameChange = (
    sheetId: string,
    newName: string // This can be a selection from dropdown or text from input
  ) => {
    const sheet = sheets.find(s => s.id === sheetId);
    if (!sheet) return;

    let finalMappedName = newName.trim();
    let isNew = false;
    let needsReviewUpdate = sheet.needsReview; // Preserve current review status unless changed

    // Check if it's a selection from existing tables (or a special value)
    const isExistingTable = tables.some(t => normalizeName(t.name) === normalizeName(finalMappedName));
    const isSpecialValue = finalMappedName === '_create_new_' || finalMappedName === '';

    if (!isExistingTable && !isSpecialValue) {
      // This is a new table name being typed by the user or a modified existing name
      // The user types the 'base name' (e.g., 'summary', 'passthrough_expenses')
      const baseName = toSqlFriendlyName(finalMappedName);
      
      if (!baseName) { // User cleared the input or entered invalid chars only
        updateSheet(sheetId, {
          mappedName: '', // Treat as unselected
          approved: false,
          needsReview: true,
          isNewTable: false,
          error: 'New table name cannot be empty or invalid.',
        });
        return;
      }

      // Construct the full internal name: ln_[userPrefix_]baseName
      let internalName = "ln_";
      if (tablePrefix && tablePrefix.trim()) {
        internalName += `${toSqlFriendlyName(tablePrefix)}_`;
      }
      internalName += baseName;
      
      finalMappedName = internalName;
      isNew = true;
      needsReviewUpdate = true; // New or significantly changed names always need review

      // // console.log(`New table input: '${newName}', baseName: '${baseName}', internalName: '${finalMappedName}', userPrefix: '${tablePrefix}'`);

    } else if (isExistingTable) {
      // Selected an existing table from dropdown. `newName` is already the correct internal name (e.g., ln_actuals)
      // We just need to ensure it's not marked as a new table.
      isNew = false;
      // If they re-select a previously new table name that matches an existing one, clear error
      const currentSheet = sheets.find(s => s.id === sheetId);
      if (currentSheet?.error && normalizeName(currentSheet.mappedName) === normalizeName(finalMappedName)) {
        updateSheet(sheetId, { error: null });
      }
      // Check if the selected existing table name is different from the current one
      if (normalizeName(sheet.mappedName) !== normalizeName(finalMappedName)) {
        needsReviewUpdate = true; // Changed selection, mark for review
      }
    } else if (finalMappedName === '_create_new_') {
      // User clicked 'Create New Table'. `finalMappedName` is literally '_create_new_'.
      // The input field will be shown, pre-filled with a suggestion.
      // The actual internal name construction will happen when they type into that field (handled above).
      isNew = true; // Mark as new mode
      needsReviewUpdate = true;
      // Suggest a name based on the original sheet name for the input field
      const suggestedBaseName = toSqlFriendlyName(sheet.originalName);
      // The TextField component itself will handle displaying this suggestion. We store _create_new_ to signal UI state.
    } else {
      // Name is empty (e.g., user cleared selection or backspaced from new name input)
      isNew = false; // Not a new table if name is empty
      needsReviewUpdate = true;
    }

    // Update the sheet in the store
    updateSheet(sheetId, {
      mappedName: finalMappedName, // Store potentially fully prefixed name or special value
      approved: false, // Always unapprove on change
      needsReview: needsReviewUpdate,
      isNewTable: isNew,
      error: null, // Clear previous errors on valid change
    });

    // If the change was to create a new table or clear, select the sheet to show input/status
    if (isNew || finalMappedName === '' || finalMappedName === '_create_new_') {
      setSelectedSheet(sheet);
      onSheetSelect(sheet.id);
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
    // // console.log("Starting auto-mapping...");
    // // console.log("Available tables:", tables);

    // Only map sheets that aren't skipped and aren't already approved
    const sheetsToMap = sheets.filter(s => !s.skip && !s.approved);
    // // console.log("Sheets to map:", sheetsToMap.map(s => s.originalName));

    let matchCount = 0;
    let suggestCount = 0;
    let noMatchCount = 0;

    sheetsToMap.forEach(sheet => {
      const bestMatch = findBestMatchingTable(sheet.originalName);
      // // console.log(`Match for "${sheet.originalName}":`, bestMatch);

      if (bestMatch) {
        if (bestMatch.confidence === 100) {
          // Always auto-approve perfect (100%) matches without requiring any manual review
          // // console.log(`Auto-approving exact match: ${sheet.originalName} → ${bestMatch.tableName} (${bestMatch.confidence}%)`);

          // Don't apply prefix to existing tables - use the table name as-is
          const safeTableName = normalizeTableName(bestMatch.tableName);

          // console.log(`Using safe table name: ${bestMatch.tableName} → ${safeTableName}`);
          // console.log(`Perfect match auto-mapping debug:`, {
          //   sheetName: sheet.originalName,
          //   matchedTable: bestMatch.tableName,
          //   safeTableName,
          //   confidence: bestMatch.confidence
          // });

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
          // // console.log(`Auto-approving high confidence match: ${sheet.originalName} → ${bestMatch.tableName} (${bestMatch.confidence}%)`);

          // Don't apply prefix to existing tables - use the table name as-is
          const safeTableName = normalizeTableName(bestMatch.tableName);

          // // console.log(`Using safe table name: ${bestMatch.tableName} → ${safeTableName}`);

          updateSheet(sheet.id, {
            mappedName: safeTableName,
            approved: true,
            needsReview: false,
            status: 'approved'
          });

          matchCount++;
        } else {
          // For matches below 95% confidence, suggest "Create New Table" instead
          // // console.log(`No high confidence match found for: ${sheet.originalName}, suggesting new table creation`);

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
        // // console.log(`No match found for: ${sheet.originalName}, suggesting new table creation`);

        // Generate a SQL-friendly table name from the sheet name
        const sqlFriendlyName = toSqlFriendlyName(sheet.originalName);

        // Always apply ln_ prefix to suggested new tables
        const prefixedSuggestion = `ln_${sqlFriendlyName}`;

        // // console.log(`Setting sheet ${sheet.id} to create new mode with suggested table name: ${prefixedSuggestion}`);

        // CRITICAL FIX: Use _create_new_ flag to trigger the UI to show edit field
        updateSheet(sheet.id, {
          // Use _create_new_ to ensure the UI shows the edit field
          mappedName: '_create_new_',
          // Mark this as a new table
          // @ts-ignore - Custom property
          isNewTable: true,
          // Auto-approve
          approved: true,
          needsReview: false,
          status: 'approved',
          // Store the real name in these fields
          // @ts-ignore - Custom property
          suggestedName: prefixedSuggestion,
          // @ts-ignore - Custom property
          createNewValue: prefixedSuggestion
        });

        // // console.log(`Created new table for sheet ${sheet.id} with name: ${prefixedSuggestion}`);

        noMatchCount++;
      }
    });

    // // console.log(`Auto-mapping complete: ${matchCount} auto-approved, ${suggestCount} suggested, ${noMatchCount} no match`);

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
        // // console.error('Error during manual auto-mapping:', error);
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
      // // console.log(`Setting header row: UI=${uiRowNumber}, Internal=${internalRow}`);
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
    const newPrefix = e.target.value;
    setGlobalTablePrefix(newPrefix);

    // Update names for sheets that are already marked as new tables
    sheets.forEach(sheet => {
      if (sheet.isNewTable && sheet.mappedName && sheet.mappedName !== '_create_new_') {
        // Extract the base name. Current mappedName is ln_[oldPrefix_]baseName or ln_baseName
        let baseName = '';
        const lnStripped = sheet.mappedName.startsWith('ln_') ? sheet.mappedName.substring(3) : sheet.mappedName;
        
        const oldPrefixSql = tablePrefix ? toSqlFriendlyName(tablePrefix) : '';

        if (oldPrefixSql && lnStripped.startsWith(`${oldPrefixSql}_`)) {
          baseName = lnStripped.substring(oldPrefixSql.length + 1);
        } else {
          baseName = lnStripped; // No old prefix or mismatch, assume lnStripped is the baseName
        }

        if (!baseName) { // Safety check, should not happen if mappedName was valid
            // // console.warn(`Could not extract baseName from ${sheet.mappedName} for sheet ${sheet.id}`);
            return;
        }

        // Construct new full internal name: ln_[newPrefix_]baseName
        let newFullInternalName = "ln_";
        if (newPrefix && newPrefix.trim()) {
          newFullInternalName += `${toSqlFriendlyName(newPrefix)}_`;
        }
        newFullInternalName += baseName;
        
        // // console.log(`Global prefix change: Sheet ${sheet.id}, oldMapped: ${sheet.mappedName}, newMapped: ${newFullInternalName}, newPrefix: ${newPrefix}, oldPrefix: ${tablePrefix}, baseName: ${baseName}`);

        updateSheet(sheet.id, {
          mappedName: newFullInternalName,
          approved: false, // Re-approval needed
          needsReview: true,
        });
      }
    });
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
                  {/* console.log(`Rendering table cell for sheet ${sheet.id}, mappedName=${sheet.mappedName}, isNewTable=${sheet.isNewTable}`) */}
                  {/* Check if this table is in create new mode using either indicator */}
                  {/* Support both special mappedName and isNewTable flag for compatibility */}
                  {/* MEGA IMPORTANT: If we want to edit a table name we MUST switch to this mode (force with the New button) */}
                  {sheet.isNewTable || sheet.mappedName === '_create_new_' || (!tables.find(t => normalizeName(t.name) === normalizeName(sheet.mappedName)) && sheet.mappedName)
                  ? (
                    // Create new table mode with ability to go back to selection
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                      <TextField
                        size="small"
                        placeholder="Enter new table name (e.g. 'my_data')"
                        // When in create new mode, if mappedName is '_create_new_', suggest based on originalName.
                        // Otherwise, show the base name (user-typed part) from the full internal mappedName.
                        value={(() => {
                          if (sheet.mappedName === '_create_new_') {
                            return toSqlFriendlyName(sheet.originalName);
                          }
                          // Extract base name for display: remove ln_ and [userPrefix_]
                          let displayValue = sheet.mappedName || '';
                          if (displayValue.startsWith('ln_')) {
                            displayValue = displayValue.substring(3);
                          }
                          const currentPrefixSql = tablePrefix ? toSqlFriendlyName(tablePrefix) : '';
                          if (currentPrefixSql && displayValue.startsWith(`${currentPrefixSql}_`)) {
                            displayValue = displayValue.substring(currentPrefixSql.length + 1);
                          }
                          return displayValue;
                        })()}
                        onChange={(e) => handleMappedNameChange(sheet.id, e.target.value)}
                        onBlur={(e) => {
                          // Ensure the current value (which is the base name) is processed by handleMappedNameChange
                          // to form the full internal name and update the store.
                          handleMappedNameChange(sheet.id, e.target.value);
                        }}
                        error={!!sheet.error}
                        helperText={sheet.error}
                        disabled={sheet.skip}
                        fullWidth
                        sx={{ mr: 1 }}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <Typography variant="caption" color="textSecondary">
                                {"ln_" + (tablePrefix ? toSqlFriendlyName(tablePrefix) + '_' : '')}
                              </Typography>
                            </InputAdornment>
                          ),
                        }}
                      />
                      <Tooltip title="Back to table selection">
                        <IconButton
                          size="small"
                          onClick={() => handleMappedNameChange(sheet.id, '')} // Clears mapping, goes to select
                          disabled={sheet.skip}
                        >
                          <ArrowBackIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ) : (
                    // Table selection mode with dropdown
                    <Select
                        size="small"
                        value={getValidSelectValue(sheet.mappedName, getSortedTableSuggestions(sheet.originalName, tables, tablePrefix || ''))}
                        onChange={(e) => {
                        // Enhanced handler for dropdown selection
                        const selectedValue = e.target.value;
                        // // console.log(`Selected value from dropdown:`, selectedValue);

                        // Special handling for Create New Table option
                        if (selectedValue === '_create_new_') {
                          // Generate SQL-friendly name first
                          const sqlFriendlyName = toSqlFriendlyName(sheet.originalName);
                          const prefixedSuggestion = tablePrefix ? `${toSqlFriendlyName(tablePrefix)}_${sqlFriendlyName}` : sqlFriendlyName;

                          // CRITICAL FIX: Use _create_new_ flag to trigger the UI to show edit field
                          // // console.log(`Setting sheet ${sheet.id} to create new table mode with name: ${prefixedSuggestion}`);

                          // Use the special _create_new_ value to trigger the UI to show the edit field
                          updateSheet(sheet.id, {
                            // Use _create_new_ to ensure the UI shows the edit field
                            mappedName: '_create_new_',
                            // Mark this as a new table
                            // @ts-ignore - Custom property
                            isNewTable: true,
                            // Auto-approve
                            approved: true,
                            needsReview: false,
                            status: 'approved',
                            // Store the real name in these fields
                            // @ts-ignore - Custom property
                            suggestedName: prefixedSuggestion,
                            // @ts-ignore - Custom property
                            createNewValue: prefixedSuggestion
                          });
                          // // console.log(`Set sheet ${sheet.id} to create new table mode with suggested name: ${prefixedSuggestion}`);
                        } else {
                          // For other selections, use the normal handler
                          handleMappedNameChange(sheet.id, selectedValue);
                        }
                      }}
                        disabled={sheet.skip}
                        error={!sheet.mappedName && !sheet.skip}
                        displayEmpty
                        sx={{ minWidth: 150, flexGrow: 1 }}
                    >
                      <MenuItem value="">
                        <em>Select a table</em>
                      </MenuItem>
                      
                      <MenuItem value="_create_new_">
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Typography
                            component="span"
                            sx={{
                              color: '#9c27b0', // Purple color
                              fontWeight: 'bold',
                              fontSize: '1.2rem',
                              mr: 1
                            }}
                          >
                            +
                          </Typography>
                          <Typography color="primary">Create New Table</Typography>
                        </Box>
                      </MenuItem>
                      
                      <Divider />
                      
                      <MenuItem disabled>
                        <Typography variant="caption" color="text.secondary">
                          Existing Tables (by match confidence)
                        </Typography>
                      </MenuItem>
                      
                      {/* Table suggestions sorted by confidence */}
                      {getSortedTableSuggestions(sheet.originalName, tables, tablePrefix || '').map((suggestion) => (
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
                      // Check if this is a new table
                      // @ts-ignore - Custom property
                      const isNewTable = sheet.isNewTable;

                      return (
                        <Tooltip
                          title={
                            isNewTable
                              ? "New table will be created"
                              : hasHighConfidenceMatch
                                ? `Auto-approved (${matchConfidence}% match)`
                                : "Approved"
                          }
                          placement="top"
                        >
                          <Chip
                            label={isNewTable ? "New Table" : "Approved"}
                            color={isNewTable ? "secondary" : "success"}
                            icon={
                              isNewTable
                                ? <Typography component="span" sx={{ color: '#9c27b0', fontWeight: 'bold', fontSize: '1.2rem' }}>+</Typography>
                                : <CheckCircleIcon fontSize="small" />
                            }
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
    // // console.log(`Found normalized match: ${currentValue} → ${normalizedMatch.name}`);
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
      // // console.error('Error processing table suggestion:', err, table);
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