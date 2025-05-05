/**
 * Schema Cache Refresh Utility
 * 
 * Provides functions to force schema cache refresh after migrations or when PGRST202 errors occur.
 * Implements multiple approaches to maximize compatibility and success rate.
 */

import { supabaseClient } from "./supabaseClient";
import { SUPABASE_PROJECT_ID } from "./supabaseMcp";

// Configuration options for schema refresh
export interface SchemaRefreshOptions {
  maxRetries?: number;
  retryDelay?: number; // in milliseconds
  logLevel?: 'none' | 'error' | 'warn' | 'info' | 'debug';
  notifyOnly?: boolean; // If true, only use pg_notify without REST API approach
}

// Default options
const DEFAULT_OPTIONS: SchemaRefreshOptions = {
  maxRetries: 3,
  retryDelay: 1000,
  logLevel: 'info',
  notifyOnly: false
};

// Result of a schema refresh attempt
export interface SchemaRefreshResult {
  success: boolean;
  method: string;
  error?: Error | null;
  attempts: number;
}

/**
 * Log a message based on the configured log level
 */
function log(level: 'error' | 'warn' | 'info' | 'debug', message: string, options: SchemaRefreshOptions) {
  const logLevels = {
    'none': 0,
    'error': 1,
    'warn': 2,
    'info': 3,
    'debug': 4
  };

  const configuredLevel = options.logLevel || 'info';
  
  if (logLevels[level] <= logLevels[configuredLevel]) {
    switch (level) {
      case 'error':
        console.error(`[SchemaRefresh] ${message}`);
        break;
      case 'warn':
        console.warn(`[SchemaRefresh] ${message}`);
        break;
      case 'info':
        console.info(`[SchemaRefresh] ${message}`);
        break;
      case 'debug':
        console.debug(`[SchemaRefresh] ${message}`);
        break;
    }
  }
}

/**
 * Sleep for a specified number of milliseconds
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Refresh the schema cache using pg_notify
 * This is the approach used in migration 006_schema_cache_refresh.sql
 */
export async function refreshSchemaCacheViaPgNotify(options: SchemaRefreshOptions = DEFAULT_OPTIONS): Promise<SchemaRefreshResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  log('info', 'Attempting schema cache refresh via pg_notify...', opts);
  
  try {
    // Call the refresh_schema_cache function which internally uses pg_notify
    const { data, error } = await supabaseClient.rpc('refresh_schema_cache');
    
    if (error) {
      log('error', `pg_notify schema refresh failed: ${error.message}`, opts);
      return {
        success: false,
        method: 'pg_notify',
        error: new Error(error.message),
        attempts: 1
      };
    }
    
    log('info', 'pg_notify schema refresh completed successfully', opts);
    return {
      success: true,
      method: 'pg_notify',
      attempts: 1
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log('error', `pg_notify schema refresh exception: ${error.message}`, opts);
    return {
      success: false,
      method: 'pg_notify',
      error,
      attempts: 1
    };
  }
}

/**
 * Refresh the schema cache using the Supabase REST API
 * This is a more reliable approach that mimics the Dashboard's "Reload" button
 */
export async function refreshSchemaCacheViaRestApi(options: SchemaRefreshOptions = DEFAULT_OPTIONS): Promise<SchemaRefreshResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  log('info', 'Attempting schema cache refresh via REST API...', opts);
  
  // Get the current auth token
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData?.session?.access_token) {
    log('error', 'REST API schema refresh failed: No authentication token available', opts);
    return {
      success: false,
      method: 'rest_api',
      error: new Error('No authentication token available'),
      attempts: 0
    };
  }
  
  const accessToken = sessionData.session.access_token;
  
  let attempts = 0;
  let lastError: Error | null = null;
  
  while (attempts < (opts.maxRetries || 3)) {
    attempts++;
    try {
      // Construct the URL for the Supabase Management API
      // This endpoint triggers a schema cache refresh
      const url = `https://api.supabase.io/v1/projects/${SUPABASE_PROJECT_ID}/postgrest/reload`;
      
      log('debug', `Making REST API request to ${url} (attempt ${attempts})`, opts);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }
      
      log('info', 'REST API schema refresh completed successfully', opts);
      return {
        success: true,
        method: 'rest_api',
        attempts
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log('warn', `REST API schema refresh attempt ${attempts} failed: ${lastError.message}`, opts);
      
      if (attempts < (opts.maxRetries || 3)) {
        log('debug', `Waiting ${opts.retryDelay}ms before retry...`, opts);
        await sleep(opts.retryDelay || 1000);
      }
    }
  }
  
  log('error', `REST API schema refresh failed after ${attempts} attempts`, opts);
  return {
    success: false,
    method: 'rest_api',
    error: lastError,
    attempts
  };
}

/**
 * Refresh the schema cache using all available methods
 * This is the recommended approach for maximum reliability
 */
export async function refreshSchemaCache(options: SchemaRefreshOptions = DEFAULT_OPTIONS): Promise<SchemaRefreshResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  log('info', 'Starting schema cache refresh with all available methods...', opts);
  
  // First try pg_notify approach (always try this as it's the simplest)
  const pgNotifyResult = await refreshSchemaCacheViaPgNotify(opts);
  
  // If pg_notify succeeded or we're configured to only use pg_notify, return the result
  if (pgNotifyResult.success || opts.notifyOnly) {
    return pgNotifyResult;
  }
  
  // Otherwise, try the REST API approach
  log('info', 'pg_notify approach failed, trying REST API approach...', opts);
  const restApiResult = await refreshSchemaCacheViaRestApi(opts);
  
  // Return the REST API result
  return restApiResult;
}

/**
 * Verify that the schema cache is up-to-date by testing a known function
 */
export async function verifySchemaCache(): Promise<boolean> {
  try {
    // Try to call a function that should be in the schema cache
    // We use refresh_schema_cache itself as the test function
    const { data, error } = await supabaseClient.rpc('refresh_schema_cache');
    
    // If there's no error, the schema cache is up-to-date
    return !error;
  } catch (err) {
    console.error('Schema cache verification failed:', err);
    return false;
  }
}

/**
 * Refresh the schema cache with automatic verification and retry
 */
export async function refreshSchemaCacheWithVerification(options: SchemaRefreshOptions = DEFAULT_OPTIONS): Promise<SchemaRefreshResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // First attempt to refresh the schema cache
  const refreshResult = await refreshSchemaCache(opts);
  
  // If the refresh failed, return the result
  if (!refreshResult.success) {
    return refreshResult;
  }
  
  // Verify that the schema cache is up-to-date
  log('info', 'Verifying schema cache is up-to-date...', opts);
  const isVerified = await verifySchemaCache();
  
  if (!isVerified) {
    log('warn', 'Schema cache verification failed, cache may still be stale', opts);
    
    // Try one more time with the REST API approach
    if (refreshResult.method !== 'rest_api' && !opts.notifyOnly) {
      log('info', 'Trying REST API approach as final attempt...', opts);
      return await refreshSchemaCacheViaRestApi(opts);
    }
    
    // Update the result to indicate verification failure
    return {
      ...refreshResult,
      success: false,
      error: new Error('Schema cache verification failed')
    };
  }
  
  log('info', 'Schema cache verification successful', opts);
  return refreshResult;
}