const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Load credentials
const keyPath = '/mnt/c/Users/sston/Downloads/greenway-452013-d7eadcb745e9.json';
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

const supabaseUrl = 'https://kukfbbaevndujnodafnk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2ZiYmFldm5kdWpub2RhZm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMjk4NzcsImV4cCI6MjA2MTcwNTg3N30.h32Q0CyVxT4D_Gp9O-nngRo9iUs6CPcEGxq-BpQidxA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFormats() {
  console.log('Testing different private key formats...\n');
  
  // Test 1: Exact format from JSON file
  console.log('1. Testing with exact JSON format (with \\n):');
  const result1 = await supabase.rpc('test_google_credentials_format', {
    email: serviceAccount.client_email,
    private_key: serviceAccount.private_key
  });
  console.log(JSON.stringify(result1.data, null, 2));
  
  // Test 2: With real newlines
  console.log('\n2. Testing with real newlines:');
  const keyWithRealNewlines = serviceAccount.private_key.replace(/\\n/g, '\n');
  const result2 = await supabase.rpc('test_google_credentials_format', {
    email: serviceAccount.client_email,
    private_key: keyWithRealNewlines
  });
  console.log(JSON.stringify(result2.data, null, 2));
  
  // Test 3: With double-escaped newlines (common Supabase issue)
  console.log('\n3. Testing with double-escaped newlines (\\\\n):');
  const keyWithDoubleEscape = serviceAccount.private_key.replace(/\\n/g, '\\\\n');
  const result3 = await supabase.rpc('test_google_credentials_format', {
    email: serviceAccount.client_email,
    private_key: keyWithDoubleEscape
  });
  console.log(JSON.stringify(result3.data, null, 2));
  
  console.log('\n\nRECOMMENDATIONS:');
  console.log('================');
  console.log('Based on the results above, use the format that shows:');
  console.log('- has_escaped_newlines: true');
  console.log('- has_real_newlines: false');
  console.log('- length: ~1700 characters');
  console.log('\nThis is usually Format 1 (exact JSON format with \\n)');
}

testFormats().catch(console.error);