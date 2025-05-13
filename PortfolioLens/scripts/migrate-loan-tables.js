/**
 * migrate-loan-tables.js
 * 
 * Simplified migration script to apply the 'ln_' prefix to loan tables only
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Initialize the readline interface for user confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Loan tables to migrate (from the screenshot)
const LOAN_TABLES = [
  { name: 'information', new_name: 'ln_information' },
  { name: 'payments', new_name: 'ln_payments' },
  { name: 'delinquency', new_name: 'ln_delinquency' },
  { name: 'expenses', new_name: 'ln_expenses' },
  { name: 'trailing_payments', new_name: 'ln_trailing_payments' },
  { name: 'insurance', new_name: 'ln_insurance' },
  { name: 'loss_mitigation', new_name: 'ln_loss_mitigation' },
  { name: 'covid_19', new_name: 'ln_covid_19' },
  { name: 'bankruptcy', new_name: 'ln_bankruptcy' },
  { name: 'foreclosure', new_name: 'ln_foreclosure' },
  { name: 'borrowers', new_name: 'ln_borrowers' },
  { name: 'loan_details', new_name: 'ln_loan_details' },
  { name: 'loan_documents', new_name: 'ln_loan_documents' },
  { name: 'loan_notes', new_name: 'ln_loan_notes' },
  { name: 'loans', new_name: 'ln_loans' },
  { name: 'properties', new_name: 'ln_properties' }
];

/**
 * Generate SQL for a single table migration with a backward compatibility view
 */
function generateTableMigrationSQL(tableName, newTableName, schema = 'public') {
  return `
-- Migrate ${schema}.${tableName} to ${schema}.${newTableName}
BEGIN;

-- Rename the table
ALTER TABLE IF EXISTS ${schema}.${tableName} RENAME TO ${newTableName};

-- Create a compatibility view with the original name
CREATE OR REPLACE VIEW ${schema}.${tableName} AS
SELECT * FROM ${schema}.${newTableName};

-- Grant appropriate permissions on the view
GRANT SELECT ON ${schema}.${tableName} TO authenticated;
GRANT SELECT ON ${schema}.${tableName} TO service_role;

-- Add a comment indicating this is a compatibility view
COMMENT ON VIEW ${schema}.${tableName} IS 'Compatibility view for migrated table ${schema}.${newTableName}';

-- Update any RLS policies to reference the new table name
DO $$
DECLARE
  policy_name text;
BEGIN
  FOR policy_name IN 
    SELECT policyname FROM pg_policies 
    WHERE tablename = '${tableName}' AND schemaname = '${schema}'
  LOOP
    EXECUTE format('ALTER POLICY %I ON ${schema}.${newTableName} RENAME TO %I', 
      policy_name, 
      policy_name
    );
  END LOOP;
END
$$;

COMMIT;
`;
}

/**
 * Create migration SQL file
 */
function createMigrationFile(tables) {
  // Create the migrations directory if it doesn't exist
  const migrationDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationDir)) {
    fs.mkdirSync(migrationDir, { recursive: true });
  }

  // Generate the timestamp for the filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '_');
  const filename = `${migrationDir}/migrate_loan_tables_${timestamp}.sql`;

  // Create the SQL header
  let sql = `-- Loan Tables Migration
-- Generated: ${new Date().toISOString()}
-- 
-- This migration renames loan-related tables to use the ln_ prefix
-- and creates compatibility views for backward compatibility

`;

  // Add each table's migration SQL
  tables.forEach(table => {
    sql += generateTableMigrationSQL(table.name, table.new_name);
    sql += "\n";
  });

  // Write the file
  fs.writeFileSync(filename, sql);
  
  console.log(`Migration file created: ${filename}`);
  return filename;
}

/**
 * Execute the migration against the database
 */
async function executeMigration(migrationFile) {
  console.log("\n⚠️  Warning: This will modify your database schema. Make sure you have a backup.");
  
  const confirm = await new Promise(resolve => {
    rl.question("Do you want to execute this migration? (yes/no): ", answer => {
      resolve(answer.toLowerCase() === "yes");
    });
  });
  
  if (!confirm) {
    console.log("Migration cancelled.");
    rl.close();
    return;
  }
  
  try {
    // Read the migration SQL
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    // Initialize the database client
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    // Connect to the database
    await client.connect();
    console.log("Connected to database.");
    
    // Execute the migration
    console.log("Executing migration...");
    await client.query(sql);
    
    console.log("Migration completed successfully! 🎉");
    
    // Clean up
    await client.end();
    
  } catch (error) {
    console.error("Migration failed:", error);
  }
  
  rl.close();
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'generate';
  
  if (command === 'generate') {
    // Generate migration SQL file
    const migrationFile = createMigrationFile(LOAN_TABLES);
    console.log("\nMigration file generated. Review it before execution.");
    console.log("To execute the migration, run: node migrate-loan-tables.js execute");
    
  } else if (command === 'execute') {
    // Execute the migration
    const migrationFile = args[1];
    
    if (!migrationFile) {
      const migrationsDir = path.join(__dirname, 'migrations');
      if (!fs.existsSync(migrationsDir)) {
        console.error("No migrations directory found. Generate a migration first.");
        process.exit(1);
      }
      
      // Find the most recent migration file
      const files = fs.readdirSync(migrationsDir)
        .filter(file => file.startsWith('migrate_loan_tables_'))
        .sort()
        .reverse();
      
      if (files.length === 0) {
        console.error("No migration files found. Generate a migration first.");
        process.exit(1);
      }
      
      const latestMigration = path.join(migrationsDir, files[0]);
      console.log(`Using latest migration file: ${latestMigration}`);
      await executeMigration(latestMigration);
      
    } else {
      // Use the specified migration file
      await executeMigration(migrationFile);
    }
    
  } else {
    console.log(`
Loan Tables Migration Tool

Usage:
  node migrate-loan-tables.js generate           - Generate migration SQL file
  node migrate-loan-tables.js execute [file]     - Execute migration (latest or specified file)
    `);
  }
}

// Run the script
main().catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});