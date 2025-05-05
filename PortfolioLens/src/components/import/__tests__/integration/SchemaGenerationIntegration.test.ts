import { SchemaGenerator } from '../../services/SchemaGenerator';
import { MetadataService } from '../../services/MetadataService';
import { MissingColumnInfo, ColumnType } from '../../types';

// Mock dependencies
jest.mock('@supabase/supabase-js');
jest.mock('../../../utility/supabaseClient', () => ({
  executeSQL: jest.fn().mockResolvedValue({ success: true, message: 'Schema operations executed successfully' }),
  supabaseClient: {}
}));

describe('Schema Generation Integration Tests', () => {
  describe('SchemaGenerator', () => {
    it('should generate SQL for creating tables', () => {
      // Define tables to create
      const tablesToCreate = [
        { tableName: 'new_loans' },
        { tableName: 'new_payments' }
      ];
      
      // Define columns to add
      const columnsToAdd: { tableName: string, columns: MissingColumnInfo[] }[] = [];
      
      // Generate SQL
      const sql = SchemaGenerator.generateSQL(tablesToCreate, columnsToAdd);
      
      // Verify SQL contains CREATE TABLE statements
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS "new_loans"');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS "new_payments"');
      
      // Verify SQL contains standard columns
      expect(sql).toContain('"id" UUID PRIMARY KEY DEFAULT uuid_generate_v4()');
      expect(sql).toContain('"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
      expect(sql).toContain('"updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
      
      // Verify SQL contains schema cache refresh
      expect(sql).toContain('SELECT refresh_schema_cache()');
    });
    
    it('should generate SQL for adding columns to existing tables', () => {
      // Define tables to create
      const tablesToCreate: { tableName: string }[] = [];
      
      // Define columns to add
      const columnsToAdd = [
        {
          tableName: 'loans',
          columns: [
            { columnName: 'new_column1', suggestedType: 'TEXT', originalType: 'string' as ColumnType },
            { columnName: 'new_column2', suggestedType: 'NUMERIC(18,2)', originalType: 'number' as ColumnType }
          ]
        },
        {
          tableName: 'payments',
          columns: [
            { columnName: 'new_date', suggestedType: 'TIMESTAMP WITH TIME ZONE', originalType: 'date' as ColumnType }
          ]
        }
      ];
      
      // Generate SQL
      const sql = SchemaGenerator.generateSQL(tablesToCreate, columnsToAdd);
      
      // Verify SQL contains ALTER TABLE statements
      expect(sql).toContain('ALTER TABLE "loans"');
      expect(sql).toContain('ALTER TABLE "payments"');
      
      // Verify SQL contains ADD COLUMN statements
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS "new_column1" TEXT');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS "new_column2" NUMERIC(18,2)');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS "new_date" TIMESTAMP WITH TIME ZONE');
      
      // Verify SQL contains schema cache refresh
      expect(sql).toContain('SELECT refresh_schema_cache()');
    });
    
    it('should execute schema operations', async () => {
      // Generate SQL
      const sql = SchemaGenerator.generateSQL(
        [{ tableName: 'test_table' }],
        [{ 
          tableName: 'existing_table', 
          columns: [{ columnName: 'test_column', suggestedType: 'TEXT', originalType: 'string' }] 
        }]
      );
      
      // Execute SQL
      const result = await SchemaGenerator.executeSQL(sql);
      
      // Verify result
      expect(result.success).toBe(true);
      expect(result.message).toBe('Schema operations executed successfully.');
    });
    
    it('should analyze Excel data to determine required schema changes', () => {
      // Mock Excel data
      const excelData = [
        { 
          'ID': '1', 
          'Name': 'Test', 
          'Amount': 100.5, 
          'Date': '2025-01-01', 
          'IsActive': 'Yes',
          'LongText': 'This is a very long text that should be stored as TEXT instead of VARCHAR'
        },
        { 
          'ID': '2', 
          'Name': 'Test2', 
          'Amount': 200, 
          'Date': '2025-01-02', 
          'IsActive': 'No',
          'LongText': 'Another long text value with more than 255 characters '.repeat(10)
        }
      ];
      
      // Analyze schema
      const missingColumns = SchemaGenerator.analyzeExcelSchema('test_table', excelData);
      
      // Verify missing columns
      expect(missingColumns).toHaveLength(6);
      
      // Verify column types
      const idColumn = missingColumns.find(col => col.columnName === 'ID');
      expect(idColumn).toBeDefined();
      expect(idColumn?.suggestedType).toBe('varchar(255)');
      expect(idColumn?.originalType).toBe('string' as ColumnType);
      
      const nameColumn = missingColumns.find(col => col.columnName === 'Name');
      expect(nameColumn).toBeDefined();
      expect(nameColumn?.suggestedType).toBe('varchar(255)');
      expect(nameColumn?.originalType).toBe('string' as ColumnType);
      
      const amountColumn = missingColumns.find(col => col.columnName === 'Amount');
      expect(amountColumn).toBeDefined();
      expect(amountColumn?.suggestedType).toBe('numeric(18,6)');
      expect(amountColumn?.originalType).toBe('number' as ColumnType);
      
      const dateColumn = missingColumns.find(col => col.columnName === 'Date');
      expect(dateColumn).toBeDefined();
      expect(dateColumn?.suggestedType).toBe('timestamp with time zone');
      expect(dateColumn?.originalType).toBe('date' as ColumnType);
      
      const isActiveColumn = missingColumns.find(col => col.columnName === 'IsActive');
      expect(isActiveColumn).toBeDefined();
      expect(isActiveColumn?.suggestedType).toBe('boolean');
      expect(isActiveColumn?.originalType).toBe('boolean' as ColumnType);
      
      const longTextColumn = missingColumns.find(col => col.columnName === 'LongText');
      expect(longTextColumn).toBeDefined();
      expect(longTextColumn?.suggestedType).toBe('text');
      expect(longTextColumn?.originalType).toBe('string' as ColumnType);
    });
    
    it('should infer column types from column names when no data is available', () => {
      // Mock Excel data with empty values
      const excelData = [
        { 
          'loan_id': '', 
          'amount': '', 
          'date_created': '', 
          'is_active': '',
          'notes': ''
        }
      ];
      
      // Analyze schema
      const missingColumns = SchemaGenerator.analyzeExcelSchema('test_table', excelData);
      
      // Verify column types based on column names
      const loanIdColumn = missingColumns.find(col => col.columnName === 'loan_id');
      expect(loanIdColumn).toBeDefined();
      expect(loanIdColumn?.suggestedType).toBe('varchar(255)');
      
      const amountColumn = missingColumns.find(col => col.columnName === 'amount');
      expect(amountColumn).toBeDefined();
      expect(amountColumn?.suggestedType).toBe('numeric(18,6)');
      expect(amountColumn?.originalType).toBe('number');
      
      const dateColumn = missingColumns.find(col => col.columnName === 'date_created');
      expect(dateColumn).toBeDefined();
      expect(dateColumn?.suggestedType).toBe('timestamp with time zone');
      expect(dateColumn?.originalType).toBe('date');
      
      const isActiveColumn = missingColumns.find(col => col.columnName === 'is_active');
      expect(isActiveColumn).toBeDefined();
      expect(isActiveColumn?.suggestedType).toBe('boolean');
      expect(isActiveColumn?.originalType).toBe('boolean');
    });
  });
  
  describe('MetadataService Integration with SchemaGenerator', () => {
    let metadataService: MetadataService;
    let mockSupabaseClient: any;
    
    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();
      
      // Create mock Supabase client
      mockSupabaseClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        rpc: jest.fn().mockReturnThis()
      };
      
      // Initialize service
      metadataService = new MetadataService(mockSupabaseClient);
      
      // Mock the executeSQL function
      (metadataService as any).executeSQL = jest.fn().mockResolvedValue([
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'loan_id', data_type: 'character varying', is_nullable: 'NO' }
      ]);
    });
    
    it('should detect missing columns in a table', async () => {
      // Mock the getTableInfo method
      (metadataService as any).getTableInfo = jest.fn().mockResolvedValue({
        tableName: 'loans',
        columns: [
          { columnName: 'id', dataType: 'uuid', isNullable: false, columnDefault: 'uuid_generate_v4()', isPrimaryKey: true },
          { columnName: 'loan_id', dataType: 'character varying', isNullable: false, columnDefault: null, isPrimaryKey: false }
        ]
      });
      
      // Define column mapping with new columns
      const mapping = {
        'Loan ID': { excelColumn: 'Loan ID', dbColumn: 'loan_id', type: 'string' as ColumnType },
        'Amount': { excelColumn: 'Amount', dbColumn: 'amount', type: 'number' as ColumnType },
        'Date': { excelColumn: 'Date', dbColumn: 'date', type: 'date' as ColumnType }
      };
      
      // Detect missing columns
      const missingColumns = await metadataService.detectMissingColumns('loans', mapping);
      
      // Verify missing columns
      expect(missingColumns).toHaveLength(2);
      expect(missingColumns[0].columnName).toBe('amount');
      expect(missingColumns[0].suggestedType).toBe('numeric(18,6)');
      expect(missingColumns[1].columnName).toBe('date');
      expect(missingColumns[1].suggestedType).toBe('timestamp with time zone');
    });
    
    it('should create missing columns in a table', async () => {
      // Mock the SchemaGenerator.executeSQL method
      jest.spyOn(SchemaGenerator, 'executeSQL').mockResolvedValue({
        success: true,
        message: 'Schema operations executed successfully.'
      });
      
      // Define missing columns
      const missingColumns: MissingColumnInfo[] = [
        { columnName: 'amount', suggestedType: 'numeric(18,6)', originalType: 'number' as ColumnType },
        { columnName: 'date', suggestedType: 'timestamp with time zone', originalType: 'date' as ColumnType }
      ];
      
      // Create missing columns
      const result = await metadataService.createMissingColumns('loans', missingColumns);
      
      // Verify result
      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully created');
      
      // Verify SchemaGenerator.executeSQL was called with correct SQL
      expect(SchemaGenerator.executeSQL).toHaveBeenCalled();
      const sqlArg = (SchemaGenerator.executeSQL as jest.Mock).mock.calls[0][0];
      expect(sqlArg).toContain('ALTER TABLE "loans"');
      expect(sqlArg).toContain('ADD COLUMN IF NOT EXISTS "amount" numeric(18,6)');
      expect(sqlArg).toContain('ADD COLUMN IF NOT EXISTS "date" timestamp with time zone');
    });
  });
});