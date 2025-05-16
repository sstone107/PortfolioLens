/**
 * Test script to check mapping_templates table
 */
import { supabaseClient } from '../../utility/supabaseClient';

// Check mapping_templates table directly
const checkTemplates = async () => {
  try {
    console.log('Checking mapping_templates table...');
    
    // First, check if the table exists
    const { data: tableExists, error: tableError } = await supabaseClient
      .from('mapping_templates')
      .select('count(*)', { count: 'exact', head: true });
    
    if (tableError) {
      console.error('Error checking mapping_templates table:', tableError);
      return;
    }
    
    console.log('mapping_templates table exists, fetching data...');
    
    // Fetch all templates
    const { data: templates, error: fetchError } = await supabaseClient
      .from('mapping_templates')
      .select('*');
    
    if (fetchError) {
      console.error('Error fetching templates:', fetchError);
      return;
    }
    
    console.log(`Found ${templates.length} templates:`, templates);
    
    // Let's try to insert a test template if none exist
    if (templates.length === 0) {
      console.log('No templates found, creating a test template...');
      
      // Create a simple test template
      const testTemplate = {
        name: 'Test Template',
        description: 'Created for testing purposes',
        header_row: 0,
        sheet_mappings: JSON.stringify([
          {
            sheetName: 'Sheet1',
            tableName: 'test_table',
            columns: []
          }
        ]),
        created_by: 'system'
      };
      
      // Insert the test template
      const { data: inserted, error: insertError } = await supabaseClient
        .from('mapping_templates')
        .insert(testTemplate)
        .select();
      
      if (insertError) {
        console.error('Error creating test template:', insertError);
      } else {
        console.log('Test template created successfully:', inserted);
      }
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
};

// Run the check
checkTemplates();

export default checkTemplates;