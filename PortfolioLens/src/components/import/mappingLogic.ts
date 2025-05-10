/**
 * Mapping Logic for Excel/CSV imports
 * Provides utility functions for managing mapping templates
 */
import { supabaseClient } from '../../utility/supabaseClient';
import { MappingTemplate, SheetMapping } from '../../store/batchImportStore';
import { v4 as uuidv4 } from 'uuid';

/**
 * Save a mapping template to Supabase
 */
export const saveTemplate = async (template: Partial<MappingTemplate>): Promise<MappingTemplate> => {
  try {
    // Make sure we have required fields
    if (!template.name) {
      throw new Error('Template name is required');
    }
    
    // Create a new UUID if not provided
    const templateId = template.id || uuidv4();
    
    // Get current user ID
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // Create template object
    const templateData = {
      id: templateId,
      name: template.name,
      description: template.description || '',
      servicer_id: template.servicerId,
      file_pattern: template.filePattern,
      header_row: template.headerRow || 0,
      table_prefix: template.tablePrefix || null,
      sheet_mappings: template.sheetMappings,
      created_by: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: template.version || 1,
      review_only: template.reviewOnly || false
    };
    
    // Save to Supabase
    const { data, error } = await supabaseClient
      .from('mapping_templates')
      .upsert(templateData)
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    // Return the saved template
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
    const { data, error } = await supabaseClient
      .from('mapping_templates')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
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
    const { data, error } = await supabaseClient
      .from('mapping_templates')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      throw error;
    }
    
    return data as MappingTemplate;
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
    const { error } = await supabaseClient
      .from('mapping_templates')
      .delete()
      .eq('id', id);
    
    if (error) {
      throw error;
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
  fileName: string,
  templates: MappingTemplate[]
): Promise<MappingTemplate | null> => {
  try {
    // First try exact file name matches
    const exactMatch = templates.find(template => 
      template.filePattern && new RegExp(`^${template.filePattern}$`).test(fileName)
    );
    
    if (exactMatch) {
      return exactMatch;
    }
    
    // Then try partial matches
    const partialMatches = templates.filter(template => 
      template.filePattern && new RegExp(template.filePattern).test(fileName)
    );
    
    if (partialMatches.length > 0) {
      // Sort by most recent first
      partialMatches.sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.updated_at).getTime();
        const dateB = new Date(b.updatedAt || b.updated_at).getTime();
        return dateB - dateA;
      });
      
      return partialMatches[0];
    }
    
    // No match found
    return null;
  } catch (error) {
    console.error('Error finding matching template:', error);
    return null;
  }
};