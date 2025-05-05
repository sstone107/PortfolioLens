import { ImportService, ImportResult } from '../ImportService';
import { MetadataService } from '../MetadataService';
import { ImportJob, ColumnMapping } from '../../types';

// Mock dependencies
jest.mock('../MetadataService');
jest.mock('@supabase/supabase-js');

describe('ImportService', () => {
  let importService: ImportService;
  let mockMetadataService: jest.Mocked<MetadataService>;
  let mockSupabaseClient: any;
  
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Mock Supabase client with required methods
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockReturnThis()
    };
    
    // Create mock MetadataService
    mockMetadataService = new MetadataService() as jest.Mocked<MetadataService>;
    
    // Initialize ImportService with mocks
    importService = new ImportService(mockMetadataService, mockSupabaseClient);
  });
  
  describe('processBatchImport', () => {
    it('should successfully process batch import with valid data', async () => {
      // Mock data
      const jobs: ImportJob[] = [
        {
          id: 'test-job-1',
          userId: 'user-123',
          fileName: 'test.xlsx',
          tableName: 'loans',
          sheetName: 'Sheet1',
          mapping: {
            'Loan ID': {
              excelColumn: 'Loan ID',
              dbColumn: 'loan_id',
              type: 'string'
            }
          },
          status: 'pending',
          totalRows: 10,
          processedRows: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      
      const excelData = {
        'Sheet1': [
          { 'Loan ID': 'LOAN-001' },
          { 'Loan ID': 'LOAN-002' }
        ]
      };
      
      // Mock MetadataService
      mockMetadataService.detectMissingColumns = jest.fn().mockResolvedValue([]);
      
      // Mock successful database insert
      mockSupabaseClient.from.mockReturnThis();
      mockSupabaseClient.insert.mockReturnValue({ error: null });
      
      // Execute the method
      const results = await importService.processBatchImport(jobs, excelData, false);
      
      // Verify results
      expect(results).toBeDefined();
      expect(results['Sheet1']).toBeDefined();
      expect(results['Sheet1'].success).toBe(true);
      expect(results['Sheet1'].rowCount).toBe(2);
      
      // Verify that data was inserted
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('loans');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });
    
    it('should handle missing sheet data', async () => {
      // Mock data with missing sheet
      const jobs: ImportJob[] = [
        {
          id: 'test-job-1',
          userId: 'user-123',
          fileName: 'test.xlsx',
          tableName: 'loans',
          sheetName: 'MissingSheet',
          mapping: {},
          status: 'pending',
          totalRows: 10,
          processedRows: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      
      const excelData = {
        'Sheet1': [] // MissingSheet is not in data
      };
      
      // Execute the method
      const results = await importService.processBatchImport(jobs, excelData, false);
      
      // Verify results
      expect(results).toBeDefined();
      expect(results['MissingSheet']).toBeDefined();
      expect(results['MissingSheet'].success).toBe(false);
      expect(results['MissingSheet'].message).toContain('Sheet data not found');
      expect(results['MissingSheet'].rowCount).toBe(0);
    });
    
    it('should create missing columns when requested', async () => {
      // Mock data
      const jobs: ImportJob[] = [
        {
          id: 'test-job-1',
          userId: 'user-123',
          fileName: 'test.xlsx',
          tableName: 'loans',
          sheetName: 'Sheet1',
          mapping: {
            'NewColumn': {
              excelColumn: 'NewColumn',
              dbColumn: 'new_column',
              type: 'string'
            }
          },
          status: 'pending',
          totalRows: 10,
          processedRows: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      
      const excelData = {
        'Sheet1': [
          { 'NewColumn': 'Value1' }
        ]
      };
      
      // Mock missing columns detection
      const missingColumns = [
        { columnName: 'new_column', suggestedType: 'TEXT', originalType: 'string' }
      ];
      mockMetadataService.detectMissingColumns = jest.fn().mockResolvedValue(missingColumns);
      
      // Mock successful column creation
      mockMetadataService.createMissingColumns = jest.fn().mockResolvedValue({
        success: true,
        message: 'Created columns'
      });
      
      // Mock successful database insert
      mockSupabaseClient.from.mockReturnThis();
      mockSupabaseClient.insert.mockReturnValue({ error: null });
      
      // Execute the method
      const results = await importService.processBatchImport(jobs, excelData, true);
      
      // Verify results
      expect(results).toBeDefined();
      expect(results['Sheet1']).toBeDefined();
      expect(results['Sheet1'].success).toBe(true);
      expect(results['Sheet1'].columnsCreated).toEqual(['new_column']);
      
      // Verify that missing columns were created
      expect(mockMetadataService.detectMissingColumns).toHaveBeenCalledWith('loans', jobs[0].mapping);
      expect(mockMetadataService.createMissingColumns).toHaveBeenCalledWith('loans', missingColumns);
      
      // Verify that data was inserted
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('loans');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });
  });
  
  describe('createImportJob', () => {
    it('should create an import job in the database', async () => {
      // Mock job data
      const jobData = {
        userId: 'user-123',
        fileName: 'test.xlsx',
        tableName: 'loans',
        sheetName: 'Sheet1',
        mapping: {},
        totalRows: 10
      };
      
      // Mock successful database insert
      mockSupabaseClient.from.mockReturnThis();
      mockSupabaseClient.insert.mockReturnThis();
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValue({
        data: { id: 'new-job-id' },
        error: null
      });
      
      // Execute the method
      const jobId = await importService.createImportJob(jobData);
      
      // Verify result
      expect(jobId).toBe('new-job-id');
      
      // Verify that job was created
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('import_jobs');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('id');
    });
    
    it('should throw an error when job creation fails', async () => {
      // Mock job data
      const jobData = {
        userId: 'user-123',
        fileName: 'test.xlsx',
        tableName: 'loans',
        sheetName: 'Sheet1',
        mapping: {},
        totalRows: 10
      };
      
      // Mock failed database insert
      mockSupabaseClient.from.mockReturnThis();
      mockSupabaseClient.insert.mockReturnThis();
      mockSupabaseClient.select.mockReturnThis();
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });
      
      // Execute the method and expect error
      await expect(importService.createImportJob(jobData)).rejects.toThrow('Failed to create import job');
    });
  });
});
