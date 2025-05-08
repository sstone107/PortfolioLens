#!/usr/bin/env node
// This script directly executes the SQL to fix the encrypted_password requirement
// and manually syncs users from auth.users to the users table

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://kukfbbaevndujnodafnk.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY must be set in environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
});

async function fixEncryptedPasswordAndSyncUsers() {
  console.log('Starting to fix encrypted_password constraint and sync users...');

  try {
    // Step 1: Make encrypted_password nullable
    console.log('Step 1: Making encrypted_password nullable...');
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql_query: `
        UPDATE users SET encrypted_password = 'PLACEHOLDER_PASSWORD' WHERE encrypted_password IS NULL;
        ALTER TABLE users ALTER COLUMN encrypted_password DROP NOT NULL;
      `
    });

    if (alterError) {
      console.error('Error making encrypted_password nullable:', alterError);
      return;
    }
    console.log('Successfully made encrypted_password nullable.');

    // Step 2: Get auth users
    console.log('Step 2: Getting users from auth.users...');
    const { data: authUsers, error: authError } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT id, email, raw_user_meta_data, created_at, updated_at
        FROM auth.users
        ORDER BY created_at DESC;
      `
    });

    if (authError) {
      console.error('Error getting auth users:', authError);
      return;
    }

    if (!authUsers || authUsers.length === 0) {
      console.log('No auth users found.');
      return;
    }

    console.log(`Found ${authUsers.length} auth users.`);

    // Step 3: Get user roles
    console.log('Step 3: Getting user roles...');
    const { data: roles, error: rolesError } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT id, name
        FROM user_roles
        ORDER BY name;
      `
    });

    if (rolesError) {
      console.error('Error getting roles:', rolesError);
      return;
    }

    if (!roles || roles.length === 0) {
      console.error('No roles found. Cannot proceed.');
      return;
    }

    // Find Admin role or default to first role
    const adminRole = roles.find(r => r.name === 'Admin') || roles[0];
    console.log(`Using role: ${adminRole.name} (${adminRole.id}) as default.`);

    // Step 4: Sync users one by one
    console.log('Step 4: Syncing users to users table...');
    let syncCount = 0;

    for (const user of authUsers) {
      try {
        const fullName = user.raw_user_meta_data && 
          (user.raw_user_meta_data.full_name || user.raw_user_meta_data.name) || 
          user.email.split('@')[0];

        const { error: insertError } = await supabase.rpc('exec_sql', {
          sql_query: `
            INSERT INTO users (
              id,
              email,
              full_name,
              encrypted_password,
              role_id,
              is_active,
              created_at,
              updated_at
            )
            VALUES (
              '${user.id}',
              '${user.email.replace(/'/g, "''")}',
              '${fullName.replace(/'/g, "''")}',
              'PLACEHOLDER_PASSWORD',
              '${adminRole.id}',
              true,
              '${user.created_at}',
              '${user.updated_at}'
            )
            ON CONFLICT (id) DO UPDATE
            SET
              email = EXCLUDED.email,
              full_name = EXCLUDED.full_name,
              role_id = EXCLUDED.role_id,
              updated_at = EXCLUDED.updated_at;
          `
        });

        if (insertError) {
          console.error(`Error syncing user ${user.email}:`, insertError);
        } else {
          syncCount++;
          console.log(`Synced user: ${user.email}`);
        }
      } catch (err) {
        console.error(`Exception syncing user ${user.email}:`, err);
      }
    }

    console.log(`Successfully synced ${syncCount} out of ${authUsers.length} users.`);

    // Step 5: Also assign admin role to users in the user_role_assignments table
    console.log('Step 5: Assigning admin role to users in user_role_assignments...');
    const { error: assignError } = await supabase.rpc('exec_sql', {
      sql_query: `
        INSERT INTO user_role_assignments (user_id, role_id, created_at, updated_at)
        SELECT 
          u.id, 
          '${adminRole.id}',
          NOW(),
          NOW()
        FROM 
          users u
        WHERE 
          NOT EXISTS (
            SELECT 1 FROM user_role_assignments ura 
            WHERE ura.user_id = u.id AND ura.role_id = '${adminRole.id}'
          )
        ON CONFLICT (user_id, role_id) DO NOTHING;
      `
    });

    if (assignError) {
      console.error('Error assigning admin role:', assignError);
    } else {
      console.log('Successfully assigned admin role to users.');
    }

    console.log('All operations completed.');

  } catch (err) {
    console.error('Unhandled error:', err);
  }
}

fixEncryptedPasswordAndSyncUsers()
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });