/**
 * Run Final Template Fix Script
 * 
 * This script applies the final fixes for nested sheet mappings.
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

async function runFinalFix() {
  try {
    console.log('Running final template fix...');
    
    // Read final fix SQL
    const fixPath = join(__dirname, '../src/db/migrations/034_fix_nested_sheets_extraction.sql');
    const fixSql = readFileSync(fixPath, 'utf8');
    
    // Apply the fix
    console.log('Applying nested sheets extraction fix...');
    const { error } = await supabaseClient.rpc('exec_sql', { 
      p_query: fixSql 
    });
    
    if (error) {
      console.error('Final fix failed:', error);
      throw error;
    }
    
    console.log('Final fix completed successfully');
    
    // Refresh schema cache
    console.log('Refreshing schema cache...');
    const { error: refreshError } = await supabaseClient.rpc('refresh_schema_cache');
    
    if (refreshError) {
      console.error('Schema cache refresh failed:', refreshError);
      throw refreshError;
    }
    
    console.log('Schema cache refreshed successfully');
    
    // Test a specific template
    const templateId = process.argv[2] || '1a607284-cc6d-4a9c-9767-072bcbbb2661';
    
    // Get the template
    console.log(`Testing template ${templateId}...`);
    const { data, error: getError } = await supabaseClient.rpc('get_mapping_template_by_id', {
      p_id: templateId
    });
    
    if (getError) {
      console.error('Error getting template:', getError);
      throw getError;
    }
    
    console.log('Template data structure:');
    console.log('- id:', data.id);
    console.log('- name:', data.name);
    console.log('- sheetMappings type:', typeof data.sheetMappings);
    console.log('- sheetMappings is array:', Array.isArray(data.sheetMappings));
    
    if (Array.isArray(data.sheetMappings)) {
      console.log('- sheetMappings length:', data.sheetMappings.length);
      if (data.sheetMappings.length > 0) {
        console.log('- First sheet name:', data.sheetMappings[0].originalName || 'Unknown');
        console.log('- First sheet has columns:', Array.isArray(data.sheetMappings[0].columns));
        if (Array.isArray(data.sheetMappings[0].columns)) {
          console.log('- First sheet column count:', data.sheetMappings[0].columns.length);
        }
      }
    } else if (data.sheetMappings && typeof data.sheetMappings === 'object') {
      console.log('- sheetMappings keys:', Object.keys(data.sheetMappings));
      if (data.sheetMappings.sheets && Array.isArray(data.sheetMappings.sheets)) {
        console.log('- sheetMappings.sheets length:', data.sheetMappings.sheets.length);
      }
    }
    
    console.log('- sheet_mappings included:', !!data.sheet_mappings);
    if (data.sheet_mappings) {
      console.log('- sheet_mappings has sheets:', !!data.sheet_mappings.sheets);
      if (data.sheet_mappings.sheets && Array.isArray(data.sheet_mappings.sheets)) {
        console.log('- sheet_mappings.sheets length:', data.sheet_mappings.sheets.length);
      }
    }
    
    console.log('\nThe final fixes have been applied. The template editor should now work properly.');
    
  } catch (err) {
    console.error('Error running final fix:', err);
    process.exit(1);
  }
}

runFinalFix();