const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kukfbbaevndujnodafnk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2ZiYmFldm5kdWpub2RhZm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMjk4NzcsImV4cCI6MjA2MTcwNTg3N30.h32Q0CyVxT4D_Gp9O-nngRo9iUs6CPcEGxq-BpQidxA';

const supabase = createClient(supabaseUrl, supabaseKey);

const CONFIG_ID = process.argv[2];

async function testPattern() {
  if (!CONFIG_ID) {
    console.log('Usage: node scripts\\test-pattern-search.cjs <CONFIG_ID>');
    console.log('Get CONFIG_ID from the Google Drive sync configuration page');
    return;
  }
  
  console.log(`Testing pattern matching for config: ${CONFIG_ID}\n`);
  
  try {
    const { data, error } = await supabase.functions.invoke(
      'sync-google-drive',
      {
        body: { 
          configId: CONFIG_ID,
          testMode: true
        }
      }
    );
    
    if (error) {
      console.error('Error:', error.message);
      if (error.context) {
        const body = await error.context.text();
        console.error('Details:', body);
      }
      return;
    }
    
    if (data.results && data.results.length > 0) {
      data.results.forEach(result => {
        console.log(`\nFolder: ${result.config}`);
        console.log(`Template: ${result.template}`);
        console.log(`Pattern: ${result.pattern || 'All files'}`);
        console.log(`Total files found: ${result.totalFiles}`);
        console.log(`Matching files: ${result.matchingFiles.length}`);
        
        if (result.matchingFiles.length > 0) {
          console.log('\nMatching files:');
          result.matchingFiles.forEach((file, idx) => {
            console.log(`${idx + 1}. ${file.name}`);
            console.log(`   Modified: ${new Date(file.modifiedTime).toLocaleDateString()}`);
            console.log(`   Size: ${(parseInt(file.size) / 1024 / 1024).toFixed(2)} MB`);
          });
        }
      });
    } else {
      console.log('No results returned');
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testPattern();