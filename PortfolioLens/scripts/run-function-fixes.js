// Script to run the missing functions fix
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Create Supabase client
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

async function runFix() {
  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, './fix-missing-functions.sql');
    console.log(`Reading SQL from: ${sqlPath}`);
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Split SQL into individual statements for better error handling
    const statements = sqlContent
      .split(/;\s*$/m)  // Split on semicolons at the end of lines
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => s + ';');

    console.log(`Found ${statements.length} SQL statements to execute`);

    // Function to safely execute a SQL statement
    async function executeSql(sql, description) {
      try {
        console.log(`Executing: ${description}`);
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
        
        if (error) {
          console.error(`Error executing statement: ${description}`, error);
          return false;
        }
        
        console.log(`Successfully executed: ${description}`);
        return true;
      } catch (err) {
        console.error(`Exception executing statement: ${description}`, err.message);
        return false;
      }
    }

    // Execute each statement with a description
    let successCount = 0;
    let failCount = 0;

    // Execute is_valid_user_id function
    if (await executeSql(statements[0], "Create is_valid_user_id function")) {
      successCount++;
    } else {
      failCount++;
    }

    // Enable RLS on users table
    if (await executeSql(statements[1], "Enable RLS on users table")) {
      successCount++;
    } else {
      failCount++;
    }

    // Create view policy for users table
    if (await executeSql(statements[2], "Create view policy for users table")) {
      successCount++;
    } else {
      failCount++;
    }
    
    if (await executeSql(statements[3], "Create insert policy for users")) {
      successCount++;
    } else {
      failCount++;
    }

    // Create admin insert policy for users table
    if (await executeSql(statements[4], "Create admin insert policy for users")) {
      successCount++;
    } else {
      failCount++;
    }
    
    if (await executeSql(statements[5], "Create admin insert policy for users")) {
      successCount++;
    } else {
      failCount++;
    }

    // Create get_admin_stats function
    if (await executeSql(statements[6], "Create get_admin_stats function")) {
      successCount++;
    } else {
      failCount++;
    }

    // Create admin_audit_log table
    if (await executeSql(statements[7], "Create admin_audit_log table")) {
      successCount++;
    } else {
      failCount++;
    }

    // Enable RLS on admin_audit_log
    if (await executeSql(statements[8], "Enable RLS on admin_audit_log")) {
      successCount++;
    } else {
      failCount++;
    }

    // Create view policy for admin_audit_log
    if (await executeSql(statements[9], "Create view policy for admin_audit_log")) {
      successCount++;
    } else {
      failCount++;
    }
    
    if (await executeSql(statements[10], "Create view policy for admin_audit_log")) {
      successCount++;
    } else {
      failCount++;
    }

    // Create sync_auth_users function
    if (await executeSql(statements[11], "Create sync_auth_users function")) {
      successCount++;
    } else {
      failCount++;
    }

    // Run sync_auth_users function
    if (await executeSql(statements[12], "Run sync_auth_users function")) {
      successCount++;
    } else {
      failCount++;
    }

    // Create is_admin function
    if (await executeSql(statements[13], "Create is_admin function")) {
      successCount++;
    } else {
      failCount++;
    }

    // Create promote_to_admin function
    if (await executeSql(statements[14], "Create promote_to_admin function")) {
      successCount++;
    } else {
      failCount++;
    }

    console.log(`Fix completed: ${successCount} statements succeeded, ${failCount} failed`);

    // Verify if the functions were created successfully
    console.log("Verifying function creation...");
    
    const { data: functions, error: funcError } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        AND routine_type = 'FUNCTION'
        AND routine_name IN ('is_valid_user_id', 'get_admin_stats', 'sync_auth_users', 'is_admin', 'promote_to_admin');
      `
    });

    if (funcError) {
      console.error("Error verifying functions:", funcError);
    } else {
      console.log("Functions found in database:", functions);
      const functionNames = functions.map(f => f.routine_name);
      
      if (functionNames.includes('is_valid_user_id')) {
        console.log("✅ is_valid_user_id function exists");
      } else {
        console.log("❌ is_valid_user_id function is missing");
      }
      
      if (functionNames.includes('get_admin_stats')) {
        console.log("✅ get_admin_stats function exists");
      } else {
        console.log("❌ get_admin_stats function is missing");
      }
    }

    // Test the get_admin_stats function
    const { data: statsData, error: statsError } = await supabase.rpc('get_admin_stats');
    if (statsError) {
      console.error("Error calling get_admin_stats:", statsError);
    } else {
      console.log("Admin stats result:", statsData);
    }

  } catch (error) {
    console.error('Error running fix:', error);
    process.exit(1);
  }
}

runFix()
  .then(() => console.log('Script completed'))
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });