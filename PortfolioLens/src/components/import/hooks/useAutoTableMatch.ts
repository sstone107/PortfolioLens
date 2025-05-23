/**
 * useAutoTableMatch.ts
 * Custom hook for auto-matching Excel sheets to database tables with confidence scoring
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

  // Track if we've already evaluated for current state to prevent infinite updates
  const hasEvaluatedRef = useRef(false);
  const previousTablesLengthRef = useRef<number | null>(null);
  const previousSheetsLengthRef = useRef<number | null>(null);
  
  // Run evaluation on table and sheet changes
  useEffect(() => {
    // Skip evaluation if tables or sheets aren't loaded yet
    if (!tables?.length || !sheets?.length) {
      return;
    }
    
    // Check if data has changed significantly to warrant re-evaluation
    const tablesChanged = previousTablesLengthRef.current !== tables.length;
    const sheetsChanged = previousSheetsLengthRef.current !== sheets.length;
    
    // Only evaluate if data has changed or we haven't evaluated yet
    if (tablesChanged || sheetsChanged || !hasEvaluatedRef.current) {
      console.log('Auto-mapping: Evaluating sheets due to tables/sheets changes', {
        tablesLength: tables.length, 
        sheetsLength: sheets.length,
        tablesChanged,
        sheetsChanged,
        firstEvaluation: !hasEvaluatedRef.current
      });
      
      // Update refs to track current state
      previousTablesLengthRef.current = tables.length;
      previousSheetsLengthRef.current = sheets.length;
      hasEvaluatedRef.current = true;
      
      // Run the evaluation
      evaluateSheets();
    }
  }, [tables, sheets]); // Removed evaluateSheets to break circular dependency

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
      const { sheetId, sheetName, matchedTable, confidence } = result; // Removed needsReview as it's re-evaluated
      
      if (matchedTable && confidence >= TABLE_AUTO_APPROVE_THRESHOLD) {
        // High confidence match - use and auto-approve
        const normalizedMappedName = normalizeTableName(matchedTable);
        return {
          sheetId,
          mappedName: normalizedMappedName, 
          approved: true,
          needsReview: false,
          status: 'approved',
          isNewTable: false // Explicitly not a new table
        };
      } else {
        // No good match or low confidence - suggest creating a new table
        const baseSuggestedName = toSqlFriendlyName(sheetName); // Already applies ln_ and normalizes
        const prefixedNewName = tablePrefix ? `${tablePrefix}${baseSuggestedName}` : baseSuggestedName;
        
        return {
          sheetId,
          mappedName: '_create_new_',
          approved: true, // Consider it approved for UI purposes when suggesting a new name
          needsReview: false, // Avoids immediate 'needs review' flag
          status: 'approved', 
          isNewTable: true, 
          suggestedName: prefixedNewName, 
          createNewValue: prefixedNewName  
        };
      }
    });
  }, [evaluateSheets, toSqlFriendlyName, tablePrefix, tables, sheets, normalizeTableName, TABLE_AUTO_APPROVE_THRESHOLD]);

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
  
  // Memoize the effective status to reduce unnecessary recalculations
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
    [] // Removed matchCache dependency to prevent infinite updates
  );

  // Using constants that are defined at the top level of the file

  const autoMapColumns = useCallback((sheetId: string, sheetColumns: ColumnMapping[], tableSchema: any) => {
    // Get the sheet we're working with
    const sheet = sheets.find(s => s.id === sheetId);
    if (!sheet) {
      console.error(`Sheet ${sheetId} not found when trying to auto-map columns.`);
      return;
    }
    
    // Check if this is a new table
    const isNewTable = sheet.isNewTable || sheet.wasCreatedNew || sheet.createNewValue === sheet.mappedName;
    
    // If table schema is missing but this is a new table, we should still process it
    if (!tableSchema || !tableSchema.columns || tableSchema.columns.length === 0) {
      if (isNewTable) {
        console.log(`Auto-mapping columns for new table sheet ${sheetId} (${sheet.mappedName})`);
      } else {
        console.warn(`Auto-mapping columns for sheet ${sheetId} skipped: table schema or columns missing.`);
        return;
      }
    } else {
      console.log(`Auto-mapping columns for sheet ${sheetId} against table ${tableSchema?.table_name || tableSchema?.name}`);
    }

    // Normalize column header names function (moved inside to prevent circular dependency)
    const normalizeFieldName = (originalName: string): string => {
      // Convert to lowercase, replace spaces and special chars with underscores
      return originalName
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '_')    // Replace special chars with underscore
        .replace(/\s+/g, '_')        // Replace spaces with underscore
        .replace(/_+/g, '_')         // Replace multiple underscores with single
        .replace(/^_+|_+$/g, '');    // Remove leading/trailing underscores
    };

    const updatedSheetColumns = sheetColumns.map((sheetCol): ColumnMapping => {
      // Skip already mapped columns
      if (sheetCol.skip || (sheetCol.mappedName && sheetCol.mappedName !== '_create_new_')) { 
        return {
          ...sheetCol,
          mappedName: sheetCol.mappedName,
          confidence: sheetCol.confidence,
        } as ColumnMapping;
      }

      // For new tables, auto-create all unmapped columns
      if (isNewTable) {
        // Generate inferred field name
        const inferredName = normalizeFieldName(sheetCol.originalName);
        
        // For new tables, set unmapped columns to _create_new_ 
        console.log(`Auto-creating column ${sheetCol.originalName} -> ${inferredName} in new table`);
        return {
          ...sheetCol,
          mappedName: '_create_new_',
          createNewValue: inferredName,
          dataType: sheetCol.inferredDataType || sheetCol.dataType || 'text',
          confidence: 100, // High confidence for auto-created fields
          _isNewlyCreated: true,
          needsReview: false // Auto-approve new fields in new tables
        } as ColumnMapping;
      }

      // For existing tables, try to find best match
      let bestMatch: { mappedName: string; score: number } = { mappedName: '', score: -1 };
      
      if (tableSchema && tableSchema.columns) {
        tableSchema.columns.forEach((dbCol: { name: string; [key: string]: any }) => { 
          const score = calculateSimilarity(sheetCol.originalName, dbCol.name);
          if (score >= COLUMN_MATCH_THRESHOLD && score > bestMatch.score) { 
            bestMatch = { mappedName: dbCol.name, score };
          }
        });
      }

      if (bestMatch.score >= COLUMN_MATCH_THRESHOLD) { 
        console.log(`Column ${sheetCol.originalName} -> ${bestMatch.mappedName} (Score: ${bestMatch.score})`);
        return {
          ...sheetCol,
          mappedName: bestMatch.mappedName,
          confidence: bestMatch.score,
        } as ColumnMapping;
      }
      
      // No match found in existing table - set to _create_new_ for manual handling
      const inferredName = normalizeFieldName(sheetCol.originalName);
      return {
        ...sheetCol,
        mappedName: '_create_new_',
        createNewValue: inferredName,
        dataType: sheetCol.inferredDataType || sheetCol.dataType || 'text', 
        confidence: 0,
        _isNewlyCreated: true,
        needsReview: true // Require review for new fields in existing tables
      } as ColumnMapping;
    });

    if (sheet) {
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
      const { sheetId, sheetName, matchedTable, confidence } = result; 
      let finalMappedName: string = '';
      let status: SheetMapping['status'] = 'pending';
      let approved = false;
      let needsReviewFlag = false;
      let isNewTableFlag = false; 
      let suggestedNameVal: string | undefined = undefined;
      let createNewValueVal: string | undefined = undefined;

      const sheet = sheets.find(s => s.id === sheetId);
      if (sheet?.skip) {
        console.log(`Skipping automap for sheet ${sheetId} as it's marked to skip.`);
        return; 
      }
      
      if (matchedTable) { 
        if (confidence >= TABLE_AUTO_APPROVE_THRESHOLD) {
          finalMappedName = normalizeTableName(matchedTable); 
          status = 'approved';
          approved = true;
          needsReviewFlag = false;
          isNewTableFlag = false;
          console.log(`Auto-mapping sheet ${sheetId} to ${finalMappedName} (Confidence: ${confidence}%) - Approved`);
        } else {
          // Low confidence match, suggest creating new
          finalMappedName = '_create_new_';
          status = 'ready'; 
          approved = true; // Approved for UI purposes (avoids immediate review flag)
          needsReviewFlag = false; 
          isNewTableFlag = true;
          const baseSuggestion = matchedTable ? normalizeTableName(matchedTable) : toSqlFriendlyName(sheetName);
          const prefixedSuggestion = tablePrefix ? `${tablePrefix}${baseSuggestion}` : baseSuggestion;
          suggestedNameVal = prefixedSuggestion;
          createNewValueVal = prefixedSuggestion;
          console.log(`Auto-mapping sheet ${sheetId} to '_create_new_' (Confidence: ${confidence}%) - Suggested: ${suggestedNameVal}`);
        }
      } else {
          // No match found, suggest creating new
          finalMappedName = '_create_new_';
          status = 'ready';
          approved = true; // Approved for UI purposes
          needsReviewFlag = false; 
          isNewTableFlag = true; 
          const baseSuggestion = toSqlFriendlyName(sheetName);
          const prefixedSuggestion = tablePrefix ? `${tablePrefix}${baseSuggestion}` : baseSuggestion;
          suggestedNameVal = prefixedSuggestion;
          createNewValueVal = prefixedSuggestion;
          console.log(`Auto-mapping sheet ${sheetId} to '_create_new_' based on new table suggestion. Suggested: ${suggestedNameVal}`);
      }

      const existingSheet = sheets.find(s => s.id === sheetId);
      const existingColumns = existingSheet?.columns || []; 

      const finalIsNewTableValue: boolean = !!isNewTableFlag;

      updateSheet(sheetId, {
        mappedName: finalMappedName,
        approved,
        needsReview: needsReviewFlag,
        isNewTable: finalIsNewTableValue, 
        suggestedName: suggestedNameVal,
        createNewValue: createNewValueVal, 
        status: status as SheetMapping['status'], 
        columns: existingColumns 
      });

      // Always try to auto-map columns, both for existing tables and new tables
      if (finalMappedName && tables) {
        let targetTableSchema = null;
        
        // Find existing table schema if not creating new
        if (finalMappedName !== '_create_new_') {
          targetTableSchema = tables.find(t => normalizeTableName(t.name) === finalMappedName);
        }
        
        // Even if no schema is found (for new tables), still call autoMapColumns
        // The updated function will handle both cases appropriately
        autoMapColumns(sheetId, existingColumns, targetTableSchema);
      }
    });
  }, [evaluateSheets, sheets, tables, updateSheet, autoMapColumns, normalizeTableName, toSqlFriendlyName, tablePrefix, TABLE_AUTO_APPROVE_THRESHOLD]);

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
    
    // First, ensure the loan table prefix (ln_) is added if needed
    // Check if it already has the ln_ prefix
    const loanPrefix = 'ln_';
    const hasLnPrefix = safeName.startsWith(loanPrefix);
    
    if (!hasLnPrefix) {
      // Add ln_ at the beginning
      safeName = `${loanPrefix}${safeName}`;
    }
    
    // Then apply any specified tablePrefix if it doesn't already have it
    // This is typically a client or project-specific prefix
    // Insert the tablePrefix after the ln_ prefix
    if (tablePrefix && !safeName.substring(loanPrefix.length).startsWith(tablePrefix)) {
      safeName = `${loanPrefix}${tablePrefix}${safeName.substring(loanPrefix.length)}`;
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