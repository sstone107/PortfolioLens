/**
 * Enhanced Similarity Utilities
 * 
 * Optimized implementation for string similarity and column mapping,
 * including caching mechanisms and exact match fast paths.
 */

// Worker singleton pattern with lazy initialization
let similarityWorker: Worker | null = null;
let workerInUse = false;
let workerInitTime = 0;

/**
 * Get the similarity worker instance, creating it if needed
 * Includes automatic worker restart if it's been active for too long
 */
export const getSimilarityWorker = (): Worker => {
  const WORKER_LIFESPAN_MS = 600000; // 10 minutes
  const now = Date.now();
  
  // Check if worker has been running too long and should be restarted
  if (similarityWorker && (now - workerInitTime > WORKER_LIFESPAN_MS)) {
    console.log('Terminating long-running worker to prevent memory leaks');
    similarityWorker.terminate();
    similarityWorker = null;
  }
  
  // Create new worker if needed
  if (!similarityWorker) {
    similarityWorker = new Worker(
      new URL('../workers/similarityCalculator.worker.ts', import.meta.url), 
      { type: 'module' }
    );
    workerInitTime = now;
  }
  
  return similarityWorker;
};

// Types
export type SimilarityMatrix = Record<string, Record<string, number>>;
export type BestMatches = Record<string, { field: string; score: number }>;

// Strong caching for similarity results
const similarityCache = new Map<string, number>();
const bestMatchCache = new Map<string, { column: string, fields: string[], result: BestMatches }>();

/**
 * Creates a unique cache key for similarity caching
 */
const createCacheKey = (str1: string, str2: string): string => {
  // Sort strings to ensure consistent key regardless of parameter order
  return [str1, str2].sort().join('___');
};

/**
 * Creates a best match cache key
 */
const createBestMatchCacheKey = (column: string, fields: string[]): string => {
  return `${column}___${fields.join('|')}`;
};

/**
 * Cached version of similarity calculation for client-side use
 * Uses singleton pattern to maintain a single cache
 */
export const getCachedSimilarity = (str1: string, str2: string): number => {
  const cacheKey = createCacheKey(str1, str2);
  
  // Check cache first
  if (similarityCache.has(cacheKey)) {
    return similarityCache.get(cacheKey)!;
  }
  
  // Not in cache, handle common fast paths first
  if (str1 === str2) return 100; // Exact match
  if (!str1 || !str2) return 0;  // Empty string
  
  // Normalize for matching
  const norm1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const norm2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Exact match after normalization
  if (norm1 === norm2 && norm1.length > 0) {
    similarityCache.set(cacheKey, 100);
    return 100;
  }
  
  // Handle common patterns
  // Pluralization (loans/loan)
  if (
    (norm1 + 's' === norm2) ||
    (norm2 + 's' === norm1) ||
    (norm1.endsWith('s') && norm1.slice(0, -1) === norm2) ||
    (norm2.endsWith('s') && norm2.slice(0, -1) === norm1)
  ) {
    similarityCache.set(cacheKey, 95);
    return 95;
  }
  
  // Substring containment
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const smaller = norm1.length < norm2.length ? norm1 : norm2;
    const larger = norm1.length < norm2.length ? norm2 : norm1;
    const ratio = smaller.length / larger.length;
    const score = Math.min(90, Math.round(ratio * 100));
    similarityCache.set(cacheKey, score);
    return score;
  }
  
  // Simple character overlap scoring
  const set1 = new Set(norm1.split(''));
  const set2 = new Set(norm2.split(''));
  let matchCount = 0;
  
  set1.forEach(char => {
    if (set2.has(char)) matchCount++;
  });
  
  const totalChars = new Set([...norm1.split(''), ...norm2.split('')]).size;
  if (totalChars === 0) return 0;
  
  const score = Math.round((matchCount / totalChars) * 100);
  
  // Cache the result
  similarityCache.set(cacheKey, score);
  return score;
};

/**
 * Find best matches between columns and fields
 * Uses exact match fast path to avoid unnecessary computation
 */
export const findBestMatches = async (
  columns: string[],
  fields: string[],
  options?: { skipExactMatches?: boolean, useCache?: boolean }
): Promise<{ bestMatches: BestMatches }> => {
  // Quick short-circuit if no columns to match
  if (!columns.length) {
    return { bestMatches: {} };
  }
  
  // Check for worker availability
  if (workerInUse) {
    console.warn('Worker is busy, falling back to synchronous processing');
    // Fall back to synchronous processing
    return findBestMatchesSynchronous(columns, fields, options);
  }
  
  try {
    // Mark worker as in use
    workerInUse = true;
    
    const worker = getSimilarityWorker();
    
    return await new Promise((resolve, reject) => {
      // One-time message handler
      const handler = (e: MessageEvent) => {
        const { type, error, ...data } = e.data;
        
        if (type === 'error') {
          worker.removeEventListener('message', handler);
          workerInUse = false;
          reject(new Error(error));
          return;
        }
        
        if (type === 'best_matches_result') {
          worker.removeEventListener('message', handler);
          workerInUse = false;
          resolve(data);
          return;
        }
        
        // Handle case where worker determines no calculation is needed
        if (type === 'no_calculation_needed') {
          worker.removeEventListener('message', handler);
          workerInUse = false;
          resolve({ bestMatches: data.exactMatches || {} });
          return;
        }
        
        // Progress updates don't complete the operation
        if (type === 'progress') {
          // Optionally handle progress updates
          return;
        }
      };
      
      // Add handler and send message
      worker.addEventListener('message', handler);
      
      // Send the computation request
      worker.postMessage({
        action: 'find_best_matches',
        payload: { 
          columns, 
          fields,
          skipExactMatches: options?.skipExactMatches || false
        }
      });
      
      // Set a timeout to handle worker hangs
      setTimeout(() => {
        if (workerInUse) {
          console.warn('Worker timeout - terminating and falling back to synchronous');
          worker.removeEventListener('message', handler);
          
          // Terminate the hung worker
          worker.terminate();
          similarityWorker = null;
          workerInUse = false;
          
          // Fall back to synchronous processing
          resolve(findBestMatchesSynchronous(columns, fields, options));
        }
      }, 10000); // 10 second timeout
    });
  } catch (error) {
    // Reset worker state and fall back to synchronous processing
    console.error('Worker error, falling back to synchronous processing:', error);
    workerInUse = false;
    return findBestMatchesSynchronous(columns, fields, options);
  }
};

/**
 * Synchronous fallback for best match finding
 * Used when worker is unavailable or times out
 */
export const findBestMatchesSynchronous = (
  columns: string[],
  fields: string[],
  options?: { skipExactMatches?: boolean, useCache?: boolean }
): { bestMatches: BestMatches } => {
  const bestMatches: BestMatches = {};
  const useCache = options?.useCache !== false;
  
  // Process each column
  for (const column of columns) {
    // Fast path: Check cache first
    if (useCache) {
      const cacheKey = createBestMatchCacheKey(column, fields);
      if (bestMatchCache.has(cacheKey)) {
        const cached = bestMatchCache.get(cacheKey)!;
        bestMatches[column] = { 
          field: cached.result[column].field,
          score: cached.result[column].score 
        };
        continue;
      }
    }
    
    // Find the best match for this column
    let bestScore = -1;
    let bestField = '';
    
    for (const field of fields) {
      const similarity = getCachedSimilarity(column, field);
      
      if (similarity > bestScore) {
        bestScore = similarity;
        bestField = field;
        
        // Short circuit on exact match if not skipping exact matches
        if (similarity === 100 && !options?.skipExactMatches) {
          break;
        }
      }
    }
    
    // Store the best match if we found one
    if (bestScore > 0) {
      bestMatches[column] = { field: bestField, score: bestScore };
      
      // Cache the result
      if (useCache) {
        const cacheKey = createBestMatchCacheKey(column, fields);
        bestMatchCache.set(cacheKey, { 
          column, 
          fields: [...fields], 
          result: { [column]: { field: bestField, score: bestScore } } 
        });
      }
    }
  }
  
  return { bestMatches };
};

/**
 * Clear all similarity caches
 * Call this when switching files or when memory needs to be reclaimed
 */
export const clearSimilarityCache = (): void => {
  similarityCache.clear();
  bestMatchCache.clear();
};