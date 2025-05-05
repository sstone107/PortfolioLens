/**
 * Database Migration Runner Utility
 * Used to execute SQL migration scripts against the Supabase database
 */
import { supabase } from '../lib/supabase';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Runs a specific migration file
 * @param migrationFileName - Name of the migration file in the migrations directory
 * @returns Result of the migration operation
 */
export const runMigration = async (migrationFileName: string) => {
  try {
    // Build the path to the migration file
    const migrationPath = path.join(__dirname, 'migrations', migrationFileName);
    
    // Check if file exists
    if (!fs.existsSync(migrationPath)) {
      return {
        success: false,
        error: `Migration file not found: ${migrationFileName}`
      };
    }
    
    // Read the SQL file
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the SQL against Supabase
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('Migration error:', error);
      if (error.message?.includes('function exec_sql() does not exist')) {
        return {
          success: false,
          error: 'The exec_sql function does not exist in your Supabase project. Please run the SQL script manually in the Supabase SQL Editor.',
          sql // Return the SQL so it can be manually executed
        };
      }
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (err: any) {
    console.error('Unexpected error running migration:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Executes the migration script from the command line
 * Usage: node runMigration.js 004_additional_servicing_tables.sql
 */
const runMigrationFromCLI = async () => {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    console.error('Please provide a migration filename');
    console.error('Usage: node runMigration.js 004_additional_servicing_tables.sql');
    process.exit(1);
  }
  
  console.log(`Running migration: ${migrationFile}`);
  const result = await runMigration(migrationFile);
  
  if (result.success) {
    console.log('Migration completed successfully');
  } else {
    console.error('Migration failed:', result.error);
    if (result.sql) {
      console.log('\nSQL to run manually:');
      console.log('----------------------------------------');
      console.log(result.sql);
      console.log('----------------------------------------');
    }
  }
};

// Run the migration if this script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrationFromCLI();
}
