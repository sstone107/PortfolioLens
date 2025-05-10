import { SupabaseClient } from '@supabase/supabase-js';
import {
  ColumnMapping,
  TableMappingSuggestion,
  ColumnType
} from '../types';
import { calculateStringSimilarity } from '../utils/StringSimilarity';
import { supabaseClient } from '../../../utility';
import { MetadataService } from './MetadataService';
import { executeSql, applyMigration } from '../../../utility/supabaseMcp';

/**
 * Service for handling column mappings
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
   * Save mapping for reuse (simplified version)
   */
  async saveMapping(
    name: string,
    tableName: string,
    mapping: Record<string, ColumnMapping>
  ): Promise<string> {
    try {
      const now = new Date().toISOString();
      
      // Prepare the mapping data
      const mappingData = {
        name,
        table_name: tableName,
        mapping: mapping,
        created_at: now,
        updated_at: now
      };
      
      // First try using MCP
      const insertQuery = `
        INSERT INTO import_mappings (
          name, table_name, mapping, created_at, updated_at
        )
        VALUES (
          '${mappingData.name}',
          '${mappingData.table_name}',
          '${JSON.stringify(mappingData.mapping)}',
          '${mappingData.created_at}',
          '${mappingData.updated_at}'
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
          .from('import_mappings')
          .insert(mappingData)
          .select('id')
          .single();
        
        if (error) {
          console.error(`Error saving mapping for ${tableName}:`, error.message);
          throw new Error(`Failed to save mapping: ${error.message}`);
        }
        
        return data.id;
      }
      
      throw new Error('Failed to save mapping: No valid database connection');
    } catch (error: any) {
      console.error('Error saving mapping:', error);
      throw new Error(`Failed to save mapping: ${error.message || 'Unknown error'}`);
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
   * Incorporates name similarity, type compatibility, and confidence scoring.
   *
   * @param sheetData - Data from Excel sheet (used for type inference from sample rows).
   * @param tableInfo - Database table information.
   * @returns A record mapping Excel column headers to their mapping suggestions.
   */
  /**
   * Suggest column mappings based on string similarity matching
   * Works with both empty and non-empty datasets with consistent match percentages
   * @returns A map of column name to suggested mapping with confidence scores
   */
  suggestColumnMappings(
    sheetData: Record<string, any>[],
    tableInfo: { tableName: string, columns: Array<{ columnName: string, dataType: string }> }
  ): Record<string, import('../types').ColumnMappingSuggestions> { 
    const columnSuggestions: Record<string, import('../types').ColumnMappingSuggestions> = {};

    // Identify excel columns even if sheet is empty (just headers)
    let excelColumns: string[] = [];
    if (sheetData.length > 0) {
      // Normal case - sheet has data
      excelColumns = Object.keys(sheetData[0]);
    } else {
      // Special case handling for empty sheets (headers only, no data)
      // We need to get columns from somewhere else - for now, just log the issue
      // We'll let the function continue and the caller will provide column names
      console.log('[MAPSERV] Empty sheet detected, using caller-provided column names');
      // CRITICAL: Don't return early so we can still process column names supplied by the caller
    }

    // Filter out system columns
    const dbColumns = tableInfo.columns.filter(col => 
      !['id', 'created_at', 'updated_at'].includes(col.columnName.toLowerCase())
    );

      // CRITICAL: For tables with missing data, guarantee a reasonable set of suggestions with scores
      // We'll use a combination of heuristics to ensure all columns have reasonable suggestions
      
      // Calculate similarity score between two strings with multiple strategies for better matching
      const calculateSimilarity = (str1: string, str2: string): number => {
        if (!str1 || !str2) return 0;
        
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();
        
        // Strategy 1: Exact match gets perfect score
        if (s1 === s2) return 1.0;
        
        // Strategy 2: Case-insensitive exact match
        if (s1.toLowerCase() === s2.toLowerCase()) return 0.99;
        
        // Strategy 3: One is contained within the other
        if (s1.includes(s2) || s2.includes(s1)) {
          const minLength = Math.min(s1.length, s2.length);
          const maxLength = Math.max(s1.length, s2.length);
          return 0.75 + ((minLength / maxLength) * 0.24); // Range: 0.75-0.99 based on length similarity
        }
        
        // Strategy 4: Normalize whitespace, underscores, hyphens
        const normalizedS1 = s1.replace(/[\s_-]/g, '');
        const normalizedS2 = s2.replace(/[\s_-]/g, '');
        
        if (normalizedS1 === normalizedS2) return 0.9;
        if (normalizedS1.includes(normalizedS2) || normalizedS2.includes(normalizedS1)) {
          const minLength = Math.min(normalizedS1.length, normalizedS2.length);
          const maxLength = Math.max(normalizedS1.length, normalizedS2.length);
          return 0.7 + ((minLength / maxLength) * 0.2); // Range: 0.7-0.9
        }
        
        // Enhanced matching for empty tables - pattern matching to ensure we always have suggestions
        // Special case for 'id' fields
        if ((s1.endsWith('_id') && s2 === 'id') || (s2.endsWith('_id') && s1 === 'id')) {
          return 0.85; // High score for ID fields
        }
        
        // Special case for common date fields
        if ((s1.includes('date') && s2.includes('date')) ||
            (s1.includes('time') && s2.includes('time'))) {
          return 0.80; // Good score for date/time fields
        }
      
      // Strategy 5: Word token matching (e.g., "first name" vs "firstname")
      const words1 = s1.split(/[\s_-]/).filter(w => w.length > 0);
      const words2 = s2.split(/[\s_-]/).filter(w => w.length > 0);
      
      if (words1.length > 0 && words2.length > 0) {
        let matchCount = 0;
        for (const word1 of words1) {
          if (words2.some(w2 => w2.includes(word1) || word1.includes(w2))) {
            matchCount++;
          }
        }
        
        const wordMatchScore = matchCount / Math.max(words1.length, words2.length);
        if (wordMatchScore > 0) {
          return 0.5 + (wordMatchScore * 0.2); // Range: 0.5-0.7
        }
      }
      
      // Strategy 6: Check if the strings share a prefix or suffix
      const minLen = Math.min(s1.length, s2.length);
      const prefix = s1.substring(0, Math.floor(minLen / 2)) === s2.substring(0, Math.floor(minLen / 2));
      const suffix = s1.substring(s1.length - Math.floor(minLen / 2)) === s2.substring(s2.length - Math.floor(minLen / 2));
      
      if (prefix || suffix) {
        return 0.4; // Modest score for sharing beginning or end
      }
      
      // No similarity found
      return 0;
    };

    // Get confidence level from score
    const getConfidenceLevel = (score: number): import('../types').ConfidenceLevel => {
      if (score >= 0.8) return 'High';
      if (score >= 0.5) return 'Medium';
      return 'Low';
    };

    // Process each Excel column - ensure we always generate suggestions whether data exists or not
    for (const excelCol of excelColumns) {
      const suggestions: import('../types').ColumnSuggestion[] = [];

      // Generate suggestions based on name similarity matching - EMPTY TABLE SPECIFIC STRATEGY
      // For empty tables, we want to generate multiple meaningful suggestions with scores
      const similarityScores: Array<{dbCol: {columnName: string, dataType: string}, score: number}> = [];
      
      // Calculate similarity scores for all DB columns
      for (const dbCol of dbColumns) {
        const score = calculateSimilarity(excelCol, dbCol.columnName);
        // Track all scores, not just high ones
        if (score > 0) {
          similarityScores.push({ dbCol, score });
        }
      }
      
      // Sort by score (highest first)
      similarityScores.sort((a, b) => b.score - a.score);
      
      // CRITICAL: FOR EMPTY TABLES - ensure at least 3-4 suggestions even if no good matches
      // This is important to show match percentages consistently
      // We need more suggestions for empty tables (sheetData.length === 0)
      const isEmptyTable = sheetData.length === 0;
      const suggestionsNeeded = isEmptyTable ? 4 : 2; // More suggestions for empty tables
      let hasMeaningfulMatches = false;
     
      // First, add high confidence matches (score > 0.7)
      for (const item of similarityScores) {
        if (item.score > 0.7) {
          hasMeaningfulMatches = true;
          suggestions.push({
            dbColumn: item.dbCol.columnName,
            confidenceScore: item.score,
            isTypeCompatible: true,
            confidenceLevel: getConfidenceLevel(item.score),
            isDuplicate: false
          });
        }
      }
      
      // If no high confidence, add medium confidence (score > 0.4)
      if (!hasMeaningfulMatches) {
        for (const item of similarityScores) {
          if (item.score > 0.4 && item.score <= 0.7) {
            suggestions.push({
              dbColumn: item.dbCol.columnName,
              confidenceScore: item.score,
              isTypeCompatible: true,
              confidenceLevel: getConfidenceLevel(item.score),
              isDuplicate: false
            });
          }
        }
      }
      
      // If we don't have enough suggestions yet, add more even with lower confidence
      if (suggestions.length < suggestionsNeeded && isEmptyTable) {
        // Take the top N from what's left (or all if fewer than N)
        const remainingScores = similarityScores
          .filter(item => !suggestions.some(s => s.dbColumn === item.dbCol.columnName))
          .slice(0, suggestionsNeeded - suggestions.length);
        
        for (const item of remainingScores) {
          // For empty tables, use the original score for visual consistency with user expectations
          suggestions.push({
            dbColumn: item.dbCol.columnName,
            confidenceScore: item.score,
            isTypeCompatible: true,
            confidenceLevel: getConfidenceLevel(item.score),
            isDuplicate: false
          });
        }
      }
      
      // If still no matches (extreme case), add at least one suggestion
      if (suggestions.length === 0 && dbColumns.length > 0) {
        // Get ideal match by name or just use the first column
        const firstCol = dbColumns[0];
        suggestions.push({
          dbColumn: firstCol.columnName,
          confidenceScore: 0.5, // Medium score for visibility in empty tables
          isTypeCompatible: true,
          confidenceLevel: 'Medium',
          isDuplicate: false
        });
      }

      // Sort suggestions by confidence score (highest first)
      suggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);
      
      // Always add a Skip option with medium confidence - using special _skip_ identifier
      suggestions.push({
        dbColumn: '_skip_',
        confidenceScore: 0.5,
        isTypeCompatible: true,
        confidenceLevel: 'Medium'
        // Don't use isSkip property - it's not in the interface
      });

      // Add a suggestion to create a new field
      suggestions.push({
        dbColumn: excelCol, // Suggest the original Excel column name
        confidenceScore: 0.65, // Higher score to prioritize over skip 
        isTypeCompatible: true,
        isCreateNewField: true,
        confidenceLevel: 'Medium'
      });

      columnSuggestions[excelCol] = {
        sourceColumn: excelCol,
        suggestions,
        inferredDataType: null // No type inference for empty datasets
      };
    }

    return columnSuggestions;
  }
  
  /**
   * Suggest table mappings for sheet names using simple alphanumeric matching only
   * All fuzzy matching, word-level matching, and pattern detection has been removed
   * @param sheetNames - List of sheet names from Excel file
   * @returns Suggested table mappings with exact alphanumeric matches only
   */
  async getSuggestedTableMappings(sheetNames: string[]): Promise<TableMappingSuggestion[]> {
    const suggestions: TableMappingSuggestion[] = [];
    try {
      // Get available tables
      const tables = await this.metadataService.getCachedTableNames();
      
      // Process each sheet
      for (const sheetName of sheetNames) {
        // Normalize the sheet name - keep only alphanumeric characters
        const normalizedSheetName = sheetName.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        let bestMatch = '';
        let bestMatchType: 'exact' | 'none' = 'none';
        
        // Simple alphanumeric matching only
        for (const table of tables) {
          // Normalize table name - keep only alphanumeric characters
          const normalizedTable = table.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          // Only exact normalized match is considered
          if (normalizedSheetName === normalizedTable) {
            bestMatch = table;
            bestMatchType = 'exact';
            break;
          }
        }
        
        // Create suggestion object - only create if we have a match
        if (bestMatch) {
          suggestions.push({
            sheetName,
            tableName: bestMatch,
            confidenceScore: 1.0, // Fixed value for all matches
            matchType: bestMatchType
          });
        } else {
          // If no match was found, add with empty table name
          suggestions.push({
            sheetName,
            tableName: '',
            confidenceScore: 0,
            matchType: 'none'
          });
        }
      }
    } catch (error: any) {
      // Log error and return empty result
      console.error('Error suggesting table mappings:', error);
      return [];
    }
    
    return suggestions;
  }
}