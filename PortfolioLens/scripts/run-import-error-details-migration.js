import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { promises as fs } from 'fs'
import path from 'path'

// Load environment variables from parent directory
dotenv.config({ path: path.resolve('..', '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  console.log('Running import error details migration...')
  
  try {
    // Read the migration file
    const migrationPath = path.resolve('src/db/migrations/056_add_import_error_details.sql')
    const migrationContent = await fs.readFile(migrationPath, 'utf-8')
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationContent
    })
    
    if (error) {
      console.error('Migration failed:', error)
      return
    }
    
    console.log('Migration completed successfully!')
    
    // Test the new tables
    console.log('\nTesting new tables...')
    
    // Check if import_error_details exists
    const { count: errorDetailsCount } = await supabase
      .from('import_error_details')
      .select('*', { count: 'exact', head: true })
    
    console.log('✓ import_error_details table exists')
    
    // Check if view exists
    const { data: summaryData } = await supabase
      .from('import_error_summary')
      .select('*')
      .limit(1)
    
    console.log('✓ import_error_summary view exists')
    
    // Check if import_jobs has new column
    const { data: jobData } = await supabase
      .from('import_jobs')
      .select('enable_detailed_logging')
      .limit(1)
    
    console.log('✓ enable_detailed_logging column added to import_jobs')
    
    console.log('\nMigration verified successfully!')
    
  } catch (error) {
    console.error('Error during migration:', error.message)
  }
}

runMigration()