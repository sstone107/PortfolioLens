import SqlExecutionService, { 
  SqlExecutionStatus, 
  SqlExecutionResult,
  SqlExecutionOptions
} from '../../../../services/SqlExecutionService';
import { UserRoleType } from '../../../../types/userRoles';
import { DatabaseService } from '../../services/DatabaseService';

// Mock dependencies
jest.mock('../../../../utility/supabaseMcp', () => ({
  executeSql: jest.fn().mockImplementation((query) => {
    if (query.includes('SELECT * FROM users')) {
      return [
        { id: 'user1', name: 'Admin User', role: 'admin' },
        { id: 'user2', name: 'Regular User', role: 'user' }
      ];
    } else if (query.includes('INSERT INTO')) {
      return [{ id: 'new-record-id' }];
    } else if (query.includes('UPDATE')) {
      return [{ affected_rows: 1 }];
    } else if (query.includes('DELETE')) {
      return [{ affected_rows: 1 }];
    }
    return [];
  }),
  applyMigration: jest.fn().mockResolvedValue({ success: true })
}));

jest.mock('../../../../utility/supabaseClient', () => ({
  supabaseClient: {
    rpc: jest.fn().mockImplementation((functionName, params) => {
      if (functionName === 'exec_sql_secure') {
        // Mock different responses based on the query
        const query = params.query_text;
        
        if (query.includes('SELECT * FROM users')) {
          return {
            data: [
              { id: 'user1', name: 'Admin User', role: 'admin' },
              { id: 'user2', name: 'Regular User', role: 'user' }
            ],
            error: null
          };
        } else if (query.includes('INSERT INTO')) {
          return {
            data: [{ id: 'new-record-id' }],
            error: null
          };
        } else if (query.includes('DROP TABLE')) {
          // Simulate permission denied for destructive operations
          return {
            data: null,
            error: { message: 'Destructive operations are not allowed for your role' }
          };
        }
        
        return { data: [], error: null };
      }
      return { data: null, error: { message: 'Function not found' } };
    }),
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis()
  }
}));

// Mock the useUserRoles hook
jest.mock('../../../../contexts/userRoleContext', () => ({
  useUserRoles: jest.fn().mockImplementation(() => ({
    userWithRoles: {
      hasRole: (role: string) => role === 'Admin' || role === 'Accounting',
      isAdmin: true
    }
  }))
}));

describe('SQL Execution Integration Tests', () => {
  describe('SqlExecutionService', () => {
    it('should execute a SQL query with parameters', async () => {
      // Execute a query
      const result = await SqlExecutionService.executeQuery(
        'SELECT * FROM users WHERE role = $1',
        { $1: 'admin' }
      );
      
      // Verify result
      expect(result).toBeDefined();
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(2);
      expect(result.metadata.status).toBe(SqlExecutionStatus.SUCCESS);
      expect(result.metadata.queryHash).toBeDefined();
    });
    
    it('should execute a secure SQL query with role-based permissions', async () => {
      // Execute a secure query
      const result = await SqlExecutionService.executeSecureQuery(
        'SELECT * FROM financial_data WHERE year = $1',
        { $1: 2025 },
        [UserRoleType.Admin, UserRoleType.Accounting]
      );
      
      // Verify result
      expect(result).toBeDefined();
      expect(result.error).toBeNull();
      expect(result.metadata.status).toBe(SqlExecutionStatus.SUCCESS);
    });
    
    it('should handle errors when executing SQL queries', async () => {
      // Execute a query that will fail
      const result = await SqlExecutionService.executeQuery(
        'DROP TABLE users'
      );
      
      // Verify result
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
      expect(result.data).toBeNull();
      expect(result.metadata.status).toBe(SqlExecutionStatus.ERROR);
    });
    
    it('should generate a query hash for tracking', () => {
      // Generate a hash
      const hash = SqlExecutionService.generateQueryHash('SELECT * FROM users');
      
      // Verify hash
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });
  
  describe('DatabaseService SQL Integration', () => {
    let dbService: DatabaseService;
    
    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();
      
      // Initialize service
      dbService = new DatabaseService();
      
      // Mock the connection verification
      (dbService as any).verifyConnection = jest.fn().mockResolvedValue(true);
      (dbService as any).connectionState = 'connected';
    });
    
    it('should execute SQL using the secure SQL execution framework', async () => {
      // Mock SqlExecutionService.executeQuery
      jest.spyOn(SqlExecutionService, 'executeQuery').mockResolvedValue({
        data: [{ id: 'user1', name: 'Test User' }],
        error: null,
        metadata: {
          status: SqlExecutionStatus.SUCCESS,
          rowCount: 1,
          queryHash: 'abc123'
        }
      });
      
      // Execute SQL
      const result = await dbService.executeSQL(
        'SELECT * FROM users WHERE id = $1',
        { $1: 'user1' }
      );
      
      // Verify result
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('user1');
      
      // Verify SqlExecutionService.executeQuery was called
      expect(SqlExecutionService.executeQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1',
        { $1: 'user1' },
        {}
      );
    });
    
    it('should execute secure SQL with role-based permissions', async () => {
      // Mock SqlExecutionService.executeSecureQuery
      jest.spyOn(SqlExecutionService, 'executeSecureQuery').mockResolvedValue({
        data: [{ id: 'financial1', amount: 1000 }],
        error: null,
        metadata: {
          status: SqlExecutionStatus.SUCCESS,
          rowCount: 1,
          queryHash: 'abc123'
        }
      });
      
      // Execute secure SQL
      const result = await dbService.executeSecureSQL(
        'SELECT * FROM financial_data WHERE id = $1',
        { $1: 'financial1' },
        [UserRoleType.Admin, UserRoleType.Accounting]
      );
      
      // Verify result
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('financial1');
      
      // Verify SqlExecutionService.executeSecureQuery was called
      expect(SqlExecutionService.executeSecureQuery).toHaveBeenCalledWith(
        'SELECT * FROM financial_data WHERE id = $1',
        { $1: 'financial1' },
        [UserRoleType.Admin, UserRoleType.Accounting],
        {}
      );
    });
    
    it('should handle errors when executing SQL', async () => {
      // Mock SqlExecutionService.executeQuery to return an error
      jest.spyOn(SqlExecutionService, 'executeQuery').mockResolvedValue({
        data: null,
        error: new Error('SQL execution failed'),
        metadata: {
          status: SqlExecutionStatus.ERROR,
          queryHash: 'abc123'
        }
      });
      
      // Execute SQL and expect it to throw
      await expect(dbService.executeSQL('DROP TABLE users')).rejects.toThrow('SQL execution failed');
      
      // Verify SqlExecutionService.executeQuery was called
      expect(SqlExecutionService.executeQuery).toHaveBeenCalledWith(
        'DROP TABLE users',
        {},
        {}
      );
    });
    
    it('should apply a database migration with audit logging', async () => {
      // Mock SqlExecutionService.executeQuery
      jest.spyOn(SqlExecutionService, 'executeQuery').mockResolvedValue({
        data: [{ id: 'log1' }],
        error: null,
        metadata: {
          status: SqlExecutionStatus.SUCCESS,
          rowCount: 1,
          queryHash: 'abc123'
        }
      });
      
      // Mock applyMigration
      const mockApplyMigration = require('../../../../utility/supabaseMcp').applyMigration;
      mockApplyMigration.mockResolvedValue({ success: true, message: 'Migration applied' });
      
      // Apply migration
      const result = await dbService.applyMigration(
        'test-migration',
        'CREATE TABLE test_table (id UUID PRIMARY KEY);'
      );
      
      // Verify result
      expect(result).toEqual({ success: true, message: 'Migration applied' });
      
      // Verify SqlExecutionService.executeQuery was called for logging
      expect(SqlExecutionService.executeQuery).toHaveBeenCalled();
      
      // Verify applyMigration was called
      expect(mockApplyMigration).toHaveBeenCalledWith(
        'test-migration',
        'CREATE TABLE test_table (id UUID PRIMARY KEY);'
      );
    });
  });
  
  describe('SQL Execution Audit Logging', () => {
    it('should log SQL execution details', async () => {
      // Mock supabaseClient.from for the log query
      const mockFrom = require('../../../../utility/supabaseClient').supabaseClient.from;
      mockFrom.mockReturnThis();
      
      // Execute a query to generate a log
      await SqlExecutionService.executeQuery('SELECT * FROM users');
      
      // Get logs
      const { logs, count } = await SqlExecutionService.getLogs(10, 0, {
        status: SqlExecutionStatus.SUCCESS
      });
      
      // Verify logs were retrieved
      expect(mockFrom).toHaveBeenCalledWith('sql_execution_log');
    });
  });
});