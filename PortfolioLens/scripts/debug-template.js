/**
 * Debug script to inspect the structure of a template
 * Use: node debug-template.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Set up Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kukfbbaevndujnodafnk.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_KEY;

if (!supabaseKey) {
  console.error('Error: Supabase key not found. Set VITE_SUPABASE_KEY environment variable.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Function to get templates
async function getTemplates() {
  try {
    // Fetch all templates
    const { data, error } = await supabase
      .from('mapping_templates')
      .select('*');
    
    if (error) {
      console.error('Error fetching templates:', error);
      return;
    }
    
    console.log(`Found ${data.length} templates`);
    
    // Display each template
    for (const template of data) {
      console.log('\n---------- TEMPLATE ----------');
      console.log(`ID: ${template.templateId}`);
      console.log(`Name: ${template.templateName}`);
      console.log(`Description: ${template.description}`);
      console.log(`File pattern: ${template.originalFileNamePattern || template.file_pattern}`);
      console.log(`Created at: ${template.createdAt}`);
      
      // Check for mappings
      console.log('\nSHEET MAPPINGS:');
      if (template.sheetMappings) {
        if (Array.isArray(template.sheetMappings)) {
          console.log(`Has sheet mappings array: ${template.sheetMappings.length} sheets`);
          template.sheetMappings.forEach((sheet, i) => {
            console.log(`- Sheet ${i+1}: ${sheet.originalName} → ${sheet.mappedName}`);
          });
        } else {
          console.log('sheetMappings is not an array:', typeof template.sheetMappings);
          console.log(JSON.stringify(template.sheetMappings, null, 2).substring(0, 500) + '...');
        }
      } else {
        console.log('No sheetMappings property');
      }
      
      // Check alternative format
      if (template.sheet_mappings) {
        console.log('\nSHEET_MAPPINGS (snake_case):');
        if (Array.isArray(template.sheet_mappings)) {
          console.log(`Has sheet_mappings array: ${template.sheet_mappings.length} sheets`);
        } else {
          console.log('sheet_mappings is not an array:', typeof template.sheet_mappings);
          console.log(JSON.stringify(template.sheet_mappings, null, 2).substring(0, 500) + '...');
        }
      } else {
        console.log('No sheet_mappings property');
      }
      
      console.log('-------------------------------\n');
    }
    
    // Look for RPC function
    console.log('Checking for RPC functions:');
    const { data: rpcFunctions, error: rpcError } = await supabase.rpc('list_functions');
    
    if (rpcError) {
      console.error('Error checking RPC functions:', rpcError);
    } else if (rpcFunctions) {
      console.log('Found RPC functions:', rpcFunctions);
    } else {
      console.log('No RPC functions found or function not available');
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

// Run the function
getTemplates().catch(console.error);