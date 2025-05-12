/**
 * Utility for managing similarity computations with web workers
 */

// Worker singleton pattern for reuse
let similarityWorker: Worker | null = null;

/**
 * Get the similarity worker instance, creating it if needed
 */
export const getSimilarityWorker = (): Worker => {
  if (!similarityWorker) {
    similarityWorker = new Worker(
      new URL('../workers/similarityCalculator.worker.ts', import.meta.url), 
      { type: 'module' }
    );
  }
  return similarityWorker;
};

// Type for the similarity matrix
export type SimilarityMatrix = Record<string, Record<string, number>>;

// Type for best matches result
export type BestMatches = Record<string, { field: string; score: number }>;

/**
 * Computes similarity matrix for all column-field pairs
 * @param columns Source column names from the import file
 * @param fields Target field names from the database
 * @returns Promise that resolves with the similarity matrix
 */
export const computeSimilarityMatrix = (
  columns: string[], 
  fields: string[]
): Promise<{
  similarityMatrix: SimilarityMatrix;
  computationTime: number;
  columnCount: number;
  fieldCount: number;
}> => {
  const worker = getSimilarityWorker();
  
  return new Promise((resolve, reject) => {
    // One-time message handler
    const handler = (e: MessageEvent) => {
      const { type, error, ...data } = e.data;
      
      if (type === 'error') {
        worker.removeEventListener('message', handler);
        reject(new Error(error));
        return;
      }
      
      if (type === 'similarity_result') {
        worker.removeEventListener('message', handler);
        resolve(data);
        return;
      }
    };
    
    // Add the handler
    worker.addEventListener('message', handler);
    
    // Send the computation request
    worker.postMessage({
      action: 'compute_similarity',
      payload: { columns, fields }
    });
  });
};

/**
 * Finds best matches for each column from available fields
 * @param columns Source column names from the import file
 * @param fields Target field names from the database
 * @returns Promise that resolves with the best matches map
 */
export const findBestMatches = (
  columns: string[],
  fields: string[]
): Promise<{ bestMatches: BestMatches }> => {
  // Quick short-circuit if no columns to match
  if (!columns.length) {
    return Promise.resolve({ bestMatches: {} });
  }

  const worker = getSimilarityWorker();

  return new Promise((resolve, reject) => {
    // One-time message handler
    const handler = (e: MessageEvent) => {
      const { type, error, ...data } = e.data;

      if (type === 'error') {
        worker.removeEventListener('message', handler);
        reject(new Error(error));
        return;
      }

      if (type === 'best_matches_result') {
        worker.removeEventListener('message', handler);
        resolve(data);
        return;
      }

      // Handle case where worker determines no calculation is needed
      if (type === 'no_calculation_needed') {
        worker.removeEventListener('message', handler);
        resolve({ bestMatches: data.exactMatches || {} });
        return;
      }
    };

    // Add the handler
    worker.addEventListener('message', handler);

    // Send the computation request
    worker.postMessage({
      action: 'find_best_matches',
      payload: { columns, fields }
    });
  });
};

/**
 * Cache for similarity results to avoid redundant calculations
 */
const similarityCache = new Map<string, number>();

/**
 * Creates a cache key for two strings
 */
const createCacheKey = (str1: string, str2: string): string => {
  // Sort strings to ensure consistent key regardless of parameter order
  return [str1, str2].sort().join('___');
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
  
  // Not in cache, we'll use simplified similarity calculation
  // (This is a simplified version compared to worker implementation)
  let score = 0;
  
  // Exact match
  if (str1 === str2) {
    score = 100;
  } 
  // Normalize and check again
  else {
    const norm1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (norm1 === norm2) {
      score = 100;
    }
    // Simple substring containment with ratio scoring
    else if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const smaller = norm1.length < norm2.length ? norm1 : norm2;
      const larger = norm1.length < norm2.length ? norm2 : norm1;
      const ratio = smaller.length / larger.length;
      score = Math.min(90, Math.round(ratio * 100));
    } 
    // Simplified character overlap scoring
    else {
      const set1 = new Set(norm1.split(''));
      const set2 = new Set(norm2.split(''));
      let matchCount = 0;
      
      set1.forEach(char => {
        if (set2.has(char)) matchCount++;
      });
      
      const totalChars = new Set([...norm1.split(''), ...norm2.split('')]).size;
      score = Math.round((matchCount / totalChars) * 100);
    }
  }
  
  // Cache the result
  similarityCache.set(cacheKey, score);
  return score;
};

/**
 * Clear the similarity cache (use when changing the dataset)
 */
export const clearSimilarityCache = (): void => {
  similarityCache.clear();
};