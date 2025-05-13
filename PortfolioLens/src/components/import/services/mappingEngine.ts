/**
 * Pure Mapping Engine Module
 * 
 * Handles column mapping logic with no UI dependencies.
 * Core functionality for matching Excel columns to database fields.
 */

// Types for mapping engine
export interface MappingOptions {
  skipExactMatches?: boolean;
  confidenceThreshold?: number;
  caseSensitive?: boolean;
  batchSize?: number;
}

export interface ColumnInfo {
  originalName: string;
  originalIndex: number;
  inferredDataType?: string;
  sample?: unknown[];
}

export interface DbFieldInfo {
  name: string;
  type: string;
  description?: string;
  isRequired?: boolean;
}

export interface MappingResult {
  originalName: string;
  mappedName: string;
  dataType: string;
  confidence: number;
  needsReview: boolean;
  originalIndex: number;
  exactMatch: boolean;
  sample?: unknown[];
  inferredDataType?: string;
}

// Cache for normalized values
const normalizationCache = new Map<string, string>();
const dbNormalizationCache = new Map<string, string>();
const exactMatchCache = new Map<string, string>();

/**
 * Normalize a string for comparison by removing special chars and converting to lowercase
 * Cached for performance in bulk operations
 */
export const normalizeString = (str: string): string => {
  if (!str) return '';
  
  // Check cache first
  if (normalizationCache.has(str)) {
    return normalizationCache.get(str)!;
  }
  
  const normalized = str
    .toLowerCase()
    .replace(/[%#$@&*()+=\[\]{}|\\;:"<>?/~`]/g, ' ') // Replace special chars with spaces
    .replace(/[.,!'-]/g, '')                       // Remove punctuation completely
    .replace(/\s+/g, ' ')                         // Replace multiple spaces with single space
    .trim();
  
  // Cache the result
  normalizationCache.set(str, normalized);
  return normalized;
};

/**
 * Enhanced string normalization for matching
 * Strips out all non-alphanumeric characters and converts to lowercase
 */
export const normalizeForMatching = (str: string): string => {
  if (!str) return '';
  
  // Check cache first
  if (normalizationCache.has(`strict:${str}`)) {
    return normalizationCache.get(`strict:${str}`)!;
  }
  
  const normalized = str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
  
  // Cache the result
  normalizationCache.set(`strict:${str}`, normalized);
  return normalized;
};

/**
 * Normalize a column name for database use
 * Handles SQL-compatible naming
 */
export const normalizeForDb = (str: string): string => {
  if (!str) return '';
  
  // Check cache first
  if (dbNormalizationCache.has(str)) {
    return dbNormalizationCache.get(str)!;
  }
  
  let normalized = str
    .toLowerCase()
    .replace(/[^\w\s]/g, '_') // Replace special chars with underscore
    .replace(/\s+/g, '_')     // Replace spaces with underscore
    .replace(/_+/g, '_')      // Replace multiple underscores with single
    .trim()
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
  
  // Prefix numerics with col_ (required for PostgreSQL)
  if (/^\d/.test(normalized)) {
    normalized = 'col_' + normalized;
  }
  
  // Cache the result
  dbNormalizationCache.set(str, normalized);
  return normalized;
};

/**
 * Calculate string similarity between two strings (0-100%)
 * Implements several optimized heuristics for field name matching
 */
export const calculateSimilarity = (str1: string, str2: string): number => {
  if (!str1 && !str2) return 100;
  if (!str1 || !str2) return 0;

  // Check for direct match after aggressive normalization first
  const strictNorm1 = normalizeForMatching(str1);
  const strictNorm2 = normalizeForMatching(str2);

  // Exact match after normalization = 100%
  if (strictNorm1 === strictNorm2 && strictNorm1.length > 0) {
    return 100;
  }

  // Special case: empty normalized strings but non-empty originals
  if (strictNorm1 === '' && strictNorm2 === '' && str1 !== '' && str2 !== '') {
    return 90; // High match for special character only names
  }

  // Check for common Excel to DB name patterns
  if (normalizeForDb(str1).replace(/_/g, '') === normalizeForDb(str2).replace(/_/g, '')) {
    return 100; // These are essentially the same in database context
  }

  // Handle pluralization (loans vs loan)
  if (
    (strictNorm1 + 's' === strictNorm2) ||
    (strictNorm2 + 's' === strictNorm1) ||
    (strictNorm1.endsWith('s') && strictNorm1.slice(0, -1) === strictNorm2) ||
    (strictNorm2.endsWith('s') && strictNorm2.slice(0, -1) === strictNorm1)
  ) {
    return 95; // Pluralization differences are high confidence
  }

  // Handle substring containment (loanAmount vs amount)
  if (strictNorm1.includes(strictNorm2) || strictNorm2.includes(strictNorm1)) {
    // Calculate containment ratio based on length
    const containedStr = strictNorm1.length < strictNorm2.length ? strictNorm1 : strictNorm2;
    const containerStr = strictNorm1.length < strictNorm2.length ? strictNorm2 : strictNorm1;

    // Simple cases: one is fully contained in the other
    if (containerStr.startsWith(containedStr) || containerStr.endsWith(containedStr)) {
      // Beginning or end is a stronger match
      const ratio = containedStr.length / containerStr.length;
      return Math.min(90, Math.round(85 + (ratio * 10)));
    } else {
      // Middle containment is a bit weaker
      const ratio = containedStr.length / containerStr.length;
      return Math.min(85, Math.round(75 + (ratio * 15)));
    }
  }

  // For all other cases, use simplified edit distance (faster than Levenshtein)
  const normStr1 = normalizeString(str1);
  const normStr2 = normalizeString(str2);
  
  // Use simpler character-based similarity for performance
  const maxLength = Math.max(normStr1.length, normStr2.length);
  if (maxLength === 0) return 100;
  
  // Calculate character differences (simple but fast approach)
  let matchedChars = 0;
  const str1Chars = new Set(normStr1.split(''));
  const str2Chars = new Set(normStr2.split(''));
  
  str1Chars.forEach(char => {
    if (str2Chars.has(char)) matchedChars++;
  });
  
  const totalUniqueChars = new Set([...normStr1.split(''), ...normStr2.split('')]).size;
  const similarity = Math.round((matchedChars / totalUniqueChars) * 100);
  
  // Cap at 100%
  return Math.min(100, similarity);
};

/**
 * Find exact matches between sheet columns and database fields
 * Ultra-optimized for the fast path case
 */
export const findExactMatches = (
  sheetColumns: ColumnInfo[], 
  dbFields: DbFieldInfo[]
): Map<string, MappingResult> => {
  // Create lookup maps for each normalization method
  const fieldMaps = {
    exact: new Map<string, DbFieldInfo>(),
    normalized: new Map<string, DbFieldInfo>(),
    dbNormalized: new Map<string, DbFieldInfo>(),
  };
  
  // Populate field maps for fast lookups
  for (const field of dbFields) {
    // Original field name (exact match)
    fieldMaps.exact.set(field.name, field);
    
    // Normalized field name (case-insensitive alphanumeric)
    const normalizedName = normalizeForMatching(field.name);
    fieldMaps.normalized.set(normalizedName, field);
    
    // DB normalized name (SQL-compatible format)
    const dbNormalizedName = normalizeForDb(field.name);
    fieldMaps.dbNormalized.set(dbNormalizedName, field);
  }
  
  // Find exact matches for all columns
  const matches = new Map<string, MappingResult>();
  
  for (const column of sheetColumns) {
    const columnName = column.originalName;
    
    // Skip columns we've already processed
    if (exactMatchCache.has(columnName)) {
      const fieldName = exactMatchCache.get(columnName)!;
      const fieldInfo = dbFields.find(f => f.name === fieldName);
      
      if (fieldInfo) {
        matches.set(columnName, {
          originalName: columnName,
          mappedName: fieldInfo.name,
          dataType: fieldInfo.type,
          confidence: 100,
          needsReview: false,
          originalIndex: column.originalIndex,
          exactMatch: true,
          sample: column.sample,
          inferredDataType: column.inferredDataType
        });
        continue;
      }
    }
    
    // Try direct exact match first (fastest)
    let matchedField = fieldMaps.exact.get(columnName);
    
    // If no exact match, try normalized versions
    if (!matchedField) {
      const normalizedColumnName = normalizeForMatching(columnName);
      matchedField = fieldMaps.normalized.get(normalizedColumnName);
      
      // If still no match, try DB normalized version
      if (!matchedField) {
        const dbNormalizedColumnName = normalizeForDb(columnName);
        matchedField = fieldMaps.dbNormalized.get(dbNormalizedColumnName);
      }
    }
    
    // If we found an exact match through any normalization method
    if (matchedField) {
      matches.set(columnName, {
        originalName: columnName,
        mappedName: matchedField.name,
        dataType: matchedField.type,
        confidence: 100,
        needsReview: false,
        originalIndex: column.originalIndex,
        exactMatch: true,
        sample: column.sample,
        inferredDataType: column.inferredDataType
      });
      
      // Cache this match for future reference
      exactMatchCache.set(columnName, matchedField.name);
    }
  }
  
  return matches;
};

/**
 * Get best field match for a single column
 */
export const getBestFieldMatch = (
  columnName: string,
  dbFields: DbFieldInfo[],
  options: MappingOptions = {}
): { field: DbFieldInfo; score: number } | null => {
  // Early return for empty inputs
  if (!columnName || !dbFields.length) {
    return null;
  }
  
  let bestMatch: DbFieldInfo | null = null;
  let bestScore = 0;
  
  // Check each field for similarity
  for (const field of dbFields) {
    const similarity = calculateSimilarity(columnName, field.name);
    
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = field;
    }
  }
  
  if (bestMatch && bestScore >= (options.confidenceThreshold || 0)) {
    return { field: bestMatch, score: bestScore };
  }
  
  return null;
};

/**
 * Determine if a mapping needs manual review
 */
export const needsReview = (
  mapping: MappingResult, 
  dbFields: DbFieldInfo[]
): boolean => {
  // Skip exact matches - they never need review
  if (mapping.exactMatch || mapping.confidence === 100) {
    return false;
  }
  
  // Always review new field creation
  if (mapping.mappedName === '_create_new_') {
    return true;
  }
  
  // High confidence matches to existing DB fields don't need review
  if (mapping.confidence >= 95) {
    const matchedField = dbFields.find(field => field.name === mapping.mappedName);
    if (matchedField) {
      return false;
    }
  }
  
  // Default to requiring review for uncertain matches
  return true;
};

/**
 * Normalize a database type for consistent display and comparison
 */
export const normalizeDataType = (pgType: string): string => {
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
    return pgType;
  }
  
  // Default to text for any other types
  return 'text';
};

/**
 * Process similarity matching in batches to avoid blocking
 */
export async function batchProcessSimilarity(
  columns: ColumnInfo[],
  dbFields: DbFieldInfo[],
  options: MappingOptions = {},
  progressCallback?: (percent: number) => void
): Promise<Map<string, MappingResult>> {
  const batchSize = options.batchSize || 50;
  const totalColumns = columns.length;
  let processedCount = 0;
  
  // Start with exact matches for the fast path
  const exactMatches = findExactMatches(columns, dbFields);
  const results = new Map(exactMatches);
  
  // Skip columns that already have exact matches
  const columnsToProcess = columns.filter(
    col => !exactMatches.has(col.originalName)
  );
  
  // If all columns were exactly matched, return early
  if (columnsToProcess.length === 0) {
    if (progressCallback) progressCallback(100);
    return results;
  }
  
  // Process remaining columns in batches
  const totalBatches = Math.ceil(columnsToProcess.length / batchSize);
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * batchSize;
    const end = Math.min(start + batchSize, columnsToProcess.length);
    const batch = columnsToProcess.slice(start, end);
    
    // Process this batch
    await new Promise<void>(resolve => {
      // Use requestIdleCallback if available, setTimeout if not
      const scheduleNextBatch = window.requestIdleCallback || 
        ((fn) => setTimeout(fn, 0));
      
      scheduleNextBatch(() => {
        for (const column of batch) {
          // Skip if we already have an exact match
          if (results.has(column.originalName)) continue;
          
          // Find best match for this column
          const match = getBestFieldMatch(column.originalName, dbFields, options);
          
          if (match) {
            // Create mapping result
            const mappingResult: MappingResult = {
              originalName: column.originalName,
              mappedName: match.field.name,
              dataType: normalizeDataType(match.field.type),
              confidence: match.score,
              needsReview: match.score < 95, // Requires 95% confidence for auto-approval
              originalIndex: column.originalIndex,
              exactMatch: false,
              sample: column.sample,
              inferredDataType: column.inferredDataType
            };
            
            results.set(column.originalName, mappingResult);
          } else {
            // No match found, create a new field
            const normalizedName = normalizeForDb(column.originalName);
            const mappingResult: MappingResult = {
              originalName: column.originalName,
              mappedName: '_create_new_', // Special marker for new fields
              dataType: column.inferredDataType || 'text',
              confidence: 0,
              needsReview: true,
              originalIndex: column.originalIndex,
              exactMatch: false,
              sample: column.sample,
              inferredDataType: column.inferredDataType
            };
            
            results.set(column.originalName, mappingResult);
          }
        }
        
        // Update progress
        processedCount += batch.length;
        if (progressCallback) {
          progressCallback(Math.round((processedCount / totalColumns) * 100));
        }
        
        resolve();
      });
    });
  }
  
  return results;
}

/**
 * Generate column mappings (main entry point)
 * Creates a mapping from sheet column names to DB fields with confidence scores
 */
export async function generateColumnMappings(
  sheetColumns: ColumnInfo[],
  dbFields: DbFieldInfo[],
  options: MappingOptions = {},
  progressCallback?: (percent: number) => void
): Promise<MappingResult[]> {
  // Validate inputs
  if (!sheetColumns.length) {
    return [];
  }
  
  if (!dbFields.length) {
    // No DB fields, all columns become new fields
    return sheetColumns.map(col => ({
      originalName: col.originalName,
      mappedName: normalizeForDb(col.originalName),
      dataType: col.inferredDataType || 'text',
      confidence: 0,
      needsReview: true,
      originalIndex: col.originalIndex,
      exactMatch: false,
      sample: col.sample,
      inferredDataType: col.inferredDataType
    }));
  }
  
  try {
    // Process similarity matching in batches
    const mappingResults = await batchProcessSimilarity(
      sheetColumns,
      dbFields,
      options,
      progressCallback
    );
    
    // Convert map to array and finalize needsReview status
    const results = [...mappingResults.values()].map(mapping => ({
      ...mapping,
      needsReview: needsReview(mapping, dbFields)
    }));
    
    // Sort by original index
    results.sort((a, b) => a.originalIndex - b.originalIndex);
    
    return results;
  } catch (error) {
    console.error('Error generating column mappings:', error);
    throw error;
  }
}

/**
 * Clear all caches
 * Call this when switching files or when memory needs to be reclaimed
 */
export function clearMappingCaches(): void {
  normalizationCache.clear();
  dbNormalizationCache.clear();
  exactMatchCache.clear();
}