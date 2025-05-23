#!/usr/bin/env node

/**
 * Script to refresh the Supabase schema cache
 * 
 * This script calls the schema_cache_refresh() function to update
 * the PostgREST schema cache when database schema changes are made.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('❌ Missing Supabase URL in environment variables');
  console.error('Required: VITE_SUPABASE_URL or SUPABASE_URL');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('❌ Missing Supabase Service Role Key in environment variables');
  console.error('Required: SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error('💡 The service role key is needed to refresh the schema cache.');
  console.error('💡 You can find it in your Supabase dashboard under Settings > API');
  console.error('💡 Add it to your .env file as: SUPABASE_SERVICE_ROLE_KEY=your_service_key_here');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function refreshSchemaCache() {
  try {
    console.log('🔄 Refreshing Supabase schema cache...');
    
    // Call the schema refresh function
    const { data, error } = await supabase.rpc('schema_cache_refresh');
    
    if (error) {
      console.error('❌ Error refreshing schema cache:', error);
      process.exit(1);
    }
    
    console.log('✅ Schema cache refreshed successfully');
    
    // Also try to check if audit_logs table is accessible
    console.log('🔍 Checking audit_logs table accessibility...');
    
    const { data: tableCheck, error: tableError } = await supabase
      .from('audit_logs')
      .select('id')
      .limit(1);
      
    if (tableError) {
      console.warn('⚠️ audit_logs table check failed:', tableError.message);
      console.log('💡 This might be normal if the table is empty or RLS is blocking access');
    } else {
      console.log('✅ audit_logs table is accessible');
    }
    
    console.log('🎉 Schema cache refresh completed');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

refreshSchemaCache();