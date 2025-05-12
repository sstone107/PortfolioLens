/**
 * SimilarityService
 * 
 * Service for computing column-to-field similarity with server RPC and client fallback
 * Handles orchestration between server and client processing
 */

import { supabaseClient } from '../../../utility/supabaseClient';
import { getSimilarityWorker } from '../utils/similarityUtils';
import { generateColumnMappings, MappingResult, ColumnInfo, DbFieldInfo, clearMappingCaches } from './mappingEngine';

// Cache for RPC results to prevent redundant server calls
const rpcResultCache = new Map<string, any>();

/**
 * Generate cache key for RPC calls
 */
function generateCacheKey(columns: string[], fields: string[], skipExact?: boolean): string {
  return `${columns.join('|')}__${fields.join('|')}__${skipExact ? 'skip' : 'include'}`;
}

/**
 * Call the server-side RPC for similarity calculation
 */
export async function callServerSimilarityRPC(
  columns: string[],
  fields: string[],
  options?: { skipExactMatches?: boolean }
): Promise<{ 
  similarityMatrix: Record<string, Record<string, number>>, 
  bestMatches: Record<string, { field: string, score: number }>
}> {
  // Return from cache if available
  const cacheKey = generateCacheKey(columns, fields, options?.skipExactMatches);
  if (rpcResultCache.has(cacheKey)) {
    return rpcResultCache.get(cacheKey);
  }
  
  try {
    // Call RPC endpoint
    console.log(`Calling server RPC with ${columns.length} columns and ${fields.length} fields`);
    const startTime = performance.now();
    
    const { data, error } = await supabaseClient.rpc('compute_column_similarity', {
      sheet_columns: columns,
      db_fields: fields,
      skip_exact_matches: options?.skipExactMatches || false
    });
    
    const endTime = performance.now();
    console.log(`Server RPC completed in ${Math.round(endTime - startTime)}ms`);
    
    if (error) {
      console.error('RPC Error:', error);
      throw error;
    }
    
    // Cache result
    rpcResultCache.set(cacheKey, data);
    
    return data;
  } catch (error) {
    console.error('Error calling similarity RPC:', error);
    throw error;
  }
}

/**
 * Process similarity using web worker (client-side fallback)
 */
export async function processWithWorker(
  columns: string[],
  fields: string[]
): Promise<{
  similarityMatrix: Record<string, Record<string, number>>,
  bestMatches: Record<string, { field: string, score: number }>
}> {
  return new Promise((resolve, reject) => {
    const worker = getSimilarityWorker();
    
    // One-time message handler
    const handleWorkerMessage = (e: MessageEvent) => {
      const { type, error, ...data } = e.data;
      
      if (type === 'error') {
        worker.removeEventListener('message', handleWorkerMessage);
        reject(new Error(error));
        return;
      }
      
      if (type === 'similarity_result') {
        worker.removeEventListener('message', handleWorkerMessage);
        resolve({
          similarityMatrix: data.similarityMatrix,
          bestMatches: data.bestMatches || {}
        });
        return;
      }
      
      if (type === 'best_matches_result') {
        worker.removeEventListener('message', handleWorkerMessage);
        resolve({
          similarityMatrix: {},
          bestMatches: data.bestMatches || {}
        });
        return;
      }
      
      if (type === 'no_calculation_needed') {
        worker.removeEventListener('message', handleWorkerMessage);
        resolve({
          similarityMatrix: {},
          bestMatches: data.exactMatches || {}
        });
        return;
      }
    };
    
    // Add message handler
    worker.addEventListener('message', handleWorkerMessage);
    
    // Send computation request
    worker.postMessage({
      action: 'find_best_matches',
      payload: { columns, fields }
    });
  });
}

/**
 * Get similarity with automatic RPC/client fallback
 */
export async function getSimilarity(
  columns: string[], 
  fields: string[],
  options?: { 
    skipExactMatches?: boolean;
    forceClientSide?: boolean;
    timeout?: number;
  }
): Promise<{
  similarityMatrix: Record<string, Record<string, number>>,
  bestMatches: Record<string, { field: string, score: number }>
}> {
  // Handle empty inputs
  if (columns.length === 0 || fields.length === 0) {
    return { similarityMatrix: {}, bestMatches: {} };
  }
  
  // Force client-side processing if specified
  if (options?.forceClientSide) {
    console.log('Forced client-side similarity processing');
    return processWithWorker(columns, fields);
  }
  
  // Try server-side RPC with timeout
  const timeoutMs = options?.timeout || 5000;
  let serverResult: any = null;
  let serverError: any = null;
  
  try {
    // Create a promise race with a timeout
    serverResult = await Promise.race([
      callServerSimilarityRPC(columns, fields, options),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('RPC timeout')), timeoutMs)
      )
    ]);
  } catch (error) {
    console.warn('Server RPC failed or timed out, falling back to client-side processing', error);
    serverError = error;
  }
  
  // Return server result if successful
  if (serverResult) {
    return serverResult;
  }
  
  // Server failed, fall back to client-side processing
  console.log('Using client-side similarity fallback');
  return processWithWorker(columns, fields);
}

/**
 * Generate column mappings using the optimal strategy (main entry point)
 * This handles orchestration between server and client processing
 */
export async function generateMappings(
  columns: ColumnInfo[],
  dbFields: DbFieldInfo[],
  options?: {
    skipExactMatches?: boolean;
    forceClientSide?: boolean;
    confidenceThreshold?: number;
    progressCallback?: (percent: number) => void;
    timeout?: number;
  }
): Promise<MappingResult[]> {
  try {
    // Fast path - use pure mapping engine with batched processing
    return await generateColumnMappings(
      columns,
      dbFields,
      {
        skipExactMatches: options?.skipExactMatches,
        confidenceThreshold: options?.confidenceThreshold || 0,
        batchSize: 50
      },
      options?.progressCallback
    );
  } catch (error) {
    console.error('Error generating mappings:', error);
    throw error;
  }
}

/**
 * Clear all caches
 * Call this when switching files or when memory needs to be reclaimed
 */
export function clearSimilarityCaches(): void {
  rpcResultCache.clear();
  clearMappingCaches();
}