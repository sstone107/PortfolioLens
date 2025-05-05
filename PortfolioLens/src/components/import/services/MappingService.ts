import { SupabaseClient } from '@supabase/supabase-js';
import {
  ColumnMapping,
  TableMappingSuggestion,
  ColumnType,
  MappingTemplate,
  GlobalAttributes,
  SubServicerTag,
  AuditTrailEntry
} from '../types';
import { supabaseClient } from '../../../utility';
import { MetadataService } from './MetadataService';
import { executeSql, applyMigration } from '../../../utility/supabaseMcp';
import { inferDataType as inferDataTypeFromModule } from '../dataTypeInference'; // Import the correct function

/**
 * Service for handling column mappings and template management
 * Enhanced with persistent templates, versioning, and data enrichment
 */
export class MappingService {
  private client: SupabaseClient | undefined;
  private metadataService: MetadataService;
  
  constructor(metadataService?: MetadataService, customClient?: SupabaseClient) {
    this.client = customClient;
    
    // Avoid circular dependency by deferring MetadataService creation
    if (metadataService) {
      this.metadataService = metadataService;
    } else {
      try {
        // Dynamically import to avoid circular dependency
        const MetadataServiceClass = require('./MetadataService').MetadataService;
        this.metadataService = new MetadataServiceClass(this.client);
      } catch (error) {
        console.error('Failed to initialize MetadataService:', error);
        // Create a placeholder metadataService that won't break the app
        this.metadataService = {
          getTables: async () => [],
          getTableInfo: async () => ({ tableName: '', columns: [] }),
          detectMissingColumns: async () => []
        } as unknown as MetadataService;
      }
    }
  }
  
  /**
   * Get saved column mappings for a table
   * @param tableName - Name of the target table
   * @returns Promise with array of mapping templates
   */
  async getMappings(tableName: string): Promise<Record<string, any>[]> {
    try {
      // First try using MCP executeSql
      const query = `
        SELECT * FROM import_mappings
        WHERE table_name = '${tableName}'
        ORDER BY created_at DESC;
      `;
      
      const mappings = await executeSql(query);
      
      if (mappings && mappings.data && Array.isArray(mappings.data) && mappings.data.length > 0) {
        return mappings.data;
      }
      
      // If MCP fails, try using the Supabase client directly
      if (this.client) {
        // Query saved mappings for the table
        const { data, error } = await this.client
          .from('import_mappings')
          .select('*')
          .eq('table_name', tableName);
        
        if (error) {
          throw new Error(`Error fetching mappings: ${error.message}`);
        }
        
        return data || [];
      }
      
      return [];
    } catch (error: any) {
      console.error('Error getting mappings:', error);
      return [];
    }
  }
  
  /**
   * Save mapping template for reuse
   * @param name - Template name
   * @param tableName - Target table name
   * @param mapping - Column mapping
   * @returns Promise with ID of saved template
   */
  async saveMappingTemplate(
    name: string,
    tableName: string,
    mapping: Record<string, ColumnMapping>,
    description?: string,
    globalAttributes?: Record<string, any>,
    subServicerTags?: string[],
    userId?: string
  ): Promise<string> {
    try {
      const now = new Date().toISOString();
      
      // Get the latest version of this template if it exists
      let version = 1;
      const existingTemplates = await this.getMappingTemplates(tableName);
      const existingTemplate = existingTemplates.find(t => t.name === name);
      
      if (existingTemplate) {
        version = existingTemplate.version + 1;
        
        // Deactivate previous versions
        await this.deactivatePreviousTemplateVersions(name, tableName);
      }
      
      // Prepare the template data
      const templateData = {
        name,
        description: description || `Mapping template for ${tableName}`,
        table_name: tableName,
        mapping_json: JSON.stringify(mapping),
        global_attributes: JSON.stringify(globalAttributes || {}),
        sub_servicer_tags: JSON.stringify(subServicerTags || []),
        version,
        is_active: true,
        created_at: now,
        updated_at: now,
        created_by: userId || 'system'
      };
      
      // First try using MCP
      const insertQuery = `
        INSERT INTO mapping_templates (
          name, description, table_name, mapping_json, global_attributes,
          sub_servicer_tags, version, is_active, created_at, updated_at, created_by
        )
        VALUES (
          '${templateData.name}',
          '${templateData.description}',
          '${templateData.table_name}',
          '${templateData.mapping_json}',
          '${templateData.global_attributes}',
          '${templateData.sub_servicer_tags}',
          ${templateData.version},
          ${templateData.is_active},
          '${templateData.created_at}',
          '${templateData.updated_at}',
          '${templateData.created_by}'
        )
        RETURNING id;
      `;
      
      const result = await executeSql(insertQuery);
      
      if (result && result.data && Array.isArray(result.data) && result.data.length > 0 && result.data[0].id) {
        return result.data[0].id;
      }
      
      // If MCP fails, try using the Supabase client directly
      if (this.client) {
        const { data, error } = await this.client
          .from('mapping_templates')
          .insert(templateData)
          .select('id')
          .single();
        
        if (error) {
          console.error(`Error saving mapping template for ${tableName}:`, error.message);
          throw new Error(`Failed to save mapping template: ${error.message}`);
        }
        
        return data.id;
      }
      
      throw new Error('Failed to save mapping template: No valid database connection');
    } catch (error: any) {
      console.error('Error saving mapping template:', error);
      throw new Error(`Failed to save mapping template: ${error.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Deactivate previous versions of a template
   * @param name - Template name
   * @param tableName - Table name
   */
  private async deactivatePreviousTemplateVersions(name: string, tableName: string): Promise<void> {
    try {
      const updateQuery = `
        UPDATE mapping_templates
        SET is_active = false, updated_at = '${new Date().toISOString()}'
        WHERE name = '${name}' AND table_name = '${tableName}';
      `;
      
      await executeSql(updateQuery);
      
      // If MCP fails, try using the Supabase client directly
      if (this.client) {
        const { error } = await this.client
          .from('mapping_templates')
          .update({
            is_active: false,
            updated_at: new Date().toISOString()
          })
          .eq('name', name)
          .eq('table_name', tableName);
        
        if (error) {
          console.error(`Error deactivating previous template versions:`, error.message);
        }
      }
    } catch (error: any) {
      console.error('Error deactivating previous template versions:', error);
    }
  }
  
  /**
   * Save mapping template for reuse (alias for saveMappingTemplate for backward compatibility)
   */
  async saveMapping(
    name: string,
    tableName: string,
    mapping: Record<string, ColumnMapping>
  ): Promise<string> {
    return this.saveMappingTemplate(name, tableName, mapping);
  }
  
  /**
   * Get mapping templates with version information
   * @param tableName - Optional table name to filter templates
   * @param activeOnly - If true, only return active templates
   * @returns Promise with array of mapping templates
   */
  async getMappingTemplates(tableName?: string, activeOnly: boolean = false): Promise<MappingTemplate[]> {
    try {
      let query = `
        SELECT * FROM mapping_templates
        WHERE 1=1
      `;
      
      if (tableName) {
        query += ` AND table_name = '${tableName}'`;
      }
      
      if (activeOnly) {
        query += ` AND is_active = true`;
      }
      
      query += ` ORDER BY name, version DESC`;
      
      const templates = await executeSql(query);
      
      if (templates && templates.data && Array.isArray(templates.data) && templates.data.length > 0) {
        return templates.data.map((template: any) => ({
          ...template,
          mapping: JSON.parse(template.mapping_json || '{}'),
          globalAttributes: JSON.parse(template.global_attributes || '{}'),
          subServicerTags: JSON.parse(template.sub_servicer_tags || '[]'),
          createdAt: new Date(template.created_at),
          updatedAt: new Date(template.updated_at)
        }));
      }
      
      // If MCP fails, try using the Supabase client directly
      if (this.client) {
        let query = this.client
          .from('mapping_templates')
          .select('*');
          
        if (tableName) {
          query = query.eq('table_name', tableName);
        }
        
        if (activeOnly) {
          query = query.eq('is_active', true);
        }
        
        query = query.order('name').order('version', { ascending: false });
        
        const { data, error } = await query;
        
        if (error) {
          throw new Error(`Error fetching mapping templates: ${error.message}`);
        }
        
        return (data || []).map(template => ({
          ...template,
          mapping: JSON.parse(template.mapping_json || '{}'),
          globalAttributes: JSON.parse(template.global_attributes || '{}'),
          subServicerTags: JSON.parse(template.sub_servicer_tags || '[]'),
          createdAt: new Date(template.created_at),
          updatedAt: new Date(template.updated_at)
        }));
      }
      
      return [];
    } catch (error: any) {
      console.error('Error getting mapping templates:', error);
      return [];
    }
  }
  
  /**
   * Get a specific mapping template by ID
   * @param templateId - ID of the template to retrieve
   * @returns Promise with the mapping template or null if not found
   */
  async getMappingTemplateById(templateId: string): Promise<MappingTemplate | null> {
    try {
      const query = `
        SELECT * FROM mapping_templates
        WHERE id = '${templateId}'
      `;
      
      const templates = await executeSql(query);
      
      if (templates && templates.data && Array.isArray(templates.data) && templates.data.length > 0) {
        const template = templates.data[0];
        return {
          ...template,
          mapping: JSON.parse(template.mapping_json || '{}'),
          globalAttributes: JSON.parse(template.global_attributes || '{}'),
          subServicerTags: JSON.parse(template.sub_servicer_tags || '[]'),
          createdAt: new Date(template.created_at),
          updatedAt: new Date(template.updated_at)
        };
      }
      
      // If MCP fails, try using the Supabase client directly
      if (this.client) {
        const { data, error } = await this.client
          .from('mapping_templates')
          .select('*')
          .eq('id', templateId)
          .single();
        
        if (error) {
          if (error.code === 'PGRST116') { // Record not found
            return null;
          }
          throw new Error(`Error fetching mapping template: ${error.message}`);
        }
        
        if (!data) return null;
        
        return {
          ...data,
          mapping: JSON.parse(data.mapping_json || '{}'),
          globalAttributes: JSON.parse(data.global_attributes || '{}'),
          subServicerTags: JSON.parse(data.sub_servicer_tags || '[]'),
          createdAt: new Date(data.created_at),
          updatedAt: new Date(data.updated_at)
        };
      }
      
      return null;
    } catch (error: any) {
      console.error('Error getting mapping template by ID:', error);
      return null;
    }
  }
  
  /**
   * Add an audit trail entry
   * @param entry - Audit trail entry data
   * @returns Promise with ID of saved entry
   */
  async addAuditTrailEntry(entry: Omit<AuditTrailEntry, 'id'>): Promise<string> {
    try {
      // Insert new audit trail entry
      const insertQuery = `
        INSERT INTO audit_trail (
          import_job_id, action, description, metadata, timestamp, user_id
        )
        VALUES (
          '${entry.importJobId}',
          '${entry.action}',
          '${entry.description}',
          '${JSON.stringify(entry.metadata)}',
          '${entry.timestamp.toISOString()}',
          '${entry.userId}'
        )
        RETURNING id;
      `;
      
      const result = await executeSql(insertQuery);
      
      if (result && result.data && Array.isArray(result.data) && result.data.length > 0) {
        return result.data[0].id;
      }
      
      // If MCP fails, try using the Supabase client directly
      if (this.client) {
        const { data, error } = await this.client
          .from('audit_trail')
          .insert({
            import_job_id: entry.importJobId,
            action: entry.action,
            description: entry.description,
            metadata: entry.metadata,
            timestamp: entry.timestamp.toISOString(),
            user_id: entry.userId
          })
          .select('id')
          .single();
        
        if (error) {
          throw new Error(`Error adding audit trail entry: ${error.message}`);
        }
        
        return data.id;
      }
      
      throw new Error('Failed to add audit trail entry: No valid database connection');
    } catch (error: any) {
      console.error('Error adding audit trail entry:', error);
      throw new Error(`Failed to add audit trail entry: ${error.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Get audit trail entries for an import job
   * @param importJobId - ID of the import job
   * @returns Promise with array of audit trail entries
   */
  async getAuditTrail(importJobId: string): Promise<AuditTrailEntry[]> {
    try {
      const query = `
        SELECT * FROM audit_trail
        WHERE import_job_id = '${importJobId}'
        ORDER BY timestamp DESC
      `;
      
      const entries = await executeSql(query);
      
      if (entries && entries.length > 0) {
        return entries.map((entry: any) => ({
          ...entry,
          metadata: JSON.parse(entry.metadata || '{}'),
          timestamp: new Date(entry.timestamp)
        }));
      }
      
      // If MCP fails, try using the Supabase client directly
      if (this.client) {
        const { data, error } = await this.client
          .from('audit_trail')
          .select('*')
          .eq('import_job_id', importJobId)
          .order('timestamp', { ascending: false });
        
        if (error) {
          throw new Error(`Error fetching audit trail: ${error.message}`);
        }
        
        return (data || []).map(entry => ({
          ...entry,
          metadata: JSON.parse(entry.metadata || '{}'),
          timestamp: new Date(entry.timestamp)
        }));
      }
      
      return [];
    } catch (error: any) {
      console.error('Error getting audit trail:', error);
      return [];
    }
  }
  
  /**
   * Helper method to determine column type from database data type
   * @param dataType - Database column type
   * @returns ColumnType enum value
   */
  private getColumnTypeFromDbType(dataType: string): ColumnType {
    if (dataType.includes('int') || 
        dataType.includes('numeric') || 
        dataType.includes('float') || 
        dataType.includes('decimal')) {
      return 'number';
    } else if (dataType.includes('bool')) {
      return 'boolean';
    } else if (dataType.includes('date') || dataType.includes('timestamp')) {
      return 'date';
    }
    return 'string';
  }
  
  /**
   * Suggest column mappings for Excel data to database table
   * @param sheetData - Data from Excel sheet
   * @param tableInfo - Database table information
   * @returns Suggested column mappings
   */
  /**
   * Suggest column mappings for Excel data to database table
   * Incorporates name similarity, type compatibility, and confidence scoring.
   *
   * @param sheetData - Data from Excel sheet (used for type inference from sample rows).
   * @param tableInfo - Database table information.
   * @returns A record mapping Excel column headers to their mapping suggestions.
   */
  suggestColumnMappings(
    sheetData: Record<string, any>[],
    tableInfo: { tableName: string, columns: Array<{ columnName: string, dataType: string }> }
  ): Record<string, import('../types').ColumnMappingSuggestions> { // Use inline import for return type
    const columnSuggestions: Record<string, import('../types').ColumnMappingSuggestions> = {}; // Use inline import

    // No data or columns to analyze
    if (!sheetData.length || !Object.keys(sheetData[0]).length) {
      return columnSuggestions;
    }

    const excelColumns = Object.keys(sheetData[0]);
    const dbColumns = tableInfo.columns;

    // Common field name variations to help with matching (can be expanded)
    const fieldAliases: Record<string, string[]> = {
      'id': ['identifier', 'key', 'code', 'number', 'no', 'num'],
      'name': ['label', 'title', 'description'],
      'date': ['dt', 'time', 'timestamp', 'created', 'updated', 'modified'],
      'amount': ['amt', 'value', 'sum', 'total', 'balance'],
      'rate': ['percentage', 'ratio', 'pct', 'percent'],
      'days': ['day', 'period', 'grace', 'terms', 'term'],
      'late': ['overdue', 'delinquent', 'past'],
      'grace': ['allowed', 'period', 'window', 'threshold'],
      'fee': ['charge', 'cost', 'price', 'payment', 'expense'],
      'payment': ['pmt', 'pay', 'installment', 'transaction'],
      'interest': ['int', 'yield', 'earnings', 'apr', 'apy'],
      'principal': ['loan', 'original', 'balance', 'capital'],
      'status': ['state', 'condition', 'stage', 'phase', 'step'],
      'address': ['addr', 'location', 'place', 'residence', 'property'],
      'loan_number': ['loanid', 'loannumber', 'loan', 'loanno'],
      'loan_amount': ['originalbalance', 'loansize', 'principalamount'],
      'late_charge_grace_days': ['gracedaysforlatecharge', 'latechargedays', 'daysbeforelatecharge', 'grace_days', 'grace_period']
    };

    // Function to calculate name similarity score
    const calculateNameSimilarity = (excelCol: string, dbColName: string): number => {
      const normalizedExcelCol = excelCol.toLowerCase().replace(/[_\s-]/g, '');
      const normalizedDbCol = dbColName.toLowerCase().replace(/[_\s-]/g, '');

      // 1. Exact match (highest priority)
      if (excelCol.toLowerCase() === dbColName.toLowerCase()) {
        return 1.0;
      }

      // 2. Normalized exact match
      if (normalizedExcelCol === normalizedDbCol) {
        return 0.95;
      }

      // 3. Substring matches
      if (normalizedDbCol.includes(normalizedExcelCol)) {
        return 0.8;
      } else if (normalizedExcelCol.includes(normalizedDbCol)) {
        return 0.7;
      }

      // 4. Word-level matching
      const excelWords = excelCol.toLowerCase().split(/[_\s-]+/).filter(w => w.length > 2);
      const dbWords = dbColName.toLowerCase().split(/[_\s-]+/).filter(w => w.length > 2);
      const commonWordCount = excelWords.filter(w => dbWords.includes(w)).length;
      if (commonWordCount > 0) {
        return 0.6 * (commonWordCount / Math.max(excelWords.length, dbWords.length));
      }

      // 5. Field alias matching
      for (const [key, aliases] of Object.entries(fieldAliases)) {
        const excelHasKey = normalizedExcelCol.includes(key) ||
                            aliases.some(a => normalizedExcelCol.includes(a));
        const dbHasKey = normalizedDbCol.includes(key) ||
                        aliases.some(a => normalizedDbCol.includes(a));

        if (excelHasKey && dbHasKey) {
          return 0.5;
        }
      }

      // Special handling for specific fields if needed (like the previous late_charge_grace_days example)
      if (dbColName === 'late_charge_grace_days' &&
          (normalizedExcelCol.includes('late') || normalizedExcelCol.includes('grace'))) {
        return 0.6;
      }

      return 0; // No significant name similarity
    };

    // Function to check type compatibility
    const isTypeCompatible = (inferredType: ColumnType | null, dbDataType: string): boolean => {
      if (inferredType === null) {
        return true; // Cannot determine compatibility if source type is unknown
      }

      const dbColumnType = this.getColumnTypeFromDbType(dbDataType);

      // Basic compatibility checks (can be made more sophisticated)
      if (inferredType === 'string') {
        return true; // Strings are generally compatible with most DB types (though may require casting)
      }
      if (inferredType === 'number' && dbColumnType === 'number') {
        return true;
      }
      if (inferredType === 'boolean' && dbColumnType === 'boolean') {
        return true;
      }
      if (inferredType === 'date' && dbColumnType === 'date') {
        return true;
      }

      // Allow number to string, date to string, boolean to string
      if (inferredType !== 'string' && dbColumnType === 'string' as ColumnType) {
          return true;
      }

      return false; // Types are not compatible
    };

    // Process each Excel column
    for (const excelCol of excelColumns) {
      const sampleValues = sheetData.map(row => row[excelCol]);
      const inferredDataType = inferDataTypeFromModule(sampleValues, excelCol); // Use imported function and pass header

      const suggestions: import('../types').ColumnSuggestion[] = []; // Use inline import

      // Generate suggestions for each database column
      for (const dbCol of dbColumns) {
        const nameSimilarityScore = calculateNameSimilarity(excelCol, dbCol.columnName);
        const typeCompatible = isTypeCompatible(inferredDataType, dbCol.dataType);

        // Combine scores (simple average for now, can be weighted)
        // Give type compatibility a significant weight
        const combinedScore = (nameSimilarityScore * 0.7) + (typeCompatible ? 0.3 : 0);

        // Determine confidence level
        let confidenceLevel: 'High' | 'Medium' | 'Low';
        if (combinedScore >= 0.8 && typeCompatible) {
          confidenceLevel = 'High';
        } else if (combinedScore >= 0.5) {
          confidenceLevel = 'Medium';
        } else {
          confidenceLevel = 'Low';
        }

        suggestions.push({
          dbColumn: dbCol.columnName,
          similarityScore: combinedScore,
          isTypeCompatible: typeCompatible,
          confidenceLevel: confidenceLevel,
        });
      }

      // Add a suggestion to create a new field
      suggestions.push({
        dbColumn: excelCol, // Suggest the original Excel column name as the new field name
        similarityScore: 0.1, // Low score to appear at the bottom
        isTypeCompatible: true, // Assume compatible as we're creating it
        isCreateNewField: true,
        confidenceLevel: 'Low',
      });

      // Sort suggestions by combined score in descending order
      suggestions.sort((a, b) => b.similarityScore - a.similarityScore);

      // Store the suggestions for this Excel column
      columnSuggestions[excelCol] = {
        sourceColumn: excelCol,
        suggestions: suggestions,
        inferredDataType: inferredDataType,
      };
    }

    return columnSuggestions;
  }
  
  /**
   * Suggest table mappings for sheet names
   * @param sheetNames - List of sheet names from Excel file
   * @returns Suggested table mappings
   */
  async getSuggestedTableMappings(sheetNames: string[]): Promise<TableMappingSuggestion[]> {
    try {
      // Get available tables
      const tables = await this.metadataService.getTables();
      const suggestions: TableMappingSuggestion[] = [];
      
      // Define common mappings between Excel sheet names and database tables
      const commonMappings: Record<string, string> = {
        'loan information': 'loan_information',
        'loan_information': 'loan_information',
        'loans': 'loan_information',
        'loan': 'loan_information',
        'borrowers': 'borrowers',
        'borrower': 'borrowers',
        'properties': 'properties',
        'property': 'properties',
        'investors': 'investors',
        'investor': 'investors',
        'servicers': 'servicers',
        'servicer': 'servicers',
        'payments': 'payments',
        'payment': 'payments',
        'trailing payments': 'trailing_payments',
        'trailing_payments': 'trailing_payments',
        'delinquency': 'delinquency',
        'expenses': 'expenses',
        'insurance': 'insurance',
        'loss mitigation': 'loss_mitigation',
        'loss_mitigation': 'loss_mitigation',
        'covid-19': 'covid_19',
        'covid_19': 'covid_19',
        'bankruptcy': 'bankruptcy',
        'foreclosure': 'foreclosure',
        'users': 'users',
        'user': 'users'
      };
      
      // Process each sheet
      for (const sheetName of sheetNames) {
        let bestMatch = ''; // Revert variable name
        let bestScore = 0; // Revert variable name
        let matchType: 'exact' | 'partial' | 'fuzzy' | 'none' = 'none';
        
        // Normalize sheet name for better matching
        const normalizedSheetName = sheetName.toLowerCase().replace(/[_\s-]/g, '');
        const sheetWords = sheetName.toLowerCase().split(/[_\s-]+/).filter(w => w.length > 2);
        
        // 1. Check for exact matches in common mappings
        if (commonMappings[sheetName.toLowerCase()] && tables.includes(commonMappings[sheetName.toLowerCase()])) {
          bestMatch = commonMappings[sheetName.toLowerCase()];
          bestScore = 1.0;
          matchType = 'exact';
        }
        // 2. Try normalized match
        else if (commonMappings[normalizedSheetName] && tables.includes(commonMappings[normalizedSheetName])) {
          bestMatch = commonMappings[normalizedSheetName];
          bestScore = 0.95;
          matchType = 'exact';
        }
        // 3. Check for partial matches
        else {
          // Try partial match through common mappings
          for (const [key, value] of Object.entries(commonMappings)) {
            if (tables.includes(value)) {
              if (normalizedSheetName.includes(key.replace(/[_\s-]/g, '')) ||
                  key.replace(/[_\s-]/g, '').includes(normalizedSheetName)) {
                const score = 0.8;
                if (score > bestScore) { // Use bestScore
                  bestScore = score;
                  bestMatch = value;
                  matchType = 'partial';
                }
              }
              
              // Word-level matching
              const keyWords = key.toLowerCase().split(/[_\s-]+/).filter(w => w.length > 2);
              const commonWordCount = sheetWords.filter(w => keyWords.includes(w)).length;
              
              if (commonWordCount > 0) {
                const wordScore = 0.7 * (commonWordCount / Math.max(sheetWords.length, keyWords.length));
                if (wordScore > bestScore) { // Use bestScore
                  bestScore = wordScore;
                  bestMatch = value;
                  matchType = 'partial';
                }
              }
            }
          }
          
          // Fuzzy matching with available tables
          if (bestScore < 0.5) { // Use bestScore
            for (const table of tables) {
              const normalizedTable = table.toLowerCase().replace(/[_\s-]/g, '');
              const tableWords = table.toLowerCase().split(/[_\s-]+/).filter(w => w.length > 2);
              
              // Substring match
              if (normalizedSheetName.includes(normalizedTable) || normalizedTable.includes(normalizedSheetName)) {
                const score = 0.6;
                if (score > bestScore) { // Use bestScore
                  bestScore = score;
                  bestMatch = table;
                  matchType = 'fuzzy';
                }
              }
              
              // Word-level matching
              const commonWordCount = sheetWords.filter(w => tableWords.includes(w)).length;
              if (commonWordCount > 0) {
                const wordScore = 0.5 * (commonWordCount / Math.max(sheetWords.length, tableWords.length));
                if (wordScore > tableNameScore) {
                  tableNameScore = wordScore;
                  bestTableNameMatch = table;
                  matchType = 'fuzzy';
                }
              }
            }
          }
        }

        // --- START: Calculate Average Column Match Score ---
        let avgColumnScore = 0;
        if (bestTableNameMatch && sheetData && sheetData.length > 0) {
          try {
            const tableInfo = await this.metadataService.getTableInfo(bestTableNameMatch);
            if (tableInfo && tableInfo.columns.length > 0) {
              const columnSuggestionsResult = this.suggestColumnMappings(sheetData, tableInfo);
              const excelColumns = Object.keys(columnSuggestionsResult);

              if (excelColumns.length > 0) {
                let totalHighestScore = 0;
                let mappedColumnCount = 0;

                for (const excelCol of excelColumns) {
                  const suggestionsForCol = columnSuggestionsResult[excelCol]?.suggestions;
                  if (suggestionsForCol && suggestionsForCol.length > 0) {
                    // Find the highest score, excluding the 'create new' suggestion
                    const bestSuggestion = suggestionsForCol
                      .filter(s => !s.isCreateNewField)
                      .sort((a, b) => b.similarityScore - a.similarityScore)[0];

                    if (bestSuggestion && bestSuggestion.similarityScore > 0.2) { // Only count reasonably good matches
                      totalHighestScore += bestSuggestion.similarityScore;
                      mappedColumnCount++;
                    }
                  }
                }
                avgColumnScore = mappedColumnCount > 0 ? totalHighestScore / mappedColumnCount : 0;
                 console.log(`[Table Suggestion] Sheet: ${sheetName}, Table: ${bestTableNameMatch}, Avg Col Score: ${avgColumnScore.toFixed(2)} (${mappedColumnCount} cols)`);
              }
            }
          } catch (colError) {
            console.error(`Error calculating column score for ${sheetName} -> ${bestTableNameMatch}:`, colError);
          }
        }
        // --- END: Calculate Average Column Match Score ---

        // Combine scores (e.g., 50% name, 50% column avg)
        const combinedScore = (tableNameScore * 0.5) + (avgColumnScore * 0.5);
        
        // Add the suggestion
        suggestions.push({
          sheetName,
          tableName: bestTableNameMatch,
          matchScore: combinedScore, // Use the combined score
          matchType
        });
      }
      
      return suggestions;
    } catch (error) {
      console.error('Error in table mapping suggestion:', error);
      // Sort suggestions by combined score
      suggestions.sort((a, b) => b.matchScore - a.matchScore);

      return suggestions;
    } catch (error) {
      console.error('Error in table mapping suggestion:', error);
      // Fallback in case of error
      return Object.keys(sheetDataMap).map(sheetName => ({
        sheetName,
        tableName: '',
        matchScore: 0,
        matchType: 'none' as 'none'
      }));
    }
  }
}
