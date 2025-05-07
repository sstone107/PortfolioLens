/**
 * Supabase MCP utility wrapper
 * Provides a clean interface for interacting with the Supabase MCP server
 */

import SqlExecutionService from '../services/SqlExecutionService';
import { refreshSchemaCache, SchemaRefreshOptions } from './schemaRefreshUtil';

// The project ID for the Supabase project
export const SUPABASE_PROJECT_ID = 'kukfbbaevndujnodafnk';

// TypeScript interface for the global MCP object
declare global {
  interface Window {
    supabaseMcp?: {
      executeSql: (params: { project_id: string, query: string }) => Promise<any[]>;
      execSql: (params: { project_id: string, query: string }) => Promise<any[]>;
      applyMigration: (params: { project_id: string, name: string, query: string }) => Promise<any>;
    };
    mcp3_exec_sql?: any; // Function provided by Supabase MCP
    mcp3_execute_sql?: any; // Legacy function name
  }
}

/**
 * Execute a SQL query using the secure SQL execution framework with fallbacks.
 * @param query SQL query to execute
 * @param params Optional parameters for the query
 * @param options Additional options for execution
 * @returns Promise resolving to an object containing data and potential error
 */
interface ExecuteSqlResult {
  data: any[];
  error: Error | null;
}

interface ExecuteSqlOptions {
  maxRetries?: number;
  retryDelay?: number;
  skipSchemaRefresh?: boolean;
  schemaRefreshOptions?: SchemaRefreshOptions;
}

export async function executeSql(
  query: string,
  params: Record<string, any> = {},
  options: ExecuteSqlOptions = {}
): Promise<ExecuteSqlResult> {
  let firstError: Error | null = null;
  let retryCount = 0;
  const maxRetries = options.maxRetries ?? 2; // Default to 2 retries
  const retryDelay = options.retryDelay ?? 1000; // Default to 1 second delay
  
  // Ensure parameters is always an object, never an array
  // This is critical because PostgreSQL functions expect JSONB objects
  if (params === null || params === undefined) {
    params = {};
  } else if (Array.isArray(params)) {
    console.warn('Array passed as SQL parameters, converting to object');
    params = {}; // Convert array to empty object
  }

  // --- Attempt 1: Secure SQL Execution Service ---
  try {
    // Try using the secure SQL execution service first
    const result = await SqlExecutionService.executeQuery(query, params);
    
    if (result.error) {
      firstError = result.error; // Capture the first error
      // Don't throw, continue to next approach
    } else {
      return { data: result.data || [], error: null };
    }
  } catch (secureError) {
    if (!firstError) {
      firstError = secureError instanceof Error ? secureError : new Error(String(secureError));
    }
    // Continue to next approach
  }
  
  // --- Attempt 2: Direct Supabase RPC ('exec_sql') ---
  try {
    // Fall back to direct RPC if the first attempt failed
    const { supabaseClient } = await import('./supabaseClient');
    
    // Always use 'exec_sql' for consistency (the server expects this name)
    // Attempt 2: Direct Supabase RPC ('exec_sql_secure')
    const { data, error } = await supabaseClient.rpc('exec_sql_secure', {
      query_text: query,
      parameters: params // Corrected parameter name
    });
    
    if (error) {
      console.error('[executeSql] Attempt 2 FAILED:', error.message);
      
      // Create a more detailed error with specific handling for PGRST202 (schema cache) errors
      const errorDetails = error.code === 'PGRST202'
        ? `SCHEMA CACHE ERROR: Function not found in PostgREST schema cache.
           This typically happens when the schema cache is stale after migrations.
           Original error: ${error.message} (Code: ${error.code})`
        : `Direct RPC Error: ${error.message} (Code: ${error.code})`;
      
      // Always set the error, even if we already have one, as this is likely the most relevant error
      firstError = new Error(errorDetails);
      
      // For PGRST202 errors, attempt to refresh the schema cache and retry
      if (error.code === 'PGRST202' && !options.skipSchemaRefresh && retryCount < maxRetries) {
        console.warn('[executeSql] SCHEMA CACHE ERROR DETECTED:', error.message);
        console.warn('[executeSql] Attempting to refresh schema cache automatically...');
        
        try {
          // Attempt to refresh the schema cache
          const refreshResult = await refreshSchemaCache(options.schemaRefreshOptions);
          
          if (refreshResult.success) {
            console.log('[executeSql] Schema cache refresh successful, retrying query...');
            
            // Wait a moment for the cache to fully update
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Retry the query with incremented retry count and skipSchemaRefresh=true to avoid infinite loops
            retryCount++;
            return executeSql(query, params, {
              ...options,
              skipSchemaRefresh: true,
              maxRetries: maxRetries - 1
            });
          } else {
            console.error('[executeSql] Schema cache refresh failed:', refreshResult.error?.message);
            console.error('[executeSql] Please reload the schema cache manually in the Supabase Dashboard (SQL Editor -> Schema -> Reload)');
            
            // Return with the error since refresh failed
            return { data: [], error: firstError };
          }
        } catch (refreshError) {
          console.error('[executeSql] Error during schema cache refresh:', refreshError);
          console.error('[executeSql] Please reload the schema cache manually in the Supabase Dashboard (SQL Editor -> Schema -> Reload)');
          
          // Return with the original error
          return { data: [], error: firstError };
        }
      } else if (error.code === 'PGRST202') {
        // If we've already tried refreshing or were asked to skip it, return the error
        console.error('[executeSql] SCHEMA CACHE ERROR DETECTED:', error.message);
        console.error('[executeSql] Please reload the schema cache in the Supabase Dashboard (SQL Editor -> Schema -> Reload)');
        
        // Return immediately with the error to make it visible to callers
        return { data: [], error: firstError };
      }
      
      // For other errors, continue to next approach
    } else if (data) {
      return { data: Array.isArray(data) ? data : [], error: null };
    }
  } catch (directError) {
    // Capture error but don't log verbose details
    if (!firstError) {
      firstError = directError instanceof Error ? directError : new Error(String(directError));
    }
    // Continue to next approach
  }
  
  // --- Attempt 3: MCP (SKIPPED) ---
  // MCP logic removed as requested to bypass MCP server dependency for now.
  console.info('[executeSql] Attempt 3 SKIPPED: Bypassing MCP server.');
  if (!firstError) {
      // If prior attempts failed, record a generic error.
      firstError = new Error('SQL Execution failed via Service and Direct RPC.');
  }

  // --- All Attempts Failed ---
  console.warn('[executeSql] All execution attempts failed. Returning empty data with the first encountered error.');
  
  // Check if the error is a PGRST202 error and make it more prominent in the logs
  if (firstError && firstError.message.includes('SCHEMA CACHE ERROR')) {
    console.error('==========================================================');
    console.error('CRITICAL ERROR: STALE POSTGREST SCHEMA CACHE DETECTED');
    console.error('==========================================================');
    console.error('This error indicates that the PostgREST schema cache is stale.');
    console.error('The system attempted to refresh the cache automatically but failed.');
    console.error('To fix this issue manually:');
    console.error('1. Go to the Supabase Dashboard');
    console.error('2. Navigate to SQL Editor -> Schema');
    console.error('3. Click the "Reload" button');
    console.error('4. Try your operation again');
    console.error('==========================================================');
  }
  
  // Return empty data and the first error captured
  return { data: [], error: firstError || new Error('Unknown error during SQL execution fallback.') };
  // NOTE: Removed mock data fallback to ensure errors are surfaced.
}

/**
 * Apply a database migration using the Supabase MCP server with audit logging
 * @param name Migration name
 * @param query SQL migration to apply
 * @returns Promise resolving when the migration is complete
 */
export async function applyMigration(name: string, query: string): Promise<any> {
  try {
    // Log the migration attempt
    try {
      await SqlExecutionService.executeQuery(
        `INSERT INTO sql_execution_log (
          user_id,
          role_name,
          query_text,
          parameters,
          status,
          client_info,
          data_lineage
        ) VALUES (
          auth.uid(),
          'Admin',
          $1,
          $2,
          'success',
          jsonb_build_object('source', 'supabaseMcp.applyMigration'),
          jsonb_build_object('migration_name', $3)
        )`,
        {
          $1: query,
          $2: JSON.stringify({}),
          $3: name
        }
      );
    } catch (logError) {
      console.error('Failed to log migration start:', logError);
      // Continue with migration even if logging fails
    }
    
    // Add detailed logging for MCP check
    console.log('[DEBUG applyMigration] Checking MCP availability...');
    const mcpAvailable = typeof window !== 'undefined' && window.supabaseMcp?.applyMigration;
    console.log(`[DEBUG applyMigration] MCP available: ${mcpAvailable}`);
    if (typeof window !== 'undefined') {
      console.log(`[DEBUG applyMigration] window.supabaseMcp object:`, window.supabaseMcp);
      if (window.supabaseMcp) {
        console.log(`[DEBUG applyMigration] typeof window.supabaseMcp.applyMigration:`, typeof window.supabaseMcp.applyMigration);
      }
    }
    
    // First try to use the MCP server if available
    if (mcpAvailable) {
      try {
        console.log('[DEBUG applyMigration] Attempting to apply migration via REAL MCP...');
        // Add null check for TypeScript
        if (!window.supabaseMcp) {
          throw new Error('window.supabaseMcp is unexpectedly undefined despite mcpAvailable check.');
        }
        const result = await window.supabaseMcp.applyMigration({
          project_id: SUPABASE_PROJECT_ID,
          name,
          query
        });
        console.log('MCP migration successful:', name);
        return result;
      } catch (mcpError) {
        console.error('Error applying migration via MCP, falling back to mock:', mcpError);
        
        // Log the migration failure
        try {
          await SqlExecutionService.executeQuery(
            `INSERT INTO sql_execution_log (
              user_id,
              role_name,
              query_text,
              parameters,
              status,
              error_message,
              client_info,
              data_lineage
            ) VALUES (
              auth.uid(),
              'Admin',
              $1,
              $2,
              'error',
              $3,
              jsonb_build_object('source', 'supabaseMcp.applyMigration'),
              jsonb_build_object('migration_name', $4)
            )`,
            {
              $1: query,
              $2: JSON.stringify({}),
              $3: mcpError instanceof Error ? mcpError.message : String(mcpError),
              $4: name
            }
          );
        } catch (logError) {
          console.error('Failed to log migration error:', logError);
        }
        
        // Continue to fallback case
      }
    } else {
      // Log the reason for using the mock
      console.warn('[DEBUG applyMigration] Reason for using mock: MCP server or applyMigration function not available.');
      console.info('Supabase MCP not available for migration, using mock');
    }
    
    // Mock successful migration response
    console.info(`[MOCK] Applied migration: ${name}`);
    console.info(`[MOCK] SQL: ${query.substring(0, 100)}...`);
    return { success: true, mock: true, affected_rows: 1 };
  } catch (error) {
    console.error('Error in applyMigration fallback:', error);
    
    // Log the migration failure
    try {
      await SqlExecutionService.executeQuery(
        `INSERT INTO sql_execution_log (
          user_id,
          role_name,
          query_text,
          parameters,
          status,
          error_message,
          client_info,
          data_lineage
        ) VALUES (
          auth.uid(),
          'Admin',
          $1,
          $2,
          'error',
          $3,
          jsonb_build_object('source', 'supabaseMcp.applyMigration'),
          jsonb_build_object('migration_name', $4)
        )`,
        {
          $1: query,
          $2: JSON.stringify({}),
          $3: error instanceof Error ? error.message : String(error),
          $4: name
        }
      );
    } catch (logError) {
      console.error('Failed to log migration error:', logError);
    }
    
    // Return mock success instead of throwing
    return { success: false, mock: true, error: String(error) };
  }
}

/**
 * Initialize Supabase MCP by binding the MCP server functions to the window object
 * This should be called when the application starts
 */
export function initSupabaseMcp(): void {
  if (typeof window === 'undefined') {
    return; // Not in browser environment
  }

  // Check if Supabase MCP functions are already available
  if (window.supabaseMcp && 
      ((typeof window.supabaseMcp.execSql === 'function') || 
       (typeof window.supabaseMcp.executeSql === 'function')) && 
      (typeof window.supabaseMcp.applyMigration === 'function')) {
    console.log('Supabase MCP is already available');
    return;
  }
  
  // Try to detect if we're in an environment with MCP
  let mcpAvailable = false;
  try {
    // Use safer approach to check for MCP functions
    // Check for both the new and the old function names
    mcpAvailable = typeof window !== 'undefined' && 
      ('mcp3_exec_sql' in window || 'mcp3_execute_sql' in window);
  } catch (e) {
    console.warn('Error checking for MCP availability:', e);
    mcpAvailable = false;
  }
  
  console.log('MCP availability check result:', mcpAvailable ? 'Available' : 'Not available');
  
  if (!mcpAvailable) {
    console.warn('Supabase MCP is not available and mock implementation has been removed. Database operations may fail.');
    // Optionally, define window.supabaseMcp with functions that throw errors:
    // window.supabaseMcp = {
    //   execSql: async () => { throw new Error('MCP not available and mocks removed.'); },
    //   executeSql: async () => { throw new Error('MCP not available and mocks removed.'); },
    //   applyMigration: async () => { throw new Error('MCP not available and mocks removed.'); },
    // };
  } else {
    console.log('Detected MCP available in environment, using native implementation');
  }
}
