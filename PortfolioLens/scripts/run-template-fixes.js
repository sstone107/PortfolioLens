/**
 * Run Template Fixes Script
 * 
 * This script applies both the delete template fix and 
 * the sheet mappings standardization fix.
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

async function runMigrations() {
  try {
    console.log('Running template fixes...');
    
    // Read migration SQL files
    const migrationPaths = [
      join(__dirname, '../src/db/migrations/030_fix_delete_template_function.sql'),
      join(__dirname, '../src/db/migrations/031_fix_template_sheet_mappings.sql'),
      join(__dirname, '../src/db/migrations/032_enhanced_template_diagnosis.sql'),
      join(__dirname, '../src/db/migrations/033_enhance_template_rpc_functions.sql')
    ];
    
    // Apply each migration in sequence
    for (const path of migrationPaths) {
      console.log(`Applying migration: ${path}`);
      const migrationSql = readFileSync(path, 'utf8');
      
      const { error } = await supabaseClient.rpc('exec_sql', { 
        p_query: migrationSql 
      });
      
      if (error) {
        console.error(`Migration failed for ${path}:`, error);
        console.log('Continuing with next migration...');
      } else {
        console.log(`Migration completed successfully for ${path}`);
      }
    }
    
    // Refresh schema cache
    console.log('Refreshing schema cache...');
    const { error: refreshError } = await supabaseClient.rpc('refresh_schema_cache');
    
    if (refreshError) {
      console.error('Schema cache refresh failed:', refreshError);
    } else {
      console.log('Schema cache refreshed successfully');
    }
    
    // Fix all templates
    console.log('Running fix_all_template_storage to standardize all templates...');
    const { data: fixResult, error: fixError } = await supabaseClient.rpc('fix_all_template_storage');
    
    if (fixError) {
      console.error('Template fix failed:', fixError);
    } else {
      console.log(`Fixed ${fixResult.templates_fixed} templates`);
    }
    
    console.log('Template fixes have been applied!');
    
  } catch (err) {
    console.error('Error running migrations:', err);
    process.exit(1);
  }
}

runMigrations();