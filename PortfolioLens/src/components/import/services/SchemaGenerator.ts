import { MissingColumnInfo, ColumnType } from '../types';
import SqlExecutionService from '../../../services/SqlExecutionService'; // Import SqlExecutionService
import { UserRoleType } from '../../../types/userRoles'; // Import UserRoleType
import { supabaseClient } from '../../../utility/supabaseClient'; // Import supabaseClient for direct RPC calls

/**
 * Generate and execute SQL for schema creation
 */
export class SchemaGenerator {
  /**
   * Generate SQL statements to create tables and columns
   * @param tablesToCreate Tables that need to be created
   * @param columnsToAdd Columns that need to be added to existing tables
   * @returns SQL statements as string
   */
  // Modified: Generates parameters for the add_columns_to_table stored procedure
  static generateProcedureCallParameters(
    tablesToCreate: { tableName: string }[], // Keep for potential future CREATE TABLE function
    columnsToAdd: { tableName: string, columns: MissingColumnInfo[] }[]
  ): { tableName: string, columnsJson: string }[] { // Return parameters needed for the procedure call
    
    
    const procedureCalls: { tableName: string, columnsJson: string }[] = [];

    // Handle CREATE TABLE (if needed in future - currently handled separately or assumed exists)
    // For now, we focus on ADD COLUMN via the procedure

    // Generate parameters for add_columns_to_table procedure
    if (columnsToAdd.length > 0) {
      columnsToAdd.forEach(tableInfo => {
        const { tableName, columns } = tableInfo;
        
        if (!columns || columns.length === 0) {
          console.log(`[DEBUG SchemaGenerator] Skipping parameter generation for table ${tableName} - no columns to add`);
          return;
        }
        
        // Validate and format columns for JSONB array
        const validColumnsForJson = columns
          .filter(col => col && col.columnName && typeof col.columnName === 'string' && col.suggestedType)
          .map(col => ({
            columnName: col.columnName,
            suggestedType: col.suggestedType || 'TEXT' // Ensure type exists
          }));
          
        if (validColumnsForJson.length === 0) {
          console.log(`[DEBUG SchemaGenerator] Skipping parameter generation for table ${tableName} - no valid columns to add`);
          return;
        }
        
        
        // Convert the array of column info objects to a JSON string
        const columnsJsonString = JSON.stringify(validColumnsForJson);
        
        procedureCalls.push({
          tableName: tableName,
          columnsJson: columnsJsonString
        });
      });
    }
    
    return procedureCalls;
  }
  
  /**
   * Execute schema operations using Supabase APIs instead of raw SQL
   * @param sql SQL statements to execute
   * @returns Result of execution
   */
  // Modified: Executes the add_columns_batch RPC for each table needing columns.
  static async executeSQL(
     procedureParams: { tableName: string, columnsJson: string }[]
  ): Promise<{ success: boolean, message: string }> {
    if (!procedureParams || procedureParams.length === 0) {
      console.log('[DEBUG SchemaGenerator] No procedure calls to execute.');
      return { success: true, message: 'No schema changes needed.' };
    }

    let overallSuccess = true;
    let firstErrorMessage = '';

    try {
      console.log(`[DEBUG SchemaGenerator] Executing add_columns_batch RPC for ${procedureParams.length} table(s)...`);

      for (const params of procedureParams) {
        const { tableName, columnsJson } = params;
        console.log(`[DEBUG SchemaGenerator] Calling add_columns_batch for table: ${tableName}`);
        console.log(`[DEBUG SchemaGenerator] Columns JSON:`, columnsJson);

        // Parse the JSON to get the columns array
        let columnsArray;
        try {
          columnsArray = JSON.parse(columnsJson);
        } catch (e: any) { // Type the error as any to access message property
          console.error(`[DEBUG SchemaGenerator] Error parsing columns JSON:`, e);
          throw new Error(`Failed to parse columns JSON for table ${tableName}: ${e.message || 'Unknown error'}`);
        }

        // Transform the columns array to match the format expected by add_columns_batch
        const transformedColumns = columnsArray.map((col: any) => ({
          name: col.columnName,
          type: col.suggestedType
        }));

        // Call the add_columns_batch RPC
        console.log(`[DEBUG SchemaGenerator] Calling add_columns_batch RPC for table ${tableName} with ${transformedColumns.length} columns`);
        
        const { data, error } = await supabaseClient.rpc('add_columns_batch', {
          p_table_name: tableName,
          p_columns: transformedColumns
        });
        
        // Check for errors
        if (error) {
          const errorMessage = error.message || String(error);
          console.error(`[DEBUG SchemaGenerator] Error executing add_columns_batch RPC for table ${tableName}:`, errorMessage);
          if (!firstErrorMessage) {
            firstErrorMessage = `Failed to add columns to table ${tableName}: ${errorMessage}`;
          }
          throw new Error(firstErrorMessage);
        }
        
        console.log(`[DEBUG SchemaGenerator] add_columns_batch RPC result:`, data);
        
        // The schema cache is refreshed automatically by the add_columns_batch function
        // if any columns were added, so we don't need to do it manually here
        
        console.log(`[DEBUG SchemaGenerator] Columns added successfully to table ${tableName}.`);
      }

      console.log('[DEBUG SchemaGenerator] All schema operations executed.');
      return { success: true, message: 'Schema operations executed successfully.' };

    } catch (error) {
      console.error('[DEBUG SchemaGenerator] Error executing schema operations:', error);
      return { success: false, message: `Schema execution failed: ${firstErrorMessage || (error instanceof Error ? error.message : String(error))}` };
    }
  }

  /**
   * Analyze Excel data to determine required schema changes
   * @param tableName Target table name
   * @param data Excel data rows
   * @returns Missing columns info
   */
  static analyzeExcelSchema(
    tableName: string,
    data: Record<string, any>[]
  ): MissingColumnInfo[] {
    if (!data || data.length === 0) {
      return [];
    }
    
    const result: MissingColumnInfo[] = [];
    const sampleRow = data[0];
    
    // Analyze each column in the Excel data
    for (const column of Object.keys(sampleRow)) {
      // Skip empty column names
      if (!column || column.trim() === '') {
        continue;
      }
      
      // Get more sample values for better type detection
      // Use up to 20 rows for more accurate type inference
      const sampleValues = data.slice(0, Math.min(20, data.length))
        .map(row => row[column])
        .filter(val => val != null && val !== '');
      
      let suggestedType = 'text'; // Default type
      let originalType: ColumnType = 'string';
      
      // Check if column name suggests a specific type
      const columnNameLower = column.toLowerCase();
      const isLikelyDate = /date|time|dt$|timestamp|created|updated|modified|reported/.test(columnNameLower);
      const isLikelyNumber = /amount|count|balance|value|price|rate|percent|quantity|fee|cost|score|total|ratio|payment|interest|dpd|days|age|upb|principal|num$|number/.test(columnNameLower);
      const isLikelyBoolean = /is_|has_|flag|indicator|active|enabled|status|bool/.test(columnNameLower);
      
      if (sampleValues.length > 0) {
        // Count type occurrences for majority-based decision
        let numberCount = 0;
        let dateCount = 0;
        let booleanCount = 0;
        let stringCount = 0;
        
        // Analyze each sample value
        for (const value of sampleValues) {
          if (typeof value === 'number') {
            numberCount++;
          } else if (value instanceof Date) {
            dateCount++;
          } else if (typeof value === 'boolean') {
            booleanCount++;
          } else if (typeof value === 'string') {
            // Check if string can be parsed as a number
            if (!isNaN(Number(value)) && value.trim() !== '') {
              // Check for leading zeros which indicate it should remain a string
              if (value.startsWith('0') && value.length > 1 && value[1] !== '.') {
                stringCount++;
              } else {
                numberCount++;
              }
            }
            // Check if string can be parsed as a date
            else if (!isNaN(Date.parse(value))) {
              // Additional validation to avoid false positives
              // Check common date formats
              const isValidDateFormat = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(value) || // yyyy-mm-dd or mm/dd/yyyy
                                       /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(value) ||  // dd-mm-yyyy or mm/dd/yy
                                       /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);    // ISO format
              
              if (isValidDateFormat || isLikelyDate) {
                dateCount++;
              } else {
                stringCount++;
              }
            }
            // Check for boolean-like strings
            else if (/^(true|false|yes|no|y|n|1|0)$/i.test(value.trim())) {
              booleanCount++;
            } else {
              stringCount++;
            }
          }
        }
        
        // Determine type based on majority and column name hints
        const total = numberCount + dateCount + booleanCount + stringCount;
        const numberRatio = numberCount / total;
        const dateRatio = dateCount / total;
        const booleanRatio = booleanCount / total;
        
        // Use column name as a tiebreaker or to strengthen weak signals
        if (dateRatio >= 0.7 || (dateRatio >= 0.5 && isLikelyDate)) {
          suggestedType = 'timestamp with time zone';
          originalType = 'date';
        } else if (numberRatio >= 0.7 || (numberRatio >= 0.5 && isLikelyNumber)) {
          // Determine if integer or numeric
          const integerValues = sampleValues.filter(val =>
            typeof val === 'number' ? Number.isInteger(val) :
            typeof val === 'string' && !isNaN(Number(val)) ? Number.isInteger(Number(val)) : false
          );
          
          if (integerValues.length / numberCount >= 0.8) {
            suggestedType = 'integer';
          } else {
            suggestedType = 'numeric(18,6)'; // More precision for financial data
          }
          originalType = 'number';
        } else if (booleanRatio >= 0.7 || (booleanRatio >= 0.5 && isLikelyBoolean)) {
          suggestedType = 'boolean';
          originalType = 'boolean';
        } else {
          // Check if it's a long text
          const longTexts = sampleValues.filter(val =>
            typeof val === 'string' && val.length > 255
          );
          
          if (longTexts.length > 0) {
            suggestedType = 'text';
          } else {
            suggestedType = 'varchar(255)';
          }
          originalType = 'string';
        }
      } else {
        // No sample values, use column name hints
        if (isLikelyDate) {
          suggestedType = 'timestamp with time zone';
          originalType = 'date';
        } else if (isLikelyNumber) {
          suggestedType = 'numeric(18,6)';
          originalType = 'number';
        } else if (isLikelyBoolean) {
          suggestedType = 'boolean';
          originalType = 'boolean';
        } else {
          suggestedType = 'varchar(255)';
          originalType = 'string';
        }
      }
      
      result.push({
        columnName: column,
        suggestedType,
        originalType
      });
    }
    
    return result;
  }
}
