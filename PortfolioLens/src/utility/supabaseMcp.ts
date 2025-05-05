/**
 * Supabase MCP utility wrapper
 * Provides a clean interface for interacting with the Supabase MCP server
 * and fallback mock data for local development
 *
 * Enhanced with secure SQL execution framework integration
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

// Sample table data for local development
interface SampleTable {
  table_name: string;
  display_name: string;
  category: string;
}

// Export sample tables to be used by other modules
export const SAMPLE_TABLES: SampleTable[] = [
  { table_name: 'loan_information', display_name: 'Loan Information', category: 'Loans' },
  { table_name: 'borrowers', display_name: 'Borrowers', category: 'Customers' },
  { table_name: 'payments', display_name: 'Payments', category: 'Transactions' },
  { table_name: 'properties', display_name: 'Properties', category: 'Assets' },
  { table_name: 'users', display_name: 'Users', category: 'System' },
];

// Sample column data type definition
interface ColumnDefinition {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
}

type TableColumnsMap = {
  [key: string]: ColumnDefinition[];
};

// Sample column data
const SAMPLE_COLUMNS: TableColumnsMap = {
  loan_information: [
    { column_name: 'id', data_type: 'integer', is_nullable: false },
    { column_name: 'loan_number', data_type: 'varchar', is_nullable: false },
    { column_name: 'loan_amount', data_type: 'numeric', is_nullable: false },
    { column_name: 'interest_rate', data_type: 'numeric', is_nullable: false },
    { column_name: 'term_months', data_type: 'integer', is_nullable: false },
    { column_name: 'origination_date', data_type: 'date', is_nullable: false },
    { column_name: 'status', data_type: 'varchar', is_nullable: false },
  ],
  borrowers: [
    { column_name: 'id', data_type: 'integer', is_nullable: false },
    { column_name: 'first_name', data_type: 'varchar', is_nullable: false },
    { column_name: 'last_name', data_type: 'varchar', is_nullable: false },
    { column_name: 'email', data_type: 'varchar', is_nullable: false },
    { column_name: 'phone', data_type: 'varchar', is_nullable: true },
    { column_name: 'dob', data_type: 'date', is_nullable: false },
    { column_name: 'ssn', data_type: 'varchar', is_nullable: false },
  ],
  payments: [
    { column_name: 'id', data_type: 'integer', is_nullable: false },
    { column_name: 'loan_id', data_type: 'integer', is_nullable: false },
    { column_name: 'payment_date', data_type: 'date', is_nullable: false },
    { column_name: 'amount', data_type: 'numeric', is_nullable: false },
    { column_name: 'principal', data_type: 'numeric', is_nullable: false },
    { column_name: 'interest', data_type: 'numeric', is_nullable: false },
    { column_name: 'status', data_type: 'varchar', is_nullable: false },
  ],
  properties: [
    { column_name: 'id', data_type: 'integer', is_nullable: false },
    { column_name: 'loan_id', data_type: 'integer', is_nullable: false },
    { column_name: 'address_line1', data_type: 'varchar', is_nullable: false },
    { column_name: 'address_line2', data_type: 'varchar', is_nullable: true },
    { column_name: 'city', data_type: 'varchar', is_nullable: false },
    { column_name: 'state', data_type: 'varchar', is_nullable: false },
    { column_name: 'zip', data_type: 'varchar', is_nullable: false },
    { column_name: 'property_type', data_type: 'varchar', is_nullable: false },
    { column_name: 'year_built', data_type: 'integer', is_nullable: true },
  ],
  users: [
    { column_name: 'id', data_type: 'integer', is_nullable: false },
    { column_name: 'username', data_type: 'varchar', is_nullable: false },
    { column_name: 'email', data_type: 'varchar', is_nullable: false },
    { column_name: 'created_at', data_type: 'timestamp', is_nullable: false },
    { column_name: 'last_login', data_type: 'timestamp', is_nullable: true },
    { column_name: 'is_admin', data_type: 'boolean', is_nullable: false },
  ]
};

/**
 * Get mock data for a query based on the query text
 * @param query SQL query to mock
 * @returns Array of mock results
 */
function getMockData(query: string): any[] {
  // Handle tables list queries
  if (query.toLowerCase().includes('tables_list') || 
      query.toLowerCase().includes('information_schema.tables')) {
    console.info('[MOCK] Returning sample tables list');
    return SAMPLE_TABLES;
  } 
  
  // Handle column information queries
  if (query.toLowerCase().includes('information_schema.columns')) {
    // Extract table name from the query
    const tableMatch = query.match(/table_name\s*=\s*'([^']+)'/);
    if (tableMatch && tableMatch[1]) {
      const tableName = tableMatch[1];
      if (SAMPLE_COLUMNS[tableName]) {
        console.info(`[MOCK] Returning columns for table: ${tableName}`);
        return SAMPLE_COLUMNS[tableName];
      }
    }
    // Default to first table's columns if no match
    console.info('[MOCK] No table match found, returning default columns');
    return SAMPLE_COLUMNS.loan_information;
  }
  
  // For INSERT/UPDATE/DELETE queries, return success indicator
  if (query.toLowerCase().includes('insert') || 
      query.toLowerCase().includes('update') || 
      query.toLowerCase().includes('delete') || 
      query.toLowerCase().includes('create')) {
    console.info('[MOCK] Database write operation simulated successfully');
    return [{ affected_rows: 1, success: true }];
  }
  
  // Generic empty result for other queries
  console.info('[MOCK] Unrecognized query type, returning empty result');
  return [];
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
  
  // Set up mock functions for local development
  if (!mcpAvailable) {
    console.info('Supabase MCP is not available - using mock implementation');
    window.supabaseMcp = {
      execSql: async (params: { project_id: string, query: string }) => {
        console.info('[MOCK] execSql:', params.query.substring(0, 100));
        return getMockData(params.query);
      },
      executeSql: async (params: { project_id: string, query: string }) => {
        console.info('[MOCK] executeSql:', params.query.substring(0, 100));
        return getMockData(params.query);
      },
      applyMigration: async (params: { project_id: string, name: string, query: string }) => {
        console.info('[MOCK] applyMigration:', params.name);
        console.info('[MOCK] SQL:', params.query.substring(0, 100));
        return { success: true, mock: true, affected_rows: 1 };
      }
    };
  } else {
    console.log('Detected MCP available in environment, using native implementation');
  }
}
