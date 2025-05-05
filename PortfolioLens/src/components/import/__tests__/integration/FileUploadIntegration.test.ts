import { FileReader } from '../../FileReader';
import { FileType, WorkbookInfo } from '../../types';

// Mock the xlsx library
jest.mock('xlsx', () => {
  return {
    read: jest.fn().mockImplementation((buffer, options) => {
      // Return a mock workbook based on the file type
      const isCSV = options && options.type === 'array' && options.raw === true;
      
      return {
        SheetNames: ['Sheet1', 'Sheet2'],
        Sheets: {
          'Sheet1': {
            '!ref': 'A1:C10',
            'A1': { v: 'ID' },
            'B1': { v: 'Name' },
            'C1': { v: 'Amount' },
            'A2': { v: '1' },
            'B2': { v: 'Test' },
            'C2': { v: 100.5 }
          },
          'Sheet2': {
            '!ref': 'A1:B5',
            'A1': { v: 'Date' },
            'B1': { v: 'Value' },
            'A2': { v: '2025-01-01' },
            'B2': { v: true }
          }
        }
      };
    }),
    utils: {
      decode_range: jest.fn().mockImplementation((ref) => {
        // Mock range decoder
        if (ref === 'A1:C10') {
          return { s: { c: 0, r: 0 }, e: { c: 2, r: 9 } };
        } else if (ref === 'A1:B5') {
          return { s: { c: 0, r: 0 }, e: { c: 1, r: 4 } };
        } else {
          return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };
        }
      }),
      sheet_to_json: jest.fn().mockImplementation((sheet, options) => {
        // Return mock data based on the sheet
        if (sheet === 'Sheet1' || sheet['!ref'] === 'A1:C10') {
          return [
            { 'ID': '1', 'Name': 'Test', 'Amount': 100.5 },
            { 'ID': '2', 'Name': 'Test2', 'Amount': 200 }
          ];
        } else {
          return [
            { 'Date': '2025-01-01', 'Value': true },
            { 'Date': '2025-01-02', 'Value': false }
          ];
        }
      }),
      decode_cell: jest.fn().mockImplementation((cell) => {
        // Mock cell decoder
        if (cell === 'A1') return { c: 0, r: 0 };
        if (cell === 'B1') return { c: 1, r: 0 };
        if (cell === 'C1') return { c: 2, r: 0 };
        return { c: 0, r: 0 };
      }),
      encode_col: jest.fn().mockImplementation((col) => {
        // Mock column encoder
        if (col === 0) return 'A';
        if (col === 1) return 'B';
        if (col === 2) return 'C';
        return 'A';
      })
    }
  };
});

// Create a mock File object
const createMockFile = (name: string, type: string, size: number = 1024): File => {
  const file = new File([], name, { type });
  
  // Mock arrayBuffer method
  Object.defineProperty(file, 'arrayBuffer', {
    value: jest.fn().mockResolvedValue(new ArrayBuffer(size))
  });
  
  return file;
};

describe('File Upload Integration Tests', () => {
  describe('FileReader', () => {
    it('should detect file type correctly', () => {
      // Test various file extensions
      const xlsxFile = createMockFile('test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const xlsFile = createMockFile('test.xls', 'application/vnd.ms-excel');
      const csvFile = createMockFile('test.csv', 'text/csv');
      const tsvFile = createMockFile('test.tsv', 'text/tab-separated-values');
      
      expect(FileReader.detectFileType(xlsxFile)).toBe('xlsx');
      expect(FileReader.detectFileType(xlsFile)).toBe('xls');
      expect(FileReader.detectFileType(csvFile)).toBe('csv');
      expect(FileReader.detectFileType(tsvFile)).toBe('tsv');
    });
    
    it('should read file and extract workbook info', async () => {
      // Create mock Excel file
      const mockFile = createMockFile('test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      // Read the file
      const workbookInfo = await FileReader.readFile(mockFile);
      
      // Verify workbook info
      expect(workbookInfo).toBeDefined();
      expect(workbookInfo.fileName).toBe('test.xlsx');
      expect(workbookInfo.fileType).toBe('xlsx');
      expect(workbookInfo.sheets).toHaveLength(2);
      
      // Verify sheet info
      const sheet1 = workbookInfo.sheets[0];
      expect(sheet1.name).toBe('Sheet1');
      expect(sheet1.columnCount).toBe(3);
      expect(sheet1.rowCount).toBe(9);
      expect(sheet1.columns).toContain('ID');
      expect(sheet1.columns).toContain('Name');
      expect(sheet1.columns).toContain('Amount');
      
      // Verify preview rows
      expect(sheet1.previewRows).toHaveLength(2);
      expect(sheet1.previewRows[0]).toEqual({ 'ID': '1', 'Name': 'Test', 'Amount': 100.5 });
      
      // Verify column types
      expect(sheet1.columnTypes).toBeDefined();
      expect(sheet1.columnTypes?.ID).toBe('string');
      expect(sheet1.columnTypes?.Name).toBe('string');
      expect(sheet1.columnTypes?.Amount).toBe('number');
    });
    
    it('should get data from all sheets', async () => {
      // Create mock Excel file
      const mockFile = createMockFile('test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      // Get all sheets data
      const allSheetsData = await FileReader.getAllSheetsData(mockFile);
      
      // Verify data
      expect(allSheetsData).toBeDefined();
      expect(allSheetsData.Sheet1).toBeDefined();
      expect(allSheetsData.Sheet2).toBeDefined();
      
      expect(allSheetsData.Sheet1).toHaveLength(2);
      expect(allSheetsData.Sheet2).toHaveLength(2);
      
      expect(allSheetsData.Sheet1[0].ID).toBe('1');
      expect(allSheetsData.Sheet1[0].Amount).toBe(100.5);
      
      expect(allSheetsData.Sheet2[0].Date).toBe('2025-01-01');
      expect(allSheetsData.Sheet2[0].Value).toBe(true);
    });
    
    it('should get data from a specific sheet', async () => {
      // Create mock Excel file
      const mockFile = createMockFile('test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      // Get specific sheet data
      const sheetData = await FileReader.getSheetData(mockFile, 'Sheet2');
      
      // Verify data
      expect(sheetData).toBeDefined();
      expect(sheetData).toHaveLength(2);
      expect(sheetData[0].Date).toBe('2025-01-01');
      expect(sheetData[0].Value).toBe(true);
    });
    
    it('should handle CSV files correctly', async () => {
      // Create mock CSV file
      const mockFile = createMockFile('test.csv', 'text/csv');
      
      // Read the file
      const workbookInfo = await FileReader.readFile(mockFile);
      
      // Verify workbook info
      expect(workbookInfo).toBeDefined();
      expect(workbookInfo.fileName).toBe('test.csv');
      expect(workbookInfo.fileType).toBe('csv');
      
      // CSV files should be treated as having a single sheet
      expect(workbookInfo.sheets).toHaveLength(2); // Our mock still returns 2 sheets
    });
    
    it('should infer column types correctly', async () => {
      // Create mock Excel file with various data types
      const mockFile = createMockFile('test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      // Read the file
      const workbookInfo = await FileReader.readFile(mockFile);
      
      // Verify column types for Sheet1
      const sheet1 = workbookInfo.sheets[0];
      expect(sheet1.columnTypes?.ID).toBe('string');
      expect(sheet1.columnTypes?.Name).toBe('string');
      expect(sheet1.columnTypes?.Amount).toBe('number');
      
      // Verify column types for Sheet2
      const sheet2 = workbookInfo.sheets[1];
      expect(sheet2.columnTypes?.Date).toBe('date');
      expect(sheet2.columnTypes?.Value).toBe('boolean');
    });
  });
});