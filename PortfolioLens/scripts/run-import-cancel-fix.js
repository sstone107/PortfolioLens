const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    const migrationPath = path.join(__dirname, '../src/db/migrations/058_fix_import_cancel_permissions.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running import cancel permissions fix...');
    
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      if (error.message?.includes('exec_sql')) {
        console.error('exec_sql function not found. Creating it first...');
        
        // Create the exec_sql function
        const createExecSql = `
        CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
        RETURNS JSON
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        DECLARE
          result JSON;
        BEGIN
          EXECUTE sql;
          result := json_build_object('success', true);
          RETURN result;
        EXCEPTION
          WHEN OTHERS THEN
            result := json_build_object('success', false, 'error', SQLERRM);
            RETURN result;
        END;
        $$;
        `;
        
        const { error: createError } = await supabase.rpc('query', { query: createExecSql });
        if (createError) {
          console.error('Failed to create exec_sql function:', createError);
          console.log('\nPlease run the following SQL manually in Supabase SQL Editor:');
          console.log(sql);
          return;
        }
        
        // Try again
        const { data: retryData, error: retryError } = await supabase.rpc('exec_sql', { sql });
        if (retryError) {
          throw retryError;
        }
      } else {
        throw error;
      }
    }
    
    console.log('✅ Import cancel permissions fixed successfully');
    
  } catch (error) {
    console.error('Error running migration:', error);
    console.log('\nPlease run the migration manually in Supabase SQL Editor');
  }
}

runMigration();