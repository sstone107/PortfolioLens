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
    return score;
  }
  
  /**
   * Check if a source data type is compatible with a database column type
   * @param sourceType Inferred type from source data
   * @param dbType Database column type
   * @returns Boolean indicating compatibility
   */
  private static isTypeCompatible(sourceType: ColumnType | null, dbType: string | undefined): boolean {
    if (!sourceType) {
        return true; // If source type is unknown, assume compatible
    }
    
    // Handle undefined or null dbType
    if (!dbType) {
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
    return compatible;
  }
  
  /**
   * Analyze content patterns in sample data to improve mapping confidence
   * @param sampleValues Array of sample values
   * @param dbColumnName Database column name
   * @returns Pattern match score between 0 and 1
   */
  private static analyzeContentPatterns(sampleValues: any[], dbColumnName: string | undefined): number {
    if (!sampleValues || sampleValues.length === 0) return 0;
    if (!dbColumnName) {
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
    // Prioritize exact normalized name matches
    if (nameSimilarity >= 0.99) { // Use a threshold close to 1.0 to account for potential float issues
      return 1.0;
    }

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
    // Ensure score doesn't exceed 1.0 due to weighting adjustments
    return Math.min(combinedScore, 1.0);
  }
  
  /**
   * Determine confidence level based on score
   * @param score Confidence score between 0 and 1
   * @returns Confidence level (High, Medium, Low)
   */
  public static getConfidenceLevel(score: number): ConfidenceLevel { // Use imported type
    if (score >= 0.9) return 'High';
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
        selectedTableInfo = null;
      }
    }
    
    const columnMappings: { [header: string]: BatchColumnMapping } = {};

    // --- Case 1: No table selected or found ---
    if (!selectedTableInfo) {
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
      return columnMappings;
    }

    // --- Case 2: Selected table is a NEW table proposal ---
    if (typeof selectedTableInfo === 'object' && selectedTableInfo !== null && 'sourceSheet' in selectedTableInfo) { // Check if it's a NewTableProposal
        const newTableProposal = selectedTableInfo as NewTableProposal;
        for (const header of headers) {
            const sampleValues = sampleData.map(row => row[header]);
            const inferredDataType = this.inferDataType(sampleValues, header);
            const sanitizedName = this.sanitizeColumnName(header);
            const sqlType = this.getSqlTypeFromInferredType(inferredDataType);

            // Find corresponding column proposal in the new table structure
            const proposedCol = newTableProposal.columns.find(c => c.sourceHeader === header);

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
        return columnMappings;
    }


    // --- Case 3: Selected table is an EXISTING table ---
    const existingTable = selectedTableInfo as CachedDbTable;
    
    // Track which database columns have already been mapped to prevent duplicates
    const mappedDbColumns = new Set<string>();
    
    for (const header of headers) {
      const sampleValues = sampleData.map(row => row[header]);
      const inferredDataType = this.inferDataType(sampleValues, header);
      const columnSuggestions: RankedColumnSuggestion[] = [];

      for (const column of existingTable.columns) {
        const nameSimilarity = this.calculateStringSimilarity(header, column.columnName);
        const isTypeCompatible = this.isTypeCompatible(inferredDataType, column.dataType);
        // Use static method directly
        const patternScore = AnalysisEngine.analyzeContentPatterns(sampleValues, column.columnName);
        const combinedScore = this.calculateCombinedScore(nameSimilarity, isTypeCompatible, patternScore);

        columnSuggestions.push({
          columnName: column.columnName,
          confidenceScore: combinedScore, // Use confidenceScore consistently
          isTypeCompatible,
          confidenceLevel: this.getConfidenceLevel(combinedScore)
        });
      }

      // Sort suggestions by score (descending)
      columnSuggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);

      const topSuggestion = columnSuggestions.length > 0 ? columnSuggestions[0] : null;
      const confidenceThreshold = 0.9; // Threshold for auto-mapping (Increased from 0.65 to 0.9)

      let action: 'map' | 'skip' | 'create' = 'skip'; // Default action before evaluation
      let mappedColumn: string | null = null;
      let newColumnProposal: NewColumnProposal | undefined = undefined;

      if (topSuggestion && topSuggestion.confidenceScore >= confidenceThreshold) {
        // High confidence match found
        // Check if this database column has already been mapped to prevent duplicates
        if (!mappedDbColumns.has(topSuggestion.columnName)) {
          action = 'map';
          mappedColumn = topSuggestion.columnName;
          newColumnProposal = undefined; // Ensure no proposal if mapping
          // Add to the set of mapped columns to prevent duplicates
          mappedDbColumns.add(topSuggestion.columnName);
        } else {
          // This database column is already mapped, create a new column instead
          action = 'create';
          const sanitizedName = this.sanitizeColumnName(header);
          const sqlType = this.getSqlTypeFromInferredType(inferredDataType);
          newColumnProposal = {
            columnName: sanitizedName,
            sqlType: sqlType,
            isNullable: true,
            sourceHeader: header,
          };
          mappedColumn = null;
        }
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
          selectedTableInfo = null;
        }
      }
      
      const proposals: SchemaProposal[] = [];

      if (!selectedTableInfo) {
          return []; // No table context, no proposals
      }

      // If the selected table itself is a new proposal, return that.
      if (selectedTableInfo && typeof selectedTableInfo === 'object' && selectedTableInfo !== null && 'sourceSheet' in selectedTableInfo) {
          // We might refine the columns based on final review status later,
          // but for now, the initial proposal is the main schema change.
          // Ensure columns reflect the 'create' action from mappings.
          const newTableProposal = { ...selectedTableInfo } as NewTableProposal; // Clone to avoid modifying original
          newTableProposal.columns = Object.values(columnMappings)
              .filter(m => m.action === 'create' && m.newColumnProposal)
              .map(m => m.newColumnProposal!); // Map final proposed columns
          return [newTableProposal];
      }

      // If it's an existing table, collect 'create' actions for new columns.
      const existingTable = selectedTableInfo as CachedDbTable;
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
                  proposals.push(mapping.newColumnProposal);
              } else {
                  // Handle potential name collision - maybe flag for review or suggest alternative name
              }
          }
      }
      return proposals;
  }

  /**
   * Sanitize a column name for database use
   * @param name Original column name
   * @returns Sanitized column name
   */
  public static sanitizeColumnName(name: string | null | undefined): string { // Changed to public
    if (name === null || name === undefined) {
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