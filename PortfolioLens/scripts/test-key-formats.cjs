const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://kukfbbaevndujnodafnk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2ZiYmFldm5kdWpub2RhZm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMjk4NzcsImV4cCI6MjA2MTcwNTg3N30.h32Q0CyVxT4D_Gp9O-nngRo9iUs6CPcEGxq-BpQidxA';

const supabase = createClient(supabaseUrl, supabaseKey);

// Load the original key file
const keyPath = 'C:\\Users\\sston\\Downloads\\greenway-452013-d7eadcb745e9.json';
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

async function testKeyFormat() {
  console.log('Testing different private key formats in Edge Function...\n');
  
  try {
    // Test with the key exactly as stored in Supabase (single escaped newlines)
    const { data, error } = await supabase.functions.invoke(
      'sync-google-drive',
      {
        body: { 
          testKeyFormat: true,
          email: serviceAccount.client_email,
          privateKey: serviceAccount.private_key
        }
      }
    );
    
    if (error) {
      console.error('Error:', error.message);
      if (error.context) {
        const body = await error.context.text();
        console.error('Response:', body);
      }
      return;
    }
    
    console.log('Key format test result:', JSON.stringify(data, null, 2));
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testKeyFormat();