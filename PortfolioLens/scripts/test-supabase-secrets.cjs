// Try to load dotenv if available
try {
  require('dotenv').config();
} catch (e) {
  console.log('Note: dotenv not available, using hardcoded values\n');
}

const { createClient } = require('@supabase/supabase-js');

// Use environment variables or hardcoded values
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kukfbbaevndujnodafnk.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2ZiYmFldm5kdWpub2RhZm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMjk4NzcsImV4cCI6MjA2MTcwNTg3N30.h32Q0CyVxT4D_Gp9O-nngRo9iUs6CPcEGxq-BpQidxA';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSecrets() {
  console.log('Testing Supabase Edge Function secrets...\n');
  
  try {
    const { data, error } = await supabase.functions.invoke(
      'sync-google-drive',
      {
        body: { debugMode: true }
      }
    );
    
    if (error) {
      console.error('Error calling function:', error);
      return;
    }
    
    console.log('Debug information from Edge Function:\n');
    console.log(JSON.stringify(data, null, 2));
    
    // Analyze the results
    console.log('\n\nAnalysis:');
    console.log('==========');
    
    if (!data.email.present || !data.privateKey.present) {
      console.log('❌ One or both secrets are missing!');
      console.log('   Make sure you added them to Edge Functions > Secrets');
      return;
    }
    
    // Check email
    if (data.email.value.includes('iam.gserviceaccount.com')) {
      console.log('✓ Email format looks correct');
    } else {
      console.log('❌ Email doesn\'t look like a service account');
    }
    
    // Check private key markers
    if (data.privateKey.sample.includes('BEGIN PRIVATE KEY')) {
      console.log('✓ Private key has BEGIN marker');
    } else {
      console.log('❌ Private key missing BEGIN marker');
    }
    
    // Check newlines
    if (data.privateKey.hasEscapedNewlines) {
      console.log('✓ Private key contains \\\\n characters (good for Supabase)');
    } else {
      console.log('❌ Private key missing escaped newline characters');
    }
    
    if (data.privateKey.length < 1600) {
      console.log('❌ Private key seems too short (expected ~1700 chars)');
    } else {
      console.log('✓ Private key length looks correct');
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

testSecrets();