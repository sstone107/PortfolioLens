/**
 * SQL Function Diagnostic Tool
 * 
 * This script diagnoses issues with Supabase SQL function execution by:
 * 1. Verifying actual SQL function signatures in the database
 * 2. Testing direct execution of SQL functions with proper parameters
 * 3. Checking PostgREST schema cache and exposure
 * 4. Validating permissions for the functions
 * 5. Providing workarounds for common issues
 * 
 * Usage: node scripts/diagnose-sql-functions.js
 */

require('dotenv').config({ path: './PortfolioLens/.env' });
const { createClient } = require('@supabase/supabase-js');
const chalk = require('chalk');
const readline = require('readline');

// Create Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(chalk.red('Error: Missing Supabase credentials in .env file'));
  console.error(chalk.yellow('Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set'));
  process.exit(1);
}

// Create clients with different keys for testing permission issues
const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Initialize MCP client if available
let mcpClient = null;
try {
  const { use_mcp_tool } = require('../src/utility/mcpBridge');
  mcpClient = { use_mcp_tool };
  console.log(chalk.green('✓ MCP client initialized successfully'));
} catch (error) {
  console.log(chalk.yellow('⚠ MCP client not available, skipping MCP tests'));
}

// Create readline interface for interactive mode
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt for confirmation
const confirm = async (message) => {
  return new Promise((resolve) => {
    rl.question(`${message} (y/n): `, (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
};

/**
 * Main diagnostic function
 */
async function runDiagnostics() {
  console.log(chalk.blue.bold('\n=== SQL Function Diagnostic Tool ===\n'));
  
  try {
    // Step 1: Basic connection test
    await testConnection();
    
    // Step 2: Check function signatures
    await checkFunctionSignatures();
    
    // Step 3: Test function execution
    await testFunctionExecution();
    
    // Step 4: Check PostgREST schema cache
    await checkSchemaCache();
    
    // Step 5: Check permissions
    await checkPermissions();
    
    // Step 6: Offer workarounds if needed
    await offerWorkarounds();
    
    console.log(chalk.green.bold('\nDiagnostics completed successfully!'));
  } catch (error) {
    console.error(chalk.red.bold('\nDiagnostics failed:'), error);
  } finally {
    rl.close();
  }
}

/**
 * Test basic connection to Supabase
 */
async function testConnection() {
  console.log(chalk.blue.bold('Testing Supabase Connection...'));
  
  try {
    const { data, error } = await supabase.from('_diagnose_connection').select('*').limit(1).maybeSingle();
    
    if (error && error.code === 'PGRST301') {
      // This is expected since the table doesn't exist
      console.log(chalk.green('✓ Supabase connection successful (expected table not found error)'));
      return true;
    } else if (error) {
      throw new Error(`Unexpected error: ${error.message}`);
    } else {
      console.log(chalk.green('✓ Supabase connection successful'));
      return true;
    }
  } catch (error) {
    console.error(chalk.red('✗ Supabase connection failed:'), error.message);
    
    // Check if it's an authentication error
    if (error.message.includes('JWT')) {
      console.log(chalk.yellow('  This appears to be an authentication issue. Check your API keys.'));
    } else if (error.message.includes('fetch')) {
      console.log(chalk.yellow('  This appears to be a network issue. Check your Supabase URL.'));
    }
    
    throw error;
  }
}

/**
 * Check SQL function signatures in the database
 */
async function checkFunctionSignatures() {
  console.log(chalk.blue.bold('\nChecking SQL Function Signatures...'));
  
  try {
    // Query to get function signatures directly from PostgreSQL catalog
    const query = `
      SELECT 
        n.nspname AS schema,
        p.proname AS function_name,
        pg_get_function_arguments(p.oid) AS argument_list,
        pg_get_function_result(p.oid) AS return_type,
        p.prosecdef AS security_definer
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN ('exec_sql', 'exec_sql_secure', 'exec_sql_with_params')
      ORDER BY p.proname;
    `;
    
    // Try using admin client first for more reliable results
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.rpc('exec_sql', { sql: query });
    
    if (error) {
      console.error(chalk.red('✗ Failed to query function signatures:'), error.message);
      
      // Try direct query as fallback
      console.log(chalk.yellow('  Trying alternative approach...'));
      const { data: directData, error: directError } = await client
        .from('pg_catalog.pg_proc')
        .select('*')
        .limit(1);
      
      if (directError) {
        console.error(chalk.red('✗ Alternative approach also failed:'), directError.message);
        console.log(chalk.yellow('  This likely indicates restricted access to system catalogs.'));
        
        // Fallback to checking via RPC discovery
        await checkFunctionSignaturesViaRPC();
        return;
      }
    }
    
    if (!data || data.length === 0) {
      console.log(chalk.yellow('⚠ No SQL execution functions found in the database!'));
      console.log(chalk.yellow('  This could indicate that migrations have not been applied.'));
      return;
    }
    
    // Display function signatures
    console.log(chalk.green('✓ Found SQL execution functions:'));
    data.forEach(func => {
      const securityLabel = func.security_definer ? chalk.green('SECURITY DEFINER') : chalk.yellow('SECURITY INVOKER');
      console.log(chalk.cyan(`  ${func.schema}.${func.function_name}(${func.argument_list}) RETURNS ${func.return_type} - ${securityLabel}`));
    });
    
    // Check for parameter name mismatches
    const execSqlSecure = data.find(f => f.function_name === 'exec_sql_secure');
    if (execSqlSecure) {
      const params = execSqlSecure.argument_list;
      if (params.includes('query_text') && !params.includes('query_params')) {
        console.log(chalk.green('✓ Parameter names match expected pattern (query_text, parameters, role_name)'));
      } else if (params.includes('query_params')) {
        console.log(chalk.red('✗ Parameter name mismatch detected!'));
        console.log(chalk.yellow('  Function uses "query_params" but code expects "query_text"'));
        console.log(chalk.yellow('  This is likely the cause of the schema cache errors'));
      }
    }
    
    return data;
  } catch (error) {
    console.error(chalk.red('✗ Error checking function signatures:'), error.message);
    throw error;
  }
}

/**
 * Fallback method to check function signatures via RPC discovery
 */
async function checkFunctionSignaturesViaRPC() {
  console.log(chalk.blue('Checking function signatures via RPC discovery...'));
  
  const functions = [
    { name: 'exec_sql', params: { sql: 'SELECT 1' } },
    { name: 'exec_sql_secure', params: { query_text: 'SELECT 1', parameters: {}, role_name: null } },
    { name: 'exec_sql_with_params', params: { query_text: 'SELECT 1', parameters: {} } },
    // Test with potentially mismatched parameter names
    { name: 'exec_sql', params: { query_params: 'SELECT 1', query_text: 'SELECT 1' } }
  ];
  
  for (const func of functions) {
    try {
      console.log(chalk.yellow(`  Testing ${func.name} with params:`), func.params);
      const { data, error } = await supabase.rpc(func.name, func.params);
      
      if (error) {
        if (error.code === 'PGRST204') {
          console.log(chalk.red(`  ✗ Function ${func.name} not found in schema cache`));
        } else if (error.message.includes('function arguments')) {
          console.log(chalk.yellow(`  ⚠ Function ${func.name} exists but parameter mismatch: ${error.message}`));
        } else {
          console.log(chalk.yellow(`  ⚠ Function ${func.name} error: ${error.message}`));
        }
      } else {
        console.log(chalk.green(`  ✓ Function ${func.name} executed successfully with provided parameters`));
      }
    } catch (error) {
      console.log(chalk.red(`  ✗ Error testing ${func.name}:`), error.message);
    }
  }
}

/**
 * Test SQL function execution with various parameter combinations
 */
async function testFunctionExecution() {
  console.log(chalk.blue.bold('\nTesting SQL Function Execution...'));
  
  const testCases = [
    {
      name: 'exec_sql with simple query',
      func: 'exec_sql',
      params: { sql: 'SELECT version()' },
      expectSuccess: true
    },
    {
      name: 'exec_sql_secure with query_text',
      func: 'exec_sql_secure',
      params: { query_text: 'SELECT version()', parameters: {}, role_name: null },
      expectSuccess: true
    },
    {
      name: 'exec_sql_with_params',
      func: 'exec_sql_with_params',
      params: { query_text: 'SELECT $1::text as param', parameters: { '$1': 'test' } },
      expectSuccess: true
    },
    {
      name: 'exec_sql with incorrect parameter names',
      func: 'exec_sql',
      params: { query_params: 'SELECT 1', query_text: 'SELECT 1' },
      expectSuccess: false
    }
  ];
  
  let successCount = 0;
  let failureCount = 0;
  
  for (const test of testCases) {
    try {
      console.log(chalk.yellow(`Testing: ${test.name}`));
      const { data, error } = await supabase.rpc(test.func, test.params);
      
      if (error) {
        failureCount++;
        const expectedMsg = test.expectSuccess ? chalk.red('✗ Unexpected failure') : chalk.green('✓ Expected failure');
        console.log(`${expectedMsg}: ${error.message} (${error.code || 'no code'})`);
        
        // Check for specific error types
        if (error.code === 'PGRST204') {
          console.log(chalk.yellow('  This is a schema cache error - function not found in cache'));
        } else if (error.message.includes('function arguments')) {
          console.log(chalk.yellow('  This is a parameter mismatch error'));
        }
      } else {
        successCount++;
        const expectedMsg = test.expectSuccess ? chalk.green('✓ Success as expected') : chalk.red('✗ Unexpected success');
        console.log(`${expectedMsg}: Received ${Array.isArray(data) ? data.length : 1} result(s)`);
      }
    } catch (error) {
      failureCount++;
      console.log(chalk.red(`✗ Exception: ${error.message}`));
    }
  }
  
  console.log(chalk.blue(`\nExecution Test Summary: ${successCount} succeeded, ${failureCount} failed`));
}

/**
 * Check PostgREST schema cache status
 */
async function checkSchemaCache() {
  console.log(chalk.blue.bold('\nChecking PostgREST Schema Cache...'));
  
  try {
    // First, try to get schema version to check if we can access schema info
    const { data: versionData, error: versionError } = await supabase.rpc('exec_sql', { 
      sql: "SELECT version()" 
    });
    
    if (versionError) {
      console.log(chalk.red('✗ Cannot execute basic SQL query:'), versionError.message);
      console.log(chalk.yellow('  This indicates a fundamental issue with SQL execution'));
      return;
    }
    
    console.log(chalk.green('✓ Basic SQL execution is working'));
    
    // Try to refresh schema cache using pg_notify
    console.log(chalk.yellow('Attempting to refresh schema cache...'));
    
    const { data: refreshData, error: refreshError } = await supabase.rpc('exec_sql', { 
      sql: "SELECT pg_notify('pgrst', 'reload schema')" 
    });
    
    if (refreshError) {
