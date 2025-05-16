/**
 * Fix All Templates Script
 * 
 * This script fixes the storage format of all templates to ensure consistency.
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

async function main() {
  try {
    console.log('Fixing all templates...');
    
    // Run the fix_all_template_storage function
    const { data, error } = await supabaseClient.rpc('fix_all_template_storage');
    
    if (error) {
      console.error('Error fixing templates:', error);
      throw error;
    }
    
    console.log(`Fixed ${data.templates_fixed} templates`);
    console.log('\nSUMMARY:');
    
    // Print a summary of each fixed template
    if (data.details && Array.isArray(data.details)) {
      data.details.forEach((item, index) => {
        const template = item.result;
        console.log(`\n${index + 1}. Template: ${template.name} (${template.id})`);
        console.log(`   - sheet_mappings type: ${template.sheet_mappings_type}`);
        console.log(`   - sheetMappings type: ${template.sheetMappings_type}`);
        console.log(`   - Extracted sheets length: ${
          Array.isArray(template.extracted_sheet_mappings) ? 
            template.extracted_sheet_mappings.length : 
            'Not an array'
        }`);
      });
    }
    
    console.log('\nAll templates have been standardized. The template editor should now work properly.');
    
  } catch (err) {
    console.error('Error running fix-all-templates:', err);
    process.exit(1);
  }
}

// Run the script
main();