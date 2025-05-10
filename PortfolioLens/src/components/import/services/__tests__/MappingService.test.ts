import { MappingService } from '../MappingService';
import { MetadataService } from '../MetadataService';
import { ColumnMapping, TableInfo } from '../../types';

// Mock dependencies
jest.mock('@supabase/supabase-js');
jest.mock('../../../../utility/supabaseMcp', () => ({
  executeSql: jest.fn().mockImplementation((query) => {
    // Mock different responses based on the query
    if (query.includes('SELECT * FROM import_mappings')) {
      return {
        data: [
          {
            id: 'mapping-1',
            table_name: 'loans',
            mapping_json: JSON.stringify({
              'Loan ID': { excelColumn: 'Loan ID', dbColumn: 'loan_id', type: 'string' }
            }),
            created_at: new Date().toISOString()
          }
        ]
      };
    } else if (query.includes('INSERT INTO import_mappings')) {
      return {
        data: [{ id: 'new-mapping-id' }]
      };
    } else if (query.includes('SELECT * FROM servicers')) {
      return {
        data: [
          { id: 'servicer-1', name: 'Acme Servicing' },
          { id: 'servicer-2', name: 'Beta Servicing' }
        ]
      };
    }
    return { data: [] };
  }),
  applyMigration: jest.fn().mockResolvedValue({ success: true })
}));

describe('MappingService', () => {
  let mappingService: MappingService;
  let metadataService: MetadataService;
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
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis()
    };
    
    // Create mock SchemaCacheService
    const mockSchemaCacheService: any = {
      getOrFetchSchema: jest.fn().mockResolvedValue({ 
        tables: { 'loans': {}, 'payments': {} }, 
        lastRefreshed: Date.now() 
      }),
      setMetadataService: jest.fn(),
      forceRefreshSchema: jest.fn().mockResolvedValue(undefined),
      getTableList: jest.fn().mockResolvedValue(['loans', 'payments'])
    };
    
    // Initialize services
    metadataService = new MetadataService(mockSchemaCacheService);
    metadataService.getCachedTableNames = jest.fn().mockResolvedValue(['loans', 'payments']);
    mappingService = new MappingService(metadataService, mockSupabaseClient);
  });
  
  describe('getMappings', () => {
    it('should fetch mappings for a table', async () => {
      // Execute the method
      const mappings = await mappingService.getMappings('loans');
      
      // Verify results
      expect(mappings).toBeDefined();
      expect(mappings.length).toBeGreaterThan(0);
      expect(mappings[0].table_name).toBe('loans');
    });
    
    it('should handle errors and return empty array', async () => {
      // Mock executeSql to throw an error
      jest.requireMock('../../../../utility/supabaseMcp').executeSql.mockImplementationOnce(() => {
        throw new Error('Database error');
      });
      
      // Mock Supabase client to also fail
      mockSupabaseClient.from.mockImplementationOnce(() => {
        throw new Error('Supabase error');
      });
      
      // Execute the method
      const mappings = await mappingService.getMappings('loans');
      
      // Verify results (should return empty array)
      expect(mappings).toBeDefined();
      expect(mappings).toEqual([]);
    });
  });
  
  describe('saveMapping', () => {
    it('should save a mapping for a table', async () => {
      // Define mapping to save
      const mapping: Record<string, ColumnMapping> = {
        'Loan ID': { excelColumn: 'Loan ID', dbColumn: 'loan_id', type: 'string', required: true },
        'Amount': { excelColumn: 'Amount', dbColumn: 'amount', type: 'number' }
      };
      
      // Execute the method
      const mappingId = await mappingService.saveMapping(
        'Test Mapping',
        'loans',
        mapping
      );
      
      // Verify result
      expect(mappingId).toBe('new-mapping-id');
    });
    
    it('should handle errors during mapping saving', async () => {
      // Mock executeSql to throw an error
      jest.requireMock('../../../../utility/supabaseMcp').executeSql.mockImplementationOnce(() => {
        throw new Error('Database error');
      });
      
      // Mock Supabase client to also fail
      mockSupabaseClient.from.mockImplementationOnce(() => {
        throw new Error('Supabase error');
      });
      
      // Define mapping to save
      const mapping: Record<string, ColumnMapping> = {
        'Loan ID': { excelColumn: 'Loan ID', dbColumn: 'loan_id', type: 'string' }
      };
      
      // Execute the method and expect error
      await expect(mappingService.saveMapping('Test', 'loans', mapping))
        .rejects.toThrow('Failed to save mapping');
    });
  });
  
  describe('suggestColumnMappings', () => {
    it('should generate column mapping suggestions', () => {
      // Define mock Excel data
      const sheetData = [
        { 'Loan ID': 'LOAN-001', 'Amount': 100.5, 'Date': '2025-01-01', 'Status': 'Active' },
        { 'Loan ID': 'LOAN-002', 'Amount': 200, 'Date': '2025-01-02', 'Status': 'Pending' }
      ];
      
      // Define mock table info
      const tableInfo: TableInfo = {
        tableName: 'loans',
        columns: [
          { columnName: 'id', dataType: 'uuid', isNullable: false, columnDefault: 'uuid_generate_v4()', isPrimaryKey: true },
          { columnName: 'loan_id', dataType: 'character varying', isNullable: false, columnDefault: null, isPrimaryKey: false },
          { columnName: 'amount', dataType: 'numeric', isNullable: true, columnDefault: null, isPrimaryKey: false },
          { columnName: 'date', dataType: 'timestamp with time zone', isNullable: true, columnDefault: null, isPrimaryKey: false },
          { columnName: 'created_at', dataType: 'timestamp with time zone', isNullable: false, columnDefault: 'CURRENT_TIMESTAMP', isPrimaryKey: false }
        ]
      };
      
      // Execute the method
      const suggestions = mappingService.suggestColumnMappings(sheetData, tableInfo);
      
      // Verify suggestions structure
      expect(suggestions).toBeDefined();
      
      // Check Loan ID suggestions
      expect(suggestions['Loan ID']).toBeDefined();
      expect(suggestions['Loan ID'].sourceColumn).toBe('Loan ID');
      expect(suggestions['Loan ID'].suggestions).toBeDefined();
      expect(suggestions['Loan ID'].suggestions.length).toBeGreaterThan(0);
      
      // Find the best suggestion for Loan ID
      const loanIdBestSuggestion = suggestions['Loan ID'].suggestions[0];
      expect(loanIdBestSuggestion.dbColumn).toBe('loan_id');
      expect(loanIdBestSuggestion.confidenceScore).toBeGreaterThan(0.8);
      
      // Check Amount suggestions
      expect(suggestions['Amount']).toBeDefined();
      expect(suggestions['Amount'].sourceColumn).toBe('Amount');
      expect(suggestions['Amount'].suggestions).toBeDefined();
      expect(suggestions['Amount'].suggestions.length).toBeGreaterThan(0);
      
      // Check Date suggestions
      expect(suggestions['Date']).toBeDefined();
      expect(suggestions['Date'].sourceColumn).toBe('Date');
      expect(suggestions['Date'].suggestions).toBeDefined();
      expect(suggestions['Date'].suggestions.length).toBeGreaterThan(0);
      
      // Check Status column (which has no direct match)
      expect(suggestions['Status']).toBeDefined();
      expect(suggestions['Status'].sourceColumn).toBe('Status');
      expect(suggestions['Status'].suggestions).toBeDefined();
      expect(suggestions['Status'].suggestions.length).toBeGreaterThan(0);
      
      // Verify that one of the suggestions for Status is to create a new field
      const createNewFieldSuggestion = suggestions['Status'].suggestions.find(s => s.isCreateNewField);
      expect(createNewFieldSuggestion).toBeDefined();
      expect(createNewFieldSuggestion?.isCreateNewField).toBe(true);
    });
    
    it('should handle case/spacing differences in column names', () => {
      // Define mock Excel data with column names that differ by case and spacing
      const sheetData = [
        { 'Loan Id': 'LOAN-001', 'Loan Amount': 100.5, 'Origination Date': '2025-01-01' },
        { 'Loan Id': 'LOAN-002', 'Loan Amount': 200, 'Origination Date': '2025-01-02' }
      ];
      
      // Define mock table info
      const tableInfo: TableInfo = {
        tableName: 'loans',
        columns: [
          { columnName: 'loan_id', dataType: 'character varying', isNullable: false, columnDefault: null, isPrimaryKey: false },
          { columnName: 'loan_amount', dataType: 'numeric', isNullable: true, columnDefault: null, isPrimaryKey: false },
          { columnName: 'origination_date', dataType: 'timestamp with time zone', isNullable: true, columnDefault: null, isPrimaryKey: false }
        ]
      };
      
      // Execute the method
      const suggestions = mappingService.suggestColumnMappings(sheetData, tableInfo);
      
      // Verify suggestions
      expect(suggestions['Loan Id']).toBeDefined();
      expect(suggestions['Loan Id'].suggestions[0].dbColumn).toBe('loan_id');
      expect(suggestions['Loan Id'].suggestions[0].confidenceScore).toBeGreaterThan(0.8);
      
      expect(suggestions['Loan Amount']).toBeDefined();
      expect(suggestions['Loan Amount'].suggestions[0].dbColumn).toBe('loan_amount');
      expect(suggestions['Loan Amount'].suggestions[0].confidenceScore).toBeGreaterThan(0.8);
      
      expect(suggestions['Origination Date']).toBeDefined();
      expect(suggestions['Origination Date'].suggestions[0].dbColumn).toBe('origination_date');
      expect(suggestions['Origination Date'].suggestions[0].confidenceScore).toBeGreaterThan(0.8);
    });
    
    it('should handle empty data', () => {
      // Empty data
      const emptySheet: any[] = [];
      
      // Table info
      const tableInfo: TableInfo = {
        tableName: 'loans',
        columns: [
          { columnName: 'loan_id', dataType: 'character varying', isNullable: false, columnDefault: null, isPrimaryKey: false }
        ]
      };
      
      // Execute the method
      const suggestions = mappingService.suggestColumnMappings(emptySheet, tableInfo);
      
      // Verify results
      expect(suggestions).toBeDefined();
      expect(Object.keys(suggestions).length).toBe(0);
    });
  });
  
  describe('getSuggestedTableMappings', () => {
    it('should suggest table mappings for sheet names', async () => {
      // Define sheet names
      const sheetNames = ['Loans', 'Payments', 'Unknown'];
      
      // Execute the method
      const suggestions = await mappingService.getSuggestedTableMappings(sheetNames);
      
      // Verify results
      expect(suggestions).toBeDefined();
      expect(suggestions.length).toBe(3);
      
      // Check mappings
      suggestions.forEach(suggestion => {
        expect(suggestion.sheetName).toBeDefined();
        
        // For exact matches, verify high confidence score
        if (suggestion.matchType === 'exact') {
          expect(suggestion.confidenceScore).toBe(1.0);
        } 
        // For 'none' matches, verify low confidence score
        else if (suggestion.matchType === 'none') {
          expect(suggestion.confidenceScore).toBe(0);
          expect(suggestion.tableName).toBe('');
        }
      });
    });
    
    it('should handle errors and return fallback mappings', async () => {
      // Mock getCachedTableNames to throw an error
      metadataService.getCachedTableNames = jest.fn().mockRejectedValueOnce(new Error('Failed to get tables'));
      
      // Define sheet names
      const sheetNames = ['Loans', 'Payments'];
      
      // Execute the method
      const suggestions = await mappingService.getSuggestedTableMappings(sheetNames);
      
      // Verify results
      expect(suggestions).toBeDefined();
      expect(suggestions.length).toBe(0); // Empty array because of error
    });
  });
});