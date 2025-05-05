// PortfolioLens/src/components/import/services/TableMetadataService.ts
import { SupabaseClient } from '@supabase/supabase-js';
import {
  TableInfo,
  TableColumn,
  ColumnType,
  MissingColumnInfo,
} from '../types';
import { supabaseClient } from '../../../utility/supabaseClient'; // Assuming supabaseClient is correctly configured
import { executeSql, applyMigration } from '../../../utility/supabaseMcp'; // Assuming MCP utilities are available

/**
 * Service dedicated to database table and column metadata operations.
 */
export class TableMetadataService {
  private client: SupabaseClient | undefined;

  constructor(customClient?: SupabaseClient) {
    // Use the provided client or the default singleton
    this.client = customClient || supabaseClient;
  }

  /**
   * Get list of available tables in the public schema.
   * Uses MCP's executeSql with fallback to direct client query.
   * @returns Promise resolving to an array of table names.
   */
  async getTables(): Promise<string[]> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    console.log('[TableMetadataService] Attempting to fetch tables...');

    // Attempt 1: Use executeSql (preferred, includes retries and cache refresh logic)
    try {
      console.log('[TableMetadataService] Attempt 1: Using executeSql');
      const query = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `;
      const result = await executeSql(query);

      if (result.data && result.data.length > 0) {
        const tables = result.data.map((row: any) => row.table_name);
        console.log(`[TableMetadataService] Attempt 1 (executeSql) succeeded, found ${tables.length} tables.`);
        return tables;
      } else if (result.error) {
        console.warn('[TableMetadataService] Attempt 1 (executeSql) failed:', result.error.message);
      } else {
         console.warn('[TableMetadataService] Attempt 1 (executeSql) returned no data.');
      }
    } catch (error: any) {
      console.error('[TableMetadataService] Attempt 1 (executeSql) threw an exception:', error.message);
    }

    // Attempt 2: Use the Supabase client directly with retry logic (if client is available)
    if (this.client) {
      console.log('[TableMetadataService] Attempt 2: Using Supabase client directly');
      for (let i = 0; i < MAX_RETRIES; i++) {
        try {
          const { data, error } = await this.client
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
            .eq('table_type', 'BASE TABLE') // Ensure we only get actual tables
            .order('table_name');

          if (error) throw error;

          if (data && data.length > 0) {
            const tables = data.map((row: any) => row.table_name);
            console.log(`[TableMetadataService] Attempt 2 (direct client) succeeded on try ${i + 1}, found ${tables.length} tables.`);
            return tables;
          } else {
             console.warn(`[TableMetadataService] Attempt 2 (direct client) try ${i + 1} returned no data.`);
          }
        } catch (error: any) {
          console.warn(`[TableMetadataService] Attempt 2 (direct client) failed (Attempt ${i + 1}/${MAX_RETRIES}):`, error.message);
          if (i < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          } else {
            console.error(`[TableMetadataService] Attempt 2 (direct client) failed after ${MAX_RETRIES} retries.`);
          }
        }
      }
    } else {
      console.warn('[TableMetadataService] Supabase client not available for Attempt 2.');
    }

    // Fallback if all methods fail
    console.error('[TableMetadataService] All table query methods failed, returning empty list.');
    return [];
  }

  /**
   * Get detailed information (columns) about a specific table.
   * @param tableName - Name of the table.
   * @returns Promise resolving to TableInfo.
   */
  async getTableInfo(tableName: string): Promise<TableInfo> {
    try {
      const columns = await this.getColumns(tableName);
      return { tableName, columns };
    } catch (error: any) {
      console.error(`[TableMetadataService] Error getting table info for "${tableName}":`, error);
      // Return minimal structure on error
      return { tableName, columns: [] };
    }
  }

  /**
   * Get columns for a specific table using MCP executeSql or direct client RPC.
   * @param tableName - Name of the table.
   * @returns Promise resolving to an array of TableColumn metadata.
   */
  async getColumns(tableName: string): Promise<TableColumn[]> {
    console.log(`[TableMetadataService] Fetching columns for table "${tableName}"...`);
    const sqlQuery = `
      SELECT
          c.column_name,
          c.data_type,
          c.udt_name,
          c.is_nullable,
          c.column_default,
          CASE
              WHEN kcu.column_name IS NOT NULL THEN TRUE
              ELSE FALSE
          END AS is_primary_key
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
          ON c.table_schema = kcu.table_schema
          AND c.table_name = kcu.table_name
          AND c.column_name = kcu.column_name
      LEFT JOIN information_schema.table_constraints tc
          ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_schema = tc.table_schema
          AND kcu.table_name = tc.table_name
          AND tc.constraint_type = 'PRIMARY KEY'
      WHERE c.table_schema = 'public' AND c.table_name = $1
      ORDER BY c.ordinal_position;
    `;

    // Attempt 1: Use executeSql with parameterized query
    try {
      console.log('[TableMetadataService] Attempt 1: Using executeSql with parameters');
      // Note: Parameterization support in executeSql might vary. Adjust if needed.
      // If direct parameterization isn't supported via MCP, fall back to direct client.
      // For now, assuming executeSql handles basic parameter needs or we use direct client.

      // Let's try direct client first as parameterization is clearer
      if (this.client) {
          const { data, error } = await this.client.rpc('exec_sql', { sql: sqlQuery.replace('$1', `'${tableName}'`) }); // Basic replacement, consider proper parameterization if available

          if (!error && data && data.length > 0) {
              console.log(`[TableMetadataService] Successfully retrieved ${data.length} columns via direct RPC for "${tableName}"`);
              return this.normalizeColumns(data);
          }
          if(error) console.warn('[TableMetadataService] Direct RPC column query failed:', error);
      }

      // Fallback to executeSql if direct client failed or wasn't available
      console.log('[TableMetadataService] Attempt 2: Using executeSql (potential parameter issues)');
      const columnsResult = await executeSql(sqlQuery.replace('$1', `'${tableName}'`)); // Basic replacement

      if (columnsResult.data && columnsResult.data.length > 0) {
        console.log(`[TableMetadataService] Successfully retrieved ${columnsResult.data.length} columns via MCP for "${tableName}"`);
        return this.normalizeColumns(columnsResult.data);
      } else if (columnsResult.error) {
          console.warn('[TableMetadataService] MCP executeSql column query failed:', columnsResult.error.message);
      } else {
          console.warn('[TableMetadataService] MCP executeSql column query returned no data.');
      }

    } catch (error: any) {
      console.error(`[TableMetadataService] Error fetching columns for "${tableName}":`, error.message);
    }

    console.error(`[TableMetadataService] All methods failed to fetch columns for "${tableName}".`);
    return []; // Return empty list if all methods fail
  }

  /**
   * Normalizes column data retrieved from the database.
   * @param rawColumns - Array of raw column data.
   * @returns Array of normalized TableColumn objects.
   */
  private normalizeColumns(rawColumns: any[]): TableColumn[] {
    return rawColumns.map((col: any) => ({
      columnName: col.column_name,
      // Use udt_name for user-defined types (like enums), otherwise data_type
      dataType: col.udt_name || col.data_type,
      isNullable: col.is_nullable === 'YES',
      columnDefault: col.column_default,
      isPrimaryKey: col.is_primary_key === true, // Ensure boolean comparison
    }));
  }


  /**
   * Detect missing columns in a table based on the provided mapping.
   * @param tableName - Target table name.
   * @param mapping - Import column mapping (Excel Header -> DB Column Info).
   * @returns Promise resolving to an array of missing columns with suggested types.
   */
  async detectMissingColumns(
    tableName: string,
    mapping: Record<string, { dbColumn: string, type: ColumnType }>
  ): Promise<MissingColumnInfo[]> {
    try {
      const tableInfo = await this.getTableInfo(tableName);
      const existingColumnsLower = new Set(tableInfo.columns.map(col => col.columnName.toLowerCase()));
      const missingColumns: MissingColumnInfo[] = [];

      for (const excelHeader in mapping) {
        const mapInfo = mapping[excelHeader];
        if (mapInfo.dbColumn && !existingColumnsLower.has(mapInfo.dbColumn.toLowerCase())) {
          // Check if it's already added to missingColumns to avoid duplicates
          if (!missingColumns.some(mc => mc.columnName.toLowerCase() === mapInfo.dbColumn.toLowerCase())) {
             missingColumns.push({
               columnName: mapInfo.dbColumn, // Use the intended DB column name
               suggestedType: this.getSqlTypeFromColumnType(mapInfo.type),
               originalType: mapInfo.type
             });
          }
        }
      }

      console.log(`[TableMetadataService] Detected ${missingColumns.length} missing columns for table "${tableName}".`);
      return missingColumns;
    } catch (error) {
      console.error(`[TableMetadataService] Error detecting missing columns for ${tableName}:`, error);
      return [];
    }
  }

  /**
   * Create missing columns in a database table using MCP applyMigration.
   * @param tableName - Target table name.
   * @param missingColumns - Array of missing column information.
   * @returns Promise resolving to an object indicating success status and a message.
   */
  async createMissingColumns(
    tableName: string,
    missingColumns: MissingColumnInfo[]
  ): Promise<{success: boolean, message: string}> {
    if (!missingColumns || missingColumns.length === 0) {
      return { success: true, message: 'No missing columns to create.' };
    }

    // Sanitize table and column names (basic example)
    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    if (safeTableName !== tableName) {
        console.error(`[TableMetadataService] Invalid table name detected: ${tableName}`);
        return { success: false, message: `Invalid table name: ${tableName}` };
    }

    try {
      const alterStatements = missingColumns.map(col => {
        const safeColumnName = col.columnName.replace(/[^a-zA-Z0-9_]/g, '');
        if (safeColumnName !== col.columnName) {
            throw new Error(`Invalid column name detected: ${col.columnName}`);
        }
        // Ensure suggestedType is a valid SQL type string (basic check)
        if (!/^[a-zA-Z0-9\s()]+$/.test(col.suggestedType)) {
             throw new Error(`Invalid SQL type detected: ${col.suggestedType}`);
        }
        return `ALTER TABLE public."${safeTableName}" ADD COLUMN IF NOT EXISTS "${safeColumnName}" ${col.suggestedType};`;
      });

      const migrationSql = alterStatements.join('\n');
      const migrationName = `add_cols_${safeTableName}_${Date.now()}`.substring(0, 63); // Ensure name length constraint

      console.log(`[TableMetadataService] Applying migration to add columns to ${safeTableName}: ${migrationName}`);

      // Use MCP applyMigration
      const result = await applyMigration(migrationName, migrationSql);

      if (result && result.success) {
        console.log(`[TableMetadataService] Successfully created ${missingColumns.length} columns in ${safeTableName}.`);
        return {
          success: true,
          message: `Successfully created ${missingColumns.length} columns in ${safeTableName}.`
        };
      } else {
        const errorMsg = result?.message || 'MCP applyMigration failed without specific message.';
        console.error(`[TableMetadataService] Failed to create columns via MCP for ${safeTableName}:`, errorMsg);
        return {
          success: false,
          message: `Failed to create columns: ${errorMsg}`
        };
      }
    } catch (error: any) {
      console.error(`[TableMetadataService] Error creating columns for ${tableName}:`, error);
      return {
        success: false,
        message: `Failed to create columns: ${error.message || 'Unknown error'}`
      };
    }
  }

  /**
   * Convert application-defined ColumnType to a standard SQL data type string.
   * @param type - The ColumnType ('string', 'number', 'boolean', 'date').
   * @returns Corresponding SQL data type string.
   */
  getSqlTypeFromColumnType(type: ColumnType): string {
    switch (type) {
      case 'string':
        return 'text';
      case 'number':
        // Use numeric for flexibility with decimals, adjust precision/scale if needed later
        return 'numeric';
      case 'boolean':
        return 'boolean';
      case 'date':
        // Use timestamp with time zone for full date/time info
        return 'timestamp with time zone';
      default:
        console.warn(`[TableMetadataService] Unknown ColumnType "${type}", defaulting to TEXT.`);
        return 'text'; // Default fallback
    }
  }

  /**
   * Infer ColumnType from sample data values.
   * @param data - Array of sample row objects.
   * @param column - The column name to infer the type for.
   * @returns Inferred ColumnType or null if no data or inference possible.
   */
  inferDataType(data: Record<string, any>[], column: string): ColumnType | null {
    if (!data || data.length === 0) return null;

    const nonNullValues = data
      .map(row => row[column])
      .filter(val => val !== null && val !== undefined && val !== '');

    if (nonNullValues.length === 0) return null; // Cannot infer from only null/empty values

    // Check for boolean first (stricter check)
    const isBoolean = nonNullValues.every(val =>
      typeof val === 'boolean' ||
      (typeof val === 'string' && ['true', 'false', 'yes', 'no', 'y', 'n', '1', '0'].includes(val.toLowerCase().trim())) ||
      (typeof val === 'number' && (val === 1 || val === 0))
    );
    if (isBoolean) return 'boolean';

    // Check for date (allow various formats)
    const isDate = nonNullValues.every(val => {
        if (val instanceof Date && !isNaN(val.getTime())) return true;
        // Check for Excel date serial numbers (numbers roughly between 1 and 100000)
        if (typeof val === 'number' && val > 0 && val < 2958466) { // 2958465 is 9999-12-31
            // Could be an Excel date serial number, treat as date for now
            return true;
        }
        // Try parsing string dates
        if (typeof val === 'string') {
            const parsedDate = new Date(val);
            // Check if parsing resulted in a valid date
            return !isNaN(parsedDate.getTime());
        }
        return false;
    });
    if (isDate) return 'date';


    // Check for number (allow currency, percentages)
    const isNumber = nonNullValues.every(val => {
        if (typeof val === 'number' && isFinite(val)) return true;
        if (typeof val === 'string') {
            const cleanedVal = val.trim().replace(/[\$,%]/g, ''); // Remove common currency/percent symbols
            // Check if it's a valid number after cleaning
            return cleanedVal !== '' && isFinite(Number(cleanedVal));
        }
        return false;
    });
     // Special check: If it looks like a number but has leading zeros, treat as string (e.g., ZIP codes)
    const hasLeadingZero = nonNullValues.some(val => typeof val === 'string' && val.match(/^0\d+$/));
    if (isNumber && !hasLeadingZero) return 'number';


    // Default to string if none of the above match
    return 'string';
  }
}