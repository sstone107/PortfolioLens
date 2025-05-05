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

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import readline from 'readline';

dotenv.config();

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
  const mcpBridge = await import('../src/utility/mcpBridge.js');
  mcpClient = { use_mcp_tool: mcpBridge.use_mcp_tool };
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
      console.log(chalk.red('✗ Failed to send schema refresh notification:'), refreshError.message);
    } else {
      console.log(chalk.green('✓ Schema refresh notification sent'));
      console.log(chalk.yellow('  Note: This may not work in all environments'));
      
      // Wait a moment for the cache to refresh
      console.log(chalk.yellow('  Waiting 2 seconds for cache to refresh...'));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Test if functions are now in the schema cache
    const functions = ['exec_sql', 'exec_sql_secure', 'exec_sql_with_params'];
    let cacheStatus = {};
    
    for (const func of functions) {
      try {
        const { data, error } = await supabase.rpc(func, func === 'exec_sql' 
          ? { sql: 'SELECT 1' } 
          : { query_text: 'SELECT 1', parameters: {} }
        );
        
        cacheStatus[func] = error ? 'missing' : 'present';
        
        if (error && error.code === 'PGRST204') {
          console.log(chalk.red(`✗ Function ${func} not found in schema cache`));
        } else if (error) {
          console.log(chalk.yellow(`⚠ Function ${func} error: ${error.message}`));
        } else {
          console.log(chalk.green(`✓ Function ${func} found in schema cache`));
        }
      } catch (error) {
        cacheStatus[func] = 'error';
        console.log(chalk.red(`✗ Error testing ${func}:`), error.message);
      }
    }
    
    return cacheStatus;
  } catch (error) {
    console.error(chalk.red('✗ Error checking schema cache:'), error.message);
    throw error;
  }
}

/**
 * Check permissions for SQL functions
 */
async function checkPermissions() {
  console.log(chalk.blue.bold('\nChecking Function Permissions...'));
  
  // Define roles to check
  const roles = ['anon', 'authenticated', 'service_role'];
  
  // We can only test the current role directly, but we can query the permissions
  try {
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql: `
        SELECT 
          n.nspname AS schema,
          p.proname AS function_name,
          r.rolname AS grantee,
          'EXECUTE' AS privilege_type
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        JOIN pg_auth_members m ON p.proowner = m.member
        JOIN pg_roles r ON m.roleid = r.oid
        WHERE n.nspname = 'public'
          AND p.proname IN ('exec_sql', 'exec_sql_secure', 'exec_sql_with_params')
        UNION
        SELECT 
          n.nspname AS schema,
          p.proname AS function_name,
          r.rolname AS grantee,
          'EXECUTE' AS privilege_type
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated', 'service_role')
        WHERE n.nspname = 'public'
          AND p.proname IN ('exec_sql', 'exec_sql_secure', 'exec_sql_with_params')
          AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
        ORDER BY function_name, grantee;
      `
    });
    
    if (error) {
      console.log(chalk.red('✗ Cannot query function permissions:'), error.message);
      console.log(chalk.yellow('  Falling back to direct execution tests...'));
      
      // Test current role's permissions directly
      await testCurrentRolePermissions();
      return;
    }
    
    if (!data || data.length === 0) {
      console.log(chalk.yellow('⚠ No permission information found'));
      return;
    }
    
    // Group by function
    const permissionsByFunction = {};
    data.forEach(row => {
      if (!permissionsByFunction[row.function_name]) {
        permissionsByFunction[row.function_name] = [];
      }
      permissionsByFunction[row.function_name].push(row.grantee);
    });
    
    // Display permissions
    console.log(chalk.green('Function permissions:'));
    for (const [func, grantees] of Object.entries(permissionsByFunction)) {
      console.log(chalk.cyan(`  ${func}:`), grantees.join(', '));
      
      // Check if all required roles have permissions
      const missingRoles = roles.filter(role => !grantees.includes(role));
      if (missingRoles.length > 0) {
        console.log(chalk.yellow(`  ⚠ Missing permissions for roles: ${missingRoles.join(', ')}`));
      }
    }
    
    return permissionsByFunction;
  } catch (error) {
    console.error(chalk.red('✗ Error checking permissions:'), error.message);
    throw error;
  }
}

/**
 * Test permissions for the current role directly
 */
async function testCurrentRolePermissions() {
  console.log(chalk.yellow('Testing permissions for current role...'));
  
  const functions = ['exec_sql', 'exec_sql_secure', 'exec_sql_with_params'];
  
  for (const func of functions) {
    try {
      const { data, error } = await supabase.rpc(func, func === 'exec_sql' 
        ? { sql: 'SELECT current_user, current_setting(\'role\')' } 
        : { query_text: 'SELECT current_user, current_setting(\'role\')', parameters: {} }
      );
      
      if (error) {
        if (error.message.includes('permission denied')) {
          console.log(chalk.red(`✗ No permission to execute ${func}`));
        } else {
          console.log(chalk.yellow(`⚠ Error executing ${func}: ${error.message}`));
        }
      } else {
        console.log(chalk.green(`✓ Current role can execute ${func}`));
        if (data && data.length > 0) {
          console.log(chalk.green(`  Running as: ${JSON.stringify(data[0])}`));
        }
      }
    } catch (error) {
      console.log(chalk.red(`✗ Error testing ${func}:`), error.message);
    }
  }
}

/**
 * Offer workarounds for common issues
 */
async function offerWorkarounds() {
  console.log(chalk.blue.bold('\nChecking for Workarounds...'));
  
  // Check if we need to create a compatibility wrapper
  const needsWrapper = await confirm('Would you like to create a compatibility wrapper for exec_sql with query_params parameter?');
  
  if (needsWrapper) {
    console.log(chalk.yellow('Creating compatibility wrapper...'));
    
    const wrapperSql = `
      -- Create a compatibility wrapper for the exec_sql function
      CREATE OR REPLACE FUNCTION public.exec_sql(query_params text, query_text text)
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        -- Call the secure function with the query_text parameter
        -- This wrapper exists to handle mismatched parameter names
        RETURN public.exec_sql_secure(query_text, '{}'::jsonb);
      END;
      $$;
      
      -- Grant execute permission
      GRANT EXECUTE ON FUNCTION public.exec_sql(text, text) TO anon, authenticated, service_role;
      
      -- Add comment
      COMMENT ON FUNCTION public.exec_sql(text, text) IS 'Compatibility wrapper for exec_sql with query_params and query_text parameters';
    `;
    
    try {
      // Try to create the wrapper
      const { data, error } = await supabase.rpc('exec_sql', { sql: wrapperSql });
      
      if (error) {
        console.log(chalk.red('✗ Failed to create compatibility wrapper:'), error.message);
        console.log(chalk.yellow('  You may need to run this SQL manually with higher privileges'));
        console.log(chalk.yellow('  SQL to run:'));
        console.log(wrapperSql);
      } else {
        console.log(chalk.green('✓ Compatibility wrapper created successfully'));
        console.log(chalk.yellow('  Testing the wrapper...'));
        
        // Test the wrapper
        const { data: testData, error: testError } = await supabase.rpc('exec_sql', { 
          query_params: 'ignored', 
          query_text: 'SELECT version()' 
        });
        
        if (testError) {
          console.log(chalk.red('✗ Wrapper test failed:'), testError.message);
        } else {
          console.log(chalk.green('✓ Wrapper test succeeded!'));
        }
      }
    } catch (error) {
      console.log(chalk.red('✗ Error creating wrapper:'), error.message);
    }
  }
  
  // Check if we need to refresh the schema cache
  const needsRefresh = await confirm('Would you like to attempt to refresh the PostgREST schema cache?');
  
  if (needsRefresh) {
    console.log(chalk.yellow('Attempting to refresh schema cache...'));
    
    try {
      // Try multiple refresh methods
      const methods = [
        {
          name: 'pg_notify method',
          sql: "SELECT pg_notify('pgrst', 'reload schema')"
        },
        {
          name: 'schema cache refresh function',
          sql: "SELECT refresh_schema_cache()"
        }
      ];
      
      for (const method of methods) {
        console.log(chalk.yellow(`Trying ${method.name}...`));
        const { data, error } = await supabase.rpc('exec_sql', { sql: method.sql });
        
        if (error) {
          console.log(chalk.yellow(`⚠ ${method.name} failed:`, error.message));
        } else {
          console.log(chalk.green(`✓ ${method.name} executed successfully`));
        }
      }
      
      console.log(chalk.yellow('\nManual schema cache refresh instructions:'));
      console.log('1. Go to the Supabase Dashboard');
      console.log('2. Navigate to SQL Editor -> Schema');
      console.log('3. Click the "Reload" button');
      console.log('4. Wait for confirmation that the reload is complete');
      
    } catch (error) {
      console.log(chalk.red('✗ Error refreshing schema cache:'), error.message);
    }
  }
  
  // Offer direct connection option
  console.log(chalk.yellow('\nAlternative Connection Method:'));
  console.log('If PostgREST issues persist, you can use a direct database connection.');
  console.log('This bypasses PostgREST but loses role-based security and audit logging.');
  console.log('Example code:');
  console.log(`
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DIRECT_DB_URL
  });
  
  async function directQuery(sql, params = []) {
    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }
  `);
}

// Main function to run the diagnostics
async function main() {
  try {
    await runDiagnostics();
  } catch (error) {
    console.error(chalk.red.bold('Fatal error:'), error);
    process.exit(1);
  }
}

// Run the main function
main();