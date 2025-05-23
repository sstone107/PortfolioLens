const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kukfbbaevndujnodafnk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2ZiYmFldm5kdWpub2RhZm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMjk4NzcsImV4cCI6MjA2MTcwNTg3N30.h32Q0CyVxT4D_Gp9O-nngRo9iUs6CPcEGxq-BpQidxA';

const supabase = createClient(supabaseUrl, supabaseKey);

// Replace with your actual folder ID
const FOLDER_ID = process.argv[2] || 'YOUR_FOLDER_ID_HERE';

async function testFolder() {
  if (FOLDER_ID === 'YOUR_FOLDER_ID_HERE') {
    console.log('Usage: node scripts\\test-specific-folder.cjs <FOLDER_ID>');
    console.log('Example: node scripts\\test-specific-folder.cjs 1AbC123dEfG456');
    return;
  }
  
  console.log(`Testing Google Drive folder: ${FOLDER_ID}\n`);
  
  try {
    const { data, error } = await supabase.functions.invoke(
      'sync-google-drive',
      {
        body: { 
          browseFolderId: FOLDER_ID
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
      data.files.slice(0, 10).forEach(file => {
        console.log(`  - ${file.name} (${file.mimeType})`);
      });
      if (data.files.length > 10) {
        console.log(`  ... and ${data.files.length - 10} more files`);
      }
    }
    
    if (data.folders && data.folders.length > 0) {
      console.log('\nSubfolders:');
      data.folders.forEach(folder => {
        console.log(`  - ${folder.name} (ID: ${folder.id})`);
      });
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testFolder();