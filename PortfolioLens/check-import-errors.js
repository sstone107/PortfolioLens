import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkImportErrors() {
  console.log('Checking recent import errors...\n');
  
  try {
    // Get the most recent import job
    const { data: recentJob, error: jobError } = await supabase
      .from('import_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (jobError || !recentJob) {
      console.log('No recent import jobs found');
      return;
    }
    
    console.log(`Recent import job: ${recentJob.id}`);
    console.log(`Status: ${recentJob.status}`);
    console.log(`File: ${recentJob.original_filename}\n`);
    
    // Check sheet status for this job
    const { data: sheets, error: sheetsError } = await supabase
      .from('import_sheet_status')
      .select('*')
      .eq('job_id', recentJob.id)
      .order('created_at', { ascending: false });
    
    if (!sheetsError && sheets?.length > 0) {
      console.log('Sheet processing status:');
      sheets.forEach(sheet => {
        console.log(`\n📄 ${sheet.sheet_name}:`);
        console.log(`   Status: ${sheet.status}`);
        console.log(`   Target table: ${sheet.target_table}`);
        console.log(`   Processed: ${sheet.processed_rows}, Failed: ${sheet.failed_rows}`);
        if (sheet.error_message) {
          console.log(`   ❌ Error: ${sheet.error_message}`);
        }
      });
    }
    
    // Get detailed error logs
    const { data: logs, error: logsError } = await supabase
      .from('import_logs')
      .select('*')
      .eq('job_id', recentJob.id)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (!logsError && logs?.length > 0) {
      console.log('\n\n📋 Import logs:');
      console.log('================');
      logs.forEach(log => {
        const icon = log.level === 'error' ? '❌' : log.level === 'warning' ? '⚠️' : '✅';
        console.log(`\n${icon} [${log.level.toUpperCase()}] ${log.message}`);
        if (log.details) {
          console.log('Details:', JSON.stringify(log.details, null, 2));
        }
      });
    }
    
    // Check if any data made it to the tables
    const tables = ['ln_borrowers', 'ln_loan_information', 'ln_loans'];
    console.log('\n\n📊 Table row counts:');
    console.log('===================');
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (!error) {
        console.log(`${table}: ${count || 0} rows`);
      }
    }
    
  } catch (err) {
    console.error('Error checking import errors:', err);
  }
}

checkImportErrors();