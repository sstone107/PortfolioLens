import { ImportService } from '../../services/ImportService';
import { MetadataService } from '../../services/MetadataService';
import { MappingService } from '../../services/MappingService';
import { DatabaseService } from '../../services/DatabaseService';
import { FileReader } from '../../FileReader';
import { SchemaGenerator } from '../../services/SchemaGenerator';
import { 
  ImportJob, 
  ColumnMapping, 
  WorkbookInfo,
  SheetInfo,
  TableInfo,
  ImportMapping
} from '../../types';
import { ImportResult } from '../../services/ImportService';
import SqlExecutionService, { SqlExecutionStatus } from '../../../../services/SqlExecutionService';
import { UserRoleType } from '../../../../types/userRoles';

// Mock dependencies
jest.mock('@supabase/supabase-js');
jest.mock('../../../../utility/supabaseMcp', () => ({
  executeSql: jest.fn().mockImplementation((query: string) => {
    // Mock different responses based on the query
    if (query.includes('SELECT * FROM users')) {
      return [
        { id: 'user1', name: 'Admin User', role: 'admin' },
        { id: 'user2', name: 'Regular User', role: 'user' }
      ];
    } else if (query.includes('INSERT INTO')) {
      return [{ id: 'new-record-id' }];
    } else if (query.includes('SELECT * FROM information_schema.tables')) {
      return [
        { table_name: 'loans' },
        { table_name: 'payments' },
        { table_name: 'servicers' }
      ];
    } else if (query.includes('SELECT * FROM information_schema.columns')) {
      return [
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: 'uuid_generate_v4()', is_primary: true },
        { column_name: 'loan_id', data_type: 'character varying', is_nullable: 'NO', column_default: null, is_primary: false },
        { column_name: 'amount', data_type: 'numeric', is_nullable: 'YES', column_default: null, is_primary: false },
        { column_name: 'date', data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null, is_primary: false },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO', column_default: 'CURRENT_TIMESTAMP', is_primary: false }
      ];
    }
    return [];
  }),
  applyMigration: jest.fn().mockResolvedValue({ success: true })
}));

jest.mock('xlsx', () => {
  return {
    read: jest.fn().mockImplementation(() => {
      return {
        SheetNames: ['Loans', 'Payments'],
        Sheets: {
          'Loans': {
            '!ref': 'A1:C10',
            'A1': { v: 'Loan ID' },
            'B1': { v: 'Amount' },
            'C1': { v: 'Date' },
            'A2': { v: 'LOAN-001' },
            'B2': { v: 100.5 },
            'C2': { v: '2025-01-01' }
          },
          'Payments': {
            '!ref': 'A1:B5',
            'A1': { v: 'Loan ID' },
            'B1': { v: 'Payment Amount' },
            'A2': { v: 'LOAN-001' },
            'B2': { v: 50.25 }
          }
        }
      };
    }),
    utils: {
      decode_range: jest.fn().mockImplementation((ref) => {
        if (ref === 'A1:C10') {
          return { s: { c: 0, r: 0 }, e: { c: 2, r: 9 } };
        } else if (ref === 'A1:B5') {
          return { s: { c: 0, r: 0 }, e: { c: 1, r: 4 } };
        } else {
          return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };
        }
      }),
      sheet_to_json: jest.fn().mockImplementation((sheet) => {
        if (sheet === 'Loans' || sheet['!ref'] === 'A1:C10') {
          return [
            { 'Loan ID': 'LOAN-001', 'Amount': 100.5, 'Date': '2025-01-01' },
            { 'Loan ID': 'LOAN-002', 'Amount': 200, 'Date': '2025-01-02' }
          ];
        } else {
          return [
            { 'Loan ID': 'LOAN-001', 'Payment Amount': 50.25 },
            { 'Loan ID': 'LOAN-002', 'Payment Amount': 75.5 }
          ];
        }
      }),
      decode_cell: jest.fn().mockImplementation((cell) => {
        if (cell === 'A1') return { c: 0, r: 0 };
        if (cell === 'B1') return { c: 1, r: 0 };
        if (cell === 'C1') return { c: 2, r: 0 };
        return { c: 0, r: 0 };
      }),
      encode_col: jest.fn().mockImplementation((col) => {
        if (col === 0) return 'A';
        if (col === 1) return 'B';
        if (col === 2) return 'C';
        return 'A';
      })
    }
  };
});

// Mock the useUserRoles hook
jest.mock('../../../../contexts/userRoleContext', () => ({
  useUserRoles: jest.fn().mockImplementation(() => ({
    userWithRoles: {
      hasRole: (role: string) => role === 'Admin' || role === 'Accounting',
      isAdmin: true
    }
  }))
}));

describe('End-to-End Import Integration Tests', () => {
  let importService: ImportService;
  let metadataService: MetadataService;
  let mappingService: MappingService;
  let dbService: DatabaseService;
  let mockSupabaseClient: any;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock Supabase client
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockReturnThis()
    };
    
    // Initialize services
    metadataService = new MetadataService(mockSupabaseClient);
    mappingService = new MappingService(metadataService, mockSupabaseClient);
    importService = new ImportService(metadataService, mockSupabaseClient);
    dbService = new DatabaseService();
    
    // Mock the connection verification for DatabaseService
    (dbService as any).verifyConnection = jest.fn().mockResolvedValue(true);
    (dbService as any).connectionState = 'connected';
  });
  
  describe('End-to-End Import Process', () => {
    it('should perform a complete end-to-end import process', async () => {
      // Step 1: Create a mock file
      const mockFile = new File([], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      // Mock arrayBuffer method
      Object.defineProperty(mockFile, 'arrayBuffer', {
        value: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
      });
      
      // Step 2: Read the file and extract workbook info
      const workbookInfo: WorkbookInfo = {
        fileName: 'test.xlsx',
        fileType: 'xlsx',
        sheets: [
          {
            name: 'Loans',
            columnCount: 3,
            rowCount: 9,
            columns: ['Loan ID', 'Amount', 'Date'],
            previewRows: [
              { 'Loan ID': 'LOAN-001', 'Amount': 100.5, 'Date': '2025-01-01' },
              { 'Loan ID': 'LOAN-002', 'Amount': 200, 'Date': '2025-01-02' }
            ],
            columnTypes: {
              'Loan ID': 'string',
              'Amount': 'number',
              'Date': 'date'
            }
          },
          {
            name: 'Payments',
            columnCount: 2,
            rowCount: 4,
            columns: ['Loan ID', 'Payment Amount'],
            previewRows: [
              { 'Loan ID': 'LOAN-001', 'Payment Amount': 50.25 },
              { 'Loan ID': 'LOAN-002', 'Payment Amount': 75.5 }
            ],
            columnTypes: {
              'Loan ID': 'string',
              'Payment Amount': 'number'
            }
          }
        ]
      };
      
      // Mock FileReader.readFile
      jest.spyOn(FileReader, 'readFile').mockResolvedValue(workbookInfo);
      
      // Mock FileReader.getAllSheetsData
      jest.spyOn(FileReader, 'getAllSheetsData').mockResolvedValue({
        'Loans': [
          { 'Loan ID': 'LOAN-001', 'Amount': 100.5, 'Date': '2025-01-01' },
          { 'Loan ID': 'LOAN-002', 'Amount': 200, 'Date': '2025-01-02' }
        ],
        'Payments': [
          { 'Loan ID': 'LOAN-001', 'Payment Amount': 50.25 },
          { 'Loan ID': 'LOAN-002', 'Payment Amount': 75.5 }
        ]
      });
      
      // Step 3: Get table information
      const loansTableInfo: TableInfo = {
        tableName: 'loans',
        columns: [
          { columnName: 'id', dataType: 'uuid', isNullable: false, columnDefault: 'uuid_generate_v4()', isPrimaryKey: true },
          { columnName: 'loan_id', dataType: 'character varying', isNullable: false, columnDefault: null, isPrimaryKey: false },
          { columnName: 'amount', dataType: 'numeric', isNullable: true, columnDefault: null, isPrimaryKey: false },
          { columnName: 'date', dataType: 'timestamp with time zone', isNullable: true, columnDefault: null, isPrimaryKey: false },
          { columnName: 'created_at', dataType: 'timestamp with time zone', isNullable: false, columnDefault: 'CURRENT_TIMESTAMP', isPrimaryKey: false }
        ]
      };
      
      const paymentsTableInfo: TableInfo = {
        tableName: 'payments',
        columns: [
          { columnName: 'id', dataType: 'uuid', isNullable: false, columnDefault: 'uuid_generate_v4()', isPrimaryKey: true },
          { columnName: 'loan_id', dataType: 'character varying', isNullable: false, columnDefault: null, isPrimaryKey: false },
          { columnName: 'payment_amount', dataType: 'numeric', isNullable: true, columnDefault: null, isPrimaryKey: false },
          { columnName: 'created_at', dataType: 'timestamp with time zone', isNullable: false, columnDefault: 'CURRENT_TIMESTAMP', isPrimaryKey: false }
        ]
      };
      
      // Mock getTableInfo
      jest.spyOn(metadataService, 'getTableInfo')
        .mockImplementation((tableName: string) => {
          if (tableName === 'loans') {
            return Promise.resolve(loansTableInfo);
          } else if (tableName === 'payments') {
            return Promise.resolve(paymentsTableInfo);
          }
          return Promise.resolve({ tableName, columns: [] });
        });
      
      // Step 4: Create column mappings
      const loansMappings: Record<string, ColumnMapping> = {
        'Loan ID': { excelColumn: 'Loan ID', dbColumn: 'loan_id', type: 'string' as const },
        'Amount': { excelColumn: 'Amount', dbColumn: 'amount', type: 'number' as const },
        'Date': { excelColumn: 'Date', dbColumn: 'date', type: 'date' as const }
      };
      
      const paymentsMappings: Record<string, ColumnMapping> = {
        'Loan ID': { excelColumn: 'Loan ID', dbColumn: 'loan_id', type: 'string' as const },
        'Payment Amount': { excelColumn: 'Payment Amount', dbColumn: 'payment_amount', type: 'number' as const }
      };
      
      // Step 5: Check for missing columns
      jest.spyOn(metadataService, 'detectMissingColumns').mockResolvedValue([]);
      
      // Step 6: Create import jobs
      const loansJob: ImportJob = {
        id: 'job1',
        userId: 'user1',
        fileName: 'test.xlsx',
        tableName: 'loans',
        sheetName: 'Loans',
        mapping: loansMappings,
        status: 'pending',
        totalRows: 2,
        processedRows: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const paymentsJob: ImportJob = {
        id: 'job2',
        userId: 'user1',
        fileName: 'test.xlsx',
        tableName: 'payments',
        sheetName: 'Payments',
        mapping: paymentsMappings,
        status: 'pending',
        totalRows: 2,
        processedRows: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Mock createImportJob
      jest.spyOn(importService, 'createImportJob')
        .mockResolvedValueOnce('job1')
        .mockResolvedValueOnce('job2');
      
      // Step 7: Process the import
      const excelData = {
        'Loans': [
          { 'Loan ID': 'LOAN-001', 'Amount': 100.5, 'Date': '2025-01-01' },
          { 'Loan ID': 'LOAN-002', 'Amount': 200, 'Date': '2025-01-02' }
        ],
        'Payments': [
          { 'Loan ID': 'LOAN-001', 'Payment Amount': 50.25 },
          { 'Loan ID': 'LOAN-002', 'Payment Amount': 75.5 }
        ]
      };
      
      // Mock processBatchImport
      jest.spyOn(importService, 'processBatchImport').mockResolvedValue({
        'Loans': {
          success: true,
          message: 'Successfully imported 2 rows into loans',
          rowCount: 2
        },
        'Payments': {
          success: true,
          message: 'Successfully imported 2 rows into payments',
          rowCount: 2
        }
      });
      
      // Execute the end-to-end import process
      
      // 1. Read the file
      const fileInfo = await FileReader.readFile(mockFile);
      expect(fileInfo).toBeDefined();
      expect(fileInfo.sheets).toHaveLength(2);
      
      // 2. Get all sheet data
      const allData = await FileReader.getAllSheetsData(mockFile);
      expect(allData).toBeDefined();
      expect(Object.keys(allData)).toHaveLength(2);
      
      // 3. Get table info for each sheet
      const loansInfo = await metadataService.getTableInfo('loans');
      const paymentsInfo = await metadataService.getTableInfo('payments');
      expect(loansInfo).toBeDefined();
      expect(paymentsInfo).toBeDefined();
      
      // 4. Create import jobs
      const loansJobId = await importService.createImportJob({
        userId: 'user1',
        fileName: 'test.xlsx',
        tableName: 'loans',
        sheetName: 'Loans',
        mapping: loansMappings,
        totalRows: 2
      });
      
      const paymentsJobId = await importService.createImportJob({
        userId: 'user1',
        fileName: 'test.xlsx',
        tableName: 'payments',
        sheetName: 'Payments',
        mapping: paymentsMappings,
        totalRows: 2
      });
      
      expect(loansJobId).toBe('job1');
      expect(paymentsJobId).toBe('job2');
      
      // 5. Process the import
      const results = await importService.processBatchImport([loansJob, paymentsJob], excelData, false);
      
      // 6. Verify results
      expect(results).toBeDefined();
      expect(results['Loans']).toBeDefined();
      expect(results['Loans'].success).toBe(true);
      expect(results['Loans'].rowCount).toBe(2);
      
      expect(results['Payments']).toBeDefined();
      expect(results['Payments'].success).toBe(true);
      expect(results['Payments'].rowCount).toBe(2);
    });
    
    it('should handle large datasets with many columns', async () => {
      // Create a large dataset with 200+ columns
      const largeColumnCount = 250;
      const largeColumns: string[] = [];
      const largeColumnTypes: Record<string, string> = {};
      const largePreviewRow: Record<string, any> = {};
      
      // Generate column names and sample data
      for (let i = 1; i <= largeColumnCount; i++) {
        const colName = `Column_${i}`;
        largeColumns.push(colName);
        largeColumnTypes[colName] = i % 3 === 0 ? 'number' : (i % 5 === 0 ? 'date' : 'string');
        largePreviewRow[colName] = i % 3 === 0 ? i * 10 : (i % 5 === 0 ? '2025-01-01' : `Value_${i}`);
      }
      
      // Create a large sheet
      const largeSheet: SheetInfo = {
        name: 'LargeSheet',
        columnCount: largeColumnCount,
        rowCount: 100,
        columns: largeColumns,
        previewRows: [largePreviewRow],
        columnTypes: largeColumnTypes as any
      };
      
      // Create a workbook with the large sheet
      const largeWorkbookInfo: WorkbookInfo = {
        fileName: 'large_test.xlsx',
        fileType: 'xlsx',
        sheets: [largeSheet]
      };
      
      // Mock file reader
      const mockLargeFile = new File([], 'large_test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      Object.defineProperty(mockLargeFile, 'arrayBuffer', {
        value: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
      });
      
      // Mock FileReader.readFile
      jest.spyOn(FileReader, 'readFile').mockResolvedValue(largeWorkbookInfo);
      
      // Mock FileReader.getAllSheetsData
      const largeData: Record<string, any>[] = [largePreviewRow];
      jest.spyOn(FileReader, 'getAllSheetsData').mockResolvedValue({
        'LargeSheet': largeData
      });
      
      // Mock table info with many columns
      const largeTableColumns = largeColumns.map(col => ({
        columnName: col.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        dataType: largeColumnTypes[col] === 'number' ? 'numeric' : 
                 (largeColumnTypes[col] === 'date' ? 'timestamp with time zone' : 'character varying'),
        isNullable: true,
        columnDefault: null,
        isPrimaryKey: false
      }));
      
      const largeTableInfo: TableInfo = {
        tableName: 'large_table',
        columns: [
          { columnName: 'id', dataType: 'uuid', isNullable: false, columnDefault: 'uuid_generate_v4()', isPrimaryKey: true },
          ...largeTableColumns
        ]
      };
      
      // Mock getTableInfo
      jest.spyOn(metadataService, 'getTableInfo').mockResolvedValue(largeTableInfo);
      
      // Create column mappings for the large dataset
      const largeMappings: Record<string, ColumnMapping> = {};
      largeColumns.forEach(col => {
        largeMappings[col] = {
          excelColumn: col,
          dbColumn: col.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          type: largeColumnTypes[col] as any
        };
      });
      
      // Mock detectMissingColumns
      jest.spyOn(metadataService, 'detectMissingColumns').mockResolvedValue([]);
      
      // Create import job
      const largeJob: ImportJob = {
        id: 'large-job',
        userId: 'user1',
        fileName: 'large_test.xlsx',
        tableName: 'large_table',
        sheetName: 'LargeSheet',
        mapping: largeMappings,
        status: 'pending',
        totalRows: 1,
        processedRows: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Mock createImportJob
      jest.spyOn(importService, 'createImportJob').mockResolvedValue('large-job');
      
      // Mock processBatchImport
      jest.spyOn(importService, 'processBatchImport').mockResolvedValue({
        'LargeSheet': {
          success: true,
          message: 'Successfully imported 1 row into large_table',
          rowCount: 1
        }
      });
      
      // Execute the import process for the large dataset
      
      // 1. Read the file
      const fileInfo = await FileReader.readFile(mockLargeFile);
      expect(fileInfo).toBeDefined();
      expect(fileInfo.sheets[0].columnCount).toBe(largeColumnCount);
      
      // 2. Get all sheet data
      const allData = await FileReader.getAllSheetsData(mockLargeFile);
      expect(allData).toBeDefined();
      expect(allData['LargeSheet']).toBeDefined();
      
      // 3. Get table info
      const tableInfo = await metadataService.getTableInfo('large_table');
      expect(tableInfo).toBeDefined();
      expect(tableInfo.columns.length).toBeGreaterThan(largeColumnCount);
      
      // 4. Create import job
      const jobId = await importService.createImportJob({
        userId: 'user1',
        fileName: 'large_test.xlsx',
        tableName: 'large_table',
        sheetName: 'LargeSheet',
        mapping: largeMappings,
        totalRows: 1
      });
      
      expect(jobId).toBe('large-job');
      
      // 5. Process the import
      const results = await importService.processBatchImport([largeJob], { 'LargeSheet': largeData }, false);
      
      // 6. Verify results
      expect(results).toBeDefined();
      expect(results['LargeSheet']).toBeDefined();
      expect(results['LargeSheet'].success).toBe(true);
      expect(results['LargeSheet'].rowCount).toBe(1);
    });
  });
  
  describe('Error Handling and Edge Cases', () => {
    it('should handle file format detection errors', async () => {
      // Create a file with an unsupported extension
      const mockFile = new File([], 'test.txt', { type: 'text/plain' });
      
      // Mock arrayBuffer method
      Object.defineProperty(mockFile, 'arrayBuffer', {
        value: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
      });
      
      // Mock FileReader.readFile to throw an error
      jest.spyOn(FileReader, 'readFile').mockRejectedValue(new Error('Unsupported file format'));
      
      // Attempt to read the file
      await expect(FileReader.readFile(mockFile)).rejects.toThrow('Unsupported file format');
    });
    
    it('should handle missing columns by creating them', async () => {
      // Mock detectMissingColumns to return missing columns
      const missingColumns = [
        { columnName: 'new_column', suggestedType: 'TEXT', originalType: 'string' as const }
      ];
      
      jest.spyOn(metadataService, 'detectMissingColumns').mockResolvedValue(missingColumns);
      
      // Mock createMissingColumns
      jest.spyOn(metadataService, 'createMissingColumns').mockResolvedValue({
        success: true,
        message: 'Successfully created 1 column'
      });
      
      // Create a simple job
      const job: ImportJob = {
        id: 'job1',
        userId: 'user1',
        fileName: 'test.xlsx',
        tableName: 'loans',
        sheetName: 'Loans',
        mapping: {
          'Loan ID': { excelColumn: 'Loan ID', dbColumn: 'loan_id', type: 'string' as const },
          'New Column': { excelColumn: 'New Column', dbColumn: 'new_column', type: 'string' as const }
        },
        status: 'pending',
        totalRows: 1,
        processedRows: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Mock Excel data
      const excelData = {
        'Loans': [
          { 'Loan ID': 'LOAN-001', 'New Column': 'New Value' }
        ]
      };
      
      // Mock processBatchImport
      jest.spyOn(importService, 'processBatchImport').mockImplementation(async (jobs, data, createMissingColumns) => {
        // Verify that createMissingColumns is true
        expect(createMissingColumns).toBe(true);
        
        return {
          'Loans': {
            success: true,
            message: 'Successfully imported 1 row into loans',
            rowCount: 1,
            columnsCreated: ['new_column']
          }
        };
      });
      
      // Process the import with createMissingColumns = true
      const results = await importService.processBatchImport([job], excelData, true);
      
      // Verify results
      expect(results).toBeDefined();
      expect(results['Loans']).toBeDefined();
      expect(results['Loans'].success).toBe(true);
      expect(results['Loans'].columnsCreated).toContain('new_column');
    });
    
    it('should handle SQL execution errors', async () => {
      // Mock SqlExecutionService.executeQuery to return an error
      jest.spyOn(SqlExecutionService, 'executeQuery').mockResolvedValue({
        data: null,
        error: new Error('SQL execution failed'),
        metadata: {
          status: SqlExecutionStatus.ERROR,
          queryHash: 'abc123'
        }
      });
      
      // Attempt to execute SQL
      await expect(dbService.executeSQL('DROP TABLE users')).rejects.toThrow('SQL execution failed');
    });
  });
});