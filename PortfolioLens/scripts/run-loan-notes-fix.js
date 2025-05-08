// Script to run the loan notes foreign key constraint fix
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

async function runMigration() {
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../src/db/migrations/019_fix_loan_notes_foreign_key.sql');
    console.log(`Reading migration from: ${migrationPath}`);
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Split migration into statements to handle potential errors more gracefully
    const statements = migrationSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => s + ';');

    console.log(`Executing migration in ${statements.length} statements...`);

    // Execute each statement separately
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}`);
      console.log(`Statement preview: ${statement.substring(0, 100)}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
        
        if (error) {
          console.error(`Error executing statement ${i + 1}:`, error);
          console.error('Statement:', statement);
          // Continue with next statement instead of stopping completely
        } else {
          console.log(`Statement ${i + 1} executed successfully.`);
        }
      } catch (err) {
        console.error(`Exception executing statement ${i + 1}:`, err.message);
        console.error('Statement:', statement);
        // Continue with next statement
      }
    }

    console.log('Migration execution completed.');

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
      console.log('Constraint verification:', constraints);
      if (constraints && constraints.length > 0) {
        console.log('Foreign key constraint created successfully!');
      } else {
        console.warn('Warning: Foreign key constraint was not found after migration.');
      }
    }

    // Check if the trigger was created
    const { data: triggers, error: triggerError } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = 'loan_notes' AND trigger_name = 'ensure_user_exists_before_note';
      `
    });

    if (triggerError) {
      console.error('Error verifying trigger:', triggerError);
    } else {
      console.log('Trigger verification:', triggers);
      if (triggers && triggers.length > 0) {
        console.log('Trigger created successfully!');
      } else {
        console.warn('Warning: Trigger was not found after migration.');
      }
    }

  } catch (error) {
    console.error('Error running migration:', error);
    process.exit(1);
  }
}

runMigration()
  .then(() => console.log('Script completed'))
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });