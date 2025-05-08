const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Define the migration to run
const migrationNumber = '015';
const migrationName = 'borrower_details_fields';

// Define paths
const rootPath = path.resolve(__dirname, '..');
const migrationPath = path.join(rootPath, 'src/db/migrations');
const migrationFile = path.join(migrationPath, `${migrationNumber}_${migrationName}.sql`);

console.log(`Running migration: ${migrationFile}`);

// Run the migration
try {
  // Check if the migration file exists
  if (!fs.existsSync(migrationFile)) {
    console.error(`Migration file not found: ${migrationFile}`);
    process.exit(1);
  }

  // Use the existing run-migrations.js script to apply the migration
  const command = `node ${path.join(rootPath, 'scripts/run-migrations.js')} ${migrationFile}`;
  console.log(`Executing: ${command}`);
  
  const output = execSync(command, { encoding: 'utf8' });
  console.log(output);
  
  console.log(`Migration ${migrationNumber}_${migrationName} applied successfully.`);
} catch (error) {
  console.error(`Error running migration: ${error.message}`);
  if (error.stdout) console.error(`stdout: ${error.stdout}`);
  if (error.stderr) console.error(`stderr: ${error.stderr}`);
  process.exit(1);
}