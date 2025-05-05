import {
  ColumnMapping,
  SheetInfo,
  ColumnType,
  DataEnrichmentConfig,
  TableColumn as TableColumnType,
  ColumnMappingSuggestions,
  RankedColumnSuggestion,
  NewColumnProposal,
  BatchColumnMapping,
  ColumnSuggestion
} from './types';
import {
  normalizeForMatching,
  inferTypeFromFieldName,
  normalizeFieldType,
  hasLeadingZeros,
  calculateSimilarity
} from './BatchImporterUtils';
import levenshtein from 'fast-levenshtein';

/**
 * Generate column mappings by finding matching columns between Excel sheet and database table.
 * @param sheetInfo Excel sheet metadata
 * @param tableInfo Database table metadata
 * @returns Generated column mappings
 */
/**
 * Generate column mappings between a sheet and a table
 * Handles both matching existing columns and creating new ones
 * @param sheetInfo Information about the Excel sheet
 * @param tableInfo Information about the database table
 * @param inferDataTypes If true, will try to infer data types from sample data and column names
 * @returns Record of column mappings
 */
export function generateMappingsFromMatches(
  sheetInfo: SheetInfo,
  tableInfo: any,
  inferDataTypes: boolean = true
): Record<string, ColumnMapping> {
  const mappings: Record<string, ColumnMapping> = {};
  
  // Track which database columns have already been mapped to prevent duplicates
  const mappedDbColumns = new Set<string>();
  
  // Single debug log at start
  console.debug('Generating mappings for:', sheetInfo?.name, 'to', tableInfo?.tableName || tableInfo?.name);
  
  if (!sheetInfo?.columns || !tableInfo?.columns) {
    console.warn('Missing columns data:', {
      sheetColumns: sheetInfo?.columns ? sheetInfo.columns.length : 'undefined',
      tableColumns: tableInfo?.columns ? tableInfo.columns.length : 'undefined'
    });
    return mappings;
  }
  
  // Helper function to get the column name regardless of property naming convention
  const getColumnName = (col: any): string => {
    // Extract the column name from various possible properties
    let columnName = '';
    if (col.columnName) columnName = col.columnName;
    else if (col.name) columnName = col.name;
    else if (col.column_name) columnName = col.column_name;
    else columnName = Object.values(col)[0] as string; // Fallback to first property
    
    // Handle potential null/undefined values
    if (!columnName) {
      console.warn('Column with no name found:', col);
      return 'unknown_column';
    }
    
    return columnName;
  };
  
  // Helper function to get column data type regardless of property naming
  const getDataType = (col: any): string => {
    if (col.dataType) return col.dataType;
    if (col.data_type) return col.data_type;
    if (col.type) return col.type;
    return 'string'; // Default
  };
  
  // Removed detailed column structure logging
  
  // Process each Excel column
  sheetInfo.columns.forEach(excelCol => {
    // Add debug logging for troubleshooting
    const normalizedExcelCol = normalizeForMatching(excelCol);
    console.debug(`Processing Excel column "${excelCol}" (normalized: "${normalizedExcelCol}")`);
    
    // Skip empty column names
    if (!normalizedExcelCol) {
      console.debug(`Skipping empty column name: "${excelCol}"`);
      return;
    }
    
    // Find best match in database columns
    let bestMatch = '';
    let bestMatchScore = 0;
    let bestMatchDbCol: any = null;
    
    tableInfo.columns.forEach((dbCol: any) => {
      // Skip id, created_at, updated_at
      const dbColName = getColumnName(dbCol);
      if (['id', 'created_at', 'updated_at'].includes(dbColName)) {
        return;
      }
      
      const normalizedDbCol = normalizeForMatching(dbColName);
      
      // Special handling for spaces/hyphens/underscores as synonyms
      const excelWithSpaces = excelCol.toLowerCase().replace(/[\-_]/g, ' ');
      const excelWithHyphens = excelCol.toLowerCase().replace(/[\s_]/g, '-');
      const excelWithUnderscores = excelCol.toLowerCase().replace(/[\s\-]/g, '_');
      
      const dbWithSpaces = dbColName.toLowerCase().replace(/[\-_]/g, ' ');
      const dbWithHyphens = dbColName.toLowerCase().replace(/[\s_]/g, '-');
      const dbWithUnderscores = dbColName.toLowerCase().replace(/[\s\-]/g, '_');
      
      // Check if any combination matches with a perfect score
      if (excelWithSpaces === dbWithSpaces || 
          excelWithHyphens === dbWithHyphens || 
          excelWithUnderscores === dbWithUnderscores) {
        bestMatchScore = 1;
        bestMatch = dbColName;
        bestMatchDbCol = dbCol;
        return; // Found a perfect match, no need to check further
      }
      
      // Check if normalized Excel column contains normalized DB column name or vice versa
      if (normalizedExcelCol.includes(normalizedDbCol) || normalizedDbCol.includes(normalizedExcelCol)) {
        // Calculate similarity score
        const score = Math.min(normalizedExcelCol.length, normalizedDbCol.length) / 
                     Math.max(normalizedExcelCol.length, normalizedDbCol.length);
                     
        if (score > bestMatchScore) {
          bestMatchScore = score;
          bestMatch = dbColName;
          bestMatchDbCol = dbCol;
        }
      }
    });
    
    // Get sample values for this column to analyze
    const sampleValues = sheetInfo.previewRows
      ? sheetInfo.previewRows.map(row => row[excelCol]).filter(v => v !== undefined && v !== null)
      : [];
      
    // Flag to identify if we have actual data to analyze
    const hasSampleData = sampleValues.length > 0;
    
    // Check for values with leading zeros that should be preserved as strings
    const shouldBeString = hasLeadingZeros && hasLeadingZeros(sampleValues);
    
    // Determine type based on various sources with priority
    let type: ColumnType = 'string';
    
    // Get the original field name type before normalization
    let originalFieldNameType: 'string' | 'number' | 'boolean' | 'date' | 'amount' | 'rate' | 'id' | null = null;
    if (inferDataTypes && excelCol) {
      try {
        originalFieldNameType = inferTypeFromFieldName(excelCol);
      } catch (e) {
        // Silent error handling
      }
    }
    
    // Simplified Type Determination: Prioritize pre-inferred type from sheetInfo
    if (shouldBeString) {
      // Force string type for fields with leading zeros
      type = 'string';
      console.debug(`[generateMappingsFromMatches] Type for "${excelCol}": Forced 'string' due to leading zeros.`);
    } else if (inferDataTypes) {
      // Fallback to field name inference if type wasn't pre-inferred
      try {
        if (inferTypeFromFieldName && normalizeFieldType) {
          const inferredType = normalizeFieldType(inferTypeFromFieldName(excelCol));
          type = inferredType as ColumnType;
          console.debug(`[generateMappingsFromMatches] Type for "${excelCol}": Using fallback field name inference '${type}'.`);
        } else {
           console.warn(`[generateMappingsFromMatches] Type for "${excelCol}": Could not infer type, defaulting to 'string'.`);
           type = 'string'; // Default if inference functions aren't available
        }
      } catch (e) {
         console.warn(`[generateMappingsFromMatches] Type for "${excelCol}": Error during fallback inference, defaulting to 'string'.`, e);
         type = 'string'; // Default on error
      }
    } else {
        console.debug(`[generateMappingsFromMatches] Type for "${excelCol}": Type inference disabled, defaulting to 'string'.`);
        type = 'string'; // Default if inference is disabled
    }
    
    // Removed per-column logging
    
    // Always map all columns - either with a matched DB column or just as-is
    if (bestMatchScore > 0.9 && bestMatch) {
      // We found a good DB column match with high confidence (>90%)
      // Check if this database column has already been mapped to prevent duplicates
      if (!mappedDbColumns.has(bestMatch)) {
        mappings[excelCol] = {
          excelColumn: excelCol,
          dbColumn: bestMatch,
          type
        };
        // Add to the set of mapped columns to prevent duplicates
        mappedDbColumns.add(bestMatch);
      } else {
        // This database column is already mapped, use the Excel column name instead
        console.debug(`Column "${bestMatch}" already mapped, using Excel column name for "${excelCol}" instead`);
        mappings[excelCol] = {
          excelColumn: excelCol,
          dbColumn: excelCol.toLowerCase().replace(/\s+/g, '_'),
          type
        };
      }
    } else {
      // No match found, but still add column with inferred type
      // Use the Excel column name as the DB column name (will be created if needed)
      mappings[excelCol] = {
        excelColumn: excelCol,
        dbColumn: excelCol.toLowerCase().replace(/\s+/g, '_'),
        type
      };
    }
  });
  
  // Single summary log at the end
  console.debug(`Generated ${Object.keys(mappings).length} mappings out of ${sheetInfo.columns.length} columns`);
  return mappings;
}

/**
 * Generates suggested column mappings between Excel headers and database columns.
 * Uses fuzzy name matching and type inference.
 * @param excelHeaders - Array of headers from the Excel sheet.
 * @param dbColumns - Array of available database columns.
 * @param sampleData - Sample data from the Excel sheet for type inference.
 * @returns A record where keys are Excel headers and values are objects containing suggestions, best match, and inferred type.
 */
/**
 * Enhanced column mapping suggestion function with confidence scoring
 * @param excelHeaders - Array of headers from the Excel sheet
 * @param dbColumns - Array of available database columns
 * @param sampleData - Sample data from the Excel sheet for type inference and pattern analysis
 * @returns A record of column mapping suggestions with confidence scores
 */
export function suggestColumnMappings(
  excelHeaders: string[],
  dbColumns: TableColumnType[],
  sampleData: Record<string, any>[]
): Record<string, ColumnMappingSuggestions> {
  const suggestions: Record<string, ColumnMappingSuggestions> = {};
  
  // Track which database columns have already been mapped to prevent duplicates
  const mappedDbColumns = new Set<string>();

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
    const inferredExcelType = inferDataTypeFromSamples(headerSampleValues, excelHeader);

    // Array to hold ranked suggestions for this column
    const columnSuggestions: RankedColumnSuggestion[] = [];

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
      if (totalScore >= 0.9) {
        confidenceLevel = 'High';
      } else if (totalScore >= 0.5) {
        confidenceLevel = 'Medium';
      } else {
        confidenceLevel = 'Low';
      }
      
      // Only include suggestions with a minimum score
      if (totalScore > 0.3) {
        columnSuggestions.push({
          columnName: dbCol.name,
          confidenceScore: totalScore,
          isTypeCompatible: typeCompatibility > 0,
          confidenceLevel
        });
      }
    });
    
    // Sort suggestions by score descending
    columnSuggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);
    
    // Filter out suggestions for columns that have already been mapped
    // and mark columns that would be duplicates
    const convertedSuggestions: ColumnSuggestion[] = columnSuggestions
      .map(suggestion => {
        const isDuplicate = mappedDbColumns.has(suggestion.columnName);
        return {
          dbColumn: suggestion.columnName,
          confidenceScore: isDuplicate ? suggestion.confidenceScore * 0.5 : suggestion.confidenceScore, // Reduce score for duplicates
          isTypeCompatible: suggestion.isTypeCompatible,
          confidenceLevel: isDuplicate ? 'Low' : suggestion.confidenceLevel, // Lower confidence for duplicates
          isCreateNewField: isDuplicate, // Suggest creating a new field for duplicates
          isDuplicate: isDuplicate // Add flag to indicate this is a duplicate
        };
      });
    
    // If the top suggestion has high confidence and is not a duplicate, mark it as mapped
    if (convertedSuggestions.length > 0 &&
        convertedSuggestions[0].confidenceLevel === 'High' &&
        !convertedSuggestions[0].isDuplicate) {
      mappedDbColumns.add(convertedSuggestions[0].dbColumn);
    }

    // Create the final suggestion object for this column
    suggestions[excelHeader] = {
      sourceColumn: excelHeader,
      suggestions: convertedSuggestions,
      inferredDataType: inferredExcelType
    };
  });

  return suggestions;
}

/**
 * Analyzes content patterns in sample data to improve matching confidence
 * @param sampleValues - Sample values from the Excel column
 * @param dbColumnName - Database column name to compare against
 * @param dbColumnType - Database column type
 * @returns A score from 0.0 to 1.0 representing pattern match confidence
 */
function analyzeContentPatterns(
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
 * Normalize column name for matching by removing spaces, underscores, and making lowercase.
 * @param columnName Column name to normalize
 * @returns Normalized column name
 */
export function normalizeColumnName(columnName: string): string {
  return columnName.toLowerCase().replace(/[\s_-]/g, '');
}

/**
 * Infer column type from database column metadata.
 * @param dbColumn Database column metadata
 * @returns Inferred column type
 */
export function inferTypeFromDBColumn(dbColumn: any): ColumnType {
  // Get dataType property with fallbacks for different naming conventions
  const getDataType = (col: any): string => {
    if (col.dataType) return col.dataType;
    if (col.data_type) return col.data_type;
    if (col.type) return col.type;
    return 'string'; // Default
  };
  
  const dataType = getDataType(dbColumn).toLowerCase();
  console.log('Inferring type from:', dataType);
  
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
 * Determine whether a column is likely to contain numerical values.
 * @param sampleValues Array of sample values
 * @returns True if column contains primarily numerical values
 */
export function isLikelyNumeric(sampleValues: any[]): boolean {
  if (sampleValues.length === 0) return false;
  
  const numericCount = sampleValues.filter(val => 
    !isNaN(Number(val)) && val !== null && val !== ''
  ).length;
  
  return numericCount / sampleValues.length > 0.7; // 70% threshold
}

/**
 * Infers the data type of a column based on an array of sample values.
 * Prioritizes more specific types (boolean, date, number) before defaulting to string.
 * @param sampleValues - An array of sample values from the column.
 * @returns The inferred ColumnType ('string', 'number', 'boolean', 'date') or null if no data.
 */
/**
 * Enhanced data type inference function that prioritizes sample data but also considers field names
 * Implements the following requirements:
 * - Prioritizes sample data for type inference
 * - Falls back to field names if sample data is unavailable
 * - Uses a combination of both sample data and field names for inference
 * - Treats numerical data with leading zeros as text
 * - If a column contains a mix of blank values and data of a specific type, uses the non-blank data
 *
 * @param sampleValues - An array of sample values from the column
 * @param fieldName - Optional field name to use for inference when sample data is insufficient
 * @returns The inferred ColumnType ('string', 'number', 'boolean', 'date') or null if no data
 */
/**
 * Simple and robust data type inference function
 * Follows a clear priority order:
 * 1. For empty fields, use field name analysis
 * 2. For fields with data, analyze the data first
 * 3. For mixed data, use field name as a hint
 * 
 * @param sampleValues - Sample values from the column
 * @param fieldName - Field name to use for inference when sample data is insufficient
 * @returns The inferred column type
 */
export function inferDataTypeFromSamplesNew(sampleValues: any[], fieldName?: string): ColumnType | null {
  // STEP 1: If we have no sample data, use field name inference
  if (!sampleValues || sampleValues.length === 0) {
    if (fieldName) {
      // Check for date indicators in field name
      if (/date|dt|day|month|year|time|created|modified|updated|birth|dob|discharge|dismissal|filed|bankruptcy/i.test(fieldName)) {
        console.debug(`Empty field ${fieldName} has date indicator in name, treating as date`);
        return 'date';
      }
      
      // Check for number indicators in field name
      if (/count|number|qty|amount|balance|price|fee|cost|rate|percent|ratio|score|fico|units/i.test(fieldName)) {
        console.debug(`Empty field ${fieldName} has number indicator in name, treating as number`);
        return 'number';
      }
      
      // Check for boolean indicators in field name
      if (/flag|indicator|is|has|required|enabled|active|status|escrowed|forced|claim/i.test(fieldName)) {
        console.debug(`Empty field ${fieldName} has boolean indicator in name, treating as boolean`);
        return 'boolean';
      }
      
      // Fall back to general field name inference
      try {
        const nameBasedType = normalizeFieldType(inferTypeFromFieldName(fieldName));
        console.debug(`No sample data for ${fieldName}, using name-based type: ${nameBasedType}`);
        return nameBasedType as ColumnType;
      } catch (e) {
        console.debug(`Failed to infer type from field name ${fieldName}:`, e);
        return 'string'; // Default to string if inference fails
      }
    }
    return 'string'; // Default to string if no field name
  }

  // Filter out null/empty values
  const nonNullValues = sampleValues.filter(val => val !== null && val !== undefined && val !== '');
  
  // If all values are null/empty, use field name inference (same as above)
  if (nonNullValues.length === 0) {
    if (fieldName) {
      // Check for date indicators in field name
      if (/date|dt|day|month|year|time|created|modified|updated|birth|dob|discharge|dismissal|filed|bankruptcy/i.test(fieldName)) {
        console.debug(`Empty field ${fieldName} has date indicator in name, treating as date`);
        return 'date';
      }
      
      // Check for number indicators in field name
      if (/count|number|qty|amount|balance|price|fee|cost|rate|percent|ratio|score|fico|units/i.test(fieldName)) {
        console.debug(`Empty field ${fieldName} has number indicator in name, treating as number`);
        return 'number';
      }
      
      // Check for boolean indicators in field name
      if (/flag|indicator|is|has|required|enabled|active|status|escrowed|forced|claim/i.test(fieldName)) {
        console.debug(`Empty field ${fieldName} has boolean indicator in name, treating as boolean`);
        return 'boolean';
      }
      
      // Fall back to general field name inference
      try {
        const nameBasedType = normalizeFieldType(inferTypeFromFieldName(fieldName));
        console.debug(`Only null values for ${fieldName}, using name-based type: ${nameBasedType}`);
        return nameBasedType as ColumnType;
      } catch (e) {
        console.debug(`Failed to infer type from field name ${fieldName}:`, e);
        return 'string'; // Default to string if inference fails
      }
    }
    return 'string'; // Default to string if no field name
  }

  // STEP 2: Check for values with leading zeros - indicates string
  if (hasLeadingZeros && hasLeadingZeros(nonNullValues)) {
    console.debug(`Field ${fieldName || 'unknown'} has leading zeros, treating as string`);
    return 'string';
  }

  // STEP 3: Check for boolean values
  const booleanValues = ['true', 'false', 'yes', 'no', 'y', 'n', 't', 'f', '1', '0'];
  const booleanCount = nonNullValues.filter(val => {
    if (typeof val === 'boolean') return true;
    if (typeof val === 'string' && booleanValues.includes(val.toLowerCase().trim())) return true;
    if (typeof val === 'number' && (val === 1 || val === 0)) return true;
    return false;
  }).length;

  if (booleanCount === nonNullValues.length) {
    console.debug(`Field ${fieldName || 'unknown'} contains only boolean values`);
    return 'boolean';
  }

  // STEP 4: Check for date values
  const dateCount = nonNullValues.filter(val => {
    // Check if it's a Date object
    if (val instanceof Date) return true;
    
    // Check for date strings
    if (typeof val === 'string') {
      // Try to parse as date
      const parsedDate = new Date(val);
      if (!isNaN(parsedDate.getTime())) {
        // Validate it's a reasonable date (not just a number)
        const dateStr = val.trim();
        return dateStr.includes('-') || dateStr.includes('/') || dateStr.includes('.') || 
               dateStr.includes(' ') || /^\d{8}$/.test(dateStr);
      }
    }
    
    return false;
  }).length;

  if (dateCount === nonNullValues.length) {
    console.debug(`Field ${fieldName || 'unknown'} contains only date values`);
    return 'date';
  }

  // STEP 5: Check for numeric values
  const numericCount = nonNullValues.filter(val => {
    if (typeof val === 'number') return true;
    
    if (typeof val === 'string') {
      // Remove currency symbols, commas, percent signs
      const cleanedVal = val.replace(/[$,€£%\s]/g, '').trim();
      // Check if it's a valid number
      return !isNaN(Number(cleanedVal)) && cleanedVal.length > 0;
    }
    
    return false;
  }).length;

  if (numericCount === nonNullValues.length) {
    console.debug(`Field ${fieldName || 'unknown'} contains only numeric values`);
    return 'number';
  }

  // STEP 6: If we have mixed types, check if field name strongly indicates a type
  if (fieldName) {
    // Check for date indicators in field name
    if (/date|dt|day|month|year|time|created|modified|updated|birth|dob|discharge|dismissal|filed|bankruptcy/i.test(fieldName)) {
      console.debug(`Field ${fieldName} has date indicator in name, treating as date`);
      return 'date';
    }
    
    // Check for number indicators in field name
    if (/count|number|qty|amount|balance|price|fee|cost|rate|percent|ratio|score|fico|units/i.test(fieldName)) {
      console.debug(`Field ${fieldName} has number indicator in name, treating as number`);
      return 'number';
    }
    
    // Check for boolean indicators in field name
    if (/flag|indicator|is|has|required|enabled|active|status|escrowed|forced|claim/i.test(fieldName)) {
      console.debug(`Field ${fieldName} has boolean indicator in name, treating as boolean`);
      return 'boolean';
    }
  }

  // STEP 7: Default to string for mixed data
  console.debug(`Field ${fieldName || 'unknown'} has mixed types, defaulting to string`);
  return 'string';
}
/**
 * Enhanced data type inference function with improved prioritization and pattern recognition
 * Addresses specific issues:
 * 1. Empty fields with date-related names are properly identified as dates
 * 2. Numeric values are correctly differentiated from dates
 * 3. Boolean values (TRUE/FALSE) are properly detected
 * 4. Field name analysis is prioritized for empty fields
 *
 * @param sampleValues - An array of sample values from the column
 * @param fieldName - Optional field name to use for inference when sample data is insufficient
 * @returns The inferred ColumnType ('string', 'number', 'boolean', 'date') or null if no data
 */
import { inferDataType } from './dataTypeInference';

/**
 * Simplified and robust data type inference function
 * Handles common data formats including text-formatted numbers and dates in Excel
 *
 * @param sampleValues - Sample values from the column
 * @param fieldName - Field name to use for inference when sample data is insufficient
 * @returns The inferred column type
 */
export function inferDataTypeFromSamples(sampleValues: any[], fieldName?: string): ColumnType | null {
  // Use the new implementation from dataTypeInference.ts
  return inferDataType(sampleValues, fieldName);
}

/**
 * Maps a ColumnType to an appropriate SQL data type
 * @param columnType The inferred column type
 * @returns SQL data type string
 */
export function mapColumnTypeToSql(columnType: ColumnType | null | undefined): string {
  if (!columnType) return 'TEXT';
  
  switch (columnType) {
    case 'number':
      return 'NUMERIC';
    case 'boolean':
      return 'BOOLEAN';
    case 'date':
      return 'TIMESTAMP WITH TIME ZONE';
    case 'string':
    default:
      return 'TEXT';
  }
}
/**
 * Improve column mappings by analyzing sample data.
 * @param mappings Existing column mappings
 * @param sheetInfo Excel sheet metadata
 * @param exampleData Sample data from Excel sheet
 * @returns Improved column mappings
 */
export function improveMappingsWithSampleData(
  mappings: Record<string, ColumnMapping>,
  sheetInfo: SheetInfo,
  exampleData: Record<string, any[]>
): Record<string, ColumnMapping> {
  const improvedMappings = { ...mappings };
  
  // Get sample data
  const sheetSamples = exampleData[sheetInfo.name] || [];
  
  Object.keys(improvedMappings).forEach(excelCol => {
    const mapping = improvedMappings[excelCol];
    
    // Skip if mapping already has a specific type
    if (mapping.type !== 'string') return;
    
    // Get sample values for this column
    const sampleValues = sheetSamples
      .map(row => row[excelCol])
      .filter(val => val !== undefined && val !== null);
    
    // Check if values look like numbers
    if (isLikelyNumeric(sampleValues)) {
      improvedMappings[excelCol] = {
        ...mapping,
        type: 'number'
      };
    }
    
    // Check if values look like dates
    const dateCount = sampleValues.filter(val => 
      val instanceof Date || 
      (typeof val === 'string' && !isNaN(Date.parse(val)))
    ).length;
    
    if (dateCount / sampleValues.length > 0.7) {
      improvedMappings[excelCol] = {
        ...mapping,
        type: 'date'
      };
    }
    
    // Check if values look like booleans
    const booleanValues = ['true', 'false', 'yes', 'no', '0', '1'];
    const boolCount = sampleValues.filter(val => 
      typeof val === 'boolean' || 
      (typeof val === 'string' && booleanValues.includes(val.toLowerCase()))
    ).length;
    
    if (boolCount / sampleValues.length > 0.7) {
      improvedMappings[excelCol] = {
        ...mapping,
        type: 'boolean'
      };
    }
  });
  
  return improvedMappings;
}

/**
 * Apply data enrichment to a set of data based on column mappings
 * @param data - Array of data objects to enrich
 * @param mappings - Column mappings with enrichment configurations
 * @returns Enriched data
 */
export async function applyDataEnrichment(
  data: Record<string, any>[],
  mappings: Record<string, ColumnMapping>
): Promise<Record<string, any>[]> {
  if (!data.length) return data;
  
  const enrichedData = [...data];
  const columnsWithEnrichment = Object.values(mappings)
    .filter(mapping => mapping.enrichment && mapping.enrichment.source);
  
  if (!columnsWithEnrichment.length) return data;
  
  // Process each enrichment configuration
  for (const mapping of columnsWithEnrichment) {
    const { dbColumn, enrichment } = mapping;
    
    if (!enrichment) continue;
    
    const { source, method, parameters, fallbackValue } = enrichment;
    
    try {
      // Apply enrichment based on source type
      switch (source) {
        case 'calculation':
          applyCalculationEnrichment(enrichedData, dbColumn, method, parameters);
          break;
        
        case 'lookup':
          await applyLookupEnrichment(enrichedData, dbColumn, method, parameters);
          break;
          
        case 'api':
          await applyApiEnrichment(enrichedData, dbColumn, method, parameters);
          break;
          
        case 'transform':
          applyTransformEnrichment(enrichedData, dbColumn, method, parameters);
          break;
          
        default:
          console.warn(`Unknown enrichment source: ${source}`);
      }
    } catch (error) {
      console.error(`Error applying enrichment to ${dbColumn}:`, error);
      
      // Apply fallback value if provided
      if (fallbackValue !== undefined) {
        enrichedData.forEach(row => {
          row[dbColumn] = fallbackValue;
        });
      }
    }
  }
  
  return enrichedData;
}

/**
 * Apply calculation-based enrichment
 * @param data - Data to enrich
 * @param targetColumn - Column to store result
 * @param method - Calculation method
 * @param parameters - Calculation parameters
 */
function applyCalculationEnrichment(
  data: Record<string, any>[],
  targetColumn: string,
  method?: string,
  parameters?: Record<string, any>
): void {
  if (!method || !parameters) return;
  
  const { sourceColumns, operation } = parameters;
  
  if (!sourceColumns || !operation) return;
  
  data.forEach(row => {
    try {
      switch (operation) {
        case 'sum':
          row[targetColumn] = sourceColumns.reduce((sum: number, col: string) => { // Type already correct, just confirming context
            const value = Number(row[col]) || 0;
            return sum + value;
          }, 0);
          break;
          
        case 'multiply':
          row[targetColumn] = sourceColumns.reduce((product: number, col: string) => { // Type already correct, just confirming context
            const value = Number(row[col]) || 0;
            return product * value;
          }, 1);
          break;
          
        case 'divide':
          if (sourceColumns.length === 2) {
            const numerator = Number(row[sourceColumns[0]]) || 0;
            const denominator = Number(row[sourceColumns[1]]) || 1;
            row[targetColumn] = denominator !== 0 ? numerator / denominator : 0;
          }
          break;
          
        case 'subtract':
          if (sourceColumns.length === 2) {
            const minuend = Number(row[sourceColumns[0]]) || 0;
            const subtrahend = Number(row[sourceColumns[1]]) || 0;
            row[targetColumn] = minuend - subtrahend;
          }
          break;
          
        case 'concat':
          row[targetColumn] = sourceColumns.map((col: string) => row[col] || '').join(parameters.separator || ''); // Add type string for col
          break;

        default:
          console.warn(`Unknown calculation operation: ${operation}`);
      }
    } catch (error) {
      console.error(`Error in calculation enrichment for ${targetColumn}:`, error);
    }
  });
}

/**
 * Apply lookup-based enrichment
 * @param data - Data to enrich
 * @param targetColumn - Column to store result
 * @param method - Lookup method
 * @param parameters - Lookup parameters
 */
async function applyLookupEnrichment(
  data: Record<string, any>[],
  targetColumn: string,
  method?: string,
  parameters?: Record<string, any>
): Promise<void> {
  if (!method || !parameters) return;
  
  const { lookupTable, lookupColumn, valueColumn, sourceColumn } = parameters;
  
  if (!lookupTable || !lookupColumn || !valueColumn || !sourceColumn) return;
  
  try {
    // Get unique values to look up
    const uniqueValues = new Set<string>();
    data.forEach(row => {
      if (row[sourceColumn] !== undefined && row[sourceColumn] !== null) {
        uniqueValues.add(String(row[sourceColumn]));
      }
    });
    
    if (uniqueValues.size === 0) return;
    
    // Build lookup query
    const valuesArray = Array.from(uniqueValues).map(v => `'${v}'`).join(',');
    const query = `
      SELECT "${lookupColumn}", "${valueColumn}"
      FROM "${lookupTable}"
      WHERE "${lookupColumn}" IN (${valuesArray})
    `;
    
    // Execute query
    const { executeSql } = await import('../../utility/supabaseMcp');
    const results = await executeSql(query); // Add type ExecuteSqlResult

    // Check for errors or empty data array
    if (results.error || !results.data || !results.data.length) {
        if(results.error) console.error(`Lookup query failed: ${results.error.message}`);
        return;
    }

    // Build lookup map
    const lookupMap = new Map<string, any>();
    results.data.forEach((result: any) => { // Iterate over results.data and add type any for result
      lookupMap.set(String(result[lookupColumn]), result[valueColumn]);
    });
    
    // Apply lookup values
    data.forEach(row => {
      if (row[sourceColumn] !== undefined && row[sourceColumn] !== null) {
        const lookupValue = String(row[sourceColumn]);
        if (lookupMap.has(lookupValue)) {
          row[targetColumn] = lookupMap.get(lookupValue);
        }
      }
    });
  } catch (error) {
    console.error(`Error in lookup enrichment for ${targetColumn}:`, error);
  }
}

/**
 * Apply API-based enrichment
 * @param data - Data to enrich
 * @param targetColumn - Column to store result
 * @param method - API method
 * @param parameters - API parameters
 */
async function applyApiEnrichment(
  data: Record<string, any>[],
  targetColumn: string,
  method?: string,
  parameters?: Record<string, any>
): Promise<void> {
  if (!method || !parameters) return;
  
  const { endpoint, sourceColumn, responseField, batchSize = 10 } = parameters;
  
  if (!endpoint || !sourceColumn || !responseField) return;
  
  try {
    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const requests = batch.map(row => {
        if (row[sourceColumn] === undefined || row[sourceColumn] === null) {
          return Promise.resolve(null);
        }
        
        const url = endpoint.replace('{value}', encodeURIComponent(row[sourceColumn]));
        return fetch(url)
          .then(response => response.json())
          .then(result => ({ row, result }))
          .catch(error => {
            console.error(`API error for ${row[sourceColumn]}:`, error);
            return { row, result: null };
          });
      });
      
      const results = await Promise.all(requests);
      
      // Apply results
      results.forEach(item => {
        if (item && item.row && item.result) {
          // Extract value using dot notation (e.g., "data.results[0].value")
          let value = item.result;
          const parts = responseField.split('.');
          
          for (const part of parts) {
            if (part.includes('[') && part.includes(']')) {
              // Handle array access
              const arrayName = part.substring(0, part.indexOf('['));
              const index = parseInt(part.substring(part.indexOf('[') + 1, part.indexOf(']')), 10);
              
              if (value[arrayName] && Array.isArray(value[arrayName]) && value[arrayName][index] !== undefined) {
                value = value[arrayName][index];
              } else {
                value = null;
                break;
              }
            } else if (value[part] !== undefined) {
              value = value[part];
            } else {
              value = null;
              break;
            }
          }
          
          item.row[targetColumn] = value;
        }
      });
      
      // Avoid rate limiting
      if (i + batchSize < data.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error(`Error in API enrichment for ${targetColumn}:`, error);
  }
}

/**
 * Apply transformation-based enrichment
 * @param data - Data to enrich
 * @param targetColumn - Column to store result
 * @param method - Transform method
 * @param parameters - Transform parameters
 */
function applyTransformEnrichment(
  data: Record<string, any>[],
  targetColumn: string,
  method?: string,
  parameters?: Record<string, any>
): void {
  if (!method || !parameters) return;
  
  const { sourceColumn } = parameters;
  
  if (!sourceColumn) return;
  
  data.forEach(row => {
    try {
      const sourceValue = row[sourceColumn];
      
      if (sourceValue === undefined || sourceValue === null) {
        return;
      }
      
      switch (method) {
        case 'uppercase':
          row[targetColumn] = String(sourceValue).toUpperCase();
          break;
          
        case 'lowercase':
          row[targetColumn] = String(sourceValue).toLowerCase();
          break;
          
        case 'capitalize':
          row[targetColumn] = String(sourceValue).replace(/\b\w/g, c => c.toUpperCase());
          break;
          
        case 'trim':
          row[targetColumn] = String(sourceValue).trim();
          break;
          
        case 'round':
          row[targetColumn] = Math.round(Number(sourceValue));
          break;
          
        case 'floor':
          row[targetColumn] = Math.floor(Number(sourceValue));
          break;
          
        case 'ceil':
          row[targetColumn] = Math.ceil(Number(sourceValue));
          break;
          
        case 'formatDate':
          if (parameters.format) {
            const date = new Date(sourceValue);
            if (!isNaN(date.getTime())) {
              // Simple date formatting (for complex formatting, use a library)
              const options: Intl.DateTimeFormatOptions = {};
              
              if (parameters.format.includes('yyyy')) {
                options.year = 'numeric';
              } else if (parameters.format.includes('yy')) {
                options.year = '2-digit';
              }
              
              if (parameters.format.includes('MM')) {
                options.month = '2-digit';
              } else if (parameters.format.includes('MMM')) {
                options.month = 'short';
              } else if (parameters.format.includes('MMMM')) {
                options.month = 'long';
              }
              
              if (parameters.format.includes('dd')) {
                options.day = '2-digit';
              } else if (parameters.format.includes('d')) {
                options.day = 'numeric';
              }
              
              if (parameters.format.includes('HH') || parameters.format.includes('hh')) {
                options.hour = '2-digit';
              }
              
              if (parameters.format.includes('mm')) {
                options.minute = '2-digit';
              }
              
              if (parameters.format.includes('ss')) {
                options.second = '2-digit';
              }
              
              row[targetColumn] = new Intl.DateTimeFormat('en-US', options).format(date);
            }
          }
          break;
          
        default:
          console.warn(`Unknown transform method: ${method}`);
      }
    } catch (error) {
      console.error(`Error in transform enrichment for ${targetColumn}:`, error);
    }
  });
}
