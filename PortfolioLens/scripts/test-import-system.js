#!/usr/bin/env node

import { createRequire } from 'module';
import { join } from 'path';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
dotenv.config({ path: join(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testImportSystem() {
  console.log('🔍 Testing Import System Setup...\n');

  try {
    // 1. Check if validate_login_location function exists
    console.log('1. Checking validate_login_location function...');
    const { data: funcData, error: funcError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT proname 
        FROM pg_proc 
        WHERE proname = 'validate_login_location' 
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
      `
    });

    if (funcError) {
      console.error('❌ Error checking function:', funcError.message);
    } else if (funcData && funcData.length > 0) {
      console.log('✅ validate_login_location function exists');
    } else {
      console.log('❌ validate_login_location function NOT FOUND');
    }

    // 2. Check RLS policies on import_sheet_status
    console.log('\n2. Checking RLS policies on import_sheet_status...');
    const { data: rlsData, error: rlsError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT polname, polcmd 
        FROM pg_policy 
        WHERE polrelid = 'import_sheet_status'::regclass::oid
        ORDER BY polname;
      `
    });

    if (rlsError) {
      console.error('❌ Error checking RLS policies:', rlsError.message);
    } else if (rlsData && rlsData.length > 0) {
      console.log(`✅ Found ${rlsData.length} RLS policies:`);
      rlsData.forEach(policy => {
        const cmdMap = { r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE' };
        console.log(`   - ${policy.polname} (${cmdMap[policy.polcmd] || policy.polcmd})`);
      });
    } else {
      console.log('❌ No RLS policies found on import_sheet_status');
    }

    // 3. Check if RLS is enabled
    console.log('\n3. Checking if RLS is enabled on import_sheet_status...');
    const { data: rlsEnabled, error: rlsEnabledError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT relrowsecurity 
        FROM pg_class 
        WHERE relname = 'import_sheet_status' 
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
      `
    });

    if (rlsEnabledError) {
      console.error('❌ Error checking RLS status:', rlsEnabledError.message);
    } else if (rlsEnabled && rlsEnabled.length > 0 && rlsEnabled[0].relrowsecurity) {
      console.log('✅ RLS is enabled on import_sheet_status');
    } else {
      console.log('❌ RLS is NOT enabled on import_sheet_status');
    }

    // 4. Check permissions
    console.log('\n4. Checking permissions on import_sheet_status...');
    const { data: permData, error: permError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT has_table_privilege('authenticated', 'import_sheet_status', 'INSERT') as can_insert,
               has_table_privilege('authenticated', 'import_sheet_status', 'SELECT') as can_select,
               has_table_privilege('authenticated', 'import_sheet_status', 'UPDATE') as can_update,
               has_table_privilege('authenticated', 'import_sheet_status', 'DELETE') as can_delete;
      `
    });

    if (permError) {
      console.error('❌ Error checking permissions:', permError.message);
    } else if (permData && permData.length > 0) {
      const perms = permData[0];
      console.log('Permissions for authenticated role:');
      console.log(`   - INSERT: ${perms.can_insert ? '✅' : '❌'}`);
      console.log(`   - SELECT: ${perms.can_select ? '✅' : '❌'}`);
      console.log(`   - UPDATE: ${perms.can_update ? '✅' : '❌'}`);
      console.log(`   - DELETE: ${perms.can_delete ? '✅' : '❌'}`);
    }

    // 5. Test Edge Function health check
    console.log('\n5. Testing Edge Function health check...');
    const healthUrl = `${supabaseUrl}/functions/v1/process-import-sheet/health`;
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Edge Function health check passed:', data);
      } else {
        console.log(`❌ Edge Function health check failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Failed to reach Edge Function:', error.message);
    }

    console.log('\n📊 Summary:');
    console.log('If any checks failed above, run the migration to fix them:');
    console.log('1. Go to Supabase Dashboard > SQL Editor');
    console.log('2. Run the contents of src/db/migrations/044_fix_background_import_policies.sql');
    console.log('3. Deploy the Edge Function: npx supabase functions deploy process-import-sheet');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

// Run the test
testImportSystem();