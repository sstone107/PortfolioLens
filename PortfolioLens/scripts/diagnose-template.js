/**
 * Diagnose Template Script
 * 
 * This script diagnoses a specific template using the diagnose_template_full function
 * and also fixes the template storage format.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Supabase client configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project-url.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'your-service-key';

// Initialize client
const supabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// The template ID to diagnose - default or from args
const templateId = process.argv[2] || '1a607284-cc6d-4a9c-9767-072bcbbb2661';

async function main() {
  try {
    console.log(`Diagnosing template ${templateId}...`);
    
    // Diagnose the template
    console.log('DIAGNOSIS:');
    const { data: diagnosis, error: diagnoseError } = await supabaseClient.rpc('diagnose_template_full', {
      p_id: templateId
    });
    
    if (diagnoseError) {
      console.error('Template diagnosis failed:', diagnoseError);
      throw diagnoseError;
    }
    
    // Print selected fields for quick overview
    console.log('\nQUICK OVERVIEW:');
    console.log('ID:', diagnosis.id);
    console.log('Name:', diagnosis.name);
    console.log('sheet_mappings type:', diagnosis.sheet_mappings_type);
    console.log('sheetMappings type:', diagnosis.sheetMappings_type);
    console.log('Extracted sheet mappings length:', 
      Array.isArray(diagnosis.extracted_sheet_mappings) ? 
        diagnosis.extracted_sheet_mappings.length : 
        'Not an array');
    
    console.log('\nDETAILED DIAGNOSIS:');
    console.log(JSON.stringify(diagnosis, null, 2));
    
    // Fix the template
    console.log('\nFIXING TEMPLATE:');
    const { data: fixResult, error: fixError } = await supabaseClient.rpc('fix_template_storage', {
      p_id: templateId
    });
    
    if (fixError) {
      console.error('Template fix failed:', fixError);
      throw fixError;
    }
    
    console.log('\nAFTER FIX:');
    console.log('ID:', fixResult.id);
    console.log('sheet_mappings type:', fixResult.sheet_mappings_type);
    console.log('sheetMappings type:', fixResult.sheetMappings_type);
    console.log('Extracted sheet mappings length:', 
      Array.isArray(fixResult.extracted_sheet_mappings) ? 
        fixResult.extracted_sheet_mappings.length : 
        'Not an array');
        
    // Get the template after the fix using normal function to see what UI will get
    const { data: fixedTemplate, error: getError } = await supabaseClient.rpc('get_mapping_template_by_id', {
      p_id: templateId
    });
    
    if (getError) {
      console.error('Error getting fixed template:', getError);
      throw getError;
    }
    
    console.log('\nTEMPLATE RETRIEVED BY get_mapping_template_by_id:');
    console.log('sheetMappings type:', typeof fixedTemplate.sheetMappings);
    console.log('sheetMappings isArray:', Array.isArray(fixedTemplate.sheetMappings));
    if (Array.isArray(fixedTemplate.sheetMappings)) {
      console.log('sheetMappings length:', fixedTemplate.sheetMappings.length);
      if (fixedTemplate.sheetMappings.length > 0) {
        console.log('First sheet:', fixedTemplate.sheetMappings[0]);
      }
    }
    
  } catch (err) {
    console.error('Error running template diagnosis/fix:', err);
    process.exit(1);
  }
}

// Run the script
main();