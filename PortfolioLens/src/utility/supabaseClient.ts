import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, PostgrestResponse } from '@supabase/supabase-js';

// Use consistent Supabase project ID with the one we were using for MCP
export const SUPABASE_PROJECT_ID = 'kukfbbaevndujnodafnk';

// Supabase project configuration
// For local development, we'll use a public demo project
// In production, these should be environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kukfbbaevndujnodafnk.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2ZiYmFldm5kdWpub2RhZm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMjk4NzcsImV4cCI6MjA2MTcwNTg3N30.h32Q0CyVxT4D_Gp9O-nngRo9iUs6CPcEGxq-BpQidxA';

// Verify that credentials are set
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials. Using mock data as fallback.');
}

/**
 * Initialize Supabase client with error handling
 */
export function initSupabaseClient(): SupabaseClient {
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    
    console.log('Supabase client initialized successfully');
    return client;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    throw error;
  }
}

// Create and export the Supabase client instance
export const supabaseClient = initSupabaseClient();

// Track connection status
let isConnected = false;

/**
 * Verify Supabase connection and refresh schema cache
 */
export async function verifyConnection(): Promise<boolean> {
  try {
    // First check basic connectivity with a simple query
    const { data, error } = await supabaseClient.rpc('version');
    
    if (error) {
      console.error('Connection verification failed:', error);
      isConnected = false;
      return false;
    }
    
    // Connection successful, refresh schema
    await refreshSchema();
    isConnected = true;
    console.log('Supabase connection verified ✓');
    return true;
  } catch (error) {
    console.error('Supabase connection test failed:', error);
    isConnected = false;
    return false;
  }
}

/**
 * Get connection status
 */
export function getConnectionStatus(): boolean {
  return isConnected;
}

/**
 * Execute a SQL query using the most appropriate method available
 * @param sql SQL query to execute
 * @returns Query result or throws error
 */
export const executeSQL = async (sql: string): Promise<any[] | null> => {
  // Trim the SQL just in case
  const trimmedSql = sql.trim();
  if (!trimmedSql) {
    console.warn('executeSQL called with empty query');
    return null;
  }

  // Log only the SQL, as params are not handled here anymore
  console.log(`Executing DB query via RPC: ${trimmedSql.substring(0, 80)}${trimmedSql.length > 80 ? '...' : ''}`);

  try {
    // Split the SQL string into individual statements
    // This is a basic split by semicolon, may need more robust parsing for complex SQL
    // Improved SQL statement parsing - handle comments and properly split statements
    const sqlLines = trimmedSql.split('\n');
    const cleanedSql = sqlLines
      .filter(line => !line.trim().startsWith('--')) // Remove comment-only lines
      .join('\n');
    
    // Split by semicolons but preserve SQL structure
    const statements = cleanedSql.split(';')
      .map(s => s.trim())
      .filter(s => s && s.length > 0);
    
    console.log(`[DEBUG executeSQL] Found ${statements.length} SQL statements to execute`);

    let lastResult: any[] | null = null;

    for (const statement of statements) {
      // Skip empty statements
      if (!statement) {
        console.log(`[DEBUG executeSQL] Skipping empty statement`);
        continue;
      }
      
      console.log(`Executing statement via RPC: ${statement.substring(0, 80)}${statement.length > 80 ? '...' : ''}`);
      
      // Check if this is a refresh_schema_cache call
      if (statement.includes('refresh_schema_cache')) {
        console.log(`Executing refresh_schema_cache via RPC`);
        try {
          // Execute via RPC
          const { data: refreshData, error: refreshError } = await supabaseClient.rpc('exec_sql', { sql: statement });
          
          if (refreshError) {
            console.error(`Error refreshing schema cache:`, refreshError);
            // Try an alternative approach - execute as a regular SQL statement
            try {
              const result = await supabaseClient.rpc('exec_sql', { sql: 'SELECT refresh_schema_cache();' });
              console.log(`Schema cache refreshed successfully via alternative method`);
              lastResult = result.data;
            } catch (altError) {
              console.error(`Alternative schema refresh failed:`, altError);
            }
          } else {
            console.log(`Schema cache refreshed successfully`);
            lastResult = refreshData;
          }
          continue; // Skip to next statement
        } catch (refreshErr) {
          console.error(`Exception refreshing schema cache:`, refreshErr);
          // Continue with normal execution as fallback
        }
      }
      
      // Check if this is an ALTER TABLE statement
      if (statement.toUpperCase().includes('ALTER TABLE')) {
        console.log(`[DEBUG executeSQL] Processing ALTER TABLE statement`);
        // Extract the individual ADD COLUMN statements
        const alterMatch = statement.match(/ALTER\s+TABLE\s+"([^"]+)"/i);
        const tableName = alterMatch ? alterMatch[1] : null;
        
        if (tableName) {
          console.log(`[DEBUG executeSQL] Altering table: ${tableName}`);
          
          // Extract all ADD COLUMN statements - use a more robust regex that handles multi-line statements
          // This regex captures the column name and everything up to the next comma or semicolon
          const addColumnRegex = /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"([^"]+)"\s+([^,;]+)/gi;
          const columnMatches = statement.match(addColumnRegex);
          
          if (!columnMatches || columnMatches.length === 0) {
            console.log(`[DEBUG executeSQL] No ADD COLUMN statements found in ALTER TABLE statement`);
            // Execute the entire ALTER TABLE statement as is
            try {
              // Use RPC function to execute SQL
              const { data, error } = await supabaseClient.rpc('exec_sql', { sql: statement });
              if (error) {
                console.error(`[DEBUG executeSQL] Error executing ALTER TABLE statement:`, error);
              } else {
                console.log(`[DEBUG executeSQL] Successfully executed ALTER TABLE statement`);
                lastResult = data;
              }
            } catch (sqlErr) {
              console.error(`[DEBUG executeSQL] Exception executing ALTER TABLE statement:`, sqlErr);
            }
            continue;
          }
          
          // Process each ADD COLUMN statement individually
          let columnCount = 0;
          let allColumnsSuccess = true;
          
          for (const columnMatch of columnMatches) {
            // Extract column name and type from the match
            const match = /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"([^"]+)"\s+([^,;]+)/i.exec(columnMatch);
            if (!match) continue;
            
            const columnName = match[1];
            const columnType = match[2].trim();
            columnCount++;
            
            console.log(`[DEBUG executeSQL] Adding column: ${columnName} (${columnType})`);
            
            // Execute each ADD COLUMN as a separate statement
            const singleColumnSql = `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${columnName}" ${columnType}`;
            try {
              // Use RPC function to execute SQL
              const { data, error } = await supabaseClient.rpc('exec_sql', { sql: singleColumnSql });
              
              if (error) {
                console.error(`[DEBUG executeSQL] Error adding column ${columnName}:`, error);
                allColumnsSuccess = false;
              } else {
                console.log(`[DEBUG executeSQL] Successfully added column ${columnName}`);
                lastResult = data;
              }
            } catch (columnErr) {
              console.error(`[DEBUG executeSQL] Exception adding column ${columnName}:`, columnErr);
              allColumnsSuccess = false;
            }
          }
          
          // If all columns were added successfully, refresh the schema cache
          if (allColumnsSuccess && columnCount > 0) {
            try {
              console.log(`[DEBUG executeSQL] Refreshing schema cache after adding columns`);
              await refreshSchema(1);
            } catch (refreshErr) {
              console.error(`[DEBUG executeSQL] Error refreshing schema cache:`, refreshErr);
            }
          }
          
          console.log(`[DEBUG executeSQL] Processed ${columnCount} columns for table ${tableName}`);
          continue; // Skip to next statement after processing all columns
        }
      }
      
      // Use the RPC method which is available in the Supabase client
      const { data, error } = await supabaseClient.rpc('exec_sql', { sql: statement });

      if (error) {
        // Special handling for information_schema queries failing (often due to permissions or initial state)
        if (statement.includes('information_schema.tables')) {
          console.error(`Information schema query failed:`, error);
          console.warn('Returning empty result for tables query due to schema error');
          // Continue to the next statement if this is an information schema query
          lastResult = [];
          continue;
        } else {
          console.error('Query execution failed:', error);
          // Include SQL state code if available
          const sqlState = (error as any).code ? `, SQL state: ${(error as any).code}` : '';
          throw new Error(`Error executing query: ${error.message}${sqlState}`);
        }
      }
      lastResult = data;
    }

    // Return the result of the last statement
    return lastResult;

  } catch (error: any) {
    console.error(`Exception during query execution for SQL: ${trimmedSql.substring(0,100)}...`, error);
    // Also check for information_schema failure within the catch block
    if (trimmedSql.includes('information_schema.tables')) {
         console.warn('Returning empty result for tables query due to exception');
         return []; // Return empty array
    }
    // Re-throw other errors, preserving original message if possible
    const message = error.message || 'Unknown query execution error';
    throw new Error(`Query execution failed: ${message}`);
  }
};

/**
 * Refreshes Supabase schema cache with retry logic.
 */
export async function refreshSchema(retries = 2): Promise<boolean> {
  try {
    // Call the refresh_schema_cache function directly via RPC
    // This is the recommended approach according to Supabase documentation
    const { data, error } = await supabaseClient.rpc('refresh_schema_cache');
    
    if (!error) {
      return true;
    } else {
      console.warn('Schema refresh via RPC failed:', error.message);
      
      // Try the SQL approach as a fallback
      try {
        // Try to execute the refresh_schema_cache() function via SQL
        const result = await executeSQL('SELECT refresh_schema_cache();');
        
        if (result) {
          console.log('Schema refreshed successfully via SQL ✓');
          return true;
        }
      } catch (sqlError: any) {
        console.warn('Schema refresh via SQL failed:', sqlError.message);
      }
      
      // If both approaches fail and we have retries left
      if (retries > 0) {
        console.log(`Retrying schema refresh (${retries} attempts remaining)...`);
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        return refreshSchema(retries - 1);
      }
      console.warn('All schema refresh attempts failed');
      return false;
    }
  } catch (error: any) {
    console.warn('Schema refresh exception:', error.message);
    
    // Try an alternative approach - use exec_sql RPC
    try {
      const { data, error } = await supabaseClient.rpc('exec_sql', {
        sql: 'SELECT refresh_schema_cache();'
      });
      
      if (!error) {
        console.log('Schema refreshed successfully via RPC ✓');
        return true;
      }
    } catch (rpcError) {
      // Try another RPC approach as a last resort
      try {
        await supabaseClient.rpc('exec_sql', {
          sql: `DO $$
          BEGIN
            PERFORM refresh_schema_cache();
          END $$;`
        });
        console.log('Schema refreshed successfully via DO block RPC ✓');
        return true;
      } catch (doBlockError) {
        // Ignore errors and continue with retries
      }
    }
    
    if (retries > 0) {
      console.log(`Retrying schema refresh (${retries} attempts remaining)...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return refreshSchema(retries - 1);
    }
    return false;
  }
}

/**
 * Get mock list of tables when direct database access fails
 */
function getMockTablesList(): any[] {
  console.log('[MOCK] Returning sample tables list');
  return [
    { table_name: 'loan_information' },
    { table_name: 'payments' },
    { table_name: 'borrowers' },
    { table_name: 'properties' },
    { table_name: 'transactions' }
  ];
}

/**
 * Get mock columns for a specific table
 */
function getMockColumnsForTable(tableName: string): any[] {
  console.log(`[MOCK] Returning columns for table: ${tableName}`);
  
  // Default column structure that works for most tables
  const defaultColumns = [
    { column_name: 'id', data_type: 'integer', is_nullable: false, is_primary: true },
    { column_name: 'name', data_type: 'character varying', is_nullable: false, is_primary: false },
    { column_name: 'description', data_type: 'text', is_nullable: true, is_primary: false },
    { column_name: 'amount', data_type: 'numeric', is_nullable: true, is_primary: false },
    { column_name: 'date', data_type: 'timestamp', is_nullable: true, is_primary: false },
    { column_name: 'status', data_type: 'character varying', is_nullable: true, is_primary: false },
    { column_name: 'created_at', data_type: 'timestamp', is_nullable: false, is_primary: false }
  ];
  
  // Table-specific columns could be defined here based on tableName
  return defaultColumns;
}

/**
 * Get mock sample data for a specific table
 */
function getMockSampleData(tableName: string): any[] {
  console.log(`[MOCK] Returning sample data for table: ${tableName}`);
  
  // Create generic sample data
  return Array(5).fill(0).map((_, index) => ({
    id: index + 1,
    name: `Sample ${tableName} ${index + 1}`,
    description: `Description for ${tableName} ${index + 1}`,
    amount: Math.round(Math.random() * 10000) / 100,
    date: new Date().toISOString(),
    status: ['active', 'pending', 'completed'][index % 3],
    created_at: new Date().toISOString()
  }));
}

/**
 * Check if a table exists in the database
 * @param tableName Name of the table to check
 * @returns Promise resolving to true if the table exists
 */
export async function tableExists(tableName: string): Promise<boolean> {
  try {
    // Attempt a simple select query to check for table existence via RPC
    // This avoids relying on the information_schema REST endpoint
    const checkQuery = `SELECT 1 FROM "${tableName}" LIMIT 1;`;
    console.log(`Checking table existence for "${tableName}" via RPC: ${checkQuery}`);

    // Use executeSQL which now handles single statements via RPC
    await executeSQL(checkQuery);

    // If executeSQL completes without throwing an error, the table exists
    console.log(`Table "${tableName}" exists.`);
    return true;

  } catch (error: any) {
    // If executeSQL throws an error with SQL state 42P00 (undefined_table),
    // it means the table does not exist. Re-throw other errors.
    if (error.message && error.message.includes('SQL state: 42P00')) {
      console.log(`Table "${tableName}" does not exist.`);
      return false;
    } else {
      console.error(`Error checking if table "${tableName}" exists via RPC:`, error);
      // Re-throw other unexpected errors
      throw new Error(`Failed to check table existence for "${tableName}": ${error.message}`);
    }
  }
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
  try {
    // Check if table exists first
    const exists = await tableExists(tableName);
    if (exists) {
      console.log(`Table ${tableName} already exists`);
      return true;
    }
    
    // Build column definitions
    const columnDefs = Object.entries(columns)
      .map(([name, type]) => `"${name}" ${type}`)
      .join(', ');
    
    // Create the table using RPC
    const createQuery = `
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        ${columnDefs}
      );
    `;
    
    await executeSQL(createQuery);
    console.log(`Table ${tableName} created successfully`);
    return true;
  } catch (error) {
    console.error(`Failed to create table ${tableName}:`, error);
    return false;
  }
}
