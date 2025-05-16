/**
 * Run Sheet Mappings Fix Script
 * 
 * This script applies the migration that fixes the extraction of sheet mappings 
 * from different template formats in RPC functions.
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
    console.log('Running sheet mappings template fix migration...');
    
    // Read migration SQL
    const migrationPath = join(__dirname, '../src/db/migrations/031_fix_template_sheet_mappings.sql');
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
    console.log('Sheet mappings template function has been fixed!');
    
    // Run a diagnose on a sample template if provided
    const templateId = process.argv[2];
    if (templateId) {
      console.log(`Diagnosing template ${templateId}...`);
      const { data, error: diagnoseError } = await supabaseClient.rpc('diagnose_template', {
        p_id: templateId
      });
      
      if (diagnoseError) {
        console.error('Template diagnosis failed:', diagnoseError);
      } else {
        console.log('Template diagnosis:');
        console.log(JSON.stringify(data, null, 2));
      }
    }
    
  } catch (err) {
    console.error('Error running migration:', err);
    process.exit(1);
  }
}

runMigration();