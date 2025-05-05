import {
  BatchColumnMapping,
  ColumnType,
  NewColumnProposal,
  RankedColumnSuggestion,
  RankedTableSuggestion,
  CachedDbTable,
  ConfidenceLevel, // Added
  ReviewStatus,    // Added
  NewTableProposal, // Added
  SchemaProposal   // Added
} from '../types';
import { inferDataType as inferDataTypeFromModule } from '../dataTypeInference';

/**
 * AnalysisEngine provides advanced mapping capabilities for Excel imports
 * with high-confidence mapping suggestions using name similarity, type compatibility,
 * and content pattern analysis.
 */
export class AnalysisEngine {
  /**
   * Calculate similarity score between two strings
   * @param str1 First string
   * @param str2 Second string
   * @returns Similarity score between 0 and 1
   */
  private static calculateStringSimilarity(str1: string, str2: string): number {
    // console.log(`[DEBUG AnalysisEngine] calculateStringSimilarity: Comparing "${str1}" and "${str2}"`); // Optional: Very verbose
    // Normalize strings for comparison
    const normalize = (str: string | undefined | null) => {
    if (str === undefined || str === null) {
      return ''; // Return empty string for undefined/null inputs
    }
    return str
      .toLowerCase()
      .replace(/[_\s-]/g, '') // Remove underscores, spaces, hyphens
      .replace(/[^a-z0-9]/gi, ''); // Remove non-alphanumeric chars
  };
    
    const normalizedStr1 = normalize(str1);
    const normalizedStr2 = normalize(str2);
    
    // If either string is empty after normalization, return 0
    if (!normalizedStr1.length || !normalizedStr2.length) {
        // console.log(`[DEBUG AnalysisEngine] calculateStringSimilarity: Empty normalized string, returning 0.`); // Optional
        return 0;
    }
    
    // Calculate Levenshtein distance
    const matrix: number[][] = [];
    
    // Initialize matrix
    for (let i = 0; i <= normalizedStr1.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= normalizedStr2.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= normalizedStr1.length; i++) {
      for (let j = 1; j <= normalizedStr2.length; j++) {
        const cost = normalizedStr1[i - 1] === normalizedStr2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    // Calculate similarity score (1 - normalized distance)
    const maxLength = Math.max(normalizedStr1.length, normalizedStr2.length);
    const distance = matrix[normalizedStr1.length][normalizedStr2.length];
    const score = maxLength === 0 ? 1 : 1 - distance / maxLength;
    // console.log(`[DEBUG AnalysisEngine] calculateStringSimilarity: Score = ${score.toFixed(3)}`); // Optional
    return score;
  }
  
  /**
   * Check if a source data type is compatible with a database column type
   * @param sourceType Inferred type from source data
   * @param dbType Database column type
   * @returns Boolean indicating compatibility
   */
  private static isTypeCompatible(sourceType: ColumnType | null, dbType: string | undefined): boolean {
    // console.log(`[DEBUG AnalysisEngine] isTypeCompatible: Source "${sourceType}", DB "${dbType}"`); // Optional: Verbose
    if (!sourceType) {
        // console.log(`[DEBUG AnalysisEngine] isTypeCompatible: Unknown source type, returning true.`); // Optional
        return true; // If source type is unknown, assume compatible
    }
    
    // Handle undefined or null dbType
    if (!dbType) {
        console.warn(`[DEBUG AnalysisEngine] isTypeCompatible: DB type is undefined or null, returning true.`);
        return true; // If DB type is undefined, assume compatible
    }
    
    // Normalize database type for comparison
    const normalizedDbType = dbType.toLowerCase();
    let compatible = false;
    
    switch (sourceType) {
      case 'string':
        compatible = normalizedDbType.includes('char') ||
                     normalizedDbType.includes('text') ||
                     normalizedDbType.includes('json');
        break;
      case 'number':
        compatible = normalizedDbType.includes('int') ||
                     normalizedDbType.includes('float') ||
                     normalizedDbType.includes('double') ||
                     normalizedDbType.includes('decimal') ||
                     normalizedDbType.includes('numeric');
        break;
      case 'boolean':
        compatible = normalizedDbType.includes('bool');
        break;
      case 'date':
        compatible = normalizedDbType.includes('date') ||
                     normalizedDbType.includes('time') ||
                     normalizedDbType.includes('timestamp');
        break;
      default:
        compatible = false;
        break;
    }
    // console.log(`[DEBUG AnalysisEngine] isTypeCompatible: Result = ${compatible}`); // Optional
    return compatible;
  }
  
  /**
   * Analyze content patterns in sample data to improve mapping confidence
   * @param sampleValues Array of sample values
   * @param dbColumnName Database column name
   * @returns Pattern match score between 0 and 1
   */
  private static analyzeContentPatterns(sampleValues: any[], dbColumnName: string | undefined): number {
    // console.log(`[DEBUG AnalysisEngine] analyzeContentPatterns: Column "${dbColumnName}", Samples: ${sampleValues?.length}`); // Optional: Verbose
    if (!sampleValues || sampleValues.length === 0) return 0;
    if (!dbColumnName) {
      console.warn(`[DEBUG AnalysisEngine] analyzeContentPatterns: Column name is undefined, returning 0.`);
      return 0;
    }
    
    // Convert column name to lowercase for pattern matching
    const lowerColumnName = dbColumnName.toLowerCase();
    
    // Pattern detection based on column name hints
    let patternScore = 0;
    const sampleCount = sampleValues.length;
    
    // Check for email pattern
    if (lowerColumnName.includes('email')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const emailMatches = sampleValues.filter(v =>
        typeof v === 'string' && emailRegex.test(v)
      ).length;
      patternScore = Math.max(patternScore, emailMatches / sampleCount);
    }
    
    // Check for phone pattern
    if (lowerColumnName.includes('phone') || lowerColumnName.includes('mobile')) {
      const phoneRegex = /^[\d\s\(\)\-\+]+$/;
      const phoneMatches = sampleValues.filter(v =>
        typeof v === 'string' && phoneRegex.test(v)
      ).length;
      patternScore = Math.max(patternScore, phoneMatches / sampleCount);
    }
    
    // Check for date pattern
    if (lowerColumnName.includes('date') ||
        lowerColumnName.includes('time') ||
        lowerColumnName.includes('created') ||
        lowerColumnName.includes('updated')) {
      const dateMatches = sampleValues.filter(v =>
        v instanceof Date ||
        (typeof v === 'string' && !isNaN(Date.parse(v)))
      ).length;
      patternScore = Math.max(patternScore, dateMatches / sampleCount);
    }
    
    // Check for ID pattern
    if (lowerColumnName.includes('id') || lowerColumnName.endsWith('_id')) {
      const idMatches = sampleValues.filter(v =>
        (typeof v === 'number' && Number.isInteger(v)) ||
        (typeof v === 'string' && /^[a-f0-9\-]+$/i.test(v)) // UUID-like
      ).length;
      patternScore = Math.max(patternScore, idMatches / sampleCount);
    }
    
    // console.log(`[DEBUG AnalysisEngine] analyzeContentPatterns: Final Score = ${patternScore.toFixed(3)}`); // Optional
    return patternScore;
  }
  
  /**
   * Calculate combined confidence score for a column mapping
   * @param nameSimilarity String similarity score
   * @param typeCompatibility Type compatibility (boolean)
   * @param patternScore Content pattern match score
   * @returns Combined confidence score between 0 and 1
   */
  private static calculateCombinedScore(
    nameSimilarity: number,
    typeCompatibility: boolean,
    patternScore: number
  ): number {
    // Adjusted weights - balanced emphasis
    const nameWeight = 0.50; // Reduced from 0.65
    const typeWeight = 0.25; // Increased from 0.15
    const patternWeight = 0.25; // Increased from 0.20

    // Apply penalty for type incompatibility
    const typeScore = typeCompatibility ? 1 : 0.3; // Keep penalty, but typeWeight is higher now

    // Calculate weighted score
    const combinedScore = (
      nameSimilarity * nameWeight +
      typeScore * typeWeight +
      patternScore * patternWeight
    );
    // console.log(`[DEBUG AnalysisEngine] calculateCombinedScore: Name=${nameSimilarity.toFixed(2)}, Type=${typeScore}, Pattern=${patternScore.toFixed(2)} -> Combined=${combinedScore.toFixed(3)}`); // Optional
    return combinedScore;
  }
  
  /**
   * Determine confidence level based on score
   * @param score Confidence score between 0 and 1
   * @returns Confidence level (High, Medium, Low)
   */
  public static getConfidenceLevel(score: number): ConfidenceLevel { // Use imported type
    if (score >= 0.8) return 'High';
    if (score >= 0.5) return 'Medium';
    return 'Low';
  }
  
  /**
   * Generate table mapping suggestions for a sheet, including proposing a new table if no good match exists.
   * @param sheetName Sheet name
   * @param headers Sheet headers
   * @param availableTables Available database tables
   * @param newTableThreshold Score below which a new table is proposed (e.g., 0.4)
   * @returns Ranked table suggestions (including potential new table) and the highest confidence score among existing tables.
   */
  public static generateTableSuggestions(
    sheetName: string,
    headers: string[],
    availableTables: CachedDbTable[],
    newTableThreshold: number = 0.4 // Threshold to propose a new table
  ): {
    suggestions: RankedTableSuggestion[],
    topExistingTableScore: number, // Score of the best *existing* table match
    confidenceScore: number // Alias for topExistingTableScore for backward compatibility
  } {
    console.log(`[DEBUG AnalysisEngine] generateTableSuggestions: Sheet "${sheetName}", Headers: ${headers.length}, Tables: ${availableTables.length}`);
    const suggestions: RankedTableSuggestion[] = [];
    let topExistingTableScore = 0;

    for (const table of availableTables) {
      // Calculate name similarity between sheet name and table name
      const nameSimilarity = this.calculateStringSimilarity(sheetName, table.tableName);

      // Calculate header match ratio
      let headerMatchCount = 0;
      for (const header of headers) {
        const hasMatch = table.columns.some(col =>
          this.calculateStringSimilarity(header, col.columnName) >= 0.6 // Threshold for considering a header match
        );
        if (hasMatch) headerMatchCount++;
      }
      const headerMatchRatio = headers.length > 0 ? headerMatchCount / headers.length : 0;

      // Calculate combined score (weighted average)
      const combinedScore = nameSimilarity * 0.4 + headerMatchRatio * 0.6;
      topExistingTableScore = Math.max(topExistingTableScore, combinedScore);

      console.log(`[DEBUG AnalysisEngine] Table Suggestion for "${table.tableName}": NameSim=${nameSimilarity.toFixed(2)}, HeaderRatio=${headerMatchRatio.toFixed(2)} -> Score=${combinedScore.toFixed(2)}`);

      suggestions.push({
        tableName: table.tableName,
        confidenceScore: combinedScore,
        confidenceLevel: this.getConfidenceLevel(combinedScore),
        matchType: 'partial', // Default, can refine later if needed
        isNewTableProposal: false,
      });
    }

    // Sort existing suggestions by score (descending)
    suggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);

    // Propose a new table if the best existing match is below the threshold
    if (topExistingTableScore < newTableThreshold) {
      const proposedTableName = this.sanitizeColumnName(`import_${sheetName}`); // Example naming convention
      console.log(`[DEBUG AnalysisEngine] Top existing score (${topExistingTableScore.toFixed(2)}) < threshold (${newTableThreshold}). Proposing new table: "${proposedTableName}"`);
      const newTableProposal: NewTableProposal = {
        tableName: proposedTableName,
        sourceSheet: sheetName,
        columns: headers.map(header => ({
          columnName: this.sanitizeColumnName(header),
          sqlType: 'TEXT', // Default to TEXT, refinement can happen in column mapping
          isNullable: true,
          sourceSheet: sheetName,
          sourceHeader: header,
        }))
      };

      suggestions.unshift({ // Add to the beginning of the list
        tableName: proposedTableName,
        confidenceScore: 0, // Score is not applicable for new proposal
        confidenceLevel: 'Low', // Or maybe a specific level for 'new'?
        matchType: 'new',
        isNewTableProposal: true,
        newTableProposal: newTableProposal,
      });
    }

    console.log(`[DEBUG AnalysisEngine] generateTableSuggestions: Final suggestions count: ${suggestions.length}, Top Existing Score: ${topExistingTableScore.toFixed(2)}`);
    return {
      suggestions,
      topExistingTableScore, // Return the score of the best *existing* table
      confidenceScore: topExistingTableScore // Alias for backward compatibility
    };
  }


  /**
   * Generate column mapping suggestions for a sheet, handling existing and new tables.
   * @param headers Sheet headers
   * @param sampleData Sample data rows
   * @param selectedTableInfo Selected database table (CachedDbTable) or new table proposal (NewTableProposal)
   * @returns Column mappings with confidence scores
   */
  public static generateColumnMappings(
    headers: string[],
    sampleData: Record<string, any>[],
    selectedTableInfo: CachedDbTable | NewTableProposal | string | null, // Can be existing or new proposal, or a string table name
    availableTables?: CachedDbTable[] // Optional array of available tables to look up by name
  ): { [header: string]: BatchColumnMapping } {
    // Handle case where selectedTableInfo is a string (table name)
    if (typeof selectedTableInfo === 'string' && availableTables) {
      // Find the table by name in availableTables
      const tableByName = availableTables.find(t => t.tableName === selectedTableInfo);
      if (tableByName) {
        selectedTableInfo = tableByName;
      } else {
        console.warn(`[DEBUG AnalysisEngine] Table name "${selectedTableInfo}" not found in available tables. Treating as null.`);
        selectedTableInfo = null;
      }
    }
    
    // Safe logging that handles different types of selectedTableInfo
    console.log(`[DEBUG AnalysisEngine] generateColumnMappings: Headers: ${headers.length}, Table: ${
      selectedTableInfo
        ? (typeof selectedTableInfo === 'object' && 'tableName' in selectedTableInfo
            ? selectedTableInfo.tableName
            : 'NEW')
        : 'None'
    }`);
    const columnMappings: { [header: string]: BatchColumnMapping } = {};

    // --- Case 1: No table selected or found ---
    if (!selectedTableInfo) {
      console.log(`[DEBUG AnalysisEngine] No table selected. Creating 'skip' mappings.`);
      for (const header of headers) {
        const sampleValues = sampleData.map(row => row[header]);
        const inferredDataType = this.inferDataType(sampleValues, header);
        columnMappings[header] = {
          header,
          sampleValue: sampleData.length > 0 ? sampleData[0][header] : null,
          mappedColumn: null,
          suggestedColumns: [],
          inferredDataType: inferredDataType,
          action: 'skip', // Default to skip if no table context
          status: 'pending',
          reviewStatus: 'pending', // Initialize review status
          confidenceScore: 0,
          confidenceLevel: 'Low',
        };
      }
      console.log(`[DEBUG AnalysisEngine] generateColumnMappings: Finished (No Table). Mappings: ${Object.keys(columnMappings).length}`);
      return columnMappings;
    }

    // --- Case 2: Selected table is a NEW table proposal ---
    if (typeof selectedTableInfo === 'object' && selectedTableInfo !== null && 'sourceSheet' in selectedTableInfo) { // Check if it's a NewTableProposal
        const newTableProposal = selectedTableInfo as NewTableProposal;
        console.log(`[DEBUG AnalysisEngine] Generating mappings for NEW table proposal: "${newTableProposal.tableName}"`);
        for (const header of headers) {
            const sampleValues = sampleData.map(row => row[header]);
            const inferredDataType = this.inferDataType(sampleValues, header);
            const sanitizedName = this.sanitizeColumnName(header);
            const sqlType = this.getSqlTypeFromInferredType(inferredDataType);

            // Find corresponding column proposal in the new table structure
            const proposedCol = newTableProposal.columns.find(c => c.sourceHeader === header);
            console.log(`[DEBUG AnalysisEngine] Header "${header}": Inferred type ${inferredDataType}, Proposed Col: ${proposedCol?.columnName || 'Not Found'}`);

            const newColumnProposal: NewColumnProposal = {
                columnName: proposedCol?.columnName || sanitizedName,
                sqlType: proposedCol?.sqlType || sqlType,
                isNullable: true,
                sourceSheet: newTableProposal.sourceSheet,
                sourceHeader: header,
            };

            columnMappings[header] = {
                header,
                sampleValue: sampleData.length > 0 ? sampleData[0][header] : null,
                mappedColumn: newColumnProposal.columnName, // Map to the proposed new column name
                suggestedColumns: [], // No suggestions needed for a new table initially
                inferredDataType,
                action: 'create', // Action is to create this column
                newColumnProposal: newColumnProposal,
                status: 'suggested', // Status is suggested (as part of new table)
                reviewStatus: 'pending', // Requires review
                confidenceScore: 1.0, // High confidence as it's part of the new table structure
                confidenceLevel: 'High',
            };
        }
        console.log(`[DEBUG AnalysisEngine] generateColumnMappings: Finished (New Table). Mappings: ${Object.keys(columnMappings).length}`);
        return columnMappings;
    }


    // --- Case 3: Selected table is an EXISTING table ---
    const existingTable = selectedTableInfo as CachedDbTable;
    console.log(`[DEBUG AnalysisEngine] Generating mappings for EXISTING table: "${existingTable.tableName}"`);
    for (const header of headers) {
      console.log(`[DEBUG AnalysisEngine] Processing header: "${header}"`);
      const sampleValues = sampleData.map(row => row[header]);
      const inferredDataType = this.inferDataType(sampleValues, header);
      console.log(`[DEBUG AnalysisEngine]   Inferred type: ${inferredDataType}`);
      const columnSuggestions: RankedColumnSuggestion[] = [];

      for (const column of existingTable.columns) {
        const nameSimilarity = this.calculateStringSimilarity(header, column.columnName);
        const isTypeCompatible = this.isTypeCompatible(inferredDataType, column.dataType);
        // Use static method directly
        const patternScore = AnalysisEngine.analyzeContentPatterns(sampleValues, column.columnName);
        const combinedScore = this.calculateCombinedScore(nameSimilarity, isTypeCompatible, patternScore);
        // console.log(`[DEBUG AnalysisEngine]   Suggestion "${column.columnName}": NameSim=${nameSimilarity.toFixed(2)}, TypeOK=${isTypeCompatible}, Pattern=${patternScore.toFixed(2)} -> Score=${combinedScore.toFixed(2)}`); // Optional: Very verbose

        columnSuggestions.push({
          columnName: column.columnName,
          confidenceScore: combinedScore, // Use confidenceScore consistently
          isTypeCompatible,
          confidenceLevel: this.getConfidenceLevel(combinedScore)
        });
      }

      // Sort suggestions by score (descending)
      columnSuggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);
      // console.log(`[DEBUG AnalysisEngine]   Sorted Suggestions:`, columnSuggestions.slice(0, 3)); // Optional: Verbose

      const topSuggestion = columnSuggestions.length > 0 ? columnSuggestions[0] : null;
      const confidenceThreshold = 0.65; // Threshold for auto-mapping (Lowered from 0.7)
      console.log(`[DEBUG AnalysisEngine]   Top Suggestion: ${topSuggestion?.columnName || 'None'}, Score: ${topSuggestion?.confidenceScore.toFixed(2) || 'N/A'}, Threshold: ${confidenceThreshold}`);

      let action: 'map' | 'skip' | 'create' = 'skip'; // Default action before evaluation
      let mappedColumn: string | null = null;
      let newColumnProposal: NewColumnProposal | undefined = undefined;

      if (topSuggestion && topSuggestion.confidenceScore >= confidenceThreshold) {
        // High confidence match found
        action = 'map';
        mappedColumn = topSuggestion.columnName;
        newColumnProposal = undefined; // Ensure no proposal if mapping
        console.log(`[DEBUG AnalysisEngine]   => Action: map to "${mappedColumn}"`);
      } else {
        // Low confidence or no match -> Default to 'create'
        action = 'create';
        const sanitizedName = this.sanitizeColumnName(header);
        // Use the inferred type to get a better SQL type suggestion
        const sqlType = this.getSqlTypeFromInferredType(inferredDataType);
        newColumnProposal = {
          columnName: sanitizedName,
          sqlType: sqlType, // Use refined SQL type
          isNullable: true, // Default new columns to nullable
          // sourceSheet: existingTable.tableName, // Context might be ambiguous, remove for now
          sourceHeader: header,
        };
        mappedColumn = null; // Explicitly null when creating
        console.log(`[DEBUG AnalysisEngine]   => Action: create as "${newColumnProposal.columnName}" (${newColumnProposal.sqlType})`);
      }


      columnMappings[header] = {
        header,
        sampleValue: sampleData.length > 0 ? sampleData[0][header] : null,
        mappedColumn: mappedColumn,
        confidenceScore: topSuggestion ? topSuggestion.confidenceScore : 0,
        confidenceLevel: topSuggestion ? topSuggestion.confidenceLevel : 'Low',
        suggestedColumns: columnSuggestions,
        inferredDataType,
        action: action,
        newColumnProposal: action === 'create' ? newColumnProposal : undefined,
        status: 'suggested',
        reviewStatus: 'pending' // Initialize review status
      };
    }
    console.log(`[DEBUG AnalysisEngine] generateColumnMappings: Finished (Existing Table). Mappings: ${Object.keys(columnMappings).length}`);
    return columnMappings;
  }

  /**
   * Generate schema change proposals (only new columns for now) for a given mapping state.
   * Handles both existing tables and proposed new tables.
   * @param columnMappings Current state of column mappings for a sheet
   * @param selectedTableInfo The selected table (existing or new proposal)
   * @returns Array of schema proposals (NewColumnProposal or potentially NewTableProposal)
   */
  public static generateSchemaProposals(
    columnMappings: { [header: string]: BatchColumnMapping },
    selectedTableInfo: CachedDbTable | NewTableProposal | string | null,
    availableTables?: CachedDbTable[] // Optional array of available tables to look up by name
  ): SchemaProposal[] {
      // Handle case where selectedTableInfo is a string (table name)
      if (typeof selectedTableInfo === 'string' && availableTables) {
        // Find the table by name in availableTables
        const tableByName = availableTables.find(t => t.tableName === selectedTableInfo);
        if (tableByName) {
          selectedTableInfo = tableByName;
        } else {
          console.warn(`[DEBUG AnalysisEngine] Table name "${selectedTableInfo}" not found in available tables. Treating as null.`);
          selectedTableInfo = null;
        }
      }
      
      // Safe logging that handles different types of selectedTableInfo
      console.log(`[DEBUG AnalysisEngine] generateSchemaProposals: Mappings: ${Object.keys(columnMappings).length}, Table: ${
        selectedTableInfo
          ? (typeof selectedTableInfo === 'object' && selectedTableInfo !== null && 'tableName' in selectedTableInfo
              ? selectedTableInfo.tableName
              : 'NEW')
          : 'None'
      }`);
      const proposals: SchemaProposal[] = [];

      if (!selectedTableInfo) {
          console.log(`[DEBUG AnalysisEngine] No table info, returning empty proposals.`);
          return []; // No table context, no proposals
      }

      // If the selected table itself is a new proposal, return that.
      if (selectedTableInfo && typeof selectedTableInfo === 'object' && selectedTableInfo !== null && 'sourceSheet' in selectedTableInfo) {
          console.log(`[DEBUG AnalysisEngine] Selected table is a NEW proposal. Refining columns.`);
          // We might refine the columns based on final review status later,
          // but for now, the initial proposal is the main schema change.
          // Ensure columns reflect the 'create' action from mappings.
          const newTableProposal = { ...selectedTableInfo } as NewTableProposal; // Clone to avoid modifying original
          newTableProposal.columns = Object.values(columnMappings)
              .filter(m => m.action === 'create' && m.newColumnProposal)
              .map(m => m.newColumnProposal!); // Map final proposed columns
          console.log(`[DEBUG AnalysisEngine] Returning NewTableProposal with ${newTableProposal.columns.length} columns.`);
          return [newTableProposal];
      }

      // If it's an existing table, collect 'create' actions for new columns.
      const existingTable = selectedTableInfo as CachedDbTable;
      console.log(`[DEBUG AnalysisEngine] Selected table is EXISTING: "${existingTable.tableName}". Collecting 'create' actions.`);
      for (const header in columnMappings) {
          const mapping = columnMappings[header];
          // Only add proposals for columns explicitly marked for creation
          if (mapping.action === 'create' && mapping.newColumnProposal) {
              // Check if a column with the proposed name already exists (case-insensitive check might be good)
              const alreadyExists = existingTable.columns.some(
                  c => c && c.columnName && mapping.newColumnProposal &&
                      c.columnName.toLowerCase() === mapping.newColumnProposal.columnName.toLowerCase()
              );
              if (!alreadyExists) {
                  console.log(`[DEBUG AnalysisEngine]   Adding NewColumnProposal for "${mapping.newColumnProposal.columnName}" from header "${header}"`);
                  proposals.push(mapping.newColumnProposal);
              } else {
                  // Handle potential name collision - maybe flag for review or suggest alternative name
                  console.warn(`[DEBUG AnalysisEngine] Proposed column "${mapping.newColumnProposal.columnName}" from header "${header}" already exists in table "${existingTable.tableName}". Skipping proposal.`);
                  // Optionally update mapping status to 'error' or 'needsReview'
              }
          }
      }
      console.log(`[DEBUG AnalysisEngine] generateSchemaProposals: Finished. Total proposals: ${proposals.length}`);
      return proposals;
  }

  /**
   * Sanitize a column name for database use
   * @param name Original column name
   * @returns Sanitized column name
   */
  public static sanitizeColumnName(name: string | null | undefined): string { // Changed to public
    if (name === null || name === undefined) {
      console.warn(`[DEBUG AnalysisEngine] sanitizeColumnName: Received null or undefined name, returning 'unknown_column'`);
      return 'unknown_column';
    }
    
    const originalName = name;
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_') // Replace non-alphanumeric chars with underscore
      .replace(/^[^a-z_]/, '_') // Ensure starts with letter or underscore
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
    
    // If sanitized is empty, return a default name
    if (!sanitized) {
      return 'unknown_column';
    }
    
    // console.log(`[DEBUG AnalysisEngine] sanitizeColumnName: "${originalName}" -> "${sanitized}"`); // Optional: Verbose
    return sanitized;
  }
  
  /**
   * Convert inferred data type to SQL type
   * @param inferredType Inferred data type
   * @returns SQL data type
   */
  private static getSqlTypeFromInferredType(inferredType: ColumnType | null): string {
    switch (inferredType) {
      case 'string':
        return 'TEXT';
      case 'number':
        return 'NUMERIC';
      case 'boolean':
        return 'BOOLEAN';
      case 'date':
        return 'TIMESTAMP WITH TIME ZONE';
      default:
        return 'TEXT'; // Default to TEXT for unknown types
    }
  }
  
  /**
   * Infer data type from sample values
   * @param values Array of sample values
   * @param fieldName Optional field name to use for inference
   * @returns Inferred data type
   */
  private static inferDataType(values: any[], fieldName?: string): ColumnType | null {
    // Use the new implementation with detailed logging
    if (!values || values.length === 0) return null;
    
    // Call the new implementation
    return inferDataTypeFromModule(values, fieldName);
  }
} // End of class AnalysisEngine