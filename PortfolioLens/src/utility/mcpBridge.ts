/**
 * MCP Bridge - Connects Supabase MCP Server functions to the application
 * This file provides a way to use MCP functions as if they were native API calls
 */

import { SUPABASE_PROJECT_ID } from './supabaseMcp';

// Declare global MCP functions to satisfy TypeScript
declare global {
  function mcp3_exec_sql(params: { project_id: string; query: string; parameters?: any }): Promise<any>;
  function mcp3_execute_sql(params: { project_id: string; query: string; parameters?: any }): Promise<any>;
  function mcp3_apply_migration(params: { project_id: string; name: string; query: string }): Promise<any>;
}

/**
 * Check if MCP server functions are available
 * @returns True if MCP functions are available
 */
function isMcpAvailable(): boolean {
  try {
    // @ts-ignore - Check for both possible MCP function names
    return typeof mcp3_execute_sql === 'function' || typeof mcp3_exec_sql === 'function';
  } catch (e) {
    return false;
  }
}

/**
 * Initialize MCP Server bindings
 * This function should be called once when the application starts
 */
export function initMcpBridge(): void {
  // Only run in browser environment
  if (typeof window === 'undefined') {
    return;
  }
  
  // console.log('Initializing MCP bridge...'); // Commented out
  console.log('MCP bridge initialization skipped (bypassing MCP server).'); // Added log

  // --- Start of commented out block ---
  /*
  // Create supabaseMcp object if it doesn't exist
  if (!window.supabaseMcp) {
    window.supabaseMcp = {
      // Initialize with placeholder/mock functions
      executeSql: async () => { console.warn('[MOCK] executeSql called'); return []; },
      execSql: async () => { console.warn('[MOCK] execSql called'); return []; },
      applyMigration: async () => { console.warn('[MOCK] applyMigration called'); return null; }
    };
  }
  
  // Check if MCP functions are available
  const mcpAvailable = isMcpAvailable();
  
  if (mcpAvailable) {
    console.log('MCP functions detected, setting up bridge');
    
    // Determine which SQL execution function is available
    const sqlExecFn = typeof mcp3_exec_sql === 'function' ? mcp3_exec_sql : mcp3_execute_sql;
    const sqlExecFnName = typeof mcp3_exec_sql === 'function' ? 'mcp3_exec_sql' : 'mcp3_execute_sql';
    console.log(`Mapping MCP function: ${sqlExecFnName}`);

    // Set up execSql bridge (preferred name)
    window.supabaseMcp.execSql = async (params: any) => {
      try {
        // @ts-ignore - Call the detected MCP server function
        const result = await sqlExecFn({
          project_id: params.project_id || SUPABASE_PROJECT_ID,
          query: params.query,
          // Pass parameters if the underlying function supports them (assume it might)
          parameters: params.parameters || {}
        });
        return result || [];
      } catch (error) {
        console.error(`MCP Bridge Error (${sqlExecFnName}):`, error);
        throw error;
      }
    };

    // Also map executeSql for backward compatibility if needed, pointing to the same underlying function
    window.supabaseMcp.executeSql = window.supabaseMcp.execSql;

    // Set up applyMigration bridge (assuming mcp3_apply_migration exists if SQL functions do)
    if (typeof mcp3_apply_migration === 'function') {
       window.supabaseMcp.applyMigration = async (params: any) => {
         try {
           // @ts-ignore - Call the MCP server function
           const result = await mcp3_apply_migration({
             project_id: params.project_id || SUPABASE_PROJECT_ID,
             name: params.name,
             query: params.query
           });
           return result || { success: false, error: 'No result returned' };
         } catch (error) {
           console.error('MCP Bridge Error (applyMigration):', error);
           throw error;
         }
       };
    } else {
       console.warn('MCP function mcp3_apply_migration not found!');
       // Keep mock applyMigration
    }
  } else {
    console.warn('MCP functions not available, using mock implementation');
    // The mock implementation is handled in supabaseMcp.ts
  }
  */
  // --- End of commented out block ---
}

/**
 * Create a database table if it doesn't exist
 * @param tableName Table name
 * @param columns Column definitions
 * @returns Promise resolving to true if successful
 */
export async function createTableIfNotExists(
  tableName: string, 
  columns: Record<string, string>
): Promise<boolean> {
  if (typeof window === 'undefined' || !window.supabaseMcp) {
    console.error('Cannot create table: window or supabaseMcp not available');
    return false;
  }
  
  try {
    // First check if table exists
    const checkQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '${tableName}'
      );
    `;
    
    const checkResult = await window.supabaseMcp.executeSql({
      project_id: SUPABASE_PROJECT_ID,
      query: checkQuery
    });
    
    // If table exists, no need to create it
    if (checkResult?.[0]?.exists) {
      console.log(`Table ${tableName} already exists`);
      return true;
    }
    
    // Build the CREATE TABLE statement
    const columnDefinitions = Object.entries(columns)
      .map(([colName, colType]) => `"${colName}" ${colType}`)
      .join(', ');
    
    const createQuery = `
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        ${columnDefinitions}
      );
    `;
    
    // Create the table
    const migrationResult = await window.supabaseMcp.applyMigration({
      project_id: SUPABASE_PROJECT_ID,
      name: `create_${tableName}_table`,
      query: createQuery
    });
    
    console.log(`Table ${tableName} created successfully:`, migrationResult);
    return true;
  } catch (error) {
    console.error(`Error creating table ${tableName}:`, error);
    return false;
  }
}
