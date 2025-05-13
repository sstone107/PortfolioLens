/**
 * useAutoTableMatch.ts
 * Custom hook for auto-matching Excel sheets to database tables with confidence scoring
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBatchImportStore, SheetMapping, ColumnMapping } from '../../../store/batchImportStore';
import { normalizeTableName, calculateSimilarity, normalizeString } from '../utils/stringUtils';
import { applyTablePrefix, TableCategory, shouldPrefixTable, detectTableCategory } from '../utils/tableNameUtils';

// Constants for matching thresholds - define these at the top level
export const COLUMN_MATCH_THRESHOLD = 0.6; // Threshold for considering a column match good enough 
export const TABLE_AUTO_APPROVE_THRESHOLD = 95; // 95% threshold for auto-approving table matches

// Result type for auto table match
export interface TableMatchResult {
  sheetId: string;
  sheetName: string;
  matchedTable: string | null;
  confidence: number;
  needsReview: boolean;
}

// Table suggestion interface for dropdown and auto-matching
export interface TableSuggestion {
  name: string;
  originalName: string;
  confidence: number;
  category?: TableCategory;
}

interface UseAutoTableMatchProps {
  sheets: SheetMapping[];
  tables: any[];
  updateSheet: (sheetId: string, updates: Partial<SheetMapping>) => void;
  tablePrefix: string;
}

/**
 * Hook for auto-matching sheet names to database tables with confidence scoring
 */
export const useAutoTableMatch = ({
  sheets,
  tables,
  updateSheet,
  tablePrefix = '',
}: UseAutoTableMatchProps) => {
  // Cache of match results to avoid recalculation
  const [matchCache, setMatchCache] = useState<Record<string, TableMatchResult>>({});

  /**
   * Get a normalized SQL-friendly name from a sheet name
   * Using the more robust normalizeTableName function from stringUtils
   * Also applies table prefixes where appropriate
   */
  const toSqlFriendlyName = useCallback((sheetName: string): string => {
    // First get the normalized name
    const normalized = normalizeTableName(sheetName);
    
    // Check if this should be prefixed (system table, reserved word, etc)
    if (shouldPrefixTable(normalized)) {
      return applyTablePrefix(normalized, TableCategory.LOAN);
    }
    
    return normalized;
  }, []);

  /**
   * Get sorted table suggestions for a sheet name
   * Filters tables by category and sorts by confidence
   */
  const getSortedTableSuggestions = useCallback(
    (sheetName: string, showOnlyLoanTables = true): TableSuggestion[] => {
      if (!tables || tables.length === 0) {
        return [];
      }

      // Calculate confidence for all tables
      const suggestions = tables
        .filter(table => {
          // First, validate that table exists and has a name
          if (!table || !table.name) return false;
          
          // Filter out non-loan tables if requested
          if (showOnlyLoanTables) {
            // Only show tables with ln_ prefix OR
            // tables that are categorized as loan tables
            const normalizedName = table.name.toLowerCase();
            const hasLnPrefix = normalizedName.startsWith('ln_');
            
            // For backward compatibility during transition period
            // also detect loan tables without prefix
            const category = detectTableCategory(table.name);
            const isLoanTable = category === TableCategory.LOAN;
            
            // Allow only loan tables or tables with ln_ prefix
            return hasLnPrefix || isLoanTable;
          }
          return true;
        })
        .map(table => {
          try {
            // Calculate similarity between sheet name and table name
            // For ln_ prefixed tables, remove prefix before comparison
            // to improve matching accuracy
            const tableName = table.name;
            const nameForComparison = tableName.startsWith('ln_') 
              ? tableName.substring(3) // Remove prefix for comparison
              : tableName;
            
            const similarity = calculateSimilarity(sheetName, nameForComparison);
            
            // Make sure we're using a normalized table name
            const safeTableName = normalizeTableName(table.name);

            return {
              name: safeTableName,
              originalName: table.name,
              confidence: similarity,
              category: detectTableCategory(table.name)
            };
          } catch (err) {
            console.error('Error processing table suggestion:', err, table);
            // Return a default entry with minimal information
            return {
              name: 'invalid_table',
              originalName: 'Invalid Table Entry',
              confidence: 0,
              category: TableCategory.SYSTEM
            };
          }
        });

      // Sort by confidence descending
      return suggestions.sort((a, b) => b.confidence - a.confidence);
    },
    [tables]
  );

  /**
   * Find the best matching table for a sheet name
   * Only returns a match if confidence is >= 95%
   * Prioritizes ln_ prefixed tables
   */
  const findBestMatchingTable = useCallback(
    (sheetName: string): { tableName: string; confidence: number } | null => {
      const normalizedSheetName = normalizeString(sheetName);

      // Special case handling for known tables that should map to ln_expenses
      if (sheetName === "Servicing Expenses" || sheetName === "Passthrough Expenses") {
        // First try to find ln_expenses
        const lnExpensesTable = tables.find(
          table => normalizeString(table.name) === 'ln_expenses'
        );
        
        if (lnExpensesTable) {
          return {
            tableName: lnExpensesTable.name,
            confidence: 100 // Perfect match for these special cases
          };
        }
        
        // Fallback to regular expenses if ln_expenses doesn't exist yet
        const expensesTable = tables.find(
          table => normalizeString(table.name) === 'expenses'
        );
        
        if (expensesTable) {
          return {
            tableName: expensesTable.name,
            confidence: 97 // High confidence for backward compatibility
          };
        }
      }

      // Check for exact matches with ln_ prefix first
      const exactLnMatch = tables.find(
        table => table.name && 
                table.name.startsWith('ln_') &&
                normalizeString(table.name.substring(3)) === normalizedSheetName
      );

      if (exactLnMatch) {
        return {
          tableName: exactLnMatch.name,
          confidence: 100
        };
      }

      // Check for exact matches without prefix (for backward compatibility)
      const exactMatch = tables.find(
        table => normalizeString(table.name) === normalizedSheetName
      );

      if (exactMatch) {
        // If the exact match doesn't have ln_ prefix, but an ln_ version exists,
        // prefer the ln_ version
        const lnVersionExists = tables.some(
          table => table.name && 
                  table.name.startsWith('ln_') &&
                  normalizeString(table.name.substring(3)) === normalizedSheetName
        );

        if (!lnVersionExists) {
          return {
            tableName: exactMatch.name,
            confidence: 98 // Still very high but not 100% since it doesn't have ln_ prefix
          };
        }
      }

      // Get sorted suggestions, using our enhanced filtering logic
      const matches = getSortedTableSuggestions(sheetName, true);

      // Only return the best match if it meets our threshold
      // Otherwise return null to trigger "new table" creation
      if (matches.length > 0 && matches[0].confidence >= TABLE_AUTO_APPROVE_THRESHOLD) {
        // If the best match doesn't have ln_ prefix but there's a good ln_ match,
        // prefer the ln_ match even if confidence is slightly lower
        if (!matches[0].name.startsWith('ln_')) {
          const bestLnMatch = matches.find(m => m.name.startsWith('ln_'));
          if (bestLnMatch && bestLnMatch.confidence >= TABLE_AUTO_APPROVE_THRESHOLD - 5) {
            return { tableName: bestLnMatch.name, confidence: bestLnMatch.confidence };
          }
        }
        
        return { tableName: matches[0].name, confidence: matches[0].confidence };
      }

      // No match with sufficient confidence
      return null;
    },
    [tables, getSortedTableSuggestions, TABLE_AUTO_APPROVE_THRESHOLD]
  );

  // Counter to limit logging frequency
  const [logCounter, setLogCounter] = useState(0);
  
  /**
   * Determine if a table name exists in the database
   * Throttled logging to reduce console noise
   */
  const tableExists = useCallback(
    (tableName: string): boolean => {
      // Special cases are always valid
      if (!tableName || tableName === '' || tableName === '_create_new_') {
        return true;
      }
      
      // Safety check for tables
      if (!tables || !Array.isArray(tables)) {
        // Limiting log messages to just a few to avoid flooding console
        if (logCounter < 3) {
          console.warn('Tables not loaded yet, deferring validation');
          setLogCounter(prev => prev + 1);
        }
        // Return true during loading to avoid validation errors
        // This prevents flickering in the UI and false negatives during load
        return true;
      }
      
      return tables.some(table => normalizeString(table.name) === normalizeString(tableName));
    },
    [tables, logCounter]
  );

  /**
   * Evaluate all sheets and determine best matches
   */
  const evaluateSheets = useCallback(() => {
    const results: Record<string, TableMatchResult> = {};

    sheets.forEach(sheet => {
      // Skip already cached evaluations if they exist
      if (matchCache[sheet.id] && !sheet.skip) {
        results[sheet.id] = matchCache[sheet.id];
        return;
      }

      // Evaluate based on current state
      const bestMatch = findBestMatchingTable(sheet.originalName);
      const hasHighConfidenceMatch = bestMatch && bestMatch.confidence >= 95;
      const suggestedName = toSqlFriendlyName(sheet.originalName);
      const prefixedSuggestion = tablePrefix ? `${tablePrefix}${suggestedName}` : suggestedName;

      // Generate the match result
      results[sheet.id] = {
        sheetId: sheet.id,
        sheetName: sheet.originalName,
        matchedTable: hasHighConfidenceMatch ? bestMatch.tableName : null,
        confidence: bestMatch?.confidence || 0,
        needsReview: !hasHighConfidenceMatch && !sheet.skip
      };

    });

    // Update the cache
    setMatchCache(results);
    return results;
  }, [sheets, findBestMatchingTable, toSqlFriendlyName, tablePrefix, matchCache]);

  // Run evaluation on table and sheet changes
  useEffect(() => {
    // Use optional chaining to safely access length property
    if (tables?.length > 0 && sheets?.length > 0) {
      evaluateSheets();
    }
  }, [tables, sheets, evaluateSheets]);

  /**
   * Auto-map sheets to tables with confidence-based decisions:
   * - If confidence ≥ 95% -> auto-approve and use matched table
   * - If confidence < 95% -> suggest new table with prefixed name (with _create_new_ value)
   */
  const autoMapSheets = useCallback(() => {
    if (!tables || !Array.isArray(tables) || tables.length === 0) {
      console.log("Auto-mapping sheets skipped: tables not loaded or invalid.");
      return []; 
    }
    
    if (!sheets || !Array.isArray(sheets) || sheets.length === 0) {
      console.log("Auto-mapping sheets skipped: sheets not loaded or invalid.");
      return [];
    }
    
    const evaluationResults = evaluateSheets();
    
    if (!evaluationResults || typeof evaluationResults !== 'object') {
      console.log("Auto-mapping sheets skipped: evaluation results invalid.");
      return [];
    }
    
    // Return a processed mapping result for client to apply
    return Object.values(evaluationResults).map(result => {
      const { sheetId, sheetName, matchedTable, confidence, needsReview } = result;
      
      if (matchedTable && confidence >= TABLE_AUTO_APPROVE_THRESHOLD) {
        // High confidence match - use and auto-approve
        return {
          sheetId,
          mappedName: matchedTable,
          approved: true,
          needsReview: false,
          status: 'approved'
        };
      } else {
        // No good match - create new table
        const suggestedName = toSqlFriendlyName(sheetName);
        const prefixedSuggestion = tablePrefix ? `${tablePrefix}${suggestedName}` : suggestedName;
        
        // Default to create new mode with suggested name
        // Set approved to true so it doesn't show as "Needs Review" when user already has a valid name
        return {
          sheetId,
          mappedName: '_create_new_',
          approved: true, // Automatically approve when we have a valid suggested name
          needsReview: false,
          status: 'approved', // Mark as approved since we're setting a valid name
          isNewTable: true, // Flag this as a new table explicitly
          suggestedName: prefixedSuggestion,
          createNewValue: prefixedSuggestion
        };
      }
    });
  }, [evaluateSheets, toSqlFriendlyName, tablePrefix]);

  /**
   * Get the effective approval status of a sheet based on confidence
   * and user interaction state
   */
  /**
   * Format a confidence score for consistent display
   * Ensures values are clamped to 0-100 range and rounded to 1 decimal place
   */
  const formatConfidence = useCallback((confidenceValue: number): number => {
    // Ensure value is in 0-100 range
    const clampedValue = Math.max(0, Math.min(100, confidenceValue));
    // Round to 1 decimal place
    return Math.round(clampedValue * 10) / 10;
  }, []);
  
  const getEffectiveStatus = useCallback(
    (sheet: SheetMapping): {
      isApproved: boolean;
      needsReview: boolean;
      confidence: number;
      isNewTable: boolean;
    } => {
      // Handle skipped sheets
      if (sheet.skip) {
        return {
          isApproved: false,
          needsReview: false,
          confidence: 0,
          isNewTable: false
        };
      }

      // Assert potential types coming from store and then safely check
      const rawIsNewTableValue = sheet.isNewTable as boolean | undefined | string;
      const isMarkedAsNewTable = typeof rawIsNewTableValue === 'string'
        ? rawIsNewTableValue.toLowerCase() === 'true'
        : !!rawIsNewTableValue;

      if (sheet.mappedName === '_create_new_' || isMarkedAsNewTable) {
        // If we have a valid new table name suggestion, consider it approved even without explicit flag
        const hasValidNewName = sheet.createNewValue && sheet.createNewValue.trim().length > 0;
        
        return {
          // Approved if:
          // 1. Explicitly approved OR
          // 2. Has a valid new table name
          isApproved: sheet.approved || hasValidNewName,
          // Only needs review if not approved AND not skipped AND doesn't have valid name
          needsReview: !sheet.approved && !sheet.skip && !hasValidNewName, 
          confidence: 0,
          isNewTable: true
        };
      }
      
      // Calculate average confidence from columns and ensure it's properly formatted
      const rawMatchConfidence = sheet.columns.reduce((acc, col) => acc + col.confidence, 0) / sheet.columns.length || 0;
      const matchConfidence = formatConfidence(rawMatchConfidence);
      const isNewTableSuggestionResult = sheet.mappedName === '_create_new_'; // This itself suggests a new table

      const effectivelyApproved = sheet.approved || (matchConfidence >= TABLE_AUTO_APPROVE_THRESHOLD && !sheet.skip && !isNewTableSuggestionResult);
      const finalNeedsReview = sheet.needsReview || (!effectivelyApproved && !sheet.skip && !isNewTableSuggestionResult);

      // This is the default status calculation
      return {
        isApproved: effectivelyApproved,
        isNewTable: false, 
        needsReview: finalNeedsReview,
        confidence: matchConfidence
      };
    },
    [matchCache] 
  );

  // Using constants that are defined at the top level of the file

  const autoMapColumns = useCallback((sheetId: string, sheetColumns: ColumnMapping[], tableSchema: any) => {
    if (!tableSchema || !tableSchema.columns || tableSchema.columns.length === 0) {
      console.warn(`Auto-mapping columns for sheet ${sheetId} skipped: table schema or columns missing.`);
      return;
    }
    console.log(`Auto-mapping columns for sheet ${sheetId} against table ${tableSchema.table_name}`);

    const updatedSheetColumns = sheetColumns.map((sheetCol): ColumnMapping => {
      if (sheetCol.skip || sheetCol.mappedName) { 
        return {
          ...sheetCol,
          mappedName: sheetCol.mappedName,
          confidence: sheetCol.confidence,
        } as ColumnMapping;
      }

      let bestMatch: { mappedName: string; score: number } = { mappedName: '', score: -1 };
      
      tableSchema.columns.forEach((dbCol: { name: string; [key: string]: any }) => { 
        const score = calculateSimilarity(sheetCol.originalName, dbCol.name);
        if (score >= COLUMN_MATCH_THRESHOLD && score > bestMatch.score) { 
          bestMatch = { mappedName: dbCol.name, score };
        }
      });

      if (bestMatch.score >= COLUMN_MATCH_THRESHOLD) { 
        console.log(`Column ${sheetCol.originalName} -> ${bestMatch.mappedName} (Score: ${bestMatch.score})`);
        return {
          ...sheetCol,
          mappedName: bestMatch.mappedName,
          confidence: bestMatch.score,
        } as ColumnMapping;
      }
      return {
        ...sheetCol,
        mappedName: '', 
        confidence: 0,
      } as ColumnMapping;
    });

    const currentSheet = sheets.find(s => s.id === sheetId);
    if (currentSheet) {
      updateSheet(sheetId, { columns: updatedSheetColumns });
    } else {
      console.error(`Sheet ${sheetId} not found when trying to update column mappings.`);
    }
  }, [sheets, updateSheet, calculateSimilarity]); 

  const autoMapSheetsAndColumns = useCallback(() => {
    if (!tables || !Array.isArray(tables) || tables.length === 0) {
      console.log("Auto-mapping skipped: tables not loaded or invalid.");
      return; 
    }
    
    if (!sheets || !Array.isArray(sheets) || sheets.length === 0) {
      console.log("Auto-mapping skipped: sheets not loaded or invalid.");
      return;
    }
    
    console.log('Auto-mapping table mapping...');
    const evaluationResults: Record<string, TableMatchResult> = evaluateSheets(); 

    Object.values(evaluationResults).forEach((result: TableMatchResult) => { 
      const { sheetId, sheetName, matchedTable, confidence, needsReview } = result; 
      let mappedName: string = '';
      let status: SheetMapping['status'] = 'pending';
      let approved = false;
      let needsReviewFlag = true;
      let isNewTableFlag = false; 
      let suggestedNameVal: string | undefined = undefined;

      const sheet = sheets.find(s => s.id === sheetId);
      if (sheet?.skip) {
        console.log(`Skipping automap for sheet ${sheetId} as it's marked to skip.`);
        return; 
      }
      
      if (matchedTable) { 
        if (confidence >= TABLE_AUTO_APPROVE_THRESHOLD) {
          mappedName = matchedTable; 
          status = 'approved';
          approved = true;
          needsReviewFlag = false;
          isNewTableFlag = false;
          suggestedNameVal = undefined; 
          console.log(`Auto-mapping sheet ${sheetId} to ${mappedName} (Confidence: ${confidence}%) - Approved`);
        } else {
          mappedName = '_create_new_';
          status = 'ready'; 
          approved = false;
          needsReviewFlag = false; 
          isNewTableFlag = true;
          suggestedNameVal = matchedTable; 
          console.log(`Auto-mapping sheet ${sheetId} to '_create_new_' (Confidence: ${confidence}%) - Suggested: ${suggestedNameVal}`);
        }
      } else {
          mappedName = '_create_new_';
          status = 'ready';
          approved = false;
          needsReviewFlag = false; 
          isNewTableFlag = true; 
          suggestedNameVal = undefined; 
          console.log(`Auto-mapping sheet ${sheetId} to '_create_new_' based on new table suggestion`);
      }

      const existingSheet = sheets.find(s => s.id === sheetId);
      const existingColumns = existingSheet?.columns || []; 

      // Determine the final boolean value for isNewTable here
      // isNewTableFlag is determined earlier in the loop based on logic
      const finalIsNewTableValue: boolean = !!isNewTableFlag; // Ensure it's a boolean

      updateSheet(sheetId, {
        mappedName,
        approved,
        needsReview: needsReviewFlag,
        // Pass the sanitized boolean value
        isNewTable: finalIsNewTableValue, 
        suggestedName: suggestedNameVal,
        status: status as SheetMapping['status'], 
        columns: existingColumns 
      });

      if (mappedName && mappedName !== '_create_new_' && mappedName !== '' && tables) {
        const targetTableSchema = tables.find(t => t.table_name === mappedName);
        if (targetTableSchema && existingColumns.length > 0) { 
          autoMapColumns(sheetId, existingColumns, targetTableSchema);
        }
      }
    });
  }, [evaluateSheets, sheets, tables, updateSheet, autoMapColumns]); 

  /**
   * Generate a SQL-safe name based on a friendly name
   * This is used for auto-suggesting table names during creation
   * Always applies ln_ prefix for loan tables if not already present
   */
  const generateSqlSafeName = useCallback((friendlyName: string): string => {
    if (!friendlyName || friendlyName.trim() === '') {
      return ''; // Handle empty input
    }
    
    // Use the normalizeTableName utility function which handles edge cases
    // like PostgreSQL reserved words, special characters, etc.
    let safeName = normalizeTableName(friendlyName);
    
    // First, apply any specified tablePrefix if it doesn't already have it
    // This is typically a client or project-specific prefix
    if (tablePrefix && !safeName.startsWith(tablePrefix)) {
      safeName = `${tablePrefix}${safeName}`;
    }
    
    // Then ensure the loan table prefix (ln_) is added if needed
    // Check if it already has the ln_ prefix either directly or after the tablePrefix
    const hasLnPrefix = 
      safeName.startsWith('ln_') || 
      (tablePrefix && safeName.startsWith(tablePrefix) && 
       safeName.substring(tablePrefix.length).startsWith('ln_'));
    
    if (!hasLnPrefix) {
      // If there's a tablePrefix, insert ln_ after it
      if (tablePrefix && safeName.startsWith(tablePrefix)) {
        safeName = tablePrefix + 'ln_' + safeName.substring(tablePrefix.length);
      } else {
        // Otherwise just add ln_ at the beginning
        safeName = 'ln_' + safeName;
      }
    }
    
    return safeName;
  }, [tablePrefix]);
  
  return {
    matchCache,
    findBestMatchingTable,
    tableExists,
    getSortedTableSuggestions,
    autoMapSheets,
    getEffectiveStatus,
    toSqlFriendlyName,
    autoMapSheetsAndColumns,
    generateSqlSafeName,
    formatConfidence
  };
};

export default useAutoTableMatch;