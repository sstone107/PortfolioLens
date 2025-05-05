import { 
  ColumnMapping, 
  SheetInfo, 
  ColumnType, 
  TableColumn as TableColumnType,
  ColumnMappingSuggestions,
  RankedColumnSuggestion,
  NewColumnProposal,
  BatchColumnMapping,
  ColumnSuggestion,
  RankedTableSuggestion,
  SheetProcessingState
} from './types';
import { 
  normalizeForMatching, 
  inferTypeFromFieldName, 
  normalizeFieldType, 
  hasLeadingZeros, 
  calculateSimilarity 
} from './BatchImporterUtils';
import {
  mapColumnTypeToSql
} from './ColumnMappingUtils';
import { inferDataType } from './dataTypeInference';

/**
 * Enhanced Analysis Engine for Excel import
 * Provides high-confidence mapping suggestions between Excel sheets and database tables
 */

/**
 * Analyzes content patterns in sample data to improve matching confidence
 * @param sampleValues - Sample values from the Excel column
 * @param dbColumnName - Database column name to compare against
 * @param dbColumnType - Database column type
 * @returns A score from 0.0 to 1.0 representing pattern match confidence
 */
export function analyzeContentPatterns(
  sampleValues: any[], 
  dbColumnName: string, 
  dbColumnType: ColumnType | null
): number {
  if (sampleValues.length === 0) return 0;
  
  // Initialize with a base score
  let patternScore = 0;
  
  // 1. Check for common patterns in specific column types
  const lowerDbName = dbColumnName.toLowerCase();
  
  // Email pattern detection for email-like columns
  if (lowerDbName.includes('email')) {
    const emailPattern = /@.*\./;
    const emailMatches = sampleValues.filter(v => 
      typeof v === 'string' && emailPattern.test(v)
    ).length;
    
    if (emailMatches / sampleValues.length > 0.5) {
      patternScore += 0.3;
    }
  }
  
  // Phone number pattern for phone-like columns
  if (lowerDbName.includes('phone') || lowerDbName.includes('mobile') || lowerDbName.includes('tel')) {
    const phonePattern = /^[\d\s\(\)\-\+]+$/;
    const phoneMatches = sampleValues.filter(v => 
      typeof v === 'string' && phonePattern.test(v) && v.replace(/\D/g, '').length >= 7
    ).length;
    
    if (phoneMatches / sampleValues.length > 0.5) {
      patternScore += 0.3;
    }
  }
  
  // Postal/ZIP code patterns
  if (lowerDbName.includes('zip') || lowerDbName.includes('postal')) {
    const zipMatches = sampleValues.filter(v => 
      (typeof v === 'string' && /^\d{5}(-\d{4})?$/.test(v)) || // US format
      (typeof v === 'string' && /^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(v)) // Canadian format
    ).length;
    
    if (zipMatches / sampleValues.length > 0.5) {
      patternScore += 0.3;
    }
  }
  
  // 2. Value range analysis for numeric columns
  if (dbColumnType === 'number') {
    try {
      const numericValues = sampleValues
        .filter(v => !isNaN(Number(v)))
        .map(v => Number(v));
      
      if (numericValues.length > 0) {
        const min = Math.min(...numericValues);
        const max = Math.max(...numericValues);
        
        // Check if values are within expected ranges for common fields
        if (lowerDbName.includes('age') && min >= 0 && max <= 120) {
          patternScore += 0.2;
        } else if (lowerDbName.includes('year') && min >= 1900 && max <= 2100) {
          patternScore += 0.2;
        } else if ((lowerDbName.includes('price') || lowerDbName.includes('amount')) && min >= 0) {
          patternScore += 0.2;
        }
      }
    } catch (e) {
      // Ignore errors in numeric analysis
    }
  }
  
  // 3. Date format analysis for date columns
  if (dbColumnType === 'date') {
    const dateMatches = sampleValues.filter(v => 
      v instanceof Date || 
      (typeof v === 'string' && !isNaN(Date.parse(v)))
    ).length;
    
    if (dateMatches / sampleValues.length > 0.5) {
      patternScore += 0.3;
    }
  }
  
  // Cap the score at 1.0
  return Math.min(patternScore, 1.0);
}

/**
 * Enhanced column mapping suggestion function with confidence scoring
 * @param excelHeaders - Array of headers from the Excel sheet
 * @param dbColumns - Array of available database columns
 * @param sampleData - Sample data from the Excel sheet for type inference and pattern analysis
 * @returns A record of column mapping suggestions with confidence scores
 */
export function suggestEnhancedColumnMappings(
  excelHeaders: string[],
  dbColumns: TableColumnType[],
  sampleData: Record<string, any>[]
): Record<string, ColumnMappingSuggestions> {
  const suggestions: Record<string, ColumnMappingSuggestions> = {};

  // Normalize database columns for easier comparison
  const normalizedDbColumns = dbColumns.map(col => ({
    name: col.columnName,
    normalizedName: normalizeForMatching(col.columnName),
    type: inferTypeFromDBColumn(col),
    dataType: col.dataType,
  }));

  // Process each Excel header
  excelHeaders.forEach(excelHeader => {
    const normalizedExcelHeader = normalizeForMatching(excelHeader);
    const headerSampleValues = sampleData.map(row => row[excelHeader]).filter(v => v !== undefined && v !== null);
    const inferredExcelType = inferDataType(headerSampleValues, excelHeader);

    // Array to hold ranked suggestions for this column
    const columnSuggestions: ColumnSuggestion[] = [];

    // Analyze each database column as a potential match
    normalizedDbColumns.forEach(dbCol => {
      // 1. Name similarity analysis (0.0 to 1.0)
      const nameSimilarity = calculateSimilarity(normalizedExcelHeader, dbCol.normalizedName);
      
      // 2. Type compatibility analysis (0.0 to 1.0)
      let typeCompatibility = 0;
      if (inferredExcelType && dbCol.type) {
        // Exact type match
        if (inferredExcelType === dbCol.type) {
          typeCompatibility = 1.0;
        } 
        // Compatible types (e.g., string can hold number)
        else if (inferredExcelType === 'number' && dbCol.type === 'string') {
          typeCompatibility = 0.7;
        }
        // Other compatible combinations
        else if ((inferredExcelType === 'date' && dbCol.type === 'string') ||
                (inferredExcelType === 'boolean' && dbCol.type === 'string')) {
          typeCompatibility = 0.6;
        }
        // Incompatible types get 0
      }
      
      // 3. Content pattern analysis (if we have sample data)
      let contentPatternScore = 0;
      if (headerSampleValues.length > 0) {
        // Analyze patterns in the data (e.g., formats, ranges, etc.)
        contentPatternScore = analyzeContentPatterns(headerSampleValues, dbCol.name, dbCol.type);
      }
      
      // 4. Combined scoring with weighted factors
      // Name similarity is most important, followed by type compatibility, then content patterns
      const totalScore = (nameSimilarity * 0.6) + (typeCompatibility * 0.3) + (contentPatternScore * 0.1);
      
      // 5. Determine confidence level based on total score
      let confidenceLevel: 'High' | 'Medium' | 'Low';
      if (totalScore >= 0.8) {
        confidenceLevel = 'High';
      } else if (totalScore >= 0.5) {
        confidenceLevel = 'Medium';
      } else {
        confidenceLevel = 'Low';
      }
      
      // Only include suggestions with a minimum score
      if (totalScore > 0.3) {
        columnSuggestions.push({
          dbColumn: dbCol.name,
          similarityScore: totalScore,
          isTypeCompatible: typeCompatibility > 0,
          confidenceLevel
        });
      }
    });
    
    // Sort suggestions by score descending
    columnSuggestions.sort((a, b) => b.similarityScore - a.similarityScore);
    
    // Create the final suggestion object for this column
    suggestions[excelHeader] = {
      sourceColumn: excelHeader,
      suggestions: columnSuggestions,
      inferredDataType: inferredExcelType
    };
  });

  return suggestions;
}

/**
 * Infer column type from database column metadata.
 * @param dbColumn Database column metadata
 * @returns Inferred column type
 */
function inferTypeFromDBColumn(dbColumn: any): ColumnType {
  // Get dataType property with fallbacks for different naming conventions
  const getDataType = (col: any): string => {
    if (col.dataType) return col.dataType;
    if (col.data_type) return col.data_type;
    if (col.type) return col.type;
    return 'string'; // Default
  };
  
  const dataType = getDataType(dbColumn).toLowerCase();
  
  if (dataType.includes('int') || 
      dataType.includes('numeric') || 
      dataType.includes('decimal') || 
      dataType.includes('float') || 
      dataType.includes('double') || 
      dataType.includes('money')) {
    return 'number';
  } else if (dataType.includes('bool')) {
    return 'boolean';
  } else if (dataType.includes('date') || dataType.includes('time')) {
    return 'date';
  } else {
    return 'string';
  }
}

/**
 * Creates batch column mappings from enhanced column suggestions
 * @param suggestions - Enhanced column mapping suggestions with confidence scores
 * @param sampleData - Sample data for each column
 * @returns Batch column mappings with confidence scores and status
 */
export function createBatchColumnMappingsFromSuggestions(
  suggestions: Record<string, ColumnMappingSuggestions>,
  sampleData: Record<string, any>[]
): Record<string, BatchColumnMapping> {
  const batchMappings: Record<string, BatchColumnMapping> = {};
  
  // Process each column's suggestions
  Object.entries(suggestions).forEach(([excelHeader, columnSuggestion]) => {
    // Get a sample value for this column
    const sampleValue = sampleData.length > 0 ? sampleData[0][excelHeader] : null;
    
    // Get the top suggestion if available
    const topSuggestion = columnSuggestion.suggestions.length > 0 ? 
      columnSuggestion.suggestions[0] : null;
    
    // Determine mapping action and status based on confidence
    let action: 'map' | 'skip' | 'create' = 'skip';
    let status: 'pending' | 'suggested' | 'userModified' | 'error' = 'pending';
    let mappedColumn: string | null = null;
    let newColumnProposal: NewColumnProposal | undefined = undefined;
    
    if (topSuggestion) {
      // If we have a high confidence match, suggest mapping
      if (topSuggestion.confidenceLevel === 'High' && topSuggestion.similarityScore > 0.8) {
        action = 'map';
        mappedColumn = topSuggestion.dbColumn;
        status = 'suggested';
      } 
      // If we have a medium confidence match, suggest mapping but require review
      else if (topSuggestion.confidenceLevel === 'Medium' && topSuggestion.similarityScore > 0.5) {
        action = 'map';
        mappedColumn = topSuggestion.dbColumn;
        status = 'pending';
      }
      // For low confidence, suggest creating a new column
      else if (topSuggestion.similarityScore < 0.4) {
        action = 'create';
        mappedColumn = null;
        status = 'pending';
        
        // Create a new column proposal
        const sanitizedName = excelHeader.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_{2,}/g, '_');
        newColumnProposal = {
          columnName: sanitizedName,
          sqlType: mapColumnTypeToSql(columnSuggestion.inferredDataType),
          isNullable: true
        };
      }
    } else {
      // No suggestions, propose creating a new column
      action = 'create';
      status = 'pending';
      
      // Create a new column proposal
      const sanitizedName = excelHeader.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_{2,}/g, '_');
      newColumnProposal = {
        columnName: sanitizedName,
        sqlType: mapColumnTypeToSql(columnSuggestion.inferredDataType),
        isNullable: true
      };
    }
    
    // Create the batch column mapping
    batchMappings[excelHeader] = {
      header: excelHeader,
      sampleValue,
      mappedColumn,
      confidenceScore: topSuggestion?.similarityScore,
      confidenceLevel: topSuggestion?.confidenceLevel,
      suggestedColumns: columnSuggestion.suggestions.map(s => ({
        columnName: s.dbColumn,
        similarityScore: s.similarityScore,
        isTypeCompatible: s.isTypeCompatible,
        confidenceLevel: s.confidenceLevel || 'Low'
      })),
      inferredDataType: columnSuggestion.inferredDataType,
      action,
      newColumnProposal,
      status
    };
  });
  
  return batchMappings;
}

/**
 * Suggests table mappings for Excel sheets based on similarity analysis
 * @param sheetNames - Array of sheet names from the Excel file
 * @param tableNames - Array of available database tables
 * @returns A record of sheet names to ranked table suggestions
 */
export function suggestTableMappings(
  sheetNames: string[],
  tableNames: string[]
): Record<string, RankedTableSuggestion[]> {
  const suggestions: Record<string, RankedTableSuggestion[]> = {};
  
  // Process each sheet
  sheetNames.forEach(sheetName => {
    const normalizedSheetName = normalizeForMatching(sheetName);
    const sheetSuggestions: RankedTableSuggestion[] = [];
    
    // Analyze each table as a potential match
    tableNames.forEach(tableName => {
      const normalizedTableName = normalizeForMatching(tableName);
      
      // Calculate name similarity
      const similarityScore = calculateSimilarity(normalizedSheetName, normalizedTableName);
      
      // Determine confidence level
      let confidenceLevel: 'High' | 'Medium' | 'Low';
      if (similarityScore >= 0.8) {
        confidenceLevel = 'High';
      } else if (similarityScore >= 0.5) {
        confidenceLevel = 'Medium';
      } else {
        confidenceLevel = 'Low';
      }
      
      // Only include suggestions with a minimum score
      if (similarityScore > 0.3) {
        sheetSuggestions.push({
          tableName,
          similarityScore,
          confidenceLevel
        });
      }
    });
    
    // Sort suggestions by score descending
    sheetSuggestions.sort((a, b) => b.similarityScore - a.similarityScore);
    
    // Store the suggestions for this sheet
    suggestions[sheetName] = sheetSuggestions;
  });
  
  return suggestions;
}

/**
 * Creates initial sheet processing states with table suggestions
 * @param sheetInfo - Information about the Excel sheets
 * @param tableSuggestions - Table mapping suggestions
 * @returns A record of sheet processing states
 */
export function createInitialSheetProcessingStates(
  sheetInfo: SheetInfo[],
  tableSuggestions: Record<string, RankedTableSuggestion[]>
): Record<string, SheetProcessingState> {
  const sheetStates: Record<string, SheetProcessingState> = {};
  
  sheetInfo.forEach(sheet => {
    const sheetName = sheet.name;
    const suggestions = tableSuggestions[sheetName] || [];
    const topSuggestion = suggestions.length > 0 ? suggestions[0] : null;
    
    // Create the sheet processing state
    sheetStates[sheetName] = {
      sheetName,
      headers: sheet.columns,
      sampleData: sheet.previewRows,
      selectedTable: topSuggestion && topSuggestion.confidenceLevel === 'High' ? 
        topSuggestion.tableName : null,
      tableConfidenceScore: topSuggestion?.similarityScore,
      tableSuggestions: suggestions,
      columnMappings: {}, // Will be populated later
      status: 'pending',
      rowCount: sheet.previewRows.length
    };
  });
  
  return sheetStates;
}