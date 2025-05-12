/**
 * Column Mapping Step component
 * Handles mapping Excel columns to database fields
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  FormHelperText,
  LinearProgress
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import SettingsIcon from '@mui/icons-material/Settings';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useBatchImportStore, SheetMapping, ColumnMapping } from '../../../store/batchImportStore';
import { useTableMetadata, useTableMatcher } from '../BatchImporterHooks';
import SampleDataTable from '../SampleDataTable';
import { SupabaseDataType } from '../dataTypeInference';
import { calculateSimilarity, normalizeForDb, setExistingColumns } from '../utils/stringUtils';
import { computeSimilarityMatrix, findBestMatches, getCachedSimilarity } from '../utils/similarityUtils';
import { createDebouncedSearch, searchFields } from '../utils/searchUtils';

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
  /**
   * Normalize PostgreSQL data types to standard format for UI
   * Handles special cases like 'timestamp without time zone'
   */
  const normalizeDataType = (pgType: string): SupabaseDataType => {
    if (!pgType) return 'text';

    // Handle special PostgreSQL timestamp types
    if (pgType === 'timestamp without time zone' || pgType === 'timestamp with time zone') {
      return 'timestamp';
    }

    // Handle numeric types
    if (pgType === 'real' || pgType === 'double precision') {
      return 'numeric';
    }

    // Handle integer types
    if (pgType === 'bigint' || pgType === 'smallint') {
      return 'integer';
    }

    // Handle text variants
    if (pgType === 'character varying' || pgType === 'varchar' || pgType === 'char') {
      return 'text';
    }

    // Return the type as-is if it's already one of our standardized types
    if (['text', 'numeric', 'integer', 'boolean', 'date', 'timestamp', 'uuid'].includes(pgType)) {
      return pgType as SupabaseDataType;
    }

    // Default to text for any other types
    return 'text';
  };

  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'grouped' | 'original'>('grouped');
  const [showSettings, setShowSettings] = useState(false);
  
  // Access batch import store
  const {
    sheets,
    selectedSheetId,
    updateSheet,
    updateSheetColumn,
    batchUpdateSheetColumns,
    setSelectedSheetId,
    progress,
    setProgress,
    similarityMatrix,
    bestMatches,
    setSimilarityMatrix,
    setBestMatches
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
  const { tables, loading: tablesLoading } = useTableMetadata();

  // Create a memoized table lookup map for fast access
  const tableMap = useMemo(() => {
    if (!tables || tables.length === 0) return new Map();

    const map = new Map();
    tables.forEach(table => {
      map.set(table.name, table);
    });
    return map;
  }, [tables]);

  // State for animated ellipsis for the finalizing message
  const [ellipsis, setEllipsis] = useState('');

  // State for field search filter
  const [fieldSearchText, setFieldSearchText] = useState('');

  // Create debounced search function (150ms delay)
  const debouncedSearch = useRef(createDebouncedSearch(150));

  // Improved keyboard event listener for dropdown search with debouncing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Clear on escape
      if (e.key === 'Escape') {
        setFieldSearchText('');
        return;
      }

      // Backspace
      if (e.key === 'Backspace') {
        setFieldSearchText(prev => prev.slice(0, -1));
        return;
      }

      // Only handle alphanumeric characters, underscore, and hyphen
      if (/^[a-zA-Z0-9_\-]$/.test(e.key)) {
        // Use debounced search to avoid excessive re-renders
        debouncedSearch.current(() => {
          setFieldSearchText(prev => prev + e.key);
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Auto-clear search text after 3 seconds of inactivity
    const clearTimer = setTimeout(() => {
      setFieldSearchText('');
    }, 3000);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(clearTimer);
    };
  }, [/* No fieldSearchText dependency */]);

  // Animated ellipsis for finalizing message
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (progress.stage === 'analyzing' && progress.percent >= 95) {
      // Create animated ellipsis
      interval = setInterval(() => {
        setEllipsis(prev => {
          if (prev === '...') return '';
          return prev + '.';
        });
      }, 400);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [progress.stage, progress.percent]);

  // Create a ref to track the last processed sheet-table combination
  // This helps avoid redundant similarity calculations
  const lastProcessedCombination = useRef('');

  // Reset progress state when table loading completes
  useEffect(() => {
    // IMPORTANT: Only handle the transition to idle state once when tables finish loading
    // This prevents infinite update loops when progress state changes
    if (!tablesLoading && progress.stage === 'analyzing') {
      let timer: NodeJS.Timeout;
      // Only update progress if it's not already at 100%
      if (progress.percent < 100) {
        // Update to 100% completion
        setProgress({
          stage: 'analyzing',
          message: 'Finalizing field mapping interface...',
          percent: 100
        });

        // Set a delay before transitioning to idle
        timer = setTimeout(() => {
          setProgress({
            stage: 'idle',
            message: '',
            percent: 100
          });
        }, 300);
      } else if (progress.percent === 100) {
        // If already at 100%, just schedule the transition to idle
        timer = setTimeout(() => {
          setProgress({
            stage: 'idle',
            message: '',
            percent: 100
          });
        }, 300);
      }

      return () => {
        if (timer) clearTimeout(timer);
      };
    }
  }, [tablesLoading, progress.stage, progress.percent, setProgress]);

  // Get table schema for the selected sheet - memoized with fast Map lookup
  const tableSchema = useMemo(() => {
    if (!selectedSheet || !tableMap.size) return null;
    if (!selectedSheet.mappedName) return null;

    // Fast map lookup instead of array find
    const tableName = selectedSheet.mappedName.toLowerCase();
    const matchedTable = tableMap.get(tableName);

    if (matchedTable) {
      // Create an index of column names for faster lookups
      const columnIndex = new Map();
      matchedTable.columns.forEach(col => {
        columnIndex.set(col.name, col);
      });

      // Attach the column index to the matchedTable
      return {
        ...matchedTable,
        // @ts-ignore - Adding custom property
        columnIndex
      };
    }

    return null;
  }, [selectedSheet?.id, selectedSheet?.mappedName, tableMap]);
  
  // Pre-compute column matches for each source column with significantly improved performance
  const precomputedColumnMatches = useMemo(() => {
    if (!selectedSheet || !tableSchema || !tableSchema.columns) return new Map();

    const matches = new Map();

    // Create a single array for all columns (only once)
    // and memoize it for significant performance gain
    const allColumns = [...tableSchema.columns]
      .slice(0, Math.min(100, tableSchema.columns.length)); // Limit to max 100 cols for performance

    selectedSheet.columns.forEach(column => {
      // Skip if column is already properly mapped or skipped
      if (column.skip) return;

      // Store a reference to the limited columns - we'll sort on demand when displayed
      matches.set(column.originalName, allColumns);
    });

    return matches;
  }, [selectedSheet?.id, tableSchema?.name]);

  // Helper function to determine if a column needs review
  const needsReview = useCallback((column: ColumnMapping): boolean => {
    // Step 1: Quick exits for common cases
    if (column.skip) {
      return false; // Skipped columns never need review
    }

    if (column.mappedName === '_create_new_') {
      return true; // New fields always need review
    }

    // Step 2: Handle exact matches to database fields
    // If the field matches an existing database field with 100% confidence, it NEVER needs review
    if (column.confidence === 100 && column.mappedName && column.mappedName !== '_create_new_') {
      // Quick check if this is a database field
      if (tableSchema?.columns) {
        const matchedField = tableSchema.columns.find((col: any) => col.name === column.mappedName);
        if (matchedField) {
          // This is a perfect match to an existing field - it should NEVER need review
          // Ensure we're using the database's data type
          if (column.dataType !== normalizeDataType(matchedField.type)) {
            // Update the dataType to match the database, but still don't require review
            // This is handled elsewhere, so just return false here
          }
          return false; // Perfect match to DB field, never needs review
        }
      }
    }

    // Step 3: Handle high-confidence mappings to existing fields
    // Any mappings to existing DB fields with high confidence (95%+) should not need review
    if (column.confidence >= 95 && column.mappedName && column.mappedName !== '_create_new_') {
      if (tableSchema?.columns) {
        const matchedField = tableSchema.columns.find((col: any) => col.name === column.mappedName);
        if (matchedField) {
          return false; // High confidence match to existing field, no need for review
        }
      }
    }

    // Step 4: Handle explicit needsReview flag
    // If needsReview was explicitly set to false, respect that decision
    if (column.needsReview === false) {
      return false;
    }

    // Step 5: Handle medium and low confidence
    // Any mapping with confidence below 95% needs review
    if (column.confidence !== undefined && column.confidence < 95) {
      return true;
    }

    // Step 6: Handle new fields that aren't in the database
    // If it's mapped but not to an existing field or _create_new_
    if (column.mappedName && column.mappedName !== '_create_new_' && tableSchema?.columns) {
      const existsInDb = tableSchema.columns.some((col: any) => col.name === column.mappedName);
      if (!existsInDb) {
        return true; // New field that's not in DB yet needs review
      }
    }

    // Default: if we can't determine any specific case, be conservative and mark for review
    return column.needsReview === true;
  }, [tableSchema]);

  // Group columns by data type - with improved dependencies
  const groupedColumns = useMemo(() => {
    if (!selectedSheet) return {};

    // Efficiently group by type with a single reduce operation
    return selectedSheet.columns.reduce((groups: Record<string, ColumnMapping[]>, column) => {
      const type = column.dataType as string;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(column);
      return groups;
    }, {});
  }, [
    // Only depend on the actual data we need, not the whole selectedSheet
    selectedSheet?.id,
    // Use JSON.stringify to avoid unnecessary re-renders from reference changes
    // while still detecting actual data changes
    JSON.stringify(selectedSheet?.columns?.map(col => ({
      name: col.originalName,
      type: col.dataType,
      skip: col.skip
    })))
  ]);

  // Pre-compute similarity scores when table schema or columns change
  useEffect(() => {
    console.debug("Similarity calculation effect running - checking if calculation needed");

    // Only proceed when we have a valid sheet and schema
    if (!selectedSheet || !tableSchema || !tableSchema.columns || !tableSchema.columns.length) {
      console.debug("Skipping similarity calculation - missing sheet or table schema");
      return;
    }

    // Create a unique identifier for the current sheet-table combination
    const currentSheetTable = `${selectedSheet.id}_${tableSchema.name}`;

    // Add a special check for our completion marker
    if (lastProcessedCombination.current.endsWith('_complete')) {
      console.debug('This sheet-table combination has been fully processed (complete marker)');
      return;
    }

    // Skip if we've already processed this exact sheet-table combination
    if (currentSheetTable === lastProcessedCombination.current &&
        Object.keys(similarityMatrix).length > 0 &&
        Object.keys(bestMatches).length > 0) {
      // If we already have data for this combination, exit early
      console.debug('Similarity data already cached for this sheet-table combination - skipping calculation');
      return;
    }

    // Check if we have special marker objects indicating complete calculation
    if (similarityMatrix && 'calculation_complete' in similarityMatrix &&
        bestMatches && 'exact_matches_only' in bestMatches) {
      console.debug('Calculation already complete (marker objects present) - skipping recalculation');
      return;
    }

    console.debug(`Processing similarity calculation for sheet ${selectedSheet.id}, table ${tableSchema.name}`);

    // Update the ref with current combination
    lastProcessedCombination.current = currentSheetTable;

    // Skip if we already have ANY similarity matrix data (not just for this sheet)
    // This is a simpler check that prevents redundant calculations
    const matrixHasData = Object.keys(similarityMatrix).length > 0 &&
                          Object.keys(bestMatches).length > 0 &&
                          !('calculation_complete' in similarityMatrix); // Skip the marker object

    if (matrixHasData) {
      // If we already have data, just make sure we leave the loading state properly
      if (progress.stage === 'analyzing' && progress.percent < 100) {
        setTimeout(() => {
          setProgress({
            stage: 'analyzing',
            message: 'Field mapping ready',
            percent: 100
          });

          // Extra transition to idle after a delay to avoid any flashing
          setTimeout(() => {
            setProgress({
              stage: 'idle',
              message: '',
              percent: 100
            });
          }, 500);
        }, 100);
      }
      return; // Use the existing matrix
    }

    // First, ensure the progress indicator shows meaningful progress
    // This prevents abrupt flashing of UI elements
    if (progress.stage !== 'analyzing' || progress.percent === 0) {
      setProgress({
        stage: 'analyzing',
        message: 'Initializing column mapping...',
        percent: 5
      });
    }

    // Use a slightly longer timeout to ensure UI renders before heavy computation starts
    // This avoids blocking of the main thread that leads to violations
    const timer = setTimeout(() => {
      try {
        // Start progress indicator - updates smoothly
        setProgress({
          stage: 'analyzing',
          message: 'Calculating field similarities...',
          percent: 10
        });

        // First optimization: Look for exact name matches before any similarity calculations
        // This avoids unnecessary similarity computations for direct matches
        const columnUpdates: Record<string, Partial<ColumnMapping>> = {};
        let exactMatchCount = 0;

        // Create a fast lookup map for database fields
        const fieldMap = new Map();
        tableSchema.columns.forEach((col: any) => {
          // Store with normalized versions for better matching
          const normalizedName = col.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          fieldMap.set(col.name, col);
          fieldMap.set(normalizedName, col);
        });

        // First pass: Check for exact matches with database field names
        selectedSheet.columns.forEach(column => {
          // Skip if already properly mapped
          if (column.skip || (column.mappedName && column.mappedName !== '_create_new_')) {
            return;
          }

          // Try exact matches first (case-insensitive for better UX)
          const originalNameLower = column.originalName.toLowerCase();
          const normalizedName = originalNameLower.replace(/[^a-z0-9]/g, '');

          // Check for direct matches or normalized matches
          let exactMatch: any = null;

          // Direct field name match - highest priority
          if (fieldMap.has(column.originalName)) {
            exactMatch = fieldMap.get(column.originalName);
          }
          // Case-insensitive match - still reliable
          else if (fieldMap.has(originalNameLower)) {
            exactMatch = fieldMap.get(originalNameLower);
          }
          // Normalized match (no special chars) - still reliable
          else if (fieldMap.has(normalizedName)) {
            exactMatch = fieldMap.get(normalizedName);
          }

          // If we found an exact match, use it directly without further calculations
          if (exactMatch) {
            exactMatchCount++;
            // Normalize the data type to ensure it's in our supported set
            const normalizedDataType = normalizeDataType(exactMatch.type);

            columnUpdates[column.originalName] = {
              mappedName: exactMatch.name,
              dataType: normalizedDataType, // Use normalized database type for exact matches
              confidence: 100, // Maximum confidence for exact matches
              needsReview: false // Exact matches don't need review
            };
          }
        });

        // If we found exact matches, report them
        if (exactMatchCount > 0) {
          console.debug(`Found ${exactMatchCount} exact column name matches - skipping similarity calculation for these`);
        }

        // Get remaining columns that need similarity calculation
        const remainingColumns = selectedSheet.columns.filter(column => {
          // Skip already mapped columns and those we just found exact matches for
          return !(column.skip ||
                  (column.mappedName && column.mappedName !== '_create_new_') ||
                  columnUpdates[column.originalName]);
        });

        // If all columns have been mapped exactly or already had mappings, skip similarity calculation
        if (remainingColumns.length === 0) {
          console.debug('All columns have exact matches or are already mapped - skipping similarity calculation');

          // Apply the exact matches we found
          if (Object.keys(columnUpdates).length > 0) {
            batchUpdateSheetColumns(selectedSheet.id, columnUpdates);
          }

          // IMPORTANT: Store NON-EMPTY similarity matrix and best matches to signal completion
          // Empty objects might trigger recalculation, but non-empty objects with known keys
          // will signal that the calculation is complete
          setSimilarityMatrix({ 'calculation_complete': true });
          setBestMatches({ 'exact_matches_only': true });

          // Update the lastProcessedCombination ref to mark this as fully processed
          lastProcessedCombination.current = `${selectedSheet.id}_${tableSchema.name}_complete`;

          // Fast-track to completion
          setProgress({
            stage: 'analyzing',
            message: 'Field mapping complete - all fields matched exactly',
            percent: 100
          });

          // Transition to idle after a short delay
          setTimeout(() => {
            setProgress({
              stage: 'idle',
              message: '',
              percent: 100
            });
          }, 500);

          // Return early to skip the entire similarity calculation
          return;
        }

        // For remaining columns, we'll use similarity calculation
        // Get column and field names for calculation
        const columnNames = remainingColumns.map(col => col.originalName);
        const fieldNames = tableSchema.columns.map(col => col.name);

        // Start performance measurement
        const computeStart = performance.now();

        // Log what we're doing
        console.debug(`Running similarity calculation for ${columnNames.length} remaining columns`);

        // Update progress
        setProgress({
          stage: 'analyzing',
          message: `Found ${exactMatchCount} exact matches. Calculating similarities for ${columnNames.length} remaining columns...`,
          percent: 30
        });

        // Calculate similarities using worker for remaining columns
        findBestMatches(columnNames, fieldNames)
          .then(({ bestMatches: newBestMatches }) => {
            // Store best matches in global state
            setBestMatches(newBestMatches);

            // Update progress - ensure UI remains responsive
            setProgress({
              stage: 'analyzing',
              message: 'Applying auto-mappings...',
              percent: 60
            });

            // Short delay to allow UI to update before batch processing
            setTimeout(() => {
              // Add similarity-based mappings for remaining columns

              // Only process the remaining columns that weren't exact matches
              remainingColumns.forEach(column => {
                // Check for a best match from similarity calculation
                const match = newBestMatches[column.originalName];
                if (match && match.score >= 70) {
                  // Find the database field type
                  const matchedField = tableSchema.columns.find(col => col.name === match.field);

                  // Prepare update with correct typing
                  // Perfect 100% matches never need review
                  const needsReviewFlag = match.score === 100 ? false : match.score < 95;

                  columnUpdates[column.originalName] = {
                    mappedName: match.field,
                    dataType: matchedField ? matchedField.type : column.dataType,
                    confidence: match.score,
                    needsReview: needsReviewFlag
                  };
                }
              });

              // Batch update all columns in a single state change
              if (Object.keys(columnUpdates).length > 0) {
                batchUpdateSheetColumns(selectedSheet.id, columnUpdates);
              }

              // Calculate time taken
              const computeEnd = performance.now();
              console.debug(`Similarity calculation completed in ${computeEnd - computeStart}ms`);

              // Update progress to almost complete
              setProgress({
                stage: 'analyzing',
                message: 'Field mapping ready',
                percent: 95
              });

              // Final transition to idle state after a short delay to ensure smooth UI
              setTimeout(() => {
                setProgress({
                  stage: 'analyzing',
                  message: 'Field mapping ready',
                  percent: 100
                });

                // Extra transition to idle after a delay to avoid any flashing
                setTimeout(() => {
                  setProgress({
                    stage: 'idle',
                    message: '',
                    percent: 100
                  });
                }, 500);
              }, 200);
            }, 50);
          })
          .catch(error => {
            console.error('Error in similarity calculation:', error);
            setProgress({
              stage: 'idle',
              message: '',
              percent: 100
            });
          });
      } catch (error) {
        console.error('Error initializing similarity calculation:', error);
        setProgress({
          stage: 'idle',
          message: '',
          percent: 100
        });
      }
    }, 150); // This delay helps ensure the loading screen is displayed before heavy computation

    // Cleanup function to cancel the timer if the component unmounts
    return () => {
      clearTimeout(timer);
    };
  }, [
    // Core dependencies - only run when these change
    selectedSheet?.id,
    tableSchema?.name,

    // State dependencies - use stable reference counts to avoid reruns
    // but still detect when the data has been cleared/reset
    Object.keys(similarityMatrix).length === 0 ? 'empty' : 'has-data',
    Object.keys(bestMatches).length === 0 ? 'empty' : 'has-data',

    // Function dependencies
    setBestMatches,
    setProgress,
    batchUpdateSheetColumns,

    // Progress state - only care about major stage changes, not percent
    progress.stage === 'analyzing' ? 'analyzing' : 'other'
  ]);

  // Create two sets of grouped columns: one for items needing review, one for approved/auto-mapped
  const { needsReviewGrouped, approvedGrouped } = useMemo(() => {
    if (!selectedSheet || !selectedSheet.columns) {
      return { needsReviewGrouped: {}, approvedGrouped: {} };
    }

    // Create fast lookup map for database columns
    const dbColumnsByName = new Map();
    if (tableSchema && tableSchema.columns) {
      tableSchema.columns.forEach((col: any) => {
        dbColumnsByName.set(col.name, col);
      });
    }

    // Create fast lookup for column review status
    const reviewStatusLookup = new Map();

    // Single loop to categorize all columns
    const reviewByType: Record<string, ColumnMapping[]> = {};
    const approvedByType: Record<string, ColumnMapping[]> = {};

    // Process all columns in a single pass
    selectedSheet.columns.forEach(col => {
      // Get the effective data type - use database type for mappings
      let effectiveType = col.dataType;

      // Check if this column maps to a database field
      if (col.mappedName && col.mappedName !== '_create_new_') {
        const dbCol = dbColumnsByName.get(col.mappedName);
        if (dbCol) {
          // Always normalize database types for UI consistency
          effectiveType = normalizeDataType(dbCol.type);

          // If the type in our state doesn't match the db, use the db type
          if (normalizeDataType(effectiveType) !== normalizeDataType(col.dataType)) {
            // We don't need to modify the state here as the selector component
            // will use the effectiveType directly
          }
        }
      } else {
        // For non-database fields, normalize the data type too
        effectiveType = normalizeDataType(effectiveType);
      }

      // Use unknown type as fallback
      const type = effectiveType || 'unknown';

      // Check if this column needs review - use cached result if available
      let needsReviewStatus: boolean;
      if (reviewStatusLookup.has(col.originalName)) {
        needsReviewStatus = reviewStatusLookup.get(col.originalName);
      } else {
        needsReviewStatus = needsReview(col);
        reviewStatusLookup.set(col.originalName, needsReviewStatus);
      }

      // Add column to the appropriate category
      if (needsReviewStatus) {
        if (!reviewByType[type]) reviewByType[type] = [];
        reviewByType[type].push(col);
      } else {
        if (!approvedByType[type]) approvedByType[type] = [];
        approvedByType[type].push(col);
      }
    });

    // Sort all groups by name (once per group)
    Object.keys(reviewByType).forEach(type => {
      reviewByType[type].sort((a, b) => a.originalName.localeCompare(b.originalName));
    });

    Object.keys(approvedByType).forEach(type => {
      approvedByType[type].sort((a, b) => a.originalName.localeCompare(b.originalName));
    });

    return {
      needsReviewGrouped: reviewByType,
      approvedGrouped: approvedByType,
    };
  }, [
    // Optimize dependencies with specific properties instead of whole objects
    selectedSheet?.id,
    // Use stringify to detect actual changes without causing unnecessary re-renders
    JSON.stringify(selectedSheet?.columns?.map(c => ({
      name: c.originalName,
      type: c.dataType,
      mappedName: c.mappedName,
      skip: c.skip,
      needsReview: c.needsReview,
      confidence: c.confidence
    }))),
    // Include schema dependency using only necessary data
    tableSchema?.name,
    JSON.stringify(tableSchema?.columns?.map((c: any) => ({ name: c.name, type: c.type }))),
    // Include needsReview function
    needsReview
  ]);

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

    // Special case for "Create new field" option
    if (mappedName === '_create_new_') {
      const suggestedName = normalizeForDb(columnName);
      updateSheetColumn(selectedSheet.id, columnName, {
        mappedName: '_create_new_',
        // @ts-ignore - Custom property for new name
        createNewValue: suggestedName,
        dataType: 'text', // Default for new
        needsReview: true,
        confidence: 0, // Reset confidence for "create new"
      });
      return;
    }

    const fieldUpdates: Partial<ColumnMapping> = {
      mappedName,
      // Default to true, will be set to false if a perfect schema match occurs
      needsReview: true,
    };

    if (tableSchema && tableSchema.columns) {
      const matchedField = tableSchema.columns.find((col: any) => col.name === mappedName);

      if (matchedField) {
        // If mapping to an existing field, synchronize the data type
        // IMPORTANT: Normalize the database type to handle PostgreSQL types
        fieldUpdates.dataType = normalizeDataType(matchedField.type) as SupabaseDataType;
        fieldUpdates.confidence = 100; // Manually selected existing field is always 100% confidence

        // When user selects a field manually with 100% confidence, it should never need review
        // unless there's a data type mismatch
        const originalColumnData = selectedSheet.columns.find(c => c.originalName === columnName);

        // Use normalized data types for comparison to fix "timestamp without time zone" vs "timestamp" issues
        if (originalColumnData &&
            originalColumnData.dataType &&
            originalColumnData.dataType !== 'unknown' &&
            normalizeDataType(originalColumnData.dataType) !== normalizeDataType(matchedField.type)) {
          fieldUpdates.needsReview = true; // Explicit mismatch, flag for review
        } else {
          fieldUpdates.needsReview = false; // Types match or original was default/unknown - perfect match, never needs review
        }
      } else if (mappedName && mappedName.trim() !== '') {
        fieldUpdates.confidence = 0;
        fieldUpdates.needsReview = true;
        // If field is not in schema but has a name, keep existing dataType to avoid reset
        // This prevents dataType showing incorrectly in the grouping
      } else {
        fieldUpdates.confidence = 0;
        const originalColumnData = selectedSheet.columns.find(c => c.originalName === columnName);
        // Use existing inferredDataType (if any) or fall back to text
        fieldUpdates.dataType = originalColumnData?.inferredDataType || 'text';
        fieldUpdates.needsReview = true;
      }
    } else if (mappedName && mappedName.trim() !== '') {
      fieldUpdates.confidence = 0;
      fieldUpdates.needsReview = true;
      // No tableSchema available, keep existing dataType
    }

    updateSheetColumn(selectedSheet.id, columnName, fieldUpdates);
  };
  
  // Handle skip toggle
  const handleSkipToggle = (columnName: string, skip: boolean) => {
    if (!selectedSheet) return;

    updateSheetColumn(selectedSheet.id, columnName, {
      skip,
      needsReview: true
    });
  };

  // When component mounts, validate field mappings
  useEffect(() => {
    if (selectedSheet && tableSchema && Array.isArray(tableSchema.columns)) {
      // Set existing columns globally to avoid prefixing numeric columns that already exist
      if (tableSchema.columns.length > 0) {
        const existingColumnNames = tableSchema.columns.map((col: any) => col.name);
        setExistingColumns(existingColumnNames);
      }

      // Validate field mappings to fix any out-of-range errors
      const updatedColumns = selectedSheet.columns.map(column => {
        if (!column.mappedName || column.skip) return column;

        // Check if this is a valid field in the schema
        const isValid = column.mappedName === '' ||
                        column.mappedName === '_create_new_' ||
                        tableSchema.columns.some((col: any) => col.name === column.mappedName);

        // If not valid, convert to 'create new field'
        if (!isValid) {
          return {
            ...column,
            mappedName: '_create_new_',
            needsReview: true
          };
        }

        return column;
      });

      // Only update if any columns were modified
      const hasChanges = updatedColumns.some((col, idx) =>
        col.mappedName !== selectedSheet.columns[idx].mappedName
      );

      if (hasChanges) {
        updateSheet(selectedSheet.id, {
          columns: updatedColumns
        });
      }
    }
  }, [selectedSheet?.id, tableSchema, updateSheet]);

  // Auto-column-mapping - only runs once per sheet+table combination
  useEffect(() => {
    if (!selectedSheet || !tableSchema || !tableSchema.columns || tableSchema.columns.length === 0) {
      return;
    }

    // Skip if sheet is already approved
    if (selectedSheet.approved) {
      return;
    }

    // Use a static processed flag to ensure this runs only once per sheet
    // This is crucial to avoid layout thrashing and multiple state updates
    const processingKey = `${selectedSheet.id}_${tableSchema.name}_processed`;
    if (window[processingKey]) {
      // Already processed this combination
      return;
    }

    // Set the processed flag
    window[processingKey] = true;

    // Use requestAnimationFrame to schedule the processing after rendering
    // This prevents layout thrashing and reduces forced reflow warnings
    requestAnimationFrame(() => {
      // Create a fast lookup map for database fields (for exact match check)
      const fieldMap = new Map();
      tableSchema.columns.forEach((col: any) => {
        const normalizedName = col.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        fieldMap.set(col.name, col);
        fieldMap.set(normalizedName, col);
      });

      // Batch all changes together
      const columnUpdates: Record<string, Partial<ColumnMapping>> = {};
      let changesMade = false;

      // Process each column
      selectedSheet.columns.forEach((col) => {
        // Skip if user has explicitly chosen to skip or if it's a high-confidence manual map (unless it's _create_new_)
        if (col.skip || (col.mappedName && col.mappedName !== '_create_new_' && col.confidence && col.confidence >= 0.99)) {
          return;
        }

        // First, check for exact matches by name - highest priority and most reliable
        const originalNameLower = col.originalName.toLowerCase();
        const normalizedName = originalNameLower.replace(/[^a-z0-9]/g, '');

        // Try exact matches first
        let exactMatch: any = null;

        // Direct field name match - highest priority
        if (fieldMap.has(col.originalName)) {
          exactMatch = fieldMap.get(col.originalName);
        }
        // Case-insensitive match - still reliable
        else if (fieldMap.has(originalNameLower)) {
          exactMatch = fieldMap.get(originalNameLower);
        }
        // Normalized match (no special chars) - still reliable
        else if (fieldMap.has(normalizedName)) {
          exactMatch = fieldMap.get(normalizedName);
        }

        // If we have an exact match, use it without further calculation
        if (exactMatch) {
          // For exact matches, always use the normalized database field type
          const normalizedDbType = normalizeDataType(exactMatch.type);
          if (col.mappedName !== exactMatch.name ||
              normalizeDataType(col.dataType) !== normalizedDbType ||
              col.confidence !== 100 ||
              col.needsReview !== false) {

            changesMade = true;
            columnUpdates[col.originalName] = {
              mappedName: exactMatch.name,
              dataType: normalizedDbType, // Always use normalized database type for exact matches
              confidence: 100, // Always 100% confidence for exact matches
              needsReview: false // Exact matches never need review
            };
          }
          return;
        }

        // No exact match, fall back to similarity check
        let bestMatch = '';
        let bestSimilarity = 0;

        // Find best match based on similarity
        tableSchema.columns.forEach((dbCol) => {
          const similarity = calculateSimilarity(col.originalName, dbCol.name);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = dbCol.name;
          }
        });

        if (bestSimilarity >= 0.7) {
          // Good match found, suggest it
          const matchedField = tableSchema.columns.find(dbCol => dbCol.name === bestMatch);
          const dataType = matchedField ? normalizeDataType(matchedField.type) : col.dataType;

          // Determine if this needs review based on confidence
          // 100% matches never need review, other high confidence matches (95-99.9%) don't need review either
          const needsReviewFlag = bestSimilarity === 100 ? false : bestSimilarity < 95;

          if (col.mappedName !== bestMatch ||
              normalizeDataType(col.dataType) !== dataType ||
              col.confidence !== bestSimilarity ||
              col.needsReview !== needsReviewFlag) {
            changesMade = true;
            columnUpdates[col.originalName] = {
              mappedName: bestMatch,
              dataType: dataType, // Set normalized data type from schema
              confidence: bestSimilarity,
              needsReview: needsReviewFlag,
            };
          }
        } else {
          // No good similarity match - create new field
          if (col.mappedName !== '_create_new_' || col.confidence !== 0 || col.needsReview !== true) {
            changesMade = true;
            columnUpdates[col.originalName] = {
              mappedName: '_create_new_',
              confidence: 0,
              needsReview: true,
            };
          }
        }
      });

      // Apply all changes in a single batch update
      if (changesMade && Object.keys(columnUpdates).length > 0) {
        batchUpdateSheetColumns(selectedSheet.id, columnUpdates);
      }
    });
  }, [selectedSheet?.id, tableSchema?.name, batchUpdateSheetColumns, calculateSimilarity, normalizeDataType]);

  // Handle approve all columns with optimized batch update
  const handleApproveAll = () => {
    if (!selectedSheet) return;

    // Performance measurement
    const startTime = performance.now();

    // Batch update all columns that need review
    const columnUpdates: Record<string, Partial<ColumnMapping>> = {};

    // Identify columns that need updating
    selectedSheet.columns.forEach(col => {
      if (needsReview(col)) {
        columnUpdates[col.originalName] = {
          needsReview: false
        };
      }
    });

    // Apply batch update in a single state change if we have columns to update
    if (Object.keys(columnUpdates).length > 0) {
      // First apply all column updates in a single operation
      batchUpdateSheetColumns(selectedSheet.id, columnUpdates);

      // Then update the sheet status
      updateSheet(selectedSheet.id, {
        needsReview: false,
        approved: true,
        status: 'approved'
      });
    } else {
      // No columns needed review, just update sheet status
      updateSheet(selectedSheet.id, {
        needsReview: false,
        approved: true,
        status: 'approved'
      });
    }

    // Performance measurement
    const endTime = performance.now();
    console.debug(`Approve all completed in ${endTime - startTime}ms for ${Object.keys(columnUpdates).length} columns`);
  };
  
  // Get status metrics for the current sheet
  const getStatusMetrics = () => {
    if (!selectedSheet) return { total: 0, approved: 0, needsReview: 0, skipped: 0 };

    const total = selectedSheet.columns.length;
    const skipped = selectedSheet.columns.filter(col => col.skip).length;
    const needsReviewCount = selectedSheet.columns.filter(col => needsReview(col)).length;
    const approved = total - skipped - needsReviewCount;

    return { total, approved, needsReview: needsReviewCount, skipped };
  };

  const metrics = getStatusMetrics();
  
  // Available data types for the dropdown - only use normalized types for UI
  const dataTypes: SupabaseDataType[] = [
    'text', 'numeric', 'integer', 'boolean', 'date', 'timestamp', 'uuid'
  ];
  
  // Show full-screen loading when analyzing columns, processing, or loading tables
  // This condition will trigger immediately when the Next button is clicked
  // IMPORTANT: Only check progress.percent < 100 when in analyzing stage to prevent infinite loops
  if (progress.stage === 'analyzing' || progress.stage === 'mapping' || tablesLoading) {
    // Full screen loading screen
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
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out',
          '@keyframes fadeIn': {
            '0%': { opacity: 0 },
            '100%': { opacity: 1 }
          }
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
          Processing Columns
        </Typography>

        <Typography variant="h6" gutterBottom sx={{ maxWidth: 600, mb: 4 }}>
          Please wait while we analyze and map your columns
        </Typography>

        <Typography variant="body1" gutterBottom sx={{ maxWidth: 500, mb: 4 }}>
          {tablesLoading
            ? `Loading database tables and metadata${ellipsis}`
            : progress.percent >= 95
              ? `Finalizing database connection and preparing interface${ellipsis}`
              : (progress.message || `Analyzing your columns and matching to database fields${ellipsis}`)}
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
          Columns with ≥95% confidence will be auto-approved
        </Typography>
      </Box>
    );
  }

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
      
      {/* Sample data preview has been removed */}
      
      {/* Column mapping tables */}
      {viewMode === 'grouped' ? (
        // Grouped by data type view - NOW TWO-TIERED
        <>
          {/* --- SECTION: NEEDS REVIEW --- */}
          {Object.keys(needsReviewGrouped).length > 0 && (
            <Box sx={{ mt: 3, borderTop: '2px solid', borderColor: 'warning.main', pt: 2 }}>
              <Typography variant="h5" gutterBottom sx={{ color: 'warning.dark', display: 'flex', alignItems: 'center', gap: 1}}>
                <WarningIcon /> Fields Needing Review
              </Typography>
              {Object.entries(needsReviewGrouped).map(([dataType, columnsInGroup]) => (
                <Box key={`review-${dataType}`} sx={{ mt: 2, mb: 3, pl: 2, borderLeft: '3px solid', borderColor: getDataTypeColor(dataType) }}>
                  <Typography
                    variant="subtitle1"
                    gutterBottom
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      color: getDataTypeColor(dataType),
                      fontWeight: 'medium',
                      mt: 1
                    }}
                  >
                    <Chip
                      label={dataType.toUpperCase()}
                      size="small"
                      sx={{ bgcolor: getDataTypeColor(dataType), color: 'white' }}
                    />
                    {getDataTypeLabel(dataType)}
                    <Typography variant="caption" color="text.secondary">
                      ({columnsInGroup.length} columns)
                    </Typography>
                  </Typography>
                  <ColumnMappingTable
                    columns={columnsInGroup} // Already sorted by name within the group by `groupByType`
                    onDataTypeChange={handleDataTypeChange}
                    onMappedNameChange={handleMappedNameChange}
                    onSkipToggle={handleSkipToggle}
                    dataTypes={dataTypes}
                    tableSchema={tableSchema}
                    handleMappedNameChange={handleMappedNameChange}
                    fieldSearchText={fieldSearchText}
                    setFieldSearchText={setFieldSearchText}
                    precomputedColumnMatches={precomputedColumnMatches}
                    needsReview={needsReview}
                    selectedSheet={selectedSheet}
                    updateSheet={updateSheet}
                    updateSheetColumn={updateSheetColumn} // Pass updateSheetColumn as a prop
                  />
                </Box>
              ))}
            </Box>
          )}

          {/* --- SECTION: APPROVED / AUTO-MAPPED --- */}
          {Object.keys(approvedGrouped).length > 0 && (
            <Box sx={{ mt: 4, borderTop: '2px solid', borderColor: 'success.main', pt: 2 }}>
              <Typography variant="h5" gutterBottom sx={{ color: 'success.dark', display: 'flex', alignItems: 'center', gap: 1}}>
                 <CheckCircleOutlineIcon /> Approved / Auto-Mapped Fields
              </Typography>
              {Object.entries(approvedGrouped).map(([dataType, columnsInGroup]) => (
                <Box key={`approved-${dataType}`} sx={{ mt: 2, mb: 3, pl: 2, borderLeft: '3px solid', borderColor: getDataTypeColor(dataType) }}>
                  <Typography
                    variant="subtitle1"
                    gutterBottom
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      color: getDataTypeColor(dataType),
                      fontWeight: 'medium',
                      mt: 1
                    }}
                  >
                    <Chip
                      label={dataType.toUpperCase()}
                      size="small"
                      sx={{ bgcolor: getDataTypeColor(dataType), color: 'white' }}
                    />
                    {getDataTypeLabel(dataType)}
                    <Typography variant="caption" color="text.secondary">
                      ({columnsInGroup.length} columns)
                    </Typography>
                  </Typography>
                  <ColumnMappingTable
                    columns={columnsInGroup} // Already sorted by name within the group by `groupByType`
                    onDataTypeChange={handleDataTypeChange}
                    onMappedNameChange={handleMappedNameChange}
                    onSkipToggle={handleSkipToggle}
                    dataTypes={dataTypes}
                    tableSchema={tableSchema}
                    handleMappedNameChange={handleMappedNameChange}
                    fieldSearchText={fieldSearchText}
                    setFieldSearchText={setFieldSearchText}
                    precomputedColumnMatches={precomputedColumnMatches}
                    needsReview={needsReview}
                    selectedSheet={selectedSheet}
                    updateSheet={updateSheet}
                    updateSheetColumn={updateSheetColumn} // Pass updateSheetColumn as a prop
                  />
                </Box>
              ))}
            </Box>
          )}
        </>
      ) : (
        // Split into "Needs Review" and "Approved" sections
        <Box sx={{ mt: 3 }}>
          {/* First section: Fields needing review (low confidence or unmapped) */}
          {selectedSheet.columns.some(col => needsReview(col)) && (
            <Box
              sx={{
                mb: 4,
                pb: 3,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'warning.light',
                bgcolor: 'warning.lightest',
                overflow: 'hidden'
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  px: 2,
                  py: 1,
                  mb: 1,
                  color: 'warning.dark',
                  gap: 1,
                  fontWeight: 'medium',
                  bgcolor: 'warning.lighter',
                  borderBottom: '1px solid',
                  borderColor: 'warning.light'
                }}
              >
                <WarningIcon fontSize="small" />
                Fields Needing Review
                <Chip
                  label={selectedSheet.columns.filter(col => needsReview(col)).length}
                  size="small"
                  color="warning"
                  sx={{ ml: 1 }}
                />
                <Box sx={{ ml: 'auto', fontSize: '0.8rem', color: 'warning.dark', fontWeight: 'normal' }}>
                  Fields with low confidence (&lt;85%) or missing mappings need review
                </Box>
              </Typography>

              <ColumnMappingTable
                columns={selectedSheet.columns.filter(col => needsReview(col))}
                onDataTypeChange={handleDataTypeChange}
                onMappedNameChange={handleMappedNameChange}
                onSkipToggle={handleSkipToggle}
                dataTypes={dataTypes}
                tableSchema={tableSchema}
                handleMappedNameChange={handleMappedNameChange}
                fieldSearchText={fieldSearchText}
                setFieldSearchText={setFieldSearchText}
                precomputedColumnMatches={precomputedColumnMatches}
                needsReview={needsReview}
                selectedSheet={selectedSheet}
                updateSheet={updateSheet}
                updateSheetColumn={updateSheetColumn} // Pass updateSheetColumn as a prop
              />
            </Box>
          )}

          {/* Second section: Auto-approved high confidence fields */}
          {selectedSheet.columns.some(col => !needsReview(col)) && (
            <Box
              sx={{
                mb: 2,
                pb: 3,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'success.light',
                bgcolor: 'rgba(0, 200, 83, 0.02)',
                overflow: 'hidden'
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  px: 2,
                  py: 1,
                  mb: 1,
                  color: 'success.dark',
                  gap: 1,
                  fontWeight: 'medium',
                  bgcolor: 'rgba(0, 200, 83, 0.08)',
                  borderBottom: '1px solid',
                  borderColor: 'success.light'
                }}
              >
                <CheckCircleIcon fontSize="small" />
                Approved Fields
                <Chip
                  label={selectedSheet.columns.filter(col => !needsReview(col)).length}
                  size="small"
                  color="success"
                  sx={{ ml: 1 }}
                />
                <Box sx={{ ml: 'auto', fontSize: '0.8rem', color: 'success.dark', fontWeight: 'normal' }}>
                  High confidence matches (≥85%) are auto-approved
                </Box>
              </Typography>

              <ColumnMappingTable
                columns={selectedSheet.columns.filter(col => !needsReview(col))}
                onDataTypeChange={handleDataTypeChange}
                onMappedNameChange={handleMappedNameChange}
                onSkipToggle={handleSkipToggle}
                dataTypes={dataTypes}
                tableSchema={tableSchema}
                handleMappedNameChange={handleMappedNameChange}
                fieldSearchText={fieldSearchText}
                setFieldSearchText={setFieldSearchText}
                precomputedColumnMatches={precomputedColumnMatches}
                needsReview={needsReview}
                selectedSheet={selectedSheet}
                updateSheet={updateSheet}
                updateSheetColumn={updateSheetColumn} // Pass updateSheetColumn as a prop
              />
            </Box>
          )}
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
  handleMappedNameChange: (columnName: string, mappedName: string) => void;
  fieldSearchText: string;
  setFieldSearchText: (text: string) => void;
  precomputedColumnMatches: Map<string, any[]>;
  needsReview: (column: ColumnMapping) => boolean;
  selectedSheet: SheetMapping | undefined;
  updateSheet: (sheetId: string, updatedSheetData: Partial<SheetMapping>) => void;
  updateSheetColumn: (sheetId: string, originalName: string, updates: Partial<ColumnMapping>) => void; // Add updateSheetColumn to props interface
}

const ColumnMappingTable: React.FC<ColumnMappingTableProps> = ({
  columns,
  onDataTypeChange,
  onMappedNameChange,
  onSkipToggle,
  dataTypes,
  tableSchema,
  handleMappedNameChange,
  fieldSearchText,
  setFieldSearchText,
  precomputedColumnMatches,
  needsReview,
  selectedSheet,
  updateSheet,
  updateSheetColumn, // Destructure prop
}) => {
  // No need for diagnostic logging - type mismatches are fixed automatically
  return (
    <TableContainer component={Paper} sx={{ mb: 2, boxShadow: 2 }}>
      <Table size="small" sx={{
        tableLayout: 'fixed',
        '& .MuiTableCell-root': {
          padding: '6px 12px',
          fontSize: '0.75rem'
        },
        '& .MuiTableCell-body': {
          borderRight: '1px solid rgba(224, 224, 224, 0.3)'
        },
        '& .MuiTableRow-root:hover': {
          '& .MuiTableCell-body': {
            backgroundColor: 'action.hover'
          }
        }
      }}>
        <TableHead>
          <TableRow sx={{ backgroundColor: 'primary.light' }}>
            <TableCell width="22%" sx={{
              color: 'white',
              fontWeight: 'bold',
              fontSize: '0.75rem',
              py: 1
            }}>Source Column</TableCell>
            <TableCell width="28%" sx={{
              color: 'white',
              fontWeight: 'bold',
              fontSize: '0.75rem',
              py: 1
            }}>Database Field</TableCell>
            <TableCell width="12%" sx={{
              color: 'white',
              fontWeight: 'bold',
              fontSize: '0.75rem',
              py: 1
            }}>Data Type</TableCell>
            <TableCell width="10%" sx={{
              color: 'white',
              fontWeight: 'bold',
              fontSize: '0.75rem',
              py: 1,
              textAlign: 'center',
              borderLeft: '2px solid rgba(255, 255, 255, 0.15)',
              borderRight: '2px solid rgba(255, 255, 255, 0.15)'
            }}>Skip</TableCell>
            <TableCell width="28%" sx={{
              color: 'white',
              fontWeight: 'bold',
              fontSize: '0.75rem',
              py: 1,
              pl: 2,
              borderLeft: '2px solid rgba(255, 255, 255, 0.15)',
            }}>Sample</TableCell>
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
                color: column.skip ? 'text.disabled' : 'text.primary',
                fontSize: '0.8rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 200, // Increased from 150 to 200
                borderLeft: '1px solid rgba(224, 224, 224, 0.4)',
                pl: 2
              }}>
                <Tooltip title={column.originalName} placement="top-start">
                  <Box component="span">{column.originalName}</Box>
                </Tooltip>
              </TableCell>
              
              {/* Mapped field name */}
              <TableCell sx={{ pl: 2, pr: 2 }}>
                {column.mappedName === '_create_new_' ? (
                  // Create new field mode - show text field for entering custom name
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
                    <TextField
                      size="small"
                      placeholder="Enter new field name"
                      autoFocus // Auto-focus for better UX
                      // Use the suggested name if available, or normalize from original
                      defaultValue={
                        // @ts-ignore - Custom property for new name
                        column.createNewValue ||
                        // If we have a table schema, use it to check for existing columns
                        (tableSchema?.columns?.length > 0
                          ? (() => {
                              // Use immediately invoked function to calculate normalized name
                              const existingNames = tableSchema.columns.map((col: any) => col.name);
                              // Import would cause circular dependency, so we'll set global state directly
                              // and then normalize with awareness of existing columns
                              return normalizeForDb(column.originalName);
                            })()
                          : normalizeForDb(column.originalName))
                      }
                      onChange={(e) => {
                        // Use requestAnimationFrame to make text input more responsive
                        requestAnimationFrame(() => {
                          // Store the custom name but keep in create new mode
                          updateSheetColumn(selectedSheet.id, column.originalName, {
                            mappedName: '_create_new_',
                            // @ts-ignore - Custom property for new name
                            createNewValue: e.target.value,
                            needsReview: true
                          });
                        });
                      }}
                      disabled={column.skip}
                      fullWidth
                      error={!column.mappedName && !column.skip}
                      helperText={!column.mappedName && !column.skip ? "Required" : ""}
                      // When field loses focus, convert from "create" mode to actual name
                      onBlur={(e) => {
                        if (e.target.value) {
                          if (selectedSheet) {
                            const tempColumnIndex = selectedSheet.columns.findIndex(c =>
                              c.originalName === column.originalName);
                            if (tempColumnIndex !== -1) {
                              const updatedColumns = [...selectedSheet.columns];
                              updatedColumns[tempColumnIndex] = {
                                ...column,
                                mappedName: e.target.value
                              };
                              updateSheet(selectedSheet.id, {
                                columns: updatedColumns
                              });
                            }
                            setTimeout(() => {
                              updateSheetColumn(selectedSheet.id, column.originalName, {
                                mappedName: e.target.value,
                                needsReview: true
                              });
                            }, 10);
                          }
                        }
                      }}
                      // Also handle pressing Enter
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value) {
                          if (selectedSheet) {
                            const tempColumnIndex = selectedSheet.columns.findIndex(c =>
                              c.originalName === column.originalName);
                            if (tempColumnIndex !== -1) {
                              const updatedColumns = [...selectedSheet.columns];
                              updatedColumns[tempColumnIndex] = {
                                ...column,
                                mappedName: e.currentTarget.value
                              };
                              updateSheet(selectedSheet.id, {
                                columns: updatedColumns
                              });
                            }
                            e.currentTarget.blur();
                            setTimeout(() => {
                              updateSheetColumn(selectedSheet.id, column.originalName, {
                                mappedName: e.currentTarget.value,
                                needsReview: true
                              });
                            }, 10);
                          }
                        }
                      }}
                      sx={{
                        '& .MuiInputBase-input': {
                          padding: '4px 8px',
                          height: '20px',
                          fontSize: '0.75rem'
                        },
                        '& .MuiInputBase-root': {
                          paddingRight: 0
                        },
                        '& .MuiFormHelperText-root': {
                          fontSize: '0.65rem',
                          marginTop: 0,
                          marginLeft: 0
                        }
                      }}
                    />
                  </Box>
                ) : tableSchema && tableSchema.columns ? (
                  // Normal dropdown for selecting existing fields
                  <FormControl size="small" fullWidth disabled={column.skip} sx={{ minWidth: 180 }}>
                    <Select
                      // Must use a string value matching one of the menu items
                      value={column.mappedName || ''}
                      onChange={(e: SelectChangeEvent<string>) => { // Type the event 'e'
                        const value = e.target.value as string; // value is string due to SelectChangeEvent<string>
                        if (selectedSheet) {
                          if (value === '_create_new_') {
                            const temporaryUpdate = {...column, mappedName: value};
                            const tempColumnIndex = selectedSheet.columns.findIndex(c =>
                              c.originalName === column.originalName);
                            if (tempColumnIndex !== -1) {
                              let suggestedName = '';
                              if (tableSchema?.columns?.length > 0) {
                                const existingNames = tableSchema.columns.map((col: any) => col.name);
                                import('../utils/stringUtils').then(utils => {
                                  utils.setExistingColumns(existingNames);
                                });
                              }
                              suggestedName = normalizeForDb(column.originalName);
                              const updatedColumns = [...selectedSheet.columns];
                              updatedColumns[tempColumnIndex] = {
                                ...temporaryUpdate,
                              };
                              updateSheet(selectedSheet.id, {
                                columns: updatedColumns
                              });
                            }
                            setTimeout(() => {
                              updateSheetColumn(selectedSheet.id, column.originalName, {
                                mappedName: value,
                                needsReview: true
                              });
                            }, 10);
                          } else {
                            handleMappedNameChange(column.originalName, value);
                          }
                        }
                      }}
                      renderValue={(selectedValue) => {
                        if (selectedValue === '_create_new_') {
                          return <Typography color="primary" sx={{ fontSize: '0.75rem' }}>+ Create New Field</Typography>;
                        }

                        // For existing values, show with confidence if available
                        const confidence = column.confidence || 0;

                        return (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%', overflow: 'hidden' }}>
                            {/* Show color-coded dot for high confidence matches */}
                            {confidence >= 70 && (
                              <Box
                                component="span"
                                sx={{
                                  display: 'inline-block',
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  mr: 0.5,
                                  flexShrink: 0, // Prevent dot from shrinking
                                  backgroundColor: confidence >= 90 ? '#4caf50' :
                                                confidence >= 80 ? '#8bc34a' : '#ffc107'
                                }}
                              />
                            )}

                            {/* Field name with needs-review indicator if applicable */}
                            <Box sx={{
                              display: 'flex',
                              alignItems: 'center',
                              minWidth: 0, // Allow proper text truncation
                              overflow: 'hidden',
                              width: '100%'
                            }}>
                              <Typography
                                sx={{
                                  fontSize: '0.75rem',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  flexGrow: 1 // Let text take available space
                                }}
                              >
                                {selectedValue}
                              </Typography>
                              {needsReview(column) && (
                                <Chip
                                  label="Review"
                                  size="small"
                                  color="warning"
                                  sx={{
                                    height: 16,
                                    ml: 1,
                                    flexShrink: 0, // Prevent chip from shrinking
                                    '& .MuiChip-label': {
                                      px: 0.5,
                                      py: 0,
                                      fontSize: '0.6rem'
                                    }
                                  }}
                                />
                              )}
                            </Box>

                            {/* Show confidence for good matches in selected value */}
                            {confidence > 0 && !isExistingField(column, tableSchema) && (
                              <Chip
                                label={`${getDisplayConfidence(confidence)}%`}
                                size="small"
                                color={getConfidenceColor(confidence)}
                                sx={{
                                  height: 16,
                                  minWidth: '40px',
                                  ml: 0.5,
                                  flexShrink: 0,
                                  '& .MuiChip-label': {
                                    px: 0.5,
                                    py: 0,
                                    fontSize: '0.6rem'
                                  }
                                }}
                              />
                            )}

                            {/* Show lock icon for existing fields */}
                            {isExistingField(column, tableSchema) && (
                              <Box
                                component="span"
                                sx={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  fontSize: '0.75rem',
                                  color: 'text.secondary',
                                  ml: 0.5
                                }}
                              >
                                🔒
                              </Box>
                            )}
                          </Box>
                        );
                      }}
                      MenuProps={{
                        // Performance optimizations for menu
                        anchorOrigin: {
                          vertical: 'bottom',
                          horizontal: 'left',
                        },
                        transformOrigin: {
                          vertical: 'top',
                          horizontal: 'left',
                        },
                        PaperProps: {
                          style: {
                            maxHeight: 300,
                          },
                        },
                        // Prevent full re-renders on menu open
                        TransitionProps: {
                          enter: false,
                          exit: false,
                        },
                        // Close the menu ASAP after click to prevent UI freeze
                        autoFocus: false,
                        disableAutoFocusItem: true,
                        disablePortal: true,
                      }}
                      sx={{
                        fontSize: '0.75rem',
                        '& .MuiSelect-select': {
                          padding: '4px 8px',
                          height: '20px',
                          minHeight: '20px'
                        }
                      }}
                    >
                      <MenuItem value="" sx={{ py: 0.5, minHeight: 'auto' }}>
                        <em style={{ fontSize: '0.75rem' }}>Select a field</em>
                      </MenuItem>

                      <MenuItem value="_create_new_" sx={{ py: 0.5, minHeight: 'auto' }}>
                        <Typography color="primary" sx={{ fontSize: '0.75rem' }}>+ Create New Field</Typography>
                      </MenuItem>

                      <Divider />

                      <MenuItem disabled sx={{
                        py: 0.5,
                        minHeight: 'auto',
                        position: 'sticky',
                        top: 0,
                        backgroundColor: 'background.paper',
                        zIndex: 1
                      }}>
                        <Box sx={{ width: '100%' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', mb: 0.5 }}>
                            {fieldSearchText ? `Search: "${fieldSearchText}"` : "Type to search fields..."}
                          </Typography>
                        </Box>
                      </MenuItem>

                      {/* Existing columns in the database table - using precomputed matches with search filter */}
                      {(() => {
                        // Guard clause - this prevents React hook errors
                        if (!precomputedColumnMatches.has(column.originalName)) return null;
                        const columns = precomputedColumnMatches.get(column.originalName);

                        // Create an object map to ensure uniqueness
                        const uniqueColumns: Record<string, any> = {};

                        // First add current mappedName if it exists, to ensure it's included
                        if (column.mappedName && column.mappedName !== '' && column.mappedName !== '_create_new_') {
                          uniqueColumns[column.mappedName] = {
                            name: column.mappedName,
                            type: tableSchema?.columns?.find((c: any) => c.name === column.mappedName)?.type || column.dataType || 'text',
                            similarity: 100 // High confidence to keep at top
                          };
                        }

                        // Always include empty string and _create_new_
                        uniqueColumns[''] = { name: '', type: 'text', isPlaceholder: true };
                        uniqueColumns['_create_new_'] = { name: '_create_new_', type: 'text', isPlaceholder: true };

                        // Add all existing columns from precomputedColumnMatches to uniqueColumns
                        // These already include name, type, and confidence/similarity scores
                        columns.forEach(col => {
                          if (col && col.name) {
                            // Ensure not to overwrite the explicitly added current mappedName if it's different
                            // or the placeholders
                            if (!uniqueColumns[col.name] || !uniqueColumns[col.name].isPlaceholder) {
                                uniqueColumns[col.name] = col;
                            }
                          }
                        });

                        // Convert back to array
                        const allValidOptions = Object.values(uniqueColumns);

                        // Precalculate similarities for all columns once to avoid recalculating
                        // This makes sorting much faster. Ensure 'similarity' exists or default it.
                        const columnsWithSimilarity = allValidOptions.map(dbColumn => ({
                          ...dbColumn,
                          similarity: dbColumn.name === '' || dbColumn.name === '_create_new_' ?
                            (dbColumn.name === column.mappedName ? 101 : -1) : // Prioritize current selection slightly, then placeholders
                            dbColumn.similarity || calculateSimilarity(column.originalName, dbColumn.name)
                        }));

                        // Sort all columns by similarity score descending
                        const sortedByMatch = [...columnsWithSimilarity].sort((a, b) => {
                          // Keep current selection and special placeholders at the top
                          if (a.name === column.mappedName && b.name !== column.mappedName) return -1;
                          if (b.name === column.mappedName && a.name !== column.mappedName) return 1;
                          if (a.name === '_create_new_' && b.name !== '_create_new_') return -1;
                          if (b.name === '_create_new_' && a.name !== '_create_new_') return 1;
                          if (a.name === '' && b.name !== '') return -1; // "Select a field" option
                          if (b.name === '' && a.name !== '') return 1;

                          // Then sort by similarity
                          const simA = typeof a.similarity === 'number' ? a.similarity : 0;
                          const simB = typeof b.similarity === 'number' ? b.similarity : 0;
                          if (simB !== simA) return simB - simA;
                          
                          // Fallback to alphabetical sort for same similarity score
                          return a.name.localeCompare(b.name);
                        });

                        // Filter based on search text, but always include the current selection and placeholders
                        const filteredColumns = sortedByMatch.filter(dbColumn => 
                          dbColumn.name === column.mappedName || // always include current selection
                          dbColumn.name === '_create_new_' || // always include create new
                          dbColumn.name === '' || // always include select a field
                          dbColumn.name.toLowerCase().includes(fieldSearchText.toLowerCase())
                        );

                        // Limit the number of items to render for performance, but ensure selected value is always visible
                        const itemsToRender = filteredColumns.slice(0, 50); // Show up to 50 items
                        // Ensure current mappedName is in itemsToRender if it was filtered out by slice
                        if (column.mappedName && !itemsToRender.find(item => item.name === column.mappedName)) {
                            const currentOption = sortedByMatch.find(item => item.name === column.mappedName);
                            if (currentOption) {
                                // Attempt to insert it near the top, displacing a lower-priority item if list is full
                                if (itemsToRender.length >= 50) itemsToRender.pop();
                                itemsToRender.unshift(currentOption);
                            }
                        }

                        return itemsToRender.map((dbColumn) => {
                          if (!dbColumn || typeof dbColumn.name === 'undefined') return null;

                          const displayConfidence = getDisplayConfidence(dbColumn.similarity || 0);
                          const isCurrentSelection = dbColumn.name === column.mappedName;
                          const isExistingInSchema = tableSchema?.columns?.some((c: any) => c.name === dbColumn.name);

                          return (
                            <MenuItem
                              key={dbColumn.name || `item-${Math.random()}`}
                              value={dbColumn.name}
                              disabled={dbColumn.name === ''} // Disable the placeholder "Select a field"
                              sx={{
                                py: 0.5, // Reduced padding
                                minHeight: 'auto',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                overflow: 'hidden',
                                width: '100%',
                                backgroundColor: isCurrentSelection ? 'action.selected' : 'transparent',
                                '&:hover': {
                                  backgroundColor: isCurrentSelection ? 'action.selected' : 'action.hover',
                                },
                                // Highlight if it's a strong suggestion and not yet selected
                                ...(getMatchIndicator(displayConfidence) === 'success' && !isCurrentSelection && {
                                  // borderLeft: `3px solid ${green[500]}`, // Example: green accent
                                  // pl: 1.5,
                                }),
                              }}
                            >
                              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flexGrow: 1, minWidth: 0, width: '100%', overflow: 'hidden', position: 'relative' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, width: '100%', flexWrap: 'nowrap' }}>
                                  {/* Visual indicator for match quality or if it's an existing field */}
                                  {isExistingInSchema && !isCurrentSelection && (
                                    <CheckCircleOutlineIcon sx={{ fontSize: 14, mr: 0.5, color: 'text.secondary', flexShrink: 0 }} />
                                  )}
                                  {isCurrentSelection && (
                                    <CheckCircleIcon sx={{ fontSize: 14, mr: 0.5, color: 'primary.main', flexShrink: 0 }} />
                                  )}
                                  {!isExistingInSchema && dbColumn.name && dbColumn.name !== '_create_new_' && dbColumn.name !== '' && (
                                    <WarningIcon sx={{ fontSize: 14, mr: 0.5, color: 'warning.light', flexShrink: 0 }} /> // Indicates new/non-schema field
                                  )}
                                  {/* Add green dot for high confidence matches */}
                                  {getMatchIndicator(displayConfidence) !== 'none' && !(isExistingInSchema || isCurrentSelection) && (
                                    <Box
                                      component="span"
                                      sx={{
                                        display: 'inline-block',
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        mr: 0.5,
                                        flexShrink: 0,
                                        backgroundColor: getMatchIndicator(displayConfidence) === 'success' ? '#4caf50' : '#ffc107'
                                      }}
                                    />
                                  )}
                                  <Typography
                                    sx={{
                                      fontSize: '0.75rem',
                                      fontWeight: isCurrentSelection ? 'bold' : 'normal',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      maxWidth: '100%'
                                    }}
                                  >
                                    {dbColumn.name}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.25, width: '100%', justifyContent: 'space-between' }}>
                                  {/* Show confidence for all but certain cases */}
                                  {(displayConfidence > 0) && (dbColumn.name !== '_create_new_' && dbColumn.name !== '') && (
                                    <Chip
                                      label={`${displayConfidence}%`}
                                      size="small"
                                      color={getConfidenceColor(displayConfidence)}
                                      sx={{
                                        height: 16,
                                        minWidth: '40px',
                                        mr: 1,
                                        flexShrink: 0, // Prevent chip from shrinking
                                        '& .MuiChip-label': {
                                          px: 0.5,
                                          py: 0,
                                          fontSize: '0.6rem'
                                        }
                                      }}
                                    />
                                  )}
                                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                    ({normalizeDataType(dbColumn.type) || 'unknown type'})
                                  </Typography>
                                </Box>
                              </Box>
                            </MenuItem>
                          );
                        });
                        // End of IIFE
                      })()}
                    </Select>
                    {!column.mappedName && !column.skip && (
                      <FormHelperText error>Required</FormHelperText>
                    )}
                  </FormControl>
                ) : (
                  // Fallback to text input when tableSchema is not available
                  <TextField
                    size="small"
                    value={column.mappedName || ''}
                    onChange={(e) => onMappedNameChange(column.originalName, e.target.value)}
                    disabled={column.skip}
                    fullWidth
                    error={!column.mappedName && !column.skip}
                    helperText={!column.mappedName && !column.skip ? "Required" : undefined}
                  />
                )}
              </TableCell>
              
              {/* Data type selector */}
              <TableCell sx={{ pl: 2, pr: 2 }}>
                {/* Add tooltip to explain why data type might be disabled */}
                <Tooltip
                  title={isExistingField(column, tableSchema)
                    ? "Data type cannot be changed for existing database fields"
                    : ""
                  }
                  placement="top"
                  disableHoverListener={!isExistingField(column, tableSchema)}
                >
                <FormControl
                  size="small"
                  fullWidth
                  // Disable data type editing when skipped or existing field
                  disabled={column.skip || isExistingField(column, tableSchema)}
                  sx={{ minWidth: 100 }}
                >
                  <Select
                    value={(() => {
                      // Show the correct data type from schema if this is an existing field
                      if (column.mappedName && column.mappedName !== '_create_new_' && tableSchema && tableSchema.columns) {
                        const schemaField = tableSchema.columns.find((schemaCol: any) => schemaCol.name === column.mappedName);
                        if (schemaField) {
                          // Always normalize the database field type for UI display
                          return normalizeDataType(schemaField.type);
                        }
                      }
                      // Normalize the column's data type as well
                      return normalizeDataType(column.dataType);
                    })()}
                    onChange={(e) => onDataTypeChange(column.originalName, e.target.value as SupabaseDataType)}
                    sx={{
                      fontSize: '0.75rem',
                      '& .MuiSelect-select': {
                        padding: '4px 8px',
                        height: '20px',
                        minHeight: '20px'
                      }
                    }}
                    renderValue={(value) => {
                      // Normalize value for display and color
                      const normalizedValue = normalizeDataType(value as string);
                      return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {isExistingField(column, tableSchema) && (
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-block',
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                backgroundColor: getDataTypeColor(normalizedValue),
                                mr: 0.5
                              }}
                            />
                          )}
                          <Typography
                            variant="inherit"
                            noWrap
                            sx={{
                              fontSize: '0.75rem',
                              ...(isExistingField(column, tableSchema) && {
                                fontWeight: 'medium',
                                color: getDataTypeColor(normalizedValue)
                              })
                            }}
                          >
                            {normalizedValue}
                            {isExistingField(column, tableSchema) && ' (locked)'}
                          </Typography>
                        </Box>
                      );
                    }}
                  >
                    {dataTypes.map((type) => {
                      // Only show normalized types in the menu
                      return (
                        <MenuItem key={type} value={type} sx={{ py: 0.5, minHeight: 'auto' }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip
                              label={type}
                              size="small"
                              sx={{
                                bgcolor: getDataTypeColor(type),
                                color: 'white',
                                width: 70,
                                fontSize: '0.65rem',
                                height: 18,
                                '& .MuiChip-label': {
                                  px: 1,
                                  py: 0
                                }
                              }}
                            />
                            <Typography variant="body2" sx={{ fontSize: '0.7rem' }}>
                              {getDataTypeLabel(type)}
                            </Typography>
                          </Stack>
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
                </Tooltip>
              </TableCell>
              
              {/* Skip toggle - with wider width and improved styling */}
              <TableCell sx={{
                pr: 2,
                pl: 2,
                textAlign: 'center',
                borderLeft: '1px dashed rgba(0, 0, 0, 0.12)',
                borderRight: '1px dashed rgba(0, 0, 0, 0.12)',
                backgroundColor: column.skip ? 'rgba(0, 0, 0, 0.04)' : 'transparent'
              }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={column.skip}
                      onChange={(e) => onSkipToggle(column.originalName, e.target.checked)}
                      size="small"
                      color={column.skip ? "default" : "success"}
                      sx={{
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
                          backgroundColor: column.skip ? '#bdbdbd' : '#c8e6c9'
                        },
                        mr: 0.5
                      }}
                    />
                  }
                  label={
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.7rem',
                        whiteSpace: 'nowrap',
                        fontWeight: 'medium',
                        color: column.skip ? 'text.secondary' : 'success.main'
                      }}
                    >
                      {column.skip ? "Skip" : "Import"}
                    </Typography>
                  }
                  sx={{ m: 0, alignItems: 'center', width: '100%', justifyContent: 'center' }}
                />
              </TableCell>
              
              {/* Sample values with tooltip */}
              <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', pl: 2 }}>
                <Tooltip
                  title={
                    column.sample && column.sample.length > 0
                      ? (
                        <Box sx={{ p: 1, maxWidth: 500 }}>
                          <Typography variant="subtitle2" sx={{ mb: 1, borderBottom: '1px solid rgba(255,255,255,0.2)', pb: 0.5 }}>
                            Sample Values ({column.sample.filter(val => val !== null && val !== undefined && val !== '').length} non-empty values)
                          </Typography>
                          {column.sample
                            .filter(val => val !== null && val !== undefined && val !== '')
                            .slice(0, 10)
                            .map((val, idx) => (
                              <Box
                                key={idx}
                                sx={{
                                  mb: 0.5,
                                  p: 0.5,
                                  borderRadius: 1,
                                  backgroundColor: 'rgba(255,255,255,0.1)',
                                  wordBreak: 'break-all'
                                }}
                              >
                                <Typography variant="body2" sx={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                  {String(val).substring(0, 150)}
                                  {String(val).length > 150 ? '...' : ''}
                                </Typography>
                              </Box>
                            ))
                          }
                          {column.sample.filter(val => val !== null && val !== undefined && val !== '').length > 10 && (
                            <Typography variant="caption" sx={{ mt: 1, display: 'block', fontStyle: 'italic' }}>
                              {column.sample.filter(val => val !== null && val !== undefined && val !== '').length - 10} more values not shown
                            </Typography>
                          )}
                        </Box>
                      )
                      : 'No sample data available'
                  }
                  arrow
                  placement="top-start"
                >
                  <Box>
                    {column.sample && column.sample.filter(val => val !== null && val !== undefined && val !== '').length > 0 ? (
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.75rem',
                            fontFamily: 'monospace',
                            maxWidth: '90%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {String(column.sample.find(val => val !== null && val !== undefined && val !== '') || '').substring(0, 80) +
                            (String(column.sample.find(val => val !== null && val !== undefined && val !== '') || '').length > 80 ? '...' : '')}
                        </Typography>
                        <Chip
                          label={`+${column.sample.filter(val => val !== null && val !== undefined && val !== '').length - 1}`}
                          size="small"
                          variant="outlined"
                          sx={{
                            height: 16,
                            fontSize: '0.6rem',
                            '& .MuiChip-label': { px: 0.5, py: 0 },
                            display: column.sample.filter(val => val !== null && val !== undefined && val !== '').length > 1 ? 'flex' : 'none'
                          }}
                        />
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.secondary">No data</Typography>
                    )}
                  </Box>
                </Tooltip>
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

// Helper function to normalize data types
const normalizeDataType = (dataType: string): string => {
  // Handle different timestamp formats
  if (dataType === 'timestamp without time zone' || dataType === 'timestamp with time zone') {
    return 'timestamp';
  }
  return dataType;
};

// Helper function to get data type color
const getDataTypeColor = (dataType: string): string => {
  // Normalize the data type first
  const normalizedType = normalizeDataType(dataType);

  switch (normalizedType) {
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
  // Cap confidence at 100% for display
  const cappedConfidence = Math.min(100, confidence);

  if (cappedConfidence >= 95) return 'success';
  if (cappedConfidence >= 80) return 'warning';
  if (cappedConfidence < 80) return 'error';
  return 'default';
};

// Helper function to get match indicator style based on confidence score
const getMatchIndicator = (confidence: number): 'success' | 'warning' | 'none' => {
  // Cap confidence at 100% for display
  const cappedConfidence = Math.min(100, confidence);

  if (cappedConfidence >= 95) return 'success';
  if (cappedConfidence >= 80) return 'warning';
  return 'none';
};

// Helper function to get capped confidence value for display
const getDisplayConfidence = (confidence: number): number => {
  // Always cap at 100% to avoid UI confusion
  return Math.min(100, Math.round(confidence));
};

// Helper function to get the appropriate color for a confidence chip
const getConfidenceChipColor = (confidence: number): string => {
  const cappedConfidence = Math.min(100, confidence);

  if (cappedConfidence >= 95) return '#4caf50'; // Success green
  if (cappedConfidence >= 80) return '#ff9800'; // Warning orange
  return '#f44336'; // Error red for low confidence
};

// Helper function to determine if a field is mapped to an existing database field
// (which means the data type cannot be changed)
const isExistingField = (column: ColumnMapping, tableSchema: any): boolean => {
  return !!(
    tableSchema &&
    tableSchema.columnIndex &&
    column.mappedName &&
    column.mappedName !== '_create_new_' &&
    tableSchema.columnIndex.has(column.mappedName)
  );
};

// Function to ensure current value is always included in dropdown options
const getExtraFieldOptions = (column: ColumnMapping, allColumnsList: any[]): any[] => {
  if (!column || !column.mappedName || column.mappedName === '' || column.mappedName === '_create_new_') {
    return [];
  }

  // Check if the current mapped name is already in the options list
  const hasCurrentValue = allColumnsList.some(col => col.name === column.mappedName);

  if (!hasCurrentValue) {
    // Add the current value to ensure it's always available in the dropdown
    return [{
      name: column.mappedName,
      type: 'text',
      similarity: 100 // High confidence to sort at top
    }];
  }

  return [];
};

// Helper function to get descriptive data type label
const getDataTypeLabel = (dataType: string): string => {
  // Normalize the data type first
  const normalizedType = normalizeDataType(dataType);

  switch (normalizedType) {
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