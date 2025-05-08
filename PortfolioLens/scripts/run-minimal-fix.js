// Script to run the minimal loan notes foreign key constraint fix
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Create Supabase client using environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
});

async function runMinimalFix() {
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, './minimal-loan-notes-fix.sql');
    console.log(`Reading migration from: ${migrationPath}`);
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Execute each statement separately for better error handling
    const statements = migrationSql
      .split(/;\s*$/m)  // Split on semicolons at the end of lines
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => s + ';');

    console.log(`Executing ${statements.length} SQL statements...`);

    // Function to execute a single SQL statement via exec_sql RPC
    async function executeStatement(sql) {
      const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
      if (error) throw error;
      return data;
    }

    // Step 1: Drop the constraint
    console.log('Step 1: Dropping existing foreign key constraint...');
    await executeStatement(statements[0]);
    console.log('Constraint dropped successfully.');

    // Step 2: Create the sync function
    console.log('Step 2: Creating sync_missing_users function...');
    await executeStatement(statements[1]);
    console.log('Function created successfully.');

    // Step 3: Run the sync to copy missing users
    console.log('Step 3: Syncing missing users from auth.users...');
    await executeStatement(statements[2]);
    console.log('Users synced successfully.');

    // Step 4: Add back the constraint
    console.log('Step 4: Adding foreign key constraint...');
    await executeStatement(statements[3]);
    console.log('Constraint added successfully.');

    console.log('All steps completed successfully!');

    // Verify the constraint was created correctly
    const { data: constraints, error: constraintError } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'loan_notes' AND constraint_name = 'loan_notes_user_id_fkey';
      `
    });

    if (constraintError) {
      console.error('Error verifying constraint:', constraintError);
    } else {
      console.log('Constraint verification result:', constraints);
      if (constraints.length > 0) {
        console.log('Constraint created successfully!');
      } else {
        console.warn('Warning: Constraint not found after running fix.');
      }
    }

  } catch (error) {
    console.error('Error running fix:', error);
    process.exit(1);
  }
}

runMinimalFix()
  .then(() => console.log('Script completed'))
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });