/**
 * Enhanced Web Worker for computing string similarity in background
 * Handles chunked processing of similarity calculations to avoid blocking
 */

// Define worker context
const ctx: Worker = self as any;

// Define chunk size for batched processing
const CHUNK_SIZE = 50;

// Caches for normalization operations
const normalizationCache = new Map<string, string>();
const dbNormalizationCache = new Map<string, string>();

/**
 * Normalize a string for comparison
 */
const normalizeString = (str: string): string => {
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
 */
const normalizeForMatching = (str: string): string => {
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
 * Normalize a column for database use
 */
const normalizeForDb = (str: string): string => {
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
  
  // Prefix numerics with col_ (simplified version without existing check)
  if (/^\d/.test(normalized)) {
    normalized = 'col_' + normalized;
  }
  
  // Cache the result
  dbNormalizationCache.set(str, normalized);
  return normalized;
};

/**
 * Calculate string similarity between two strings (0-100%)
 */
const calculateSimilarity = (str1: string, str2: string): number => {
  if (!str1 && !str2) return 100;
  if (!str1 || !str2) return 0;

  // Check for direct match first (cached normalization)
  const strictNorm1 = normalizeForMatching(str1);
  const strictNorm2 = normalizeForMatching(str2);

  // Fast path: Exact match after normalization
  if (strictNorm1 === strictNorm2 && strictNorm1.length > 0) {
    return 100;
  }

  // Special case: empty normalized strings but non-empty originals
  if (strictNorm1 === '' && strictNorm2 === '' && str1 !== '' && str2 !== '') {
    return 90; // High match for special character only names
  }

  // Check for common Excel to DB name patterns
  const dbNorm1 = normalizeForDb(str1);
  const dbNorm2 = normalizeForDb(str2);
  
  if (dbNorm1.replace(/_/g, '') === dbNorm2.replace(/_/g, '')) {
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
    // Calculate containment ratio
    const containedStr = strictNorm1.length < strictNorm2.length ? strictNorm1 : strictNorm2;
    const containerStr = strictNorm1.length < strictNorm2.length ? strictNorm2 : strictNorm1;

    // Check position (beginning/end vs middle)
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

  // For dissimilar strings, use character-based similarity
  const normStr1 = normalizeString(str1);
  const normStr2 = normalizeString(str2);
  
  // Early exit for obviously different strings
  if (normStr1.length > 0 && normStr2.length > 0 && normStr1[0] !== normStr2[0]) {
    return 15; // Very low similarity for strings with different first chars
  }
  
  // Calculate character overlap
  let matchedChars = 0;
  const str1Chars = new Set(normStr1.split(''));
  const str2Chars = new Set(normStr2.split(''));
  
  str1Chars.forEach(char => {
    if (str2Chars.has(char)) matchedChars++;
  });
  
  const totalUniqueChars = new Set([...normStr1, ...normStr2]).size;
  if (totalUniqueChars === 0) return 0;
  
  const similarity = Math.round((matchedChars / totalUniqueChars) * 100);
  return Math.min(100, similarity);
};

/**
 * Process similarity in batches with yielding
 */
async function processBatches(
  columns: string[],
  fields: string[],
  callback: (result: any) => void
): Promise<void> {
  // Pre-normalize fields for faster lookups
  const normalizedFields = fields.map(field => ({
    original: field,
    normalized: normalizeForMatching(field),
    normalizedDb: normalizeForDb(field)
  }));
  
  // Create field lookup maps for faster matching
  const fieldMap = new Map();
  normalizedFields.forEach(field => {
    fieldMap.set(field.original, field);
    fieldMap.set(field.normalized, field);
    fieldMap.set(field.normalizedDb, field);
  });
  
  // First check for exact matches
  const exactMatches: Record<string, { field: string; score: number }> = {};
  let exactMatchCount = 0;
  
  // Look for exact matches first (fast path)
  for (const column of columns) {
    // Try several normalization approaches for matching
    const normalizedColumn = normalizeForMatching(column);
    const normalizedDbColumn = normalizeForDb(column);
    
    // Check for exact match using any normalization
    let exactMatch = null;
    
    // Direct match - highest priority
    if (fieldMap.has(column)) {
      exactMatch = fieldMap.get(column);
    }
    // Normalized match - still very reliable
    else if (fieldMap.has(normalizedColumn)) {
      exactMatch = fieldMap.get(normalizedColumn);
    }
    // DB-normalized match - also reliable
    else if (fieldMap.has(normalizedDbColumn)) {
      exactMatch = fieldMap.get(normalizedDbColumn);
    }
    
    // If we found an exact match, add it to results
    if (exactMatch) {
      exactMatches[column] = {
        field: exactMatch.original,
        score: 100 // Exact matches always 100%
      };
      exactMatchCount++;
    }
  }
  
  // If all columns have exact matches, skip full calculation
  if (exactMatchCount === columns.length) {
    callback({
      type: 'no_calculation_needed',
      exactMatches
    });
    return;
  }
  
  // Build similarity matrix
  const similarityMatrix: Record<string, Record<string, number>> = {};
  const remainingColumns = columns.filter(col => !exactMatches[col]);
  const bestMatches = { ...exactMatches };
  
  // Process in batches of CHUNK_SIZE columns
  const batches = [];
  for (let i = 0; i < remainingColumns.length; i += CHUNK_SIZE) {
    batches.push(remainingColumns.slice(i, i + CHUNK_SIZE));
  }
  
  // Process each batch with yielding between batches
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    // Process this batch
    for (const column of batch) {
      similarityMatrix[column] = {};
      let bestScore = 0;
      let bestField = '';
      
      // Compare with each field
      for (const field of fields) {
        const similarity = calculateSimilarity(column, field);
        similarityMatrix[column][field] = similarity;
        
        // Track best match
        if (similarity > bestScore) {
          bestScore = similarity;
          bestField = field;
        }
      }
      
      // Store best match if found
      if (bestScore > 0) {
        bestMatches[column] = { field: bestField, score: bestScore };
      }
    }
    
    // Report progress
    const progress = Math.round(((batchIndex + 1) / batches.length) * 100);
    callback({
      type: 'progress',
      processed: (batchIndex + 1) * CHUNK_SIZE,
      total: remainingColumns.length,
      percent: progress
    });
    
    // Yield to allow UI updates between batches
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  
  // Return final results
  callback({
    type: 'best_matches_result',
    bestMatches,
    similarityMatrix
  });
}

/**
 * Handle worker messages
 */
ctx.addEventListener('message', (event) => {
  const { action, payload } = event.data;
  
  try {
    switch (action) {
      case 'find_best_matches': {
        const { columns, fields } = payload;
        
        // Handle empty inputs
        if (!columns.length || !fields.length) {
          ctx.postMessage({
            type: 'best_matches_result',
            bestMatches: {}
          });
          return;
        }
        
        // Process in batches with progress reporting
        processBatches(columns, fields, (result) => {
          ctx.postMessage(result);
        }).catch(error => {
          ctx.postMessage({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        });
        
        break;
      }
      
      case 'compute_similarity': {
        // Legacy compatibility - use batcher here too
        const { columns, fields } = payload;
        
        // Handle empty inputs
        if (!columns.length || !fields.length) {
          ctx.postMessage({
            type: 'similarity_result',
            similarityMatrix: {},
            computationTime: 0,
            columnCount: columns.length,
            fieldCount: fields.length
          });
          return;
        }
        
        // Process with the batch processor
        processBatches(columns, fields, (result) => {
          if (result.type === 'best_matches_result') {
            // Convert to legacy format
            ctx.postMessage({
              type: 'similarity_result',
              similarityMatrix: result.similarityMatrix || {},
              bestMatches: result.bestMatches || {},
              computationTime: 0, // Not tracking time in new implementation
              columnCount: columns.length,
              fieldCount: fields.length
            });
          } else if (result.type !== 'progress') {
            // Pass through other messages
            ctx.postMessage(result);
          }
        }).catch(error => {
          ctx.postMessage({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        });
        
        break;
      }
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});