/**
 * SQL Execution Service
 * 
 * This service provides a secure, role-based SQL execution framework with:
 * - Parameterized query execution
 * - Permission controls based on user roles
 * - Resource limits (execution time, row count)
 * - Comprehensive audit logging
 * - Data lineage tracking
 */

import { supabaseClient } from "../utility";
import { UserRoleType } from "../types/userRoles";
import { useUserRoles } from "../contexts/userRoleContext";

/**
 * SQL execution status enum
 */
export enum SqlExecutionStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled'
}

/**
 * SQL execution log entry interface
 */
export interface SqlExecutionLog {
  id: string;
  userId: string;
  roleName: string;
  queryText: string;
  parameters?: Record<string, any>;
  executionTime?: string;
  rowCount?: number;
  status: SqlExecutionStatus;
  errorMessage?: string;
  clientInfo?: Record<string, any>;
  resourceUsage?: Record<string, any>;
  createdAt: Date;
  dataLineage?: Record<string, any>;
  queryHash?: string;
}

/**
 * SQL execution result interface
 */
export interface SqlExecutionResult<T = any> {
  data: T[] | null;
  error: Error | null;
  metadata: {
    executionTime?: string;
    rowCount?: number;
    status: SqlExecutionStatus;
    queryHash?: string;
  };
}

/**
 * SQL execution options interface
 */
export interface SqlExecutionOptions {
  role?: UserRoleType;
  timeout?: number; // in milliseconds
  maxRows?: number;
  trackLineage?: boolean;
}

/**
 * SQL Execution Service class
 */
export class SqlExecutionService {
  /**
   * Execute a SQL query with parameters and role-based permissions
   * 
   * @param query SQL query to execute
   * @param params Parameters for the query
   * @param options Execution options
   * @returns Promise resolving to execution result
   */
  static async executeQuery<T = any>(
    query: string,
    params: Record<string, any> = {},
    options: SqlExecutionOptions = {}
  ): Promise<SqlExecutionResult<T>> {
    try {
      // Call the secure SQL execution function
      const rpcResult = await supabaseClient.rpc(
        'exec_sql_secure',
        {
          query_text: query,
          // Ensure parameters is always an object, never an array
          // This is critical because PostgreSQL functions expect JSONB objects
          parameters: params && typeof params === 'object' && !Array.isArray(params) ? params : {},
          // Pass null explicitly if options.role is undefined
          role_name: options.role ?? null
        }
      );
      
      // Log the raw RPC result for detailed debugging
      
      const { data, error } = rpcResult; // Destructure after logging

      if (error) { // Check top-level error
        console.error('SQL execution error (RPC Level):', error);
        console.error('[DEBUG SqlExecutionService] RPC Error Details:', JSON.stringify(error, null, 2));
        return {
          data: null,
          error: new Error(error.message || 'SQL execution failed'),
          metadata: {
            status: SqlExecutionStatus.ERROR,
            queryHash: this.generateQueryHash(query)
          }
        };
      }
      
      // Check for nested errors within the data field (common pattern for pg functions)
      if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
        const nestedErrorMsg = data.detail ? `${data.error} (Detail: ${data.detail})` : data.error;
        console.error('SQL execution error (Nested in Data):', nestedErrorMsg);
        console.error('[DEBUG SqlExecutionService] Nested Error Details:', JSON.stringify(data, null, 2));
        return {
          data: null,
          error: new Error(nestedErrorMsg),
          metadata: {
            status: SqlExecutionStatus.ERROR,
            queryHash: this.generateQueryHash(query)
          }
        };
      }

      // If no errors, return data
      return {
        // Ensure data is always an array, even if RPC returns single object or null/undefined
        data: data === null || data === undefined ? [] : (Array.isArray(data) ? data : [data]),
        error: null,
        metadata: {
          rowCount: Array.isArray(data) ? data.length : 1,
          status: SqlExecutionStatus.SUCCESS,
          queryHash: this.generateQueryHash(query)
        }
      };
    } catch (error: any) {
      console.error('SQL execution service error:', error);
      return {
        data: null,
        error: new Error(error.message || 'SQL execution service error'),
        metadata: {
          status: SqlExecutionStatus.ERROR,
          queryHash: this.generateQueryHash(query)
        }
      };
    }
  }

  /**
   * Execute a SQL query with parameters and verify user has required permissions
   * 
   * @param query SQL query to execute
   * @param params Parameters for the query
   * @param requiredRoles Roles required to execute this query
   * @param options Execution options
   * @returns Promise resolving to execution result
   */
  static async executeSecureQuery<T = any>(
    query: string,
    params: Record<string, any> = {},
    requiredRoles: UserRoleType[] = [],
    options: SqlExecutionOptions = {}
  ): Promise<SqlExecutionResult<T>> {
    // Get current user roles
    const { userWithRoles } = useUserRoles();
    
    // Check if user has required roles
    if (requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.some(role => 
        userWithRoles?.hasRole(role) || userWithRoles?.isAdmin
      );
      
      if (!hasRequiredRole) {
        return {
          data: null,
          error: new Error('Permission denied: User does not have required roles'),
          metadata: {
            status: SqlExecutionStatus.ERROR,
            queryHash: this.generateQueryHash(query)
          }
        };
      }
    }
    
    // Execute the query with the first matching role
    const role = requiredRoles.find(role => userWithRoles?.hasRole(role));
    return this.executeQuery<T>(query, params, { ...options, role: role });
  }

  /**
   * Get SQL execution logs
   * 
   * @param limit Maximum number of logs to return
   * @param offset Offset for pagination
   * @param filters Optional filters for the logs
   * @returns Promise resolving to array of execution logs
   */
  static async getLogs(
    limit: number = 50,
    offset: number = 0,
    filters: Partial<{
      userId: string;
      status: SqlExecutionStatus;
      fromDate: Date;
      toDate: Date;
      queryContains: string;
    }> = {}
  ): Promise<{ logs: SqlExecutionLog[]; count: number }> {
    try {
      let query = supabaseClient
        .from('sql_execution_log')
        .select('*', { count: 'exact' });
      
      // Apply filters
      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }
      
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      if (filters.fromDate) {
        query = query.gte('created_at', filters.fromDate.toISOString());
      }
      
      if (filters.toDate) {
        query = query.lte('created_at', filters.toDate.toISOString());
      }
      
      if (filters.queryContains) {
        query = query.ilike('query_text', `%${filters.queryContains}%`);
      }
      
      // Apply pagination
      query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });
      
      const { data, error, count } = await query;
      
      if (error) {
        console.error('Error fetching SQL execution logs:', error);
        return { logs: [], count: 0 };
      }
      
      // Transform the data to match the interface
      const logs: SqlExecutionLog[] = data.map(log => ({
        id: log.id,
        userId: log.user_id,
        roleName: log.role_name,
        queryText: log.query_text,
        parameters: log.parameters,
        executionTime: log.execution_time,
        rowCount: log.row_count,
        status: log.status as SqlExecutionStatus,
        errorMessage: log.error_message,
        clientInfo: log.client_info,
        resourceUsage: log.resource_usage,
        createdAt: new Date(log.created_at),
        dataLineage: log.data_lineage,
        queryHash: log.query_hash
      }));
      
      return { logs, count: count || 0 };
    } catch (error: any) {
      console.error('Error in getLogs:', error);
      return { logs: [], count: 0 };
    }
  }

  /**
   * Get data lineage for a specific entity
   * 
   * @param entityType Type of entity (table, column, etc.)
   * @param entityId ID of the entity
   * @returns Promise resolving to data lineage information
   */
  static async getDataLineage(
    entityType: string,
    entityId: string
  ): Promise<Record<string, any>[]> {
    try {
      // Query the execution logs to find operations that affected this entity
      const { data, error } = await supabaseClient
        .from('sql_execution_log')
        .select('*')
        .contains('data_lineage', { affected_tables: [entityId] })
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching data lineage:', error);
        return [];
      }
      
      return data.map(log => ({
        operation: this.inferOperationType(log.query_text),
        timestamp: new Date(log.created_at),
        user: log.user_id,
        role: log.role_name,
        query: log.query_text,
        parameters: log.parameters,
        lineage: log.data_lineage
      }));
    } catch (error: any) {
      console.error('Error in getDataLineage:', error);
      return [];
    }
  }

  /**
   * Generate a hash for a query (for tracking and deduplication)
   *
   * @param query SQL query
   * @returns Hash of the query
   */
  static generateQueryHash(query: string): string {
    // Simple hash function for demo purposes
    // In production, use a proper hashing algorithm
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Infer the operation type from a SQL query
   * 
   * @param query SQL query
   * @returns Operation type (SELECT, INSERT, UPDATE, DELETE, etc.)
   */
  private static inferOperationType(query: string): string {
    const normalizedQuery = query.trim().toUpperCase();
    
    if (normalizedQuery.startsWith('SELECT')) return 'SELECT';
    if (normalizedQuery.startsWith('INSERT')) return 'INSERT';
    if (normalizedQuery.startsWith('UPDATE')) return 'UPDATE';
    if (normalizedQuery.startsWith('DELETE')) return 'DELETE';
    if (normalizedQuery.startsWith('CREATE')) return 'CREATE';
    if (normalizedQuery.startsWith('ALTER')) return 'ALTER';
    if (normalizedQuery.startsWith('DROP')) return 'DROP';
    if (normalizedQuery.startsWith('TRUNCATE')) return 'TRUNCATE';
    
    return 'UNKNOWN';
  }
}

/**
 * Hook for executing SQL queries with role-based permissions
 */
export const useSqlExecution = () => {
  const { userWithRoles } = useUserRoles();
  
  /**
   * Execute a SQL query with current user's permissions
   */
  const executeQuery = async <T = any>(
    query: string,
    params: Record<string, any> = {},
    options: SqlExecutionOptions = {}
  ): Promise<SqlExecutionResult<T>> => {
    // If user is not logged in, return error
    if (!userWithRoles) {
      return {
        data: null,
        error: new Error('User not authenticated'),
        metadata: {
          status: SqlExecutionStatus.ERROR,
          queryHash: SqlExecutionService.generateQueryHash(query)
        }
      };
    }
    
    // Use the static method from the service
    return SqlExecutionService.executeQuery<T>(query, params, options);
  };
  
  /**
   * Check if user has permission to execute a query requiring specific roles
   */
  const hasQueryPermission = (requiredRoles: UserRoleType[]): boolean => {
    if (!userWithRoles) return false;
    if (userWithRoles.isAdmin) return true;
    return requiredRoles.some(role => userWithRoles.hasRole(role));
  };
  
  return {
    executeQuery,
    hasQueryPermission,
    userRoles: userWithRoles?.roles || [],
    isAdmin: userWithRoles?.isAdmin || false
  };
};

// Re-export the static class for direct usage
export default SqlExecutionService;