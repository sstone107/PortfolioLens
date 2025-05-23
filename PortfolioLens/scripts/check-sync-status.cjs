const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kukfbbaevndujnodafnk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2ZiYmFldm5kdWpub2RhZm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYxMjk4NzcsImV4cCI6MjA2MTcwNTg3N30.h32Q0CyVxT4D_Gp9O-nngRo9iUs6CPcEGxq-BpQidxA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSyncStatus() {
  console.log('Checking Google Drive sync status...\n');
  
  try {
    // Check sync history
    const { data: history, error: historyError } = await supabase
      .from('google_drive_sync_history')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(10);
    
    if (historyError) {
      console.error('Error checking history:', historyError);
    } else {
      console.log(`Total files previously synced: ${history?.length || 0}`);
      if (history && history.length > 0) {
        console.log('\nRecent synced files:');
        history.forEach(h => {
          console.log(`- ${h.file_name} (synced: ${new Date(h.synced_at).toLocaleDateString()})`);
        });
      }
    }
    
    // Check import jobs from Google Drive
    const { data: jobs, error: jobsError } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('source_metadata->>source', 'google_drive')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (jobsError) {
      console.error('Error checking jobs:', jobsError);
    } else {
      console.log(`\nTotal Google Drive import jobs: ${jobs?.length || 0}`);
      if (jobs && jobs.length > 0) {
        const statusCounts = jobs.reduce((acc, job) => {
          acc[job.status] = (acc[job.status] || 0) + 1;
          return acc;
        }, {});
        console.log('Status breakdown:', statusCounts);
        
        console.log('\nRecent import jobs:');
        jobs.forEach(job => {
          console.log(`- ${job.filename} (${job.status}) - ${new Date(job.created_at).toLocaleDateString()}`);
        });
      }
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

checkSyncStatus();