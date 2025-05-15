/**
 * Script to create the save_mapping_template RPC function
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Read environment variables from .env file if available
require('dotenv').config();

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be set');
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  try {
    // Read SQL file
    const sqlPath = path.join(__dirname, 'create_template_function.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Executing SQL to create save_mapping_template function...');
    
    // Execute SQL via RPC
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      throw error;
    }
    
    console.log('Function created successfully!', data);
    
    // Check if the function exists
    const { data: fnData, error: fnError } = await supabase.rpc('save_mapping_template', {
      p_name: 'Test',
      p_description: 'Just a test',
      p_servicer_id: null,
      p_file_pattern: null,
      p_header_row: 0,
      p_table_prefix: null,
      p_sheet_mappings: '{}'
    });
    
    if (fnError) {
      console.error('Error testing function:', fnError);
    } else {
      console.log('Function test successful, created template with ID:', fnData);
    }
    
  } catch (err) {
    console.error('Error creating function:', err);
  }
}

main();