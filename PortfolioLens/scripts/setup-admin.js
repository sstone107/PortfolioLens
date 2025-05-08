// Script to grant an existing user admin privileges
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function promoteUserToAdmin() {
  try {
    // First, list all users
    const { data: users, error } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT u.id, u.email, u.created_at, 
          CASE WHEN EXISTS (
            SELECT 1 FROM user_role_assignments ura 
            JOIN user_roles ur ON ura.role_id = ur.id 
            WHERE ura.user_id = u.id AND ur.name = 'Admin'
          ) THEN 'Yes' ELSE 'No' END as is_admin
        FROM users u
        ORDER BY u.created_at DESC
        LIMIT 20;
      `
    });

    if (error) {
      console.error("Error fetching users:", error);
      process.exit(1);
    }

    console.log("\n==== Available Users ====");
    console.log("ID | Email | Created At | Is Admin");
    console.log("----------------------------------------");
    
    if (users && users.length > 0) {
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.email} | ${new Date(user.created_at).toLocaleString()} | ${user.is_admin}`);
      });
    } else {
      console.log("No users found.");
      process.exit(1);
    }

    rl.question('\nEnter the email of the user you want to make admin: ', async (email) => {
      if (!email) {
        console.log("No email provided.");
        rl.close();
        return;
      }

      // Check if the user exists
      const { data: userExists, error: userExistsError } = await supabase.rpc('exec_sql', {
        sql_query: `SELECT EXISTS(SELECT 1 FROM users WHERE email = '${email}');`
      });

      if (userExistsError) {
        console.error("Error checking if user exists:", userExistsError);
        rl.close();
        return;
      }

      if (!userExists || !userExists[0] || !userExists[0].exists) {
        console.log(`User with email ${email} not found.`);
        rl.close();
        return;
      }

      console.log(`Promoting user ${email} to admin...`);

      // Call our promote_to_admin function
      const { data: promoteResult, error: promoteError } = await supabase.rpc('exec_sql', {
        sql_query: `SELECT promote_to_admin('${email}');`
      });

      if (promoteError) {
        console.error("Error promoting user to admin:", promoteError);
        rl.close();
        return;
      }

      console.log("Result:", promoteResult ? promoteResult[0].promote_to_admin : "No response");
      console.log(`\nUser ${email} has been promoted to admin.`);
      console.log("Please refresh your application and sign in again to see the changes.");
      
      rl.close();
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    rl.close();
    process.exit(1);
  }
}

console.log("========================================");
console.log("= PortfolioLens - Admin Setup Utility =");
console.log("========================================");
console.log("\nThis utility will help you promote a user to admin role.");
console.log("This is needed to access the admin panel and manage the system.");

promoteUserToAdmin();