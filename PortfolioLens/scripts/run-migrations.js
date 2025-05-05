import fs from 'fs';
import path from 'path';
import { Client } from 'pg'; // Use node-postgres
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// --- Direct PostgreSQL Connection Setup ---
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const dbHost = process.env.SUPABASE_DB_HOST || 'db.kukfbbaevndujnodafnk.supabase.co'; // Default host structure
const dbPort = process.env.SUPABASE_DB_PORT || 5432;
const dbUser = process.env.SUPABASE_DB_USER || 'postgres';
const dbName = process.env.SUPABASE_DB_NAME || 'postgres';

if (!dbPassword) {
  console.error('Error: SUPABASE_DB_PASSWORD not found in environment variables.');
  console.error('Please set the database password for the postgres user in your .env file.');
  process.exit(1);
}

const connectionString = `postgres://${dbUser}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${dbName}`;
// --- End Connection Setup ---


// Define migration files in order (Updated to include all)
const migrationFiles = [
  path.resolve('./src/db/migrations/001_initial_schema.sql'),
  path.resolve('./src/db/migrations/002_additional_import_tables.sql'),
  path.resolve('./src/db/migrations/002_import_system.sql'),
  path.resolve('./src/db/migrations/003_import_functions.sql'),
  path.resolve('./src/db/migrations/003_dynamic_columns_function.sql'),
  path.resolve('./src/db/migrations/004_additional_servicing_tables.sql'),
  path.resolve('./src/db/migrations/005_exec_sql_function.sql'),
  path.resolve('./src/db/migrations/006_schema_cache_refresh.sql'),
  path.resolve('./src/db/migrations/007_data_enrichment_and_templates.sql'),
  path.resolve('./src/db/migrations/008_sql_execution_framework.sql')
];

/**
 * Run a migration SQL file using a direct DB connection
 */
async function runMigration(filePath) {
  console.log(`Running migration: ${path.basename(filePath)}`);
  const client = new Client({ connectionString }); // Create new client for each migration

  try {
    await client.connect(); // Connect to the database
    console.log('Database connection established.');

    // Read migration file
    const sql = fs.readFileSync(filePath, 'utf8');

    // Split SQL file into separate statements, handling potential comments
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--')); // Ignore empty lines and comments

    console.log(`Found ${statements.length} SQL statements to execute`);

    // Execute each statement separately within a transaction
    await client.query('BEGIN'); // Start transaction

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      if (statement.length > 100) {
        console.log(`Executing statement ${i + 1}/${statements.length}: ${statement.substring(0, 100)}...`);
      } else {
        console.log(`Executing statement ${i + 1}/${statements.length}: ${statement}`);
      }

      try {
        await client.query(statement); // Execute statement directly
      } catch (statementError) {
        console.error(`Error executing statement ${i + 1}: ${statementError.message}`);
        console.error(`Failed SQL: ${statement}`);
        await client.query('ROLLBACK'); // Rollback transaction on error
        return false; // Indicate failure
      }
    }

    await client.query('COMMIT'); // Commit transaction if all statements succeed
    console.log(`Completed migration: ${path.basename(filePath)}`);
    return true; // Indicate success

  } catch (err) {
    console.error(`Error running migration ${path.basename(filePath)}:`, err);
    return false; // Indicate failure
  } finally {
    if (client) {
      await client.end(); // Ensure client is always disconnected
      console.log('Database connection closed.');
    }
  }
}

/**
 * Main function to run all migrations
 */
async function main() {
  console.log('Starting PortfolioLens database migrations using direct connection...');
  console.log(`Database Host: ${dbHost}`);

  // No need to check/create exec_sql RPC function anymore

  // Run each migration in order
  for (const migrationFile of migrationFiles) {
    const success = await runMigration(migrationFile);
    
    if (!success) {
      console.error(`Migration ${path.basename(migrationFile)} failed. Stopping.`);
      process.exit(1);
    }
  }
  
  console.log('\nAll migrations completed successfully!');
  console.log('Your database is now ready to use with PortfolioLens.');
  
  // Attempt to automatically refresh the schema cache
  console.log('\n==========================================================');
  console.log('🔄 Attempting automatic schema cache refresh...');
  console.log('==========================================================');
  
  try {
    // Import the schema refresh utility dynamically
    const schemaRefreshUtilPath = path.resolve(__dirname, '../PortfolioLens/src/utility/schemaRefreshUtil.js');
    
    // Check if the file exists
    if (fs.existsSync(schemaRefreshUtilPath)) {
      console.log(`Loading schema refresh utility from: ${schemaRefreshUtilPath}`);
      
      // Import the utility (note: this is ESM dynamic import)
      const schemaRefreshModule = await import(schemaRefreshUtilPath);
      const { refreshSchemaCacheWithVerification } = schemaRefreshModule;
      
      if (typeof refreshSchemaCacheWithVerification === 'function') {
        console.log('Schema refresh utility loaded successfully');
        
        // Attempt to refresh the schema cache
        const result = await refreshSchemaCacheWithVerification({
          maxRetries: 3,
          retryDelay: 2000,
          logLevel: 'info'
        });
        
        if (result.success) {
          console.log('✅ Schema cache refreshed successfully!');
          console.log(`Method used: ${result.method}`);
          console.log(`Attempts: ${result.attempts}`);
        } else {
          console.warn('⚠️ Automatic schema cache refresh failed');
          console.warn(`Error: ${result.error?.message || 'Unknown error'}`);
          console.warn(`Method attempted: ${result.method}`);
          console.warn(`Attempts: ${result.attempts}`);
          
          // Show manual instructions if automatic refresh failed
          showManualRefreshInstructions();
        }
      } else {
        console.warn('⚠️ Schema refresh utility found but refreshSchemaCacheWithVerification function not available');
        showManualRefreshInstructions();
      }
    } else {
      console.warn(`⚠️ Schema refresh utility not found at: ${schemaRefreshUtilPath}`);
      showManualRefreshInstructions();
    }
  } catch (error) {
    console.error('❌ Error during automatic schema cache refresh:', error);
    showManualRefreshInstructions();
  }
  
  // Add a pause to ensure the user sees this message
  console.log('\nPress any key to continue...');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', () => {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    console.log('Continuing...');
  });
}

/**
 * Display manual schema cache refresh instructions
 */
function showManualRefreshInstructions() {
  console.warn('\n==========================================================');
  console.warn('⚠️  MANUAL ACTION REQUIRED  ⚠️');
  console.warn('==========================================================');
  console.warn('You MUST reload the PostgREST schema cache after migrations!');
  console.warn('Failure to do so will cause the following issues:');
  console.warn(' - "Function not found in schema cache" errors');
  console.warn(' - RPC calls failing silently');
  console.warn(' - Import operations failing');
  console.warn(' - Data processing functions not working');
  console.warn('\nTo reload the schema cache:');
  console.warn('1. Go to the Supabase Dashboard');
  console.warn('2. Navigate to SQL Editor -> Schema');
  console.warn('3. Click the "Reload" button');
  console.warn('4. Wait for confirmation that the reload is complete');
  console.warn('\nThis step is required if the automatic refresh failed or');
  console.warn('if you notice any schema cache related errors.');
  console.warn('==========================================================');
}

// Run the migrations
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
