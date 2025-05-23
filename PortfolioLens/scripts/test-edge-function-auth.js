/**
 * Test script to verify Edge Function authentication and sheet mapping
 * 
 * Usage: npm run test:edge-function
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://kukfbbaevndujnodafnk.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseAnonKey) {
  console.error('Error: Supabase anon key is not set in environment variables');
  console.error('Looked for: VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_KEY, SUPABASE_ANON_KEY');
  process.exit(1);
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('🔧 Testing Edge Function Authentication...\n');

async function testHealthCheck() {
  console.log('1️⃣ Testing health check endpoint...');
  
  try {
    // First, sign in with test user if available
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (!session) {
      console.log('   ⚠️  No active session. Please sign in first.');
      return false;
    }
    
    console.log('   ✅ Authenticated as:', session.user.email);
    
    // Test health check via supabase.functions.invoke
    const { data, error } = await supabase.functions.invoke('process-import-job', {
      body: {
        job_id: 'health-check',
        filename: 'health.csv',
        user_id: session.user.id
      }
    });
    
    if (error) {
      console.error('   ❌ Health check failed:', error);
      return false;
    }
    
    console.log('   ✅ Health check response:', data);
    return true;
    
  } catch (error) {
    console.error('   ❌ Unexpected error:', error);
    return false;
  }
}

async function testTemplateWithSheetMappings() {
  console.log('\n2️⃣ Testing template with sheet mappings...');
  
  try {
    // Get a template with sheet mappings
    const { data: templates, error: templateError } = await supabase
      .from('mapping_templates')
      .select('*')
      .not('sheet_mappings', 'is', null)
      .limit(1);
    
    if (templateError) {
      console.error('   ❌ Failed to fetch templates:', templateError);
      return false;
    }
    
    if (!templates || templates.length === 0) {
      console.log('   ⚠️  No active templates with sheet mappings found');
      return false;
    }
    
    const template = templates[0];
    console.log('   ✅ Found template:', template.name);
    console.log('   📋 Sheet mappings:', JSON.stringify(template.sheet_mappings, null, 2));
    
    // Check if sheet_mappings is properly formatted
    if (Array.isArray(template.sheet_mappings)) {
      console.log('   ✅ Sheet mappings is an array with', template.sheet_mappings.length, 'mappings');
    } else {
      console.log('   ⚠️  Sheet mappings is not an array:', typeof template.sheet_mappings);
    }
    
    return true;
    
  } catch (error) {
    console.error('   ❌ Unexpected error:', error);
    return false;
  }
}

async function testImportJobCreation() {
  console.log('\n3️⃣ Testing import job creation...');
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      console.log('   ⚠️  No active session. Skipping test.');
      return false;
    }
    
    // Create a test import job
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .insert({
        filename: 'test-auth-check.xlsx',
        bucket_path: `${session.user.id}/test-auth-check.xlsx`,
        template_id: null,
        status: 'pending',
        user_id: session.user.id
      })
      .select()
      .single();
    
    if (jobError) {
      console.error('   ❌ Failed to create import job:', jobError);
      return false;
    }
    
    console.log('   ✅ Created import job:', job.id);
    
    // Clean up - delete the test job
    const { error: deleteError } = await supabase
      .from('import_jobs')
      .delete()
      .eq('id', job.id);
    
    if (deleteError) {
      console.error('   ⚠️  Failed to clean up test job:', deleteError);
    } else {
      console.log('   ✅ Cleaned up test job');
    }
    
    return true;
    
  } catch (error) {
    console.error('   ❌ Unexpected error:', error);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Edge Function tests...\n');
  console.log('📍 Supabase URL:', supabaseUrl);
  console.log('📍 Edge Function URL:', `${supabaseUrl}/functions/v1/process-import-job`);
  console.log('\n' + '='.repeat(60) + '\n');
  
  const healthCheckPassed = await testHealthCheck();
  const templateTestPassed = await testTemplateWithSheetMappings();
  const jobTestPassed = await testImportJobCreation();
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Results:');
  console.log('   Health Check:', healthCheckPassed ? '✅ PASSED' : '❌ FAILED');
  console.log('   Template Test:', templateTestPassed ? '✅ PASSED' : '❌ FAILED');
  console.log('   Job Creation:', jobTestPassed ? '✅ PASSED' : '❌ FAILED');
  
  const allPassed = healthCheckPassed && templateTestPassed && jobTestPassed;
  console.log('\n🏁 Overall:', allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
  
  if (!allPassed) {
    console.log('\n💡 Troubleshooting tips:');
    if (!healthCheckPassed) {
      console.log('   • Ensure the Edge Function is deployed: supabase functions deploy process-import-job');
      console.log('   • Check that you are signed in with a valid user');
    }
    if (!templateTestPassed) {
      console.log('   • Ensure mapping_templates table has active templates with sheet_mappings');
      console.log('   • Check that sheet_mappings column is properly formatted as JSON array');
    }
    if (!jobTestPassed) {
      console.log('   • Check that import_jobs table exists and has proper RLS policies');
    }
  }
}

// Run the tests
runTests().catch(console.error);