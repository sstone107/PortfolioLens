import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY

console.log('Environment check:')
console.log('- VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL ? 'Set' : 'Not set')
console.log('- SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'Not set')
console.log('- SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set')
console.log('- Using URL:', supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'None')

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  console.error('Please ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('Running migration to fix sync config columns...')
    
    const migrationPath = path.join(__dirname, '../src/db/migrations/048_fix_sync_config_columns.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')
    
    const { error } = await supabase.rpc('exec_sql', { sql })
    
    if (error) {
      console.error('Migration error:', error)
      return false
    }
    
    console.log('Migration completed successfully!')
    return true
  } catch (err) {
    console.error('Error:', err)
    return false
  }
}

runMigration().then(success => {
  process.exit(success ? 0 : 1)
})