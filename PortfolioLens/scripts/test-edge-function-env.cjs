const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kukfbbaevndujnodafnk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2ZiYmFldm5kdWpub2RhZm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMjk4NzcsImV4cCI6MjA2MTcwNTg3N30.h32Q0CyVxT4D_Gp9O-nngRo9iUs6CPcEGxq-BpQidxA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testEnv() {
  console.log('Testing Edge Function environment variables...\n');
  
  try {
    // Create a special test endpoint
    const { data, error } = await supabase.functions.invoke(
      'sync-google-drive',
      {
        body: { 
          testEnv: true
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
    
    console.log('Environment test result:', data);
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testEnv();