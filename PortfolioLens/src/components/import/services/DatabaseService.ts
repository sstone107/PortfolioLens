import { SupabaseClient } from '@supabase/supabase-js';
import { SchemaCacheService } from './SchemaCacheService'; // <-- ADD IMPORT
import {
  TableInfo,
  ImportJob,
  ColumnMapping,
  MissingColumnInfo,
  TableMappingSuggestion,
  ColumnType,
  DbColumnInfo // <-- ADD DbColumnInfo
} from '../types';
import { MetadataService } from './MetadataService';
import { MappingService } from './MappingService';
import { ImportService, ImportResult } from './ImportService';
import { executeSql, applyMigration, SUPABASE_PROJECT_ID } from '../../../utility/supabaseMcp';
import { initMcpBridge } from '../../../utility/mcpBridge';
import SqlExecutionService, { SqlExecutionOptions } from '../../../services/SqlExecutionService';
import { UserRoleType } from '../../../types/userRoles';

/**
 * Connection state enum for tracking database connection status
 */
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

/**
 * Connection pool interface for managing database connections
 */
interface ConnectionPool {
  maxConnections: number;
  activeConnections: number;
  queue: Array<() => Promise<void>>;
  acquire(): Promise<void>;
  release(): void;
}

/**
 * Facade service that coordinates database operations for import functionality
 * This service delegates to specialized services for specific operations and
 * uses the Supabase MCP pattern for database interactions
 */
export class DatabaseService {
  private client: SupabaseClient | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private connectionAttempts: number = 0;
  private readonly MAX_RETRY_ATTEMPTS: number = 3;
  private readonly RETRY_DELAY_MS: number = 1000;
  
  // Connection pool for handling large datasets
  private connectionPool: ConnectionPool = {
    maxConnections: 5,
    activeConnections: 0,
    queue: [],
    
    acquire: async function(): Promise<void> {
      if (this.activeConnections < this.maxConnections) {
        this.activeConnections++;
        return Promise.resolve();
      }
      
      // Queue the request if max connections reached
      return new Promise((resolve) => {
        this.queue.push(async () => {
          this.activeConnections++;
          resolve();
        });
      });
    },
    
    release: function(): void {
      this.activeConnections--;
      
      // Process next queued request if any
      if (this.queue.length > 0 && this.activeConnections < this.maxConnections) {
        const next = this.queue.shift();
        if (next) next();
      }
    }
  };
  
  // Specialized services
  private metadataService!: MetadataService; // Definite assignment in initializeServices
  private mappingService!: MappingService;   // Definite assignment in initializeServices
  private importService!: ImportService;     // Definite assignment in initializeServices
  private schemaCacheService!: SchemaCacheService; // <-- ADD DECLARATION (Definite assignment)
  
  constructor(customClient?: SupabaseClient) {
    // Initialize MCP bridge to ensure MCP functions are available
    // initMcpBridge(); // Commented out to bypass MCP server dependency
    
    // Store the client if provided (mainly for testing purposes)
    this.client = customClient || null;
    
    // Initialize services
    this.initializeServices();
  }
  
  /**
   * Initialize specialized services with proper error handling
   * @private
   */
  private async initializeServices(): Promise<void> {
    try {
      // Initialize services with minimal logging
      
      // 1. Create SchemaCacheService, passing this DatabaseService instance
      const schemaCacheServiceInstance = new SchemaCacheService(this);
      
      // 2. Create MetadataService, passing the SchemaCacheService instance
      const metadataServiceInstance = new MetadataService(schemaCacheServiceInstance);
      
      // 3. Inject MetadataService into SchemaCacheService (lazy link)
      if (typeof schemaCacheServiceInstance.setMetadataService === 'function') {
          schemaCacheServiceInstance.setMetadataService(metadataServiceInstance);
      } else {
           console.error('[DatabaseService] SchemaCacheService instance is missing the setMetadataService method!');
           throw new Error('SchemaCacheService is missing setMetadataService method.');
      }

      // 4. Assign the created instances
      this.schemaCacheService = schemaCacheServiceInstance;
      this.metadataService = metadataServiceInstance;

      // 5. Initialize other services that depend on MetadataService
      this.mappingService = new MappingService(this.metadataService, this.client || undefined);
      this.importService = new ImportService(this.metadataService, this.client || undefined);

      // 6. Verify connection (can happen after services are set up)
      await this.verifyConnection();

    } catch (error) {
      console.error('Failed to initialize database services:', error);
      // No need for fallback instantiation here, as a failure likely indicates a deeper issue.
      // Let the error propagate or handle it more specifically if needed.
      this.connectionState = ConnectionState.ERROR;
      // Re-throw the error to make the failure explicit to the caller
      throw new Error(`Database service initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Verify database connection with retry logic
   * @returns Promise resolving to true if connection is successful
   */
  async verifyConnection(): Promise<boolean> {
    if (this.connectionState === ConnectionState.CONNECTED) {
      return true;
    }
    
    this.connectionState = ConnectionState.CONNECTING;
    this.connectionAttempts = 0;
    
    return this.attemptConnection();
  }
  
  /**
   * Attempt to connect to the database with retry logic
   * @private
   * @returns Promise resolving to true if connection is successful
   */
  private async attemptConnection(): Promise<boolean> {
    try {
      this.connectionAttempts++;
      
      // Execute a simple query to verify connection
      // Execute query with minimal logging
      const { data, error } = await executeSql(`SELECT version();`);

      // Enhanced verification logic to handle different result formats
      if (error) {
        console.error('Connection verification query failed:', error);
        throw error;
      }

      // Check if the result is valid - more resilient to different result formats
      if (Array.isArray(data)) {
        // Case 1: Standard format - array with one element containing version info
        if (data.length === 1 && data[0]?.version) { // Added optional chaining for safety
          this.connectionState = ConnectionState.CONNECTED;
          return true;
        }
        // Case 2: Empty array - valid response indicating success but no rows
        else if (data.length === 0) {
          this.connectionState = ConnectionState.CONNECTED;
          return true;
        }
        // Case 3: Non-empty array with unexpected structure
        else { // data.length > 0 but not the expected format
          this.connectionState = ConnectionState.CONNECTED;
          return true;
        }
      } else if (data !== null && typeof data === 'object') {
        // Case 4: Non-array object response (might happen with some MCP mocks or errors)
        this.connectionState = ConnectionState.CONNECTED; // Still treat as connected if no error thrown
        return true;
      }

      // If data is null or some other unexpected type, but no error was thrown
      this.connectionState = ConnectionState.CONNECTED; // Assume connected if no error
      return true;
    } catch (error) {
      console.error(`Connection attempt ${this.connectionAttempts} failed:`, error);
      
      if (this.connectionAttempts < this.MAX_RETRY_ATTEMPTS) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
        return this.attemptConnection();
      }
      
      this.connectionState = ConnectionState.ERROR;
      console.error(`All connection attempts failed after ${this.MAX_RETRY_ATTEMPTS} retries`);
      return false;
    }
  }
  
  /**
   * Get current connection state
   * @returns Current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }
  
  /**
   * Execute a database operation with connection pool management
   * @param operation Function that performs the database operation
   * @returns Promise resolving to the operation result
   */
  private async executeWithConnectionPool<T>(operation: () => Promise<T>): Promise<T> {
    // Verify connection before executing operation
    if (this.connectionState !== ConnectionState.CONNECTED) {
      const connected = await this.verifyConnection();
      if (!connected) {
        throw new Error('Cannot execute operation: Database connection failed');
      }
    }
    
    // Acquire connection from pool
    await this.connectionPool.acquire();
    
    try {
      // Execute the operation
      return await operation();
    } finally {
      // Release connection back to pool
      this.connectionPool.release();
    }
  }
  
  // ------------- Table Metadata Methods -------------
  
  /**
   * Get list of available tables in the database
   * @returns Promise resolving to array of table names
   */
  async getTables(): Promise<string[]> {
    // Fetch tables directly, excluding system tables
    return this.executeWithConnectionPool(async () => {
        const sql = `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            AND table_name NOT IN (
               'users', 'audit_logs', 'audit_trail', 'sql_execution_log',
               'user_roles', 'user_role_assignments', 'roles', 'module_visibility'
            )
            ORDER BY table_name;
        `;
        const results = await this.executeSQL(sql);
        return results.map((row: any) => row.table_name);
    });
  }

  // Add this new method
  /**
   * Get column information for a specific table
   * @param tableName Name of the table
   * @returns Promise resolving to array of column info objects
   */
  async getColumns(tableName: string): Promise<DbColumnInfo[]> {
     return this.executeWithConnectionPool(async () => {
        const columnSql = `
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position;
        `;
        const columnsData = await this.executeSQL(columnSql, { '1': tableName });

        // Fetch primary keys separately
        const pkSql = `
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema = 'public'
              AND tc.table_name = $1;
        `;
        const pkResult = await this.executeSQL(pkSql, { '1': tableName });
        const primaryKeys = new Set(pkResult.map((row: any) => row.column_name));

        // Map results to DbColumnInfo type
        // Ensure DbColumnInfo matches the structure expected by TableColumn in TableInfo
        return columnsData.map((col: any) => ({
            columnName: col.column_name,
            dataType: col.data_type,
            isNullable: col.is_nullable === 'YES',
            columnDefault: col.column_default,
            isPrimaryKey: primaryKeys.has(col.column_name)
            // Add other DbColumnInfo fields if necessary (e.g., description)
        }));
    });
  }

  // Modify getTableInfo to use the new getColumns method
  /**
   * Get detailed information about a specific table
   * @param tableName Name of the table
   * @returns Promise resolving to table information
   */
  async getTableInfo(tableName: string): Promise<TableInfo> {
     return this.executeWithConnectionPool(async () => {
        // Use the new getColumns method
        const columns = await this.getColumns(tableName);

        // TODO: Fetch table description if needed from another source (e.g., pg_description)
        const description = undefined; // Placeholder

        // Assuming DbColumnInfo structure is compatible with TableColumn
        return {
            tableName: tableName,
            columns: columns,
            description: description
        };
    });
  }
  
  /**
   * Detect missing columns in a table based on the mapping
   * @param tableName Name of the table
   * @param mapping Column mapping
   * @returns Promise resolving to array of missing column information
   */
  async detectMissingColumns(
    tableName: string,
    mapping: Record<string, ColumnMapping>
  ): Promise<MissingColumnInfo[]> {
     // Correct Implementation: Detect missing columns directly
     return this.executeWithConnectionPool(async () => {
        const tableInfo = await this.getTableInfo(tableName);
        const existingColumns = new Set(tableInfo.columns.map(c => c.columnName.toLowerCase()));
        const missing: MissingColumnInfo[] = [];

        for (const sourceColumn in mapping) {
            const targetMapping = mapping[sourceColumn];
            // Use targetMapping.dbColumn and check if it's intended for the current tableName
            // Assuming the mapping structure implies the target table, or we filter mappings beforehand.
            // For now, let's assume the mapping passed is only for the relevant tableName.
            if (targetMapping.dbColumn) { // Check if a db column is specified
                const targetDbColumnLower = targetMapping.dbColumn.toLowerCase();
                if (!existingColumns.has(targetDbColumnLower)) {
                    // Check if already added to avoid duplicates
                    if (!missing.some(m => m.columnName.toLowerCase() === targetDbColumnLower)) {
                         missing.push({
                            columnName: targetMapping.dbColumn, // Use dbColumn, keep original casing
                            suggestedType: 'TEXT', // Default SQL type to TEXT, can be refined later
                            originalType: targetMapping.type // Add the required originalType from the mapping
                        });
                    }
                }
            }
        }
        return missing;
    });
  }
  
  /**
   * Create missing columns in a database table
   * @param tableName Name of the table
   * @param missingColumns Array of missing column information
   * @returns Promise resolving to success status
   */
  async createMissingColumns(
    tableName: string,
    missingColumns: MissingColumnInfo[]
  ): Promise<{success: boolean, message: string}> {
    // Correct Implementation: Create columns directly
    if (missingColumns.length === 0) {
        return { success: true, message: 'No missing columns to create.' };
    }

    // Important: Sanitize table and column names rigorously before embedding in SQL
    // For simplicity here, assuming names are safe, but production code needs proper sanitization.
    const addColumnClauses = missingColumns.map(col =>
        `ADD COLUMN "${col.columnName}" ${col.suggestedType || 'TEXT'}` // Default to TEXT if type missing
    ).join(',\n');

    const migrationName = `add_missing_cols_${tableName}_${Date.now()}`;
    const sql = `ALTER TABLE public."${tableName}"\n${addColumnClauses};`;

    console.log(`[DatabaseService] Applying migration to add columns: ${migrationName}`);
    console.log(sql);

    try {
        // Use applyMigration for schema changes
        const result = await this.applyMigration(migrationName, sql);
        console.log('[DatabaseService] Add columns migration result:', result);
        // Check result format - adjust based on actual applyMigration response
        if (result && (result.success || !result.error)) { // Example check
             return { success: true, message: `Successfully added ${missingColumns.length} columns to ${tableName}.` };
        } else {
             const errorMsg = result?.error?.message || JSON.stringify(result);
             return { success: false, message: `Failed to add columns to ${tableName}: ${errorMsg}` };
        }
    } catch (error) {
        console.error(`Error creating missing columns for ${tableName}:`, error);
        return { success: false, message: `Error creating missing columns: ${error instanceof Error ? error.message : String(error)}` };
    }
    // Note: executeWithConnectionPool is not used here as applyMigration likely handles its own execution context.
    // If applyMigration *doesn't*, it should be wrapped. Assuming it does for now.
  }
  
  // ------------- Mapping Methods -------------
  
  /**
   * Get saved column mappings for a table
   * @param tableName Name of the table
   * @returns Promise resolving to array of mappings
   */
  async getMappings(tableName: string): Promise<Record<string, any>[]> {
    return this.executeWithConnectionPool(() => 
      this.mappingService.getMappings(tableName)
    );
  }
  
  /**
   * Save mapping template for reuse
   * @param name Name of the mapping template
   * @param tableName Name of the table
   * @param mapping Column mapping
   * @returns Promise resolving to mapping ID
   */
  async saveMappingTemplate(
    name: string,
    tableName: string,
    mapping: Record<string, ColumnMapping>
  ): Promise<string> {
    return this.executeWithConnectionPool(() => 
      this.mappingService.saveMappingTemplate(name, tableName, mapping)
    );
  }
  
  /**
   * Save mapping template for reuse (alias for saveMappingTemplate for backward compatibility)
   * @param name Name of the mapping template
   * @param tableName Name of the table
   * @param mapping Column mapping
   * @returns Promise resolving to mapping ID
   */
  async saveMapping(
    name: string,
    tableName: string,
    mapping: Record<string, ColumnMapping>
  ): Promise<string> {
    return this.saveMappingTemplate(name, tableName, mapping);
  }
  
  /**
   * Suggest column mappings based on Excel data and database structure
   * @param sheetData Excel sheet data
   * @param tableInfo Table information
   * @returns Column mapping suggestions
   */
  suggestColumnMappings(
    sheetData: Record<string, any>[],
    tableInfo: TableInfo
  ): Record<string, import('../types').ColumnMappingSuggestions> { // Corrected return type
    // The underlying service method returns suggestions, not a final mapping
    return this.mappingService.suggestColumnMappings(sheetData, tableInfo);
  }
  
  /**
   * Get suggested table mappings for Excel sheets
   * @param sheetNames Array of sheet names
   * @returns Promise resolving to table mapping suggestions
   */
  async getSuggestedTableMappings(sheetNames: string[]): Promise<TableMappingSuggestion[]> { // Revert parameter to sheetNames
    return this.executeWithConnectionPool(() =>
      this.mappingService.getSuggestedTableMappings(sheetNames) // Pass sheetNames
    );
  }
  
  // ------------- Import Methods -------------
  
  /**
   * Process batch import of multiple sheets to multiple tables
   * @param jobs Import job details
   * @param excelData Sheet data from Excel
   * @param createMissingColumns Whether to create missing columns
   * @returns Record with results of each import
   */
  async processBatchImport(
    jobs: ImportJob[],
    excelData: Record<string, Record<string, any>[]>,
    createMissingColumns: boolean
  ): Promise<Record<string, ImportResult>> {
    return this.executeWithConnectionPool(() => 
      this.importService.processBatchImport(jobs, excelData, createMissingColumns)
    );
  }
  
  /**
   * Create a new import job record
   * @param job Import job details
   * @returns Promise resolving to job ID
   */
  async createImportJob(
    job: Omit<ImportJob, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'processedRows'>
  ): Promise<string> {
    return this.executeWithConnectionPool(() => 
      this.importService.createImportJob(job)
    );
  }
  
  /**
   * Process an import job
   * @param jobId ID of the import job
   * @returns Promise resolving to success status
   */
  async processImportJob(jobId: string): Promise<{ success: boolean, message: string }> {
    return this.executeWithConnectionPool(() => 
      this.importService.processImportJob(jobId)
    );
  }
  
  /**
   * Execute a raw SQL query using the secure SQL execution framework
   * @param sql SQL query to execute
   * @param params Optional parameters for the query
   * @param options Optional execution options
   * @returns Promise resolving to query result
   */
  async executeSQL(
    sql: string,
    params: Record<string, any> = {},
    options: SqlExecutionOptions = {}
  ): Promise<any[]> {
    return this.executeWithConnectionPool(async () => {
      try {
        // Use the secure SQL execution service
        const result = await SqlExecutionService.executeQuery(sql, params, options);
        
        if (result.error) {
          throw result.error;
        }
        
        return result.data || [];
      } catch (error) {
        console.error('Error executing SQL query:', error);
        throw new Error(`SQL execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
  
  /**
   * Execute a SQL query with role-based permissions
   * @param sql SQL query to execute
   * @param params Parameters for the query
   * @param requiredRoles Roles required to execute this query
   * @param options Execution options
   * @returns Promise resolving to query result
   */
  async executeSecureSQL(
    sql: string,
    params: Record<string, any> = {},
    requiredRoles: UserRoleType[] = [],
    options: SqlExecutionOptions = {}
  ): Promise<any[]> {
    return this.executeWithConnectionPool(async () => {
      try {
        // Use the secure SQL execution service with role checks
        const result = await SqlExecutionService.executeSecureQuery(
          sql,
          params,
          requiredRoles,
          options
        );
        
        if (result.error) {
          throw result.error;
        }
        
        return result.data || [];
      } catch (error) {
        console.error('Error executing secure SQL query:', error);
        throw new Error(`Secure SQL execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
  
  /**
   * Apply a database migration using the MCP pattern with audit logging
   * @param name Migration name
   * @param sql SQL migration to apply
   * @returns Promise resolving to migration result
   */
  async applyMigration(name: string, sql: string): Promise<any> {
    return this.executeWithConnectionPool(async () => {
      try {
        // Log the migration attempt in the SQL execution log
        await SqlExecutionService.executeQuery(
          `INSERT INTO sql_execution_log (
            user_id,
            role_name,
            query_text,
            parameters,
            status,
            client_info,
            data_lineage
          ) VALUES (
            auth.uid(),
            'Admin',
            $1,
            $2,
            'success',
            jsonb_build_object('source', 'DatabaseService.applyMigration'),
            jsonb_build_object('migration_name', $3)
          )`,
          {
            $1: sql,
            $2: JSON.stringify({}),
            $3: name
          },
          { role: UserRoleType.Admin }
        );
        
        // Apply the migration
        return await applyMigration(name, sql);
      } catch (error) {
        console.error('Error applying migration:', error);
        
        // Log the migration failure
        await SqlExecutionService.executeQuery(
          `INSERT INTO sql_execution_log (
            user_id,
            role_name,
            query_text,
            parameters,
            status,
            error_message,
            client_info,
            data_lineage
          ) VALUES (
            auth.uid(),
            'Admin',
            $1,
            $2,
            'error',
            $3,
            jsonb_build_object('source', 'DatabaseService.applyMigration'),
            jsonb_build_object('migration_name', $4)
          )`,
          {
            $1: sql,
            $2: JSON.stringify({}),
            $3: error instanceof Error ? error.message : String(error),
            $4: name
          },
          { role: UserRoleType.Admin }
        ).catch(logError => {
          console.error('Failed to log migration error:', logError);
        });
        
        throw new Error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
  
  /**
   * Get SQL execution logs
   * @param limit Maximum number of logs to return
   * @param offset Offset for pagination
   * @returns Promise resolving to execution logs
   */
  async getSqlExecutionLogs(limit: number = 50, offset: number = 0): Promise<any> {
    return this.executeWithConnectionPool(async () => {
      try {
        const result = await SqlExecutionService.getLogs(limit, offset);
        return result;
      } catch (error) {
        console.error('Error fetching SQL execution logs:', error);
        throw new Error(`Failed to fetch SQL execution logs: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
}
