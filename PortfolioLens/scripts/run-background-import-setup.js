/**
 * Run the background import system migration
 * 
 * This script applies the SQL migration to set up the background import system
 * It creates the necessary tables, policies, and functions
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Get environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Create Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_KEY; // Use the service role key for migrations

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing Supabase URL or Key. Check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Path to the migration files
const tableMigrationPath = path.resolve(__dirname, '../src/db/migrations/039_import_system_background.sql');
const rpcMigrationPath = path.resolve(__dirname, '../src/db/migrations/039_import_system_rpc.sql');

async function runMigration() {
  try {
    // Read the table migration file
    console.log(`Reading table migration file: ${tableMigrationPath}`);
    const tableSql = fs.readFileSync(tableMigrationPath, 'utf8');

    // Execute the table SQL
    console.log('Applying table migration...');
    const { data: tableData, error: tableError } = await supabase.rpc('exec_sql', { sql: tableSql });

    if (tableError) {
      console.error('Error executing table migration:', tableError);
      process.exit(1);
    }

    console.log('Table migration successful!');
    
    // Read the RPC migration file
    console.log(`Reading RPC migration file: ${rpcMigrationPath}`);
    const rpcSql = fs.readFileSync(rpcMigrationPath, 'utf8');

    // Execute the RPC SQL
    console.log('Applying RPC migration...');
    const { data: rpcData, error: rpcError } = await supabase.rpc('exec_sql', { sql: rpcSql });

    if (rpcError) {
      console.error('Error executing RPC migration:', rpcError);
      process.exit(1);
    }

    console.log('RPC migration successful!');
    
    // Test if the tables were created
    const { data: tables, error: tablesError } = await supabase
      .from('import_jobs')
      .select('id')
      .limit(1);
      
    if (tablesError) {
      console.error('Error verifying import_jobs table:', tablesError);
    } else {
      console.log('Tables verified - import_jobs is accessible');
    }
    
    // Test if the RPC functions were created
    try {
      console.log('Testing RPC functions...');
      
      // Test create_import_job RPC
      const { data: testJob, error: testJobError } = await supabase.rpc('create_import_job', {
        p_filename: 'test_file.xlsx',
        p_bucket_path: 'test/test_file.xlsx'
      });
      
      if (testJobError) {
        console.error('Error testing create_import_job RPC:', testJobError);
      } else {
        console.log('RPC function create_import_job works correctly');
        
        // Test get_import_job_status RPC
        const { data: testStatus, error: testStatusError } = await supabase.rpc('get_import_job_status', {
          p_job_id: testJob.id
        });
        
        if (testStatusError) {
          console.error('Error testing get_import_job_status RPC:', testStatusError);
        } else {
          console.log('RPC function get_import_job_status works correctly');
        }
      }
    } catch (testError) {
      console.error('Error testing RPC functions:', testError);
    }

    process.exit(0);
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();