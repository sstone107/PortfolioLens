/**
 * Run Delete Template Function Fix Script
 * 
 * This script applies the migration that fixes the delete_mapping_template RPC function.
 * The issue was with a boolean comparison error: "operator does not exist: boolean > integer"
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase client configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project-url.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'your-service-key';

// Initialize client
const supabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  try {
    console.log('Running delete template function fix migration...');
    
    // Read migration SQL
    const migrationPath = join(__dirname, '../src/db/migrations/030_fix_delete_template_function.sql');
    const migrationSql = readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    const { error } = await supabaseClient.rpc('exec_sql', { 
      p_query: migrationSql 
    });
    
    if (error) {
      console.error('Migration failed:', error);
      throw error;
    }
    
    console.log('Migration completed successfully');
    
    // Refresh schema cache
    console.log('Refreshing schema cache...');
    const { error: refreshError } = await supabaseClient.rpc('refresh_schema_cache');
    
    if (refreshError) {
      console.error('Schema cache refresh failed:', refreshError);
      throw refreshError;
    }
    
    console.log('Schema cache refreshed successfully');
    console.log('Template delete function has been fixed!');
    
  } catch (err) {
    console.error('Error running migration:', err);
    process.exit(1);
  }
}

runMigration();