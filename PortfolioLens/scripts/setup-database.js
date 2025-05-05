import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
  console.error('Please add them to your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Path to migration file
const migrationFile = path.resolve('./src/db/migrations/001_initial_schema.sql');

/**
 * Execute SQL migration against Supabase
 */
async function runMigration() {
  console.log('Running database migration...');
  
  try {
    // Read migration file
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    // Execute SQL (using Supabase SQL API)
    const { error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('Error executing migration:', error);
      return false;
    }
    
    console.log('Migration completed successfully');
    return true;
  } catch (err) {
    console.error('Error running migration:', err);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Run migration
    const migrationSuccess = await runMigration();
    
    if (!migrationSuccess) {
      console.error('Migration failed. Please check your SQL syntax and Supabase connection.');
      process.exit(1);
    }
    
    console.log('\nDatabase setup complete. You can now import data using:');
    console.log('node scripts/import-excel-data.js --file <path-to-excel> --table <table-name>');
    
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
