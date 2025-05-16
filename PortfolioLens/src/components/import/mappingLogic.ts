/**
 * Mapping Logic for Excel/CSV imports
 * Provides utility functions for managing mapping templates
 */
import { supabaseClient } from '../../utility/supabaseClient';
import { MappingTemplate, SheetMapping } from '../../store/batchImportStore';
import { v4 as uuidv4 } from 'uuid';
import { calculateSimilarity } from './utils/stringUtils';

/**
 * Save a mapping template to Supabase using RPC
 */
export const saveTemplate = async (template: Partial<MappingTemplate>): Promise<MappingTemplate> => {
  try {
    console.log('Saving template using RPC:', template);
    
    // Make sure we have required fields
    if (!template.name) {
      throw new Error('Template name is required');
    }
    
    // Get current user
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Extract file extension for source file type
    const fileExtension = template.filePattern?.split('.').pop()?.toLowerCase() || 'xlsx';
    const sourceFileType = template.sourceFileType || 
                          (fileExtension === 'csv' ? 'csv' : 
                           fileExtension === 'json' ? 'json' : 'xlsx');
    
    // Ensure sheetMappings is properly formatted
    let sheetMappingsValue = template.sheetMappings;
    // If null or undefined, set to empty array
    if (!sheetMappingsValue) {
      sheetMappingsValue = [];
    }
    // If it's a string, try to parse it
    if (typeof sheetMappingsValue === 'string') {
      try {
        sheetMappingsValue = JSON.parse(sheetMappingsValue);
      } catch (e) {
        console.error('Failed to parse sheetMappings string:', e);
        sheetMappingsValue = [];
      }
    }
    // If it has a sheets property, extract it
    if (typeof sheetMappingsValue === 'object' && !Array.isArray(sheetMappingsValue) && 'sheets' in sheetMappingsValue) {
      sheetMappingsValue = sheetMappingsValue.sheets;
    }
    
    console.log('Using new RPC functions with processed sheetMappings:', sheetMappingsValue);
    
    // Use the new save_template_v2 function
    const { data, error } = await supabaseClient.rpc('save_template_v2', {
      p_template_name: template.name,
      p_template_description: template.description || '',
      p_template_servicer_id: template.servicerId,
      p_template_file_pattern: template.filePattern,
      p_template_header_row: template.headerRow || 0,
      p_template_table_prefix: template.tablePrefix || null,
      p_template_sheet_mappings: sheetMappingsValue,
      p_template_id: template.id || null,
      p_template_source_file_type: sourceFileType
    });
    
    if (error) {
      console.error('Error saving template via save_template_v2:', error);
      
      // As last resort, try specific create function
      if (!template.id) {
        console.log('Trying create_new_mapping_template as last resort');
        const { data: createData, error: createError } = await supabaseClient.rpc('create_new_mapping_template', {
          p_template_name: template.name,
          p_template_description: template.description || '',
          p_template_servicer_id: template.servicerId,
          p_template_file_pattern: template.filePattern,
          p_template_header_row: template.headerRow || 0,
          p_template_table_prefix: template.tablePrefix || null,
          p_template_sheet_mappings: sheetMappingsValue,
          p_template_source_file_type: sourceFileType
        });
        
        if (createError) {
          console.error('Failed with create_new_mapping_template:', createError);
          throw createError;
        }
        
        console.log('Template created successfully via create_new_mapping_template:', createData);
        return createData as MappingTemplate;
      }
      
      throw error;
    }
    
    console.log('Template saved successfully via save_template_v2:', data);
    return data as MappingTemplate;
  } catch (error) {
    console.error('Error saving template:', error);
    throw error;
  }
};

/**
 * Load all mapping templates
 */
export const loadTemplates = async (): Promise<MappingTemplate[]> => {
  try {
    // Use RPC instead of direct table query
    const { data, error } = await supabaseClient
      .rpc('get_mapping_templates');
    
    if (error) {
      console.error('Error calling get_mapping_templates RPC:', error);
      throw error;
    }
    
    if (!data || !Array.isArray(data)) {
      console.warn('No templates returned or unexpected response format:', data);
      return [];
    }
    
    return data as MappingTemplate[];
  } catch (error) {
    console.error('Error loading templates:', error);
    throw error;
  }
};

/**
 * Load a specific template by ID
 */
export const loadTemplateById = async (id: string): Promise<MappingTemplate> => {
  try {
    console.log(`Loading template by ID: ${id}`);
    
    // Before loading, try to normalize the template structure
    try {
      const { data: fixResult, error: fixError } = await supabaseClient.rpc('fix_template_storage', {
        p_id: id
      });
      
      if (!fixError) {
        console.log('Successfully normalized template storage before loading:', fixResult);
      } else {
        console.warn('Error fixing template storage before loading, continuing with load:', fixError);
      }
    } catch (fixErr) {
      console.warn('Exception when trying to fix template storage before loading:', fixErr);
    }
    
    // Use RPC instead of direct table query
    const { data, error } = await supabaseClient
      .rpc('get_mapping_template_by_id', { p_id: id });
    
    if (error) {
      console.error('Error calling get_mapping_template_by_id RPC:', error);
      throw error;
    }
    
    if (!data) {
      throw new Error(`Template with ID ${id} not found`);
    }
    
    console.log('Loaded template data:', data);
    
    // Ensure sheetMappings is in the expected format
    let template = data as MappingTemplate;
    
    // If debugging is needed, run diagnose_template_full to get detailed information
    try {
      const { data: diagnosisData, error: diagnosisError } = await supabaseClient.rpc('diagnose_template_full', {
        p_id: id
      });
      
      if (!diagnosisError) {
        console.log('Template diagnosis data:', diagnosisData);
      }
    } catch (diagErr) {
      console.warn('Error diagnosing template:', diagErr);
    }
    
    return template;
  } catch (error) {
    console.error(`Error loading template ${id}:`, error);
    throw error;
  }
};

/**
 * Delete a template by ID
 */
export const deleteTemplate = async (id: string): Promise<void> => {
  try {
    // Use RPC instead of direct table query
    const { data, error } = await supabaseClient
      .rpc('delete_mapping_template', { p_id: id });
    
    if (error) {
      console.error('Error calling delete_mapping_template RPC:', error);
      throw error;
    }
    
    // Check if the deletion was successful 
    if (data === false) {
      throw new Error(`Failed to delete template with ID ${id}`);
    }
  } catch (error) {
    console.error(`Error deleting template ${id}:`, error);
    throw error;
  }
};

/**
 * Export template to JSON file
 */
export const exportTemplate = async (template: MappingTemplate): Promise<void> => {
  try {
    // Create a formatted template object for export
    const exportData = {
      templateName: template.name,
      description: template.description,
      headerRow: template.headerRow,
      tablePrefix: template.tablePrefix,
      servicerId: template.servicerId,
      filePattern: template.filePattern,
      sheets: template.sheetMappings,
      version: template.version,
      exportedAt: new Date().toISOString()
    };
    
    // Convert to JSON
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // Create file download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = `${template.name.replace(/\s+/g, '_')}_template.json`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting template:', error);
    throw error;
  }
};

/**
 * Import template from JSON file
 */
export const importTemplate = async (file: File): Promise<MappingTemplate> => {
  try {
    // Read file
    const fileContent = await file.text();
    
    // Parse JSON
    const importData = JSON.parse(fileContent);
    
    // Validate required fields
    if (!importData.templateName) {
      throw new Error('Invalid template file: Missing template name');
    }
    
    if (!importData.sheets || !Array.isArray(importData.sheets)) {
      throw new Error('Invalid template file: Missing or invalid sheets data');
    }
    
    // Create template object
    const template: Partial<MappingTemplate> = {
      id: uuidv4(), // Generate new ID for imported template
      name: `${importData.templateName} (Imported)`,
      description: importData.description,
      headerRow: importData.headerRow || 0,
      tablePrefix: importData.tablePrefix,
      servicerId: importData.servicerId,
      filePattern: importData.filePattern,
      sheetMappings: importData.sheets,
      version: 1, // Reset version for imported template
      reviewOnly: false
    };
    
    // Save imported template
    return await saveTemplate(template);
  } catch (error) {
    console.error('Error importing template:', error);
    throw error;
  }
};

/**
 * Edit an existing template
 */
export const editTemplate = async (
  id: string,
  updates: {
    name?: string;
    description?: string;
    servicerId?: string;
    filePattern?: string;
    headerRow?: number;
    tablePrefix?: string;
    sheetMappings?: SheetMapping[];
    sourceFileType?: string;
  }
): Promise<MappingTemplate> => {
  try {
    console.log('Editing template:', id, 'with updates:', updates);
    
    // Extract file extension for source file type if not specified
    let sourceFileType = updates.sourceFileType;
    if (!sourceFileType && updates.filePattern) {
      const fileExtension = updates.filePattern.split('.').pop()?.toLowerCase() || 'xlsx';
      sourceFileType = fileExtension === 'csv' ? 'csv' : 
                       fileExtension === 'json' ? 'json' : 'xlsx';
    }
    
    // Ensure sheetMappings is properly formatted as an array
    let sheetMappingsValue = null;
    if (updates.sheetMappings) {
      if (Array.isArray(updates.sheetMappings)) {
        // If it's already an array, use it directly
        sheetMappingsValue = updates.sheetMappings;
      } else if (typeof updates.sheetMappings === 'object' && 'sheets' in updates.sheetMappings) {
        // If it has a 'sheets' property, extract that
        sheetMappingsValue = updates.sheetMappings.sheets;
      } else if (typeof updates.sheetMappings === 'string') {
        // If it's a string, try to parse it
        try {
          const parsed = JSON.parse(updates.sheetMappings);
          sheetMappingsValue = Array.isArray(parsed) ? parsed : null;
        } catch (e) {
          console.error('Failed to parse sheetMappings string:', e);
        }
      }
      
      // Verify that sheetMappingsValue is an array
      if (sheetMappingsValue && !Array.isArray(sheetMappingsValue)) {
        console.error('SheetMappings is not in the expected array format:', sheetMappingsValue);
        sheetMappingsValue = null;
      }
    }
    
    console.log('Processed sheetMappings for update:', sheetMappingsValue);
    
    // First try to run the fix_template_storage function to normalize the template structure
    try {
      const { data: fixResult, error: fixError } = await supabaseClient.rpc('fix_template_storage', {
        p_id: id
      });
      
      if (!fixError) {
        console.log('Successfully normalized template storage:', fixResult);
      } else {
        console.warn('Error fixing template storage, continuing with update:', fixError);
      }
    } catch (fixErr) {
      console.warn('Exception when trying to fix template storage:', fixErr);
    }
    
    // Use RPC instead of direct table query
    const { data, error } = await supabaseClient.rpc('update_mapping_template', {
      p_id: id,
      p_name: updates.name,
      p_description: updates.description,
      p_servicer_id: updates.servicerId,
      p_file_pattern: updates.filePattern,
      p_header_row: updates.headerRow,
      p_table_prefix: updates.tablePrefix,
      p_sheet_mappings: sheetMappingsValue,
      p_source_file_type: sourceFileType
    });
    
    if (error) {
      console.error('Error calling update_mapping_template RPC:', error);
      throw error;
    }
    
    if (!data) {
      throw new Error(`Failed to update template with ID ${id}`);
    }
    
    console.log('Template updated successfully:', data);
    
    // Return the updated template data
    return data as MappingTemplate;
  } catch (error) {
    console.error(`Error updating template ${id}:`, error);
    throw error;
  }
};

/**
 * Log import activity for audit
 */
export const logImportActivity = async (
  fileName: string,
  templateId: string | null,
  status: 'success' | 'partial' | 'failed',
  details: any
): Promise<void> => {
  try {
    // Get current user ID
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    if (!user) {
      console.warn('User not authenticated, skipping audit log');
      return;
    }
    
    // Create log entry
    const logEntry = {
      id: uuidv4(),
      user_id: user.id,
      file_name: fileName,
      template_id: templateId,
      status,
      details,
      created_at: new Date().toISOString()
    };
    
    // Save to Supabase
    const { error } = await supabaseClient
      .from('import_audit_logs')
      .insert(logEntry);
    
    if (error) {
      console.error('Error logging import activity:', error);
    }
  } catch (error) {
    console.error('Error logging import activity:', error);
    // Non-critical error, just log it
  }
};

/**
 * Find best matching template for a file
 */
export const findMatchingTemplate = async (
  fileName: string
): Promise<MappingTemplate | null> => {
  if (!fileName) return null;
  
  try {
    console.log(`Searching for template matching file: ${fileName}`);
    
    // Use the RPC function to find template
    const { data, error } = await supabaseClient.rpc('find_matching_template', {
      p_file_name: fileName
    });
    
    if (error) {
      console.error('Error finding matching template via RPC:', error);
      // Continue to fallback method
    } else if (data) {
      console.log('Found matching template via RPC:', data);
      return data as MappingTemplate;
    }
    
    // If RPC failed or returned no results, fall back to client-side matching
    // First get all templates
    const templates = await loadTemplates();
    return findMatchingTemplateClient(fileName, templates);
  } catch (err) {
    console.error('Exception finding template:', err);
    return null;
  }
};

/**
 * Client-side template matching logic
 */
export const findMatchingTemplateClient = (
  fileName: string,
  templates: MappingTemplate[]
): MappingTemplate | null => {
  try {
    if (!templates || templates.length === 0) {
      console.log('No templates available for client-side matching');
      return null;
    }
    
    console.log('Using client-side template matching...');
    
    // First try exact matches with file pattern
    const exactMatch = templates.find(template => {
      const pattern = template.filePattern;
      if (!pattern) return false;
      
      // Convert glob pattern to regex 
      // e.g. "loan_*.xlsx" becomes /^loan_.*\.xlsx$/
      const regexPattern = new RegExp(
        '^' + 
        pattern.replace(/\./g, '\\.') // Escape dots
              .replace(/\*/g, '.*')   // Convert * to .*
              .replace(/\?/g, '.')    // Convert ? to .
        + '$'
      );
      
      return regexPattern.test(fileName);
    });
    
    if (exactMatch) {
      console.log('Found exact match:', exactMatch.name);
      return exactMatch;
    }
    
    // Try partial pattern matches
    const partialMatches = templates.filter(template => {
      const pattern = template.filePattern;
      if (!pattern) return false;
      
      // Less strict regex, not anchored to start/end
      const regexPattern = new RegExp(
        pattern.replace(/\./g, '\\.') // Escape dots
              .replace(/\*/g, '.*')   // Convert * to .*
              .replace(/\?/g, '.')    // Convert ? to .
      );
      
      return regexPattern.test(fileName);
    });
    
    if (partialMatches.length > 0) {
      // Sort by most specific pattern (fewer wildcards)
      partialMatches.sort((a, b) => {
        const wildcardCountA = (a.filePattern.match(/[*?]/g) || []).length;
        const wildcardCountB = (b.filePattern.match(/[*?]/g) || []).length;
        return wildcardCountA - wildcardCountB;
      });
      
      console.log('Found partial match:', partialMatches[0].name);
      return partialMatches[0];
    }
    
    // Try name-based matching as last resort
    const baseFileName = fileName.split('.')[0] || '';
    
    // Score templates by name similarity
    const scoredTemplates = templates.map(template => ({
      template,
      score: calculateSimilarity(baseFileName, template.name)
    }));
    
    // Sort by score
    scoredTemplates.sort((a, b) => b.score - a.score);
    
    // Use best match if score is above threshold
    if (scoredTemplates.length > 0 && scoredTemplates[0].score >= 70) {
      console.log(`Found name-based match: ${scoredTemplates[0].template.name} (score: ${scoredTemplates[0].score.toFixed(1)})`);
      return scoredTemplates[0].template;
    }
    
    console.log('No matching template found');
    return null;
  } catch (err) {
    console.error('Error in client-side template matching:', err);
    return null;
  }
};