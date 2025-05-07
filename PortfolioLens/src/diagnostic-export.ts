/**
 * Diagnostic Export Utility
 * 
 * This module provides comprehensive diagnostics for the application's
 * database connection, schema cache, and import system functionality.
 * Used to troubleshoot "Schema information failed to load" errors.
 */

import { supabaseClient, refreshSchema, executeSQL } from './utility/supabaseClient';
import SqlExecutionService from './services/SqlExecutionService';
import { 
  LogLevel, 
  createLogger, 
  enableDiagnosticMode, 
  disableDiagnosticMode
} from './utility/debugLogger';

// Create loggers for different aspects of diagnostics
const diagLogger = createLogger('DIAGNOSTIC');
const connLogger = createLogger('CONNECTION');
const schemaLogger = createLogger('DB_SCHEMA');
const sqlLogger = createLogger('SQL');

/**
 * Interface for diagnostic test results
 */
interface DiagnosticTestResult {
  name: string;
  success: boolean;
  message: string;
  details?: any;
  timestamp: string;
}

/**
 * Executes a query safely with proper error handling
 */
async function safeExecuteSQL(sql: string, description: string): Promise<{ 
  success: boolean; 
  data?: any; 
  error?: any;
}> {
  console.log(`  Executing SQL for ${description}...`);
  try {
    // Try the executeSQL utility first
    try {
      const result = await executeSQL(sql);
      console.log(`  ${description} successful via executeSQL`);
      return { success: true, data: result };
    } catch (sqlError) {
      console.warn(`  executeSQL failed for ${description}:`, sqlError);
      
      // Fall back to direct RPC
      try {
        const { data, error } = await supabaseClient.rpc('exec_sql', { sql });
        
        if (error) {
          console.warn(`  RPC exec_sql failed for ${description}:`, error);
          return { success: false, error };
        }
        
        console.log(`  ${description} successful via RPC`);
        return { success: true, data };
      } catch (rpcError) {
        console.warn(`  RPC also failed for ${description}:`, rpcError);
        return { success: false, error: rpcError };
      }
    }
  } catch (error) {
    console.error(`  All SQL methods failed for ${description}:`, error);
    return { success: false, error };
  }
}

/**
 * Attempts to sign in with a demo user if available
 * Only for diagnostic purposes - not for production use
 */
async function attemptDemoSignIn(): Promise<boolean> {
  console.log('🔑 Attempting demo sign-in for diagnostics...');
  try {
    // Try to sign in with a demo user for diagnostics only
    // This is only meant for development/testing
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: 'demo@example.com',
      password: 'demo123',
    });
    
    if (error) {
      console.log('Demo sign-in failed (expected):', error.message);
      return false;
    }
    
    if (data?.session) {
      console.log('Demo sign-in successful');
      return true;
    }
    
    return false;
  } catch (e) {
    console.log('Demo sign-in exception (expected):', e);
    return false;
  }
}

/**
 * Tests connection to Supabase
 */
async function diagnoseConnection(): Promise<DiagnosticTestResult> {
  console.log('📡 Testing Supabase connection...');
  
  const results: Record<string, any> = {
    clientValid: false,
    versionCheck: false,
    authStatus: 'unknown'
  };
  
  // 1. Basic client validation
  try {
    results.clientValid = typeof supabaseClient === 'object' && 
                         supabaseClient !== null && 
                         typeof supabaseClient.from === 'function';
    
    results.clientInfo = {
      baseUrl: supabaseClient?.supabaseUrl,
      authUrl: supabaseClient?.auth?.url,
      schema: supabaseClient?.schema,
    };
    
    console.log(`  Client validation: ${results.clientValid ? 'VALID' : 'INVALID'}`);
  } catch (error) {
    console.error('  Client validation error:', error);
    results.clientError = error instanceof Error ? error.message : String(error);
  }
  
  // 2. Check authentication status
  try {
    console.log('  Checking authentication status...');
    const { data: authData, error: authError } = await supabaseClient.auth.getSession();
    
    if (authError) {
      console.error('  Auth error:', authError);
      results.authStatus = 'error';
      results.authError = authError;
    } else if (authData && authData.session) {
      console.log('  ✅ User is authenticated');
      results.authStatus = 'authenticated';
      results.authData = {
        user: authData.session.user?.email || authData.session.user?.id,
        expires_at: authData.session.expires_at
      };
    } else {
      console.warn('  ⚠️ User is NOT authenticated. RLS policies may block access.');
      results.authStatus = 'anonymous';
    }
  } catch (authCheckError) {
    console.error('  Auth check exception:', authCheckError);
    results.authError = authCheckError instanceof Error ? authCheckError.message : String(authCheckError);
  }
  
  // 3. Version check
  try {
    const { success, data, error } = await safeExecuteSQL(
      'SELECT version();', 
      'PostgreSQL version check'
    );
    
    results.versionCheck = success;
    
    if (success && data && data.length > 0) {
      results.version = data[0]?.version || 'unknown';
      console.log(`  Connected to: ${results.version}`);
    } else {
      results.versionError = error;
      console.error('  Version check failed:', error);
    }
  } catch (error) {
    console.error('  Version check exception:', error);
    results.versionException = error instanceof Error ? error.message : String(error);
  }
  
  // 4. Try with direct query
  try {
    console.log('  Testing direct SQL query via exec_sql RPC...');
    const { data: rpcData, error: rpcError } = await supabaseClient.rpc('exec_sql', {
      sql: 'SELECT current_user, current_setting(\'role\'), current_database();'
    });
    
    if (rpcError) {
      console.error('  Direct SQL query error:', rpcError);
      results.directQueryError = rpcError;
    } else {
      console.log('  Direct SQL query successful:', rpcData);
      results.directQuery = rpcData;
    }
  } catch (directError) {
    console.error('  Direct SQL query exception:', directError);
    results.directQueryException = directError instanceof Error ? directError.message : String(directError);
  }
  
  const success = results.clientValid && results.versionCheck;
  
  let message = '';
  if (success) {
    message = `Connected to Supabase (${results.version || 'unknown version'})`;
    if (results.authStatus === 'authenticated') {
      message += ` as authenticated user`;
    } else if (results.authStatus === 'anonymous') {
      message += ` with ANONYMOUS access (RLS policies may block access)`;
    }
  } else {
    message = 'Failed to establish Supabase connection';
  }
  
  return {
    name: 'Supabase Connection Test',
    success,
    message,
    details: results,
    timestamp: new Date().toISOString()
  };
}

/**
 * Tests multiple methods to refresh the PostgREST schema cache
 */
async function diagnoseSchemaRefresh(): Promise<DiagnosticTestResult> {
  console.log('📊 Testing schema refresh methods...');
  
  const results: Record<string, any> = {};
  let overallSuccess = false;
  
  // Method 1: Direct RPC call
  try {
    console.log('  Testing direct RPC call to refresh_schema_cache...');
    const startTime = Date.now();
    const { data: rpcData, error: rpcError } = await supabaseClient.rpc('refresh_schema_cache');
    results.directRpc = { 
      success: !rpcError, 
      data: rpcData, 
      error: rpcError, 
      duration: Date.now() - startTime 
    };
    
    if (!rpcError) {
      overallSuccess = true;
      console.log(`  Direct RPC succeeded in ${results.directRpc.duration}ms`);
    } else {
      console.log(`  Direct RPC failed in ${results.directRpc.duration}ms: ${rpcError.message}`);
    }
  } catch (error) {
    results.directRpc = { 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      duration: 0
    };
    console.log(`  Direct RPC failed with exception: ${results.directRpc.error}`);
  }
  
  // Method 2: pg_notify
  try {
    console.log('  Testing pg_notify method...');
    const startTime = Date.now();
    const { success, data, error } = await safeExecuteSQL(
      "SELECT pg_notify('pgrst', 'reload schema');",
      'pg_notify schema refresh'
    );
    
    results.pgNotify = { 
      success, 
      data, 
      error, 
      duration: Date.now() - startTime 
    };
    
    if (success) {
      overallSuccess = true;
      console.log(`  pg_notify succeeded in ${results.pgNotify.duration}ms`);
    } else {
      console.log(`  pg_notify failed in ${results.pgNotify.duration}ms`);
    }
  } catch (error) {
    results.pgNotify = { 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      duration: 0
    };
    console.log(`  pg_notify failed with exception: ${results.pgNotify.error}`);
  }
  
  // Method 3: Library function
  try {
    console.log('  Testing refreshSchema utility function...');
    const startTime = Date.now();
    const success = await refreshSchema(1);
    results.refreshFunction = { 
      success, 
      duration: Date.now() - startTime 
    };
    
    if (success) {
      overallSuccess = true;
      console.log(`  refreshSchema succeeded in ${results.refreshFunction.duration}ms`);
    } else {
      console.log(`  refreshSchema failed in ${results.refreshFunction.duration}ms`);
    }
  } catch (error) {
    results.refreshFunction = { 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      duration: 0
    };
    console.log(`  refreshSchema failed with exception: ${results.refreshFunction.error}`);
  }
  
  return {
    name: 'Schema Refresh Diagnostics',
    success: overallSuccess,
    message: overallSuccess 
      ? 'At least one schema refresh method succeeded' 
      : 'All schema refresh methods failed',
    details: results,
    timestamp: new Date().toISOString()
  };
}

/**
 * Checks database tables existence and accessibility
 */
async function diagnoseDatabaseTables(): Promise<DiagnosticTestResult> {
  console.log('📊 Testing database tables access...');
  
  const results: Record<string, any> = {};
  let overallSuccess = false;
  
  // Method 1: Query tables via SQL
  try {
    console.log('  Testing table listing via SQL...');
    const { success, data, error } = await safeExecuteSQL(
      `SELECT table_name, table_type 
       FROM information_schema.tables 
       WHERE table_schema = 'public'
       LIMIT 10;`,
      'table listing'
    );
    
    results.sqlQuery = { 
      success, 
      count: data?.length || 0,
      error,
      data: data?.slice(0, 5) // Only store a few for brevity
    };
    
    if (success && data && data.length > 0) {
      overallSuccess = true;
      console.log(`  Found ${data.length} tables via SQL query`);
      
      // Extract table names for a cleaner report
      results.tableNames = data.map((row: any) => row.table_name || row.TABLE_NAME);
      console.log(`  Tables: ${results.tableNames.join(', ')}`);
    } else {
      console.log(`  SQL table query failed: ${error ? JSON.stringify(error) : 'No results'}`);
    }
  } catch (error) {
    results.sqlQuery = { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
    console.log(`  SQL table query exception: ${results.sqlQuery.error}`);
  }
  
  // Check for specific critical tables individually
  const criticalTables = ['mapping_templates', 'import_jobs', 'sql_execution_log'];
  results.specificTables = {};
  
  for (const tableName of criticalTables) {
    try {
      console.log(`  Testing if table '${tableName}' exists...`);
      const { success, data, error } = await safeExecuteSQL(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = '${tableName}'
        ) AS exists;`,
        `'${tableName}' existence check`
      );
      
      let tableExists = false;
      
      if (success && data && data.length > 0) {
        // Handle different possible response formats
        tableExists = data[0]?.exists === true || 
                      data[0]?.exists === 't' || 
                      data[0]?.EXISTS === true ||
                      data[0]?.EXISTS === 't';
      }
      
      results.specificTables[tableName] = { 
        exists: tableExists,
        querySuccess: success,
        error
      };
      
      console.log(`  Table '${tableName}' ${tableExists ? 'EXISTS' : 'DOES NOT EXIST'}`);
      
      if (tableExists && tableName === 'mapping_templates') {
        overallSuccess = true; // Consider success if at least mapping_templates exists
        
        // Check columns for mapping_templates
        if (tableName === 'mapping_templates') {
          const { success: colSuccess, data: colData, error: colError } = await safeExecuteSQL(
            `SELECT column_name, data_type 
             FROM information_schema.columns 
             WHERE table_schema = 'public' AND table_name = 'mapping_templates';`,
            'mapping_templates columns check'
          );
          
          if (colSuccess && colData && colData.length > 0) {
            const columnNames = colData.map((col: any) => col.column_name || col.COLUMN_NAME);
            results.specificTables[tableName].columns = columnNames;
            console.log(`  Columns in mapping_templates: ${columnNames.join(', ')}`);
            
            // Check for critical columns
            const requiredColumns = [
              'id', 'name', 'table_name', 'mapping_json', 
              'filename_regex', 'sheet_name_regex'
            ];
            
            const missingColumns = requiredColumns.filter(
              col => !columnNames.includes(col) && !columnNames.includes(col.toUpperCase())
            );
            
            results.specificTables[tableName].missingColumns = missingColumns;
            
            if (missingColumns.length > 0) {
              console.log(`  MISSING COLUMNS in mapping_templates: ${missingColumns.join(', ')}`);
            } else {
              console.log(`  All required columns present in mapping_templates`);
            }
          } else {
            console.log(`  Failed to get mapping_templates columns: ${colError ? JSON.stringify(colError) : 'No results'}`);
            results.specificTables[tableName].columnsError = colError;
          }
        }
      }
    } catch (error) {
      results.specificTables[tableName] = { 
        error: error instanceof Error ? error.message : String(error)
      };
      console.log(`  Error checking table '${tableName}': ${results.specificTables[tableName].error}`);
    }
  }
  
  return {
    name: 'Database Tables Diagnostics',
    success: overallSuccess,
    message: overallSuccess 
      ? 'Successfully verified critical tables existence' 
      : 'Failed to verify critical tables',
    details: results,
    timestamp: new Date().toISOString()
  };
}

/**
 * Checks database functions relevant to schema cache and import
 */
async function diagnoseDatabaseFunctions(): Promise<DiagnosticTestResult> {
  console.log('📊 Testing database functions...');
  
  const results: Record<string, any> = {};
  let overallSuccess = false;
  
  // Functions to check
  const criticalFunctions = [
    'refresh_schema_cache',
    'force_schema_cache_refresh',
    'exec_sql',
    'process_batch_import',
    'update_import_job_status',
    'create_import_job'
  ];
  
  // More compatible query to list functions
  try {
    console.log('  Querying available functions...');
    const { success, data, error } = await safeExecuteSQL(
      `SELECT routine_name, routine_type
       FROM information_schema.routines 
       WHERE routine_schema = 'public'
       AND routine_type = 'FUNCTION';`,
      'function listing'
    );
    
    results.functionsQuery = { 
      success, 
      count: data?.length || 0,
      error,
      data: data?.slice(0, 10) // Only store a few for brevity
    };
    
    if (success && data && data.length > 0) {
      // Extract function names
      const functionNames = data.map((fn: any) => fn.routine_name || fn.ROUTINE_NAME);
      results.availableFunctions = functionNames;
      console.log(`  Found ${functionNames.length} functions`);
      
      // Check which critical functions exist
      const foundCriticalFunctions = criticalFunctions.filter(
        fn => functionNames.includes(fn) || functionNames.includes(fn.toUpperCase())
      );
      const missingFunctions = criticalFunctions.filter(
        fn => !functionNames.includes(fn) && !functionNames.includes(fn.toUpperCase())
      );
      
      results.foundCriticalFunctions = foundCriticalFunctions;
      results.missingFunctions = missingFunctions;
      
      console.log(`  Critical functions found: ${foundCriticalFunctions.join(', ')}`);
      
      if (missingFunctions.length > 0) {
        console.log(`  MISSING critical functions: ${missingFunctions.join(', ')}`);
      }
      
      // Consider success if we found at least some critical functions
      overallSuccess = foundCriticalFunctions.length > 0 && 
                      foundCriticalFunctions.includes('refresh_schema_cache');
      
      // Test the refresh_schema_cache function if it exists
      if (foundCriticalFunctions.includes('refresh_schema_cache')) {
        try {
          console.log('  Testing refresh_schema_cache function...');
          const { success: refreshSuccess, data: refreshData, error: refreshError } = 
            await safeExecuteSQL(
              'SELECT refresh_schema_cache();',
              'refresh_schema_cache function test'
            );
          
          results.refreshFunctionTest = { 
            success: refreshSuccess, 
            data: refreshData, 
            error: refreshError 
          };
          
          console.log(`  refresh_schema_cache test ${refreshSuccess ? 'succeeded' : 'failed'}`);
        } catch (error) {
          results.refreshFunctionTest = { 
            success: false, 
            error: error instanceof Error ? error.message : String(error)
          };
          console.log(`  refresh_schema_cache test failed with exception: ${results.refreshFunctionTest.error}`);
        }
      }
    } else {
      console.log(`  Function query failed: ${error ? JSON.stringify(error) : 'No results'}`);
    }
  } catch (error) {
    results.functionsQuery = { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
    console.log(`  Function query exception: ${results.functionsQuery.error}`);
  }
  
  return {
    name: 'Database Functions Diagnostics',
    success: overallSuccess,
    message: overallSuccess 
      ? 'Critical database functions are available' 
      : 'Missing critical database functions',
    details: results,
    timestamp: new Date().toISOString()
  };
}

/**
 * Tests the RPC interface used for SQL execution
 */
async function diagnoseRpcInterface(): Promise<DiagnosticTestResult> {
  console.log('📊 Testing RPC interface...');
  
  const results: Record<string, any> = {};
  let overallSuccess = false;
  
  // Test direct RPC call
  try {
    console.log('  Testing basic RPC call...');
    const { data: rpcData, error: rpcError } = await supabaseClient.rpc('version');
    
    results.basicRpc = { 
      success: !rpcError, 
      data: rpcData, 
      error: rpcError
    };
    
    if (!rpcError) {
      console.log(`  Basic RPC call succeeded`);
      overallSuccess = true;
    } else {
      console.log(`  Basic RPC call failed: ${rpcError.message}`);
    }
  } catch (error) {
    results.basicRpc = { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
    console.log(`  Basic RPC call exception: ${results.basicRpc.error}`);
  }
  
  // Test exec_sql RPC
  try {
    console.log('  Testing exec_sql RPC...');
    const { data: sqlData, error: sqlError } = await supabaseClient.rpc('exec_sql', {
      sql: 'SELECT 1 as test;'
    });
    
    results.execSqlRpc = { 
      success: !sqlError, 
      data: sqlData, 
      error: sqlError
    };
    
    if (!sqlError) {
      console.log(`  exec_sql RPC succeeded`);
      overallSuccess = true;
    } else {
      console.log(`  exec_sql RPC failed: ${sqlError.message}`);
    }
  } catch (error) {
    results.execSqlRpc = { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
    console.log(`  exec_sql RPC exception: ${results.execSqlRpc.error}`);
  }
  
  // Test SqlExecutionService
  try {
    console.log('  Testing SqlExecutionService...');
    const result = await SqlExecutionService.executeQuery('SELECT 1 as test;');
    
    results.sqlExecutionService = { 
      success: !result.error, 
      data: result.data, 
      error: result.error
    };
    
    if (!result.error) {
      console.log(`  SqlExecutionService succeeded`);
      overallSuccess = true;
    } else {
      console.log(`  SqlExecutionService failed: ${result.error}`);
    }
  } catch (error) {
    results.sqlExecutionService = { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
    console.log(`  SqlExecutionService exception: ${results.sqlExecutionService.error}`);
  }
  
  return {
    name: 'RPC Interface Diagnostics',
    success: overallSuccess,
    message: overallSuccess 
      ? 'RPC interface is working correctly' 
      : 'Issues detected with RPC interface',
    details: results,
    timestamp: new Date().toISOString()
  };
}

/**
 * Runs all diagnostic tests and gathers results
 * @param verbose Enable verbose diagnostic mode (default: false)
 */
export async function runDiagnostics(verbose: boolean = false): Promise<void> {
  // Enable diagnostic mode if requested
  if (verbose) {
    enableDiagnosticMode();
    diagLogger.info('Diagnostic mode ENABLED - verbose logging activated');
  } else {
    // Keep default settings for normal runs
    diagLogger.info('Running with normal logging level - use verbose=true for detailed logs');
  }
  
  diagLogger.info('===========================================================');
  diagLogger.info('🔍 STARTING COMPREHENSIVE DIAGNOSTIC TESTS');
  diagLogger.info('===========================================================');
  
  const startTime = Date.now();
  const results: Record<string, DiagnosticTestResult> = {};
  
  // Run connection test first
  try {
    results.connection = await diagnoseConnection();
    
    // Only proceed with other tests if connection is successful
    if (results.connection.success) {
      // Run the diagnostic tests in sequence
      try {
        results.schemaRefresh = await diagnoseSchemaRefresh();
      } catch (error) {
        results.schemaRefresh = {
          name: 'Schema Refresh Diagnostics',
          success: false,
          message: `Error running schema refresh diagnostics: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString()
        };
      }
      
      try {
        results.rpcInterface = await diagnoseRpcInterface();
      } catch (error) {
        results.rpcInterface = {
          name: 'RPC Interface Diagnostics',
          success: false,
          message: `Error running RPC interface diagnostics: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString()
        };
      }
      
      try {
        results.databaseTables = await diagnoseDatabaseTables();
      } catch (error) {
        results.databaseTables = {
          name: 'Database Tables Diagnostics',
          success: false,
          message: `Error running database tables diagnostics: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString()
        };
      }
      
      try {
        results.databaseFunctions = await diagnoseDatabaseFunctions();
      } catch (error) {
        results.databaseFunctions = {
          name: 'Database Functions Diagnostics',
          success: false,
          message: `Error running database functions diagnostics: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString()
        };
      }
    }
  } catch (error) {
    results.connection = {
      name: 'Supabase Connection Test',
      success: false,
      message: `Critical connection error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: new Date().toISOString()
    };
    
    console.error(results.connection.message);
  }
  
  // Summary
  const duration = Date.now() - startTime;
  const successTests = Object.values(results).filter(result => result.success).length;
  const totalTests = Object.values(results).length;
  
  console.log('\n===========================================================');
  console.log(`📊 DIAGNOSTIC RESULTS: ${successTests}/${totalTests} tests passed (${duration}ms)`);
  console.log('===========================================================');
  
  // Print a summary of each test result
  for (const [testName, result] of Object.entries(results)) {
    console.log(`\n${result.success ? '✅' : '❌'} ${result.name}: ${result.message}`);
  }
  
  // Generate a problem summary
  if (successTests < totalTests) {
    console.log('\n===========================================================');
    console.log('🔍 PROBLEM ANALYSIS');
    console.log('===========================================================');
    
    // Authentication issues
    const authStatus = results.connection?.details?.authStatus;
    if (authStatus === 'anonymous' || authStatus === 'error') {
      console.log('❌ CRITICAL: Authentication issue detected');
      console.log('   The client is not authenticated or has insufficient permissions.');
      console.log('   Possible causes:');
      console.log('   - User not logged in (anonymous access)');
      console.log('   - Session expired');
      console.log('   - Row Level Security (RLS) blocking access to tables');
      console.log('\n   This is likely the root cause of all other issues!');
      console.log('   Tables and functions exist but are not accessible.');
    }
    
    // Connection issues
    if (!results.connection?.success) {
      console.log('❌ CRITICAL: Cannot connect to Supabase database');
      console.log('   Possible causes:');
      console.log('   - Invalid Supabase URL or API key');
      console.log('   - Network connectivity issues');
      console.log('   - Supabase service is down or restricted');
    }
    
    // Schema refresh issues
    if (results.connection?.success && !results.schemaRefresh?.success) {
      console.log('❌ CRITICAL: Cannot refresh PostgREST schema cache');
      console.log('   Possible causes:');
      console.log('   - Missing schema refresh functions in database');
      console.log('   - Insufficient permissions for the current user');
      console.log('   - PostgREST configuration issues');
    }
    
    // RPC interface issues
    if (results.connection?.success && !results.rpcInterface?.success) {
      console.log('❌ CRITICAL: RPC interface not working correctly');
      console.log('   Possible causes:');
      console.log('   - PostgREST configuration issues');
      console.log('   - Missing RPC functions in database');
      console.log('   - Insufficient permissions for the current user');
    }
    
    // Tables issues
    if (results.connection?.success && !results.databaseTables?.success) {
      if (authStatus === 'anonymous' || authStatus === 'error') {
        console.log('❌ CRITICAL: Cannot access required database tables due to authentication issues');
      } else {
        console.log('❌ CRITICAL: Required database tables not found');
        console.log('   Possible causes:');
        console.log('   - Database migrations not applied');
        console.log('   - Tables created in a different schema than expected');
        console.log('   - Incorrect table names or case sensitivity issues');
      }
      
      // Specific check for mapping_templates
      const mappingTemplatesDetails = results.databaseTables?.details?.specificTables?.['mapping_templates'];
      if (mappingTemplatesDetails) {
        if (!mappingTemplatesDetails.exists) {
          console.log('   - mapping_templates table appears to not exist (may be hidden by RLS)');
        } else if (mappingTemplatesDetails.missingColumns?.length > 0) {
          console.log(`   - mapping_templates is missing columns: ${mappingTemplatesDetails.missingColumns.join(', ')}`);
        }
      }
    }
    
    // Functions issues
    if (results.connection?.success && !results.databaseFunctions?.success) {
      if (authStatus === 'anonymous' || authStatus === 'error') {
        console.log('❌ CRITICAL: Cannot access required database functions due to authentication issues');
      } else {
        console.log('❌ CRITICAL: Required database functions not found');
        console.log('   Possible causes:');
        console.log('   - Database migrations not applied');
        console.log('   - Functions created in a different schema than expected');
      }
      
      // List missing functions
      const missingFunctions = results.databaseFunctions?.details?.missingFunctions;
      if (missingFunctions && missingFunctions.length > 0) {
        console.log(`   - Functions reported as missing: ${missingFunctions.join(', ')}`);
      }
    }
  }
  
  diagLogger.info('\n===========================================================');
  diagLogger.info('📊 DETAILED RESULTS (expand in browser console)');
  diagLogger.info('===========================================================');
  
  // Output full results to console in expandable format
  console.log('Full diagnostic results:', results);
  
  // Restore normal logging if verbose mode was enabled
  if (verbose) {
    // Wait a moment for logs to finish
    await new Promise(resolve => setTimeout(resolve, 500));
    disableDiagnosticMode();
    diagLogger.info('Diagnostic mode DISABLED - returning to normal logging');
  }
  
  // Provide suggested solutions
  console.log('\n===========================================================');
  console.log('💡 SUGGESTED SOLUTIONS');
  console.log('===========================================================');
  
  if (successTests < totalTests) {
    // Different advice based on authentication status
    const authStatus = results.connection?.details?.authStatus;
    
    if (authStatus === 'anonymous' || authStatus === 'error') {
      console.log('1. FIX AUTHENTICATION ISSUES (HIGHEST PRIORITY):');
      console.log('   - You MUST be logged in to access mapping templates');
      console.log('   - Check if login session has expired or is not properly established');
      console.log('   - Verify that your auth flow completes fully before accessing templates');
      console.log('   - This is likely the root cause of all other issues!');
      
      console.log('\n2. Authentication Troubleshooting:');
      console.log('   - Try logging out and logging in again');
      console.log('   - Clear your browser cache and cookies');
      console.log('   - Ensure you\'re using a valid account with proper permissions');
      console.log('   - Check your auth provider configuration in the Supabase dashboard');
    }
    
    console.log('\n3. Apply all database migrations:');
    console.log('   - Check that all SQL migrations in src/db/migrations/ have been applied');
    console.log('   - Use the apply_migration.bat or apply_migration.ps1 script to apply migrations');
    
    console.log('\n4. Force schema cache refresh:');
    console.log('   - Try the "Refresh Schema Cache" button on the UI');
    console.log('   - Execute the SQL: SELECT pg_notify(\'pgrst\', \'reload schema\');');
    
    console.log('\n5. Check template_type and related columns:');
    console.log('   - Ensure mapping_templates table has template_type, is_system_template columns');
    console.log('   - Verify mapping_json field is present and correctly formatted');
    
    console.log('\n6. Check browser console:');
    console.log('   - Look for CORS errors or network issues');
    console.log('   - Verify no JavaScript errors are preventing functionality');
  } else {
    console.log('✅ All tests passed! No fixes needed.');
  }
  
  return;
}

/**
 * Creates a diagnostic export for saving or sharing
 */
export function generateDiagnosticExport(results: Record<string, DiagnosticTestResult>): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    environment: {
      userAgent: navigator.userAgent,
      url: location.href,
      screen: {
        width: screen.width,
        height: screen.height
      }
    },
    results
  }, null, 2);
}