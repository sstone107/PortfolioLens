import { MissingColumnInfo, ColumnType } from '../types';
import { executeSQL, supabaseClient } from '../../../utility/supabaseClient';

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
  static generateSQL(
    tablesToCreate: { tableName: string }[],
    columnsToAdd: { tableName: string, columns: MissingColumnInfo[] }[]
  ): string {
    let sql = '-- Schema creation SQL\n\n';
    
    // Generate CREATE TABLE statements
    if (tablesToCreate.length > 0) {
      sql += '-- Table creation statements\n';
      
      tablesToCreate.forEach(table => {
        sql += `CREATE TABLE IF NOT EXISTS "${table.tableName}" (\n`;
        sql += '  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n';
        sql += '  "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n';
        sql += '  "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP\n';
        sql += ');\n\n';
      });
    }
    
    // Generate ALTER TABLE statements to add columns
    if (columnsToAdd.length > 0) {
      sql += '-- Column addition statements\n';
      
      columnsToAdd.forEach(tableInfo => {
        const { tableName, columns } = tableInfo;
        
        if (columns.length > 0) {
          sql += `-- Adding columns to "${tableName}"\n`;
          sql += `ALTER TABLE "${tableName}"\n`;
          
          columns.forEach((column, index) => {
            sql += `  ADD COLUMN IF NOT EXISTS "${column.columnName}" ${column.suggestedType}`;
            if (index < columns.length - 1) {
              sql += ',\n';
            } else {
              sql += ';\n\n';
            }
          });
        }
      });
    }
    
    // Add schema cache refresh
    sql += '-- Refresh schema cache\n';
    sql += 'SELECT refresh_schema_cache();\n';
    
    return sql;
  }
  
  /**
   * Execute schema operations using Supabase APIs instead of raw SQL
   * @param sql SQL statements to execute
   * @returns Result of execution
   */
  static async executeSQL(sql: string): Promise<{ success: boolean, message: string }> {
    try {
      console.log(`[SchemaGenerator] Executing schema SQL block...`);

      // Directly call the utility function with the full SQL string
      // The executeSQL utility now handles splitting and individual execution.
      await executeSQL(sql);

      console.log('[SchemaGenerator] Schema SQL block execution attempt complete.');

      // The refresh_schema_cache is included in the generated SQL block,
      // so no need to call it separately here.
      // The executeSQL utility will execute it as the last statement.

      // If executeSQL didn't throw, assume success.
      return {
        success: true,
        message: `Schema operations executed successfully.`
      };

    } catch (error: any) {
       console.error(`[SchemaGenerator] Error executing schema SQL block:`, error);
       return {
         success: false,
         message: `Failed to execute schema SQL: ${error.message}`
       };
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
