// Script to retrieve database table information from Supabase
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase credentials not found in environment variables.');
  console.error('Make sure VITE_SUPABASE_URL and VITE_SUPABASE_KEY are set in .env file.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

async function getSchemaInfo() {
  try {
    // Get users table structure using raw SQL query
    console.log('Fetching schema information via raw SQL...');
    
    // First check if the exec_sql function exists
    console.log('Testing if exec_sql function exists...');
    const testResult = await supabase.rpc('exec_sql', { 
      sql: 'SELECT 1 as test'
    });
    
    if (testResult.error && testResult.error.message.includes('function') && testResult.error.message.includes('exist')) {
      console.error('The exec_sql function does not exist. Creating it...');
      
      // Create the exec_sql function if it doesn't exist
      const { error: createError } = await supabase.rpc('exec_sql', {
        sql: `
        CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS JSONB 
        LANGUAGE plpgsql SECURITY DEFINER AS $$
        DECLARE
          result JSONB;
        BEGIN
          EXECUTE sql INTO result;
          RETURN result;
        EXCEPTION WHEN OTHERS THEN
          RETURN jsonb_build_object('error', SQLERRM);
        END;
        $$;
        `
      });
      
      if (createError) {
        console.error('Failed to create exec_sql function:', createError.message);
        console.log('Trying to use PostgreSQL native query method...');
      }
    }
    
    // Use supabase.from('users').select() to get basic table info
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (usersError) {
      console.error('Error fetching user data:', usersError.message);
      return null;
    }
    
    // Get column names from the response
    if (usersData && usersData.length > 0) {
      const columns = Object.keys(usersData[0]).map(column => {
        return {
          column_name: column,
          data_type: typeof usersData[0][column],
          is_nullable: usersData[0][column] === null ? 'YES' : 'UNKNOWN'
        };
      });
      
      console.log('Users table structure (derived from response):');
      console.log(JSON.stringify(columns, null, 2));
      return columns;
    }
    
    // If we get here, we didn't find any user data
    console.log('No user data found to analyze schema');
    return null;
  } catch (error) {
    console.error('Unexpected error:', error.message);
    return null;
  }
}

// Execute the function
getSchemaInfo().then((result) => {
  if (result) {
    // Save the results to a file
    const outputPath = path.resolve('./schema-info.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Schema information saved to ${outputPath}`);
  }
  process.exit(0);
}).catch((error) => {
  console.error('Error executing schema query:', error);
  process.exit(1);
});
