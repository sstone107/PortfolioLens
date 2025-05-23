import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials. Please set SUPABASE_SERVICE_ROLE_KEY in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('Reading migration file...');
  
  try {
    const migrationPath = path.join(__dirname, '..', 'src', 'db', 'migrations', '048_fix_loan_id_references.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Applying migration...');
    
    // Split the migration into individual statements
    const statements = migrationSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      if (statement.includes('CREATE OR REPLACE FUNCTION') || 
          statement.includes('DO $$') ||
          statement.includes('GRANT')) {
        try {
          // For DDL statements, we'll need to use raw SQL execution
          console.log('Executing statement:', statement.substring(0, 50) + '...');
          
          // Since we can't use exec_sql, we'll need to apply these manually
          console.warn('Unable to execute DDL directly. Please run the following SQL manually:');
          console.log('---');
          console.log(statement + ';');
          console.log('---');
        } catch (err) {
          console.error('Error executing statement:', err);
        }
      }
    }
    
    console.log('\nTo complete the migration, please run the SQL statements above in your Supabase SQL editor.');
    
  } catch (err) {
    console.error('Error running migration:', err);
  }
}

runMigration();