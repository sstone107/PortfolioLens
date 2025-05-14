/**
 * TableMappingStepVirtualized.tsx
 * Virtualized implementation of TableMappingStep with performance improvements and UX enhancements
 */

// IMPORTANT: Define constants at the top level to avoid temporal dead zone issues
import { TABLE_AUTO_APPROVE_THRESHOLD } from '../hooks/useAutoTableMatch';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Alert,
  Button,
  LinearProgress,
  Typography,
  useTheme,
  useMediaQuery,
  Tooltip
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useBatchImportStore, SheetMapping } from '../../../store/batchImportStore';
import { useTableMetadata } from '../BatchImporterHooks';
import useAutoTableMatch from '../hooks/useAutoTableMatch';
import { ErrorBoundary } from '../../common';
import ImportErrorFallback from '../ImportErrorFallback';
import {
  TableMappingHeader,
  TableMappingList,
  TablePreviewSection
} from './partials';

interface TableMappingStepProps {
  onSheetSelect: (sheetId: string | null) => void;
  onError: (error: string | null) => void;
}

/**
 * Virtualized Table Mapping step with enhanced performance and UX
 */
export const TableMappingStepVirtualized: React.FC<TableMappingStepProps> = ({
  onSheetSelect,
  onError
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  // States
  const [selectedSheet, setSelectedSheet] = useState<SheetMapping | null>(null);
  // Always start with sample data hidden
  const [showAllSamples, setShowAllSamples] = useState(false);
  const [showPreview, setShowPreview] = useState(false); // New state to control preview visibility
  const [initialAutoMapComplete, setInitialAutoMapComplete] = useState(false);
  const [autoMapAttempted, setAutoMapAttempted] = useState(false);
  // Cache for validation results - will be managed by useMemo or similar later if needed
  // For now, direct state update is removed from validateTableExists to prevent render loops
  const [validationCache, setValidationCache] = useState<Record<string, boolean>>({}); 
  // Always filter to show only loan tables - no state needed
  
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
  
  // Track when tables finish loading to validate mappings
  const [tablesLoaded, setTablesLoaded] = useState(false);
  
  // Counter to limit validation logging
  const [validationLogCounter, setValidationLogCounter] = useState(0);
  
  // IMPORTANT: Define validateTableExists early to avoid temporal dead zone issues
  // Validate if a table name exists in the loaded table options
  const validateTableExists = useCallback((tableName: string): boolean => {
    // Special values are always valid as options in the Select component
    if (tableName === '' || tableName === '_create_new_') return true;
    
    // If tables are not loaded yet, or no tables exist, consider other names invalid for now.
    // This prevents errors when sheets have pre-existing mappedNames before tables load.
    if (!tables || !Array.isArray(tables) || tables.length === 0) {
      // Limit logging to reduce console noise
      // if (validationLogCounter < 5 && process.env.NODE_ENV === 'development') {
      //   console.warn(`Cannot validate table name '${tableName}' while tables are loading or empty. Assuming invalid for now.`);
      //   setValidationLogCounter(prev => prev + 1); // This state update is problematic here too if called during render.
      // }
      return false; // Assume invalid if tables aren't ready, unless it's a special value handled above.
    }
    
    const cacheKey = tableName.trim().toLowerCase();
    // Check cache first (Note: cache is not being populated in this version to avoid state updates during render)
    // if (validationCache[cacheKey] !== undefined) {
    //   return validationCache[cacheKey];
    // }
    
    // Development logging (conditional to reduce noise)
    // if (process.env.NODE_ENV === 'development' && Math.random() < 0.01) {
    //   console.debug(`Validating table existence: ${tableName} against ${tables.length} tables`);
    // }

    // Stricter validation: only existing tables are valid beyond special values.
    // The logic for 'is this a new table the user is defining' is handled in TableMappingRow's Select options.
    
    const normalizedTarget = tableName.toLowerCase().trim();
    const normalizedTargetNoUnderscores = normalizedTarget.replace(/[\_\s]/g, '');
    
    const result = tables.some(table => {
      if (!table || !table.name) return false;
      const normalizedTableName = table.name.toLowerCase().trim();
      if (normalizedTableName === normalizedTarget) return true;
      const normalizedTableNameNoUnderscores = normalizedTableName.replace(/[\_\s]/g, '');
      return normalizedTableNameNoUnderscores === normalizedTargetNoUnderscores;
    });
    
    // setValidationCache(prev => ({ ...prev, [cacheKey]: result })); // Removed direct state update
    return result;
  }, [tables]); // Removed validationLogCounter and validationCache from dependencies for now
  
  // Enhanced table matching with the new hook
  const {
    getSortedTableSuggestions,
    autoMapSheets,
    autoMapSheetsAndColumns,
    getEffectiveStatus,
    toSqlFriendlyName,
    generateSqlSafeName,
    formatConfidence
  } = useAutoTableMatch({
    sheets,
    tables,
    updateSheet,
    tablePrefix
  });
  
  // Validate all existing mappings when tables finish loading
  useEffect(() => {
    // Safety check to ensure validateTableExists is properly defined
    if (typeof validateTableExists !== 'function') {
      console.warn('validateTableExists not available yet, skipping validation');
      return;
    }
    
    if (!tablesLoading && tables && tables.length > 0 && !tablesLoaded) {
      console.log('Tables loaded - validating existing mappings...');
      setTablesLoaded(true);
      
      try {
        // Check for and fix invalid mappings
        const invalidMappedSheets = sheets.filter(s => 
          !s.skip && 
          s.mappedName && 
          s.mappedName !== '_create_new_' && 
          !validateTableExists(s.mappedName)
        );

      if (invalidMappedSheets.length > 0) {
        console.warn('Found invalid table mappings that need to be reset:', 
          invalidMappedSheets.map(s => `${s.originalName} -> ${s.mappedName}`).join(', '));
          
        // Reset invalid mappings to empty
        invalidMappedSheets.forEach(sheet => {
          console.log(`Resetting invalid mapping for sheet: ${sheet.originalName}`);
          updateSheet(sheet.id, {
            mappedName: '',
            approved: false,
            needsReview: true,
            isNewTable: false,
            status: 'pending'
          });
        });
      }
      } catch (error) {
        console.error('Error during table validation:', error);
        // Still mark as loaded even if validation fails to prevent retries
        setTablesLoaded(true); 
      }
    }
  }, [tablesLoading, tables, sheets, tablesLoaded, updateSheet, validateTableExists]);
  
  // Define column widths for the virtualized list cells
  // These should roughly match the TableHead cell widths or desired proportions
  const columnWidths = {
    sheetName: isMobile ? '150px' : '25%', // Flex grow can also be used e.g. flex: 2
    databaseTable: isMobile ? '200px' : '30%', // flex: 3
    headerRow: isMobile ? '80px' : '100px',
    skip: isMobile ? '100px' : '120px',
    status: isMobile ? '120px' : '150px',
    actions: isMobile ? '80px' : '100px',
  };
  
  // Add safety timer to prevent getting stuck in loading state
  useEffect(() => {
    const immediateTimer = setTimeout(() => {
      setInitialAutoMapComplete(true);
      setProgress({
        stage: 'idle',
        message: 'Ready to edit table names',
        percent: 100
      });
    }, 300);

    return () => {
      clearTimeout(immediateTimer);
    };
  }, [setProgress]);

  // Auto-map tables when component loads
  useEffect(() => {
    // Only try auto-mapping once to prevent infinite loops
    if (autoMapAttempted || tablesLoading || !tables?.length) {
      return;
    }

    // Log the initial state to help with debugging
    console.log('Init auto-mapping with tables:', tables.length, 'sheets:', sheets.length);
    
    // Mark that we've attempted auto-mapping
    setAutoMapAttempted(true);
    
    // Safety check for validateTableExists function
    if (typeof validateTableExists !== 'function') {
      console.error('validateTableExists function not available during auto-mapping');
      setProgress({
        stage: 'idle',
        message: 'Auto-mapping skipped due to initialization error',
        percent: 100
      });
      setInitialAutoMapComplete(true);
      return;
    }
    
    try {
      // Check if we have unmapped sheets that need auto-mapping
      const unmappedSheets = sheets.filter(s => !s.skip && 
        (!s.mappedName || s.mappedName === '' || !s.approved));

      // Also check for invalid mappings that need to be fixed
      const invalidMappedSheets = sheets.filter(s => {
        try {
          return !s.skip && 
            s.mappedName && 
            s.mappedName !== '_create_new_' && 
            !validateTableExists(s.mappedName);
        } catch (err) {
          console.error('Error filtering invalid sheets:', err);
          return false; // Skip this item on error
        }
      });

    // Log any invalid mappings for debugging
    if (invalidMappedSheets.length > 0) {
      console.warn('Found invalid table mappings:', 
        invalidMappedSheets.map(s => `${s.originalName} -> ${s.mappedName}`));
    }

    if (unmappedSheets.length > 0 || invalidMappedSheets.length > 0) {
      // Set progress to analyzing state to show loading
      setProgress({
        stage: 'analyzing',
        message: 'Auto-mapping sheets to tables...',
        percent: 50
      });

      // Use setTimeout to allow UI to update with progress indicator
      setTimeout(() => {
        try {
          // Run enhanced auto-mapping that handles both sheets and columns
          autoMapSheetsAndColumns();
          
          // For invalid mappings, clear the mappedName to force re-selection
          invalidMappedSheets.forEach(sheet => {
            updateSheet(sheet.id, {
              mappedName: '',
              approved: false,
              needsReview: true,
              isNewTable: false,
              status: 'pending'
            });
          });
          
          // Find the first sheet that needs review, if any
          // Prioritize invalid mappings so they get fixed first
          const firstInvalidSheet = invalidMappedSheets[0];
          const firstNeedsReview = sheets.find(s => !s.skip && s.needsReview);
          
          if (firstInvalidSheet) {
            setSelectedSheet(firstInvalidSheet);
            onSheetSelect(firstInvalidSheet.id);
          } else if (firstNeedsReview) {
            setSelectedSheet(firstNeedsReview);
            onSheetSelect(firstNeedsReview.id);
          }
        } catch (error) {
          console.error('Error during auto-mapping:', error);
        } finally {
          // Always reset progress when done, even if there was an error
          setProgress({
            stage: 'idle',
            message: 'Auto-mapping complete',
            percent: 100
          });

          // Exit loading state
          setInitialAutoMapComplete(true);
        }
      }, 300);
    } else {
      // No sheets to map, mark as complete
      setInitialAutoMapComplete(true);
    }
    } catch (error) {
      console.error('Error in table auto-mapping top level:', error);
      
      // Set safe fallback state
      setProgress({
        stage: 'idle',
        message: 'Error during auto-mapping',
        percent: 100
      });
      setInitialAutoMapComplete(true);
    }
  }, [tables, tablesLoading, sheets, setProgress, autoMapAttempted, updateSheet, autoMapSheetsAndColumns, onSheetSelect, validateTableExists]);

  // Set error if tables failed to load
  useEffect(() => {
    if (tablesError) {
      console.error('Table loading error:', tablesError);
      onError(tablesError);
    } else {
      onError(null);
    }
  }, [tablesError, onError]);
  
  // Handle selection of a sheet for preview
  const handleSelectSheet = useCallback((sheetId: string) => {
    const sheet = sheets.find(s => s.id === sheetId);
    if (sheet) {
      setSelectedSheet(sheet);
      setShowPreview(true); // Show preview when a sheet is selected
      onSheetSelect(sheetId);
    }
  }, [sheets, onSheetSelect]);
  
  // Handle sheet name change
  const handleMappedNameChange = useCallback((sheetId: string, value: string) => {
    const sheet = sheets.find(s => s.id === sheetId);
    if (!sheet) return;

    const isCreatingNew = value === '_create_new_';
    const isSelectingExisting = value !== '' && !isCreatingNew;

    // When selecting "Create New", prepare a default suggested name
    if (isCreatingNew) {
      // Generate a SQL-friendly name based on the sheet name
      const suggestedName = tablePrefix 
        ? `${tablePrefix}${toSqlFriendlyName(sheet.originalName)}`
        : toSqlFriendlyName(sheet.originalName);
      
      console.log(`Preparing "_create_new_" mode for sheet: ${sheet.originalName} with suggested: ${suggestedName}`);
      
      updateSheet(sheetId, {
        mappedName: '_create_new_', // Special value indicating create new mode
        approved: true, // Auto-approve new tables with valid names
        needsReview: false, // Don't show this as needing review since it's in create mode
        isNewTable: true, // Flag this as a new table
        suggestedName: suggestedName, // Store the suggested name for default value
        createNewValue: suggestedName, // Set initial value for the text field
        status: 'approved' // Change status to approved for valid names
      });
      return;
    }
    
    // When selecting an existing table
    if (isSelectingExisting) {
      updateSheet(sheetId, {
        mappedName: value,
        approved: false, // Requires re-approval when selecting existing table
        needsReview: true, // Existing tables should be reviewed by default
        isNewTable: false, // Not a new table
        status: 'mapping' // Change status to mapping when selection is made
      });
      return;
    }

    // If clearing selection (value is ''), reset all flags
    if (value === '') {
      updateSheet(sheetId, {
        mappedName: '',
        approved: false,
        needsReview: false,
        isNewTable: false,
        suggestedName: undefined,
        createNewValue: undefined,
        status: 'pending'
      });
    }
  }, [sheets, updateSheet, tablePrefix, toSqlFriendlyName]);
  
  // Handle skip toggle
  const handleSkipToggle = useCallback((sheetId: string, skip: boolean) => {
    updateSheet(sheetId, {
      skip, 
      needsReview: true,
      status: skip ? 'pending' : 'mapping'
    });
  }, [updateSheet]);
  
  // Handle sheet approval
  const handleApprove = useCallback((sheetId: string) => {
    const sheet = sheets.find(s => s.id === sheetId);
    if (!sheet) return;

    // If already approved and trying to cancel, revert to 'pending' or 'needs review'
    updateSheet(sheetId, {
      mappedName: sheet.mappedName || '',
      approved: false,
      needsReview: false,
      isNewTable: false,
      status: 'pending'
    });
  }, [sheets, updateSheet]);

  const handleApproveNew = useCallback((sheetId: string) => {
    const sheet = sheets.find(s => s.id === sheetId);
    if (!sheet) return;

    if (sheet.mappedName && sheet.mappedName !== '_create_new_' && sheet.mappedName !== '') {
      // User is approving an existing table selection
      updateSheet(sheetId, {
        approved: true,
        needsReview: false,
        isNewTable: false,
        status: 'approved'
      });
    }
  }, [sheets, updateSheet]);

  // Handle global header row change (converts from 1-based UI to 0-based internal)
  const handleGlobalHeaderRowChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const uiRowNumber = parseInt(e.target.value, 10);
    // Convert from 1-based (UI) to 0-based (internal)
    const internalRow = uiRowNumber - 1;

    if (!isNaN(uiRowNumber) && uiRowNumber >= 1) {
      setGlobalHeaderRow(internalRow);
      // Update all sheets with the 0-based row index
      sheets.forEach(sheet => {
        updateSheet(sheet.id, {
          headerRow: internalRow,
          needsReview: true
        });
      });
    }
  }, [sheets, updateSheet, setGlobalHeaderRow]);
  
  // Handle global table prefix change
  const handleGlobalTablePrefixChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const prefix = e.target.value;
    const oldPrefix = tablePrefix;

    // Store the prefix globally
    setGlobalTablePrefix(prefix);

    // Update names for all sheets based on their current state
    sheets.forEach(sheet => {
      // For sheets in "Create New" mode
      if (sheet.mappedName === '_create_new_') {
        // Get the current user-entered value, if available
        const userEnteredValue = sheet.createNewValue;

        if (userEnteredValue) {
          // Remove old prefix if present and add new one
          let cleanValue = userEnteredValue;
          if (oldPrefix && cleanValue.startsWith(oldPrefix)) {
            cleanValue = cleanValue.substring(oldPrefix.length);
          }
          const prefixedValue = prefix ? `${prefix}${cleanValue}` : cleanValue;

          // Update with new prefixed value while preserving create new mode
          updateSheet(sheet.id, {
            createNewValue: prefixedValue,
            mappedName: '_create_new_'
          });
        }

        // Also update the suggested name
        let baseName;
        if (typeof sheet.suggestedName === 'string') {
          baseName = sheet.suggestedName.replace(oldPrefix || '', '');
        } else {
          baseName = toSqlFriendlyName(sheet.originalName);
        }

        // Apply the new prefix
        const newSuggestion = prefix ? `${prefix}${baseName}` : baseName;

        // Update the sheet with the new suggested name
        updateSheet(sheet.id, {
          suggestedName: newSuggestion
        });
      }
      // For sheets with actual table names that were manually created (not mapped to existing)
      else if (sheet.mappedName && sheet.wasCreatedNew) {
        // Remove old prefix if present
        let baseName = sheet.mappedName;
        if (oldPrefix && baseName.startsWith(oldPrefix)) {
          baseName = baseName.substring(oldPrefix.length);
        }

        // Apply new prefix
        const newName = prefix ? `${prefix}${baseName}` : baseName;

        // Update with new prefixed name
        updateSheet(sheet.id, {
          mappedName: newName,
          needsReview: true
        });
      }
    });
  }, [tablePrefix, setGlobalTablePrefix, sheets, updateSheet, toSqlFriendlyName]);
  
  // Handle header row change for a specific sheet
  const handleHeaderRowChange = useCallback((sheetId: string, row: number) => {
    updateSheet(sheetId, { 
      headerRow: row,
      needsReview: true // Changing header row requires review
    });
  }, [updateSheet]);
  
  // Public auto-mapping function (for button click)
  const handleAutoMap = useCallback(() => {
    // Safety check for tables
    if (!tables || tables.length === 0) {
      console.warn('Auto-mapping skipped: No database tables available');
      return;
    }
    
    // Show progress indicator
    setProgress({
      stage: 'analyzing',
      message: 'Auto-mapping sheets to tables...',
      percent: 50
    });

    // Use setTimeout to ensure the progress indicator shows
    setTimeout(() => {
      try {
        // Run enhanced auto-mapping for both sheets and columns
        autoMapSheetsAndColumns();
      } catch (error) {
        console.error('Error during manual auto-mapping:', error);
      } finally {
        // Always reset progress when done
        setProgress({
          stage: 'idle',
          message: 'Auto-mapping complete',
          percent: 100
        });
      }
    }, 100);
  }, [setProgress, autoMapSheetsAndColumns, tables]);

  // Memoized displayable sheets list for rendering
  const displayableSheets = useMemo(() => {
    try {
      // Filter out any sheets with empty or undefined data to prevent rendering errors
      return sheets.filter(sheet => {
        return sheet && sheet.id && typeof sheet.id === 'string';
      });
    } catch (error) {
      console.error('Error processing sheets for display:', error);
      return []; // Return empty array on error
    }
  }, [sheets]);

  // Enhanced loading state - fix condition to properly detect when we should show loading UI
  if ((!initialAutoMapComplete || progress.stage === 'analyzing' || progress.stage === 'reading') 
        && (!autoMapAttempted || progress.stage === 'analyzing')) {
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
            color: theme.palette.success.main,
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

        <Typography variant="h4" gutterBottom fontWeight="medium" sx={{ color: theme.palette.success.main }}>
          Processing Your Data
        </Typography>

        <Typography variant="h6" gutterBottom sx={{ maxWidth: 600, mb: 4 }}>
          Please wait while we analyze and map your spreadsheet
        </Typography>

        <Typography variant="body1" gutterBottom sx={{ maxWidth: 500, mb: 4 }}>
          {progress.message || "Analyzing your data and matching to database tables..."}
        </Typography>

        <Box sx={{ width: '100%', maxWidth: 500, mb: 4 }}>
          <LinearProgress 
            color="success" 
            variant="indeterminate"
            sx={{ height: 8, borderRadius: 2 }}
          />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Only tables with ≥{TABLE_AUTO_APPROVE_THRESHOLD}% confidence will be auto-approved
        </Typography>
        
        <Tooltip title="Tables will automatically get the ln_ prefix applied">
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            All loan tables will use the ln_ prefix
          </Typography>
        </Tooltip>
      </Box>
    );
  }

  // Main UI - only shown after initial mapping is complete
  return (
    <Box>
      {/* Global controls and summary section */}
      <TableMappingHeader
        sheets={sheets}
        globalHeaderRow={globalHeaderRow}
        tablePrefix={tablePrefix}
        tablesLoading={tablesLoading}
        handleGlobalHeaderRowChange={handleGlobalHeaderRowChange}
        handleGlobalTablePrefixChange={handleGlobalTablePrefixChange}
        handleAutoMap={handleAutoMap}
        progress={progress}
      />
      
      {/* Virtualized table mapping list */}
      <TableMappingList
        sheets={displayableSheets}
        selectedSheet={selectedSheet}
        tables={tables || []}
        tablesLoading={tablesLoading}
        columnWidths={columnWidths}
        isMobile={isMobile}
        validateTableExists={validateTableExists}
        getSortedTableSuggestions={getSortedTableSuggestions}
        getEffectiveStatus={getEffectiveStatus}
        toSqlFriendlyName={toSqlFriendlyName}
        handleMappedNameChange={handleMappedNameChange}
        handleHeaderRowChange={handleHeaderRowChange}
        handleSkipToggle={handleSkipToggle}
        handleApproveNew={handleApproveNew}
        handleSelectSheet={handleSelectSheet}
        tablePrefix={tablePrefix}
        updateSheet={updateSheet}
        generateSqlSafeName={generateSqlSafeName}
        formatConfidence={formatConfidence}
      />
      
      {/* Preview section - conditionally rendered */}
      {showPreview && (
        <Box sx={{ mt: 3, position: 'relative' }}>
          <Button 
            variant="text" 
            color="primary"
            onClick={() => setShowPreview(false)}
            sx={{ position: 'absolute', right: 0, top: -10 }}
          >
            Hide Preview
          </Button>
          <TablePreviewSection
            selectedSheet={selectedSheet}
            sheets={sheets}
            showAllSamples={showAllSamples}
            setShowAllSamples={setShowAllSamples}
          />
        </Box>
      )}
      
      {/* Show Preview button when preview is hidden */}
      {!showPreview && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Button 
            variant="outlined" 
            color="primary"
            onClick={() => setShowPreview(true)}
          >
            Show Data Preview
          </Button>
        </Box>
      )}
    </Box>
  );
};

/**
 * Error handling wrapper for TableMappingStepVirtualized
 * This catches rendering errors and provides a graceful fallback UI
 */
const TableMappingStepWithErrorBoundary: React.FC<TableMappingStepProps> = (props) => {
  const handleGoBack = () => {
    // Notify parent about going back
    props.onSheetSelect(null);
    // Notify that error is cleared
    props.onError(null);
  };

  return (
    <ErrorBoundary
      fallback={
        <ImportErrorFallback 
          onBackStep={handleGoBack}
        />
      }
      onError={(error) => {
        console.error('Table mapping error:', error);
        props.onError(`Table mapping error: ${error.message}`);
      }}
    >
      <TableMappingStepVirtualized {...props} />
    </ErrorBoundary>
  );
};

export default TableMappingStepWithErrorBoundary;