const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kukfbbaevndujnodafnk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2ZiYmFldm5kdWpub2RhZm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMjk4NzcsImV4cCI6MjA2MTcwNTg3N30.h32Q0CyVxT4D_Gp9O-nngRo9iUs6CPcEGxq-BpQidxA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testBrowse() {
  console.log('Testing Google Drive browse functionality...\n');
  
  try {
    // Test browsing the root folder
    console.log('1. Browsing root folder...');
    const { data, error } = await supabase.functions.invoke(
      'sync-google-drive',
      {
        body: { 
          browseFolderId: 'root'
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
    
    console.log('Success! Found:');
    console.log(`- ${data.files?.length || 0} files`);
    console.log(`- ${data.folders?.length || 0} folders\n`);
    
    if (data.files && data.files.length > 0) {
      console.log('Files:');
      data.files.forEach(file => {
        console.log(`  - ${file.name} (${file.mimeType})`);
      });
    }
    
    if (data.folders && data.folders.length > 0) {
      console.log('\nFolders:');
      data.folders.forEach(folder => {
        console.log(`  - ${folder.name} (ID: ${folder.id})`);
      });
    }
    
    if (!data.files?.length && !data.folders?.length) {
      console.log('\nNo files or folders found.');
      console.log('Make sure to share folders with: portfoliolens-drive-sync@greenway-452013.iam.gserviceaccount.com');
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testBrowse();