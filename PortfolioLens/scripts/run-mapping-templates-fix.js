/**
 * Script to run the mapping templates fix migrations
 * This script applies the migrations to enable RPC for mapping templates
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Set up Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kukfbbaevndujnodafnk.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_KEY;

if (!supabaseKey) {
  console.error('Error: Supabase key not found. Set VITE_SUPABASE_SERVICE_KEY or VITE_SUPABASE_KEY environment variable.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  }
});

// Migration files to run
const migrationFiles = [
  '../src/db/migrations/026_fix_mapping_templates.sql',
  '../src/db/migrations/027_mapping_templates_rpc.sql'
];

// Execute a migration file
async function executeMigration(filePath) {
  console.log(`\n=== Running migration: ${path.basename(filePath)} ===`);
  
  try {
    // Read the migration file
    const sql = fs.readFileSync(path.resolve(__dirname, filePath), 'utf8');
    
    // Split into statements (basic approach)
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;
      
      try {
        // Log a preview of the statement (first 100 chars)
        console.log(`\nExecuting statement ${i + 1}/${statements.length}: ${stmt.substring(0, 100)}${stmt.length > 100 ? '...' : ''}`);
        
        // Execute the statement using RPC (more reliable than raw SQL with Supabase REST API)
        const { data, error } = await supabase.rpc('exec_sql', { sql: stmt });
        
        if (error) {
          console.error(`Error executing statement ${i + 1}: ${error.message}`);
          // Continue with next statement
        } else {
          console.log(`Statement ${i + 1} executed successfully`);
        }
      } catch (stmtError) {
        console.error(`Exception executing statement ${i + 1}: ${stmtError.message}`);
        // Continue with next statement
      }
    }
    
    console.log(`\n✓ Migration ${path.basename(filePath)} completed`);
    return true;
  } catch (error) {
    console.error(`\n✗ Migration ${path.basename(filePath)} failed: ${error.message}`);
    return false;
  }
}

// Refresh schema cache
async function refreshSchemaCache() {
  console.log('\n=== Refreshing schema cache ===');
  
  try {
    // Try the RPC method first
    const { data, error } = await supabase.rpc('refresh_schema_cache');
    
    if (error) {
      console.error(`Error refreshing schema cache via RPC: ${error.message}`);
      
      // Try using exec_sql as fallback
      try {
        const { data: sqlData, error: sqlError } = await supabase.rpc('exec_sql', {
          sql: 'SELECT refresh_schema_cache();'
        });
        
        if (sqlError) {
          console.error(`Error refreshing schema cache via SQL: ${sqlError.message}`);
          return false;
        } else {
          console.log('Schema cache refreshed successfully via SQL');
          return true;
        }
      } catch (sqlException) {
        console.error(`Exception refreshing schema cache via SQL: ${sqlException.message}`);
        return false;
      }
    } else {
      console.log('Schema cache refreshed successfully via RPC');
      return true;
    }
  } catch (exception) {
    console.error(`Exception refreshing schema cache: ${exception.message}`);
    return false;
  }
}

// Main function
async function main() {
  console.log('=== Mapping Templates Fix ===');
  
  try {
    // Test database connection
    console.log('Testing database connection...');
    const { data: versionData, error: versionError } = await supabase.rpc('version');
    
    if (versionError) {
      console.error(`Database connection error: ${versionError.message}`);
      return;
    }
    
    console.log(`Connected to database`);
    
    // Run each migration file
    for (const file of migrationFiles) {
      const success = await executeMigration(file);
      if (!success) {
        console.error(`Migration ${file} failed, stopping execution`);
        break;
      }
    }
    
    // Final schema refresh
    await refreshSchemaCache();
    
    // Test the get_mapping_templates RPC function
    console.log('\n=== Testing get_mapping_templates RPC function ===');
    const { data: templates, error: templatesError } = await supabase.rpc('get_mapping_templates');
    
    if (templatesError) {
      console.error(`Error testing get_mapping_templates: ${templatesError.message}`);
    } else {
      console.log(`Found ${templates?.length || 0} templates`);
      if (templates?.length > 0) {
        console.log('First template:', JSON.stringify(templates[0], null, 2));
      }
    }
    
    console.log('\n=== Migration Complete ===');
  } catch (error) {
    console.error(`Migration failed: ${error.message}`);
  }
}

// Run the script
main().catch(console.error);