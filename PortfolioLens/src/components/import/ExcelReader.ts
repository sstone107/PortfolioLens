import { read, utils, WorkBook, WorkSheet } from 'xlsx';
import { SheetInfo, WorkbookInfo, ColumnType } from './types';

/**
 * Service for reading and analyzing Excel files in the browser
 */
export class ExcelReader {
  /**
   * Read an Excel file and extract basic information
   * @param file - File object from file input
   * @param previewRowCount - Number of rows to extract for preview
   * @returns Promise with workbook info
   */
  static async readFile(file: File, previewRowCount = 5): Promise<WorkbookInfo> {

    
    try {
      // Read file as array buffer
      const buffer = await file.arrayBuffer();
      
      // Parse workbook
      const workbook = read(buffer, { type: 'array' });
      
      // Extract info for each sheet
      const sheets: SheetInfo[] = workbook.SheetNames.map(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        return this.extractSheetInfo(worksheet, sheetName, previewRowCount);
      });
      

      
      return {
        fileName: file.name,
        sheets
      };
    } catch (error) {
      console.error('[ExcelReader] Error reading Excel file:', error);
      throw new Error(`Failed to read Excel file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Extract information about a worksheet
   * @param worksheet - XLSX worksheet
   * @param sheetName - Name of the sheet
   * @param previewRowCount - Number of rows to include in preview
   * @returns Sheet information
   */
  private static extractSheetInfo(
    worksheet: WorkSheet, 
    sheetName: string, 
    previewRowCount: number
  ): SheetInfo {
    // Get dimensions from the worksheet reference range
    const range = utils.decode_range(worksheet['!ref'] || 'A1:A1');
    const rowCount = range.e.r;
    const columnCount = range.e.c - range.s.c + 1; // Calculate actual column count from range
    
    // Convert sheet to JSON with headers from first row
    const jsonData = utils.sheet_to_json<Record<string, any>>(worksheet, {
      defval: null, // Use null for empty cells
      raw: true     // Keep raw values for better type detection
    });
    
    // Extract all column headers from the sheet
    let columns: string[] = [];
    
    // Try to get headers from the first json object
    if (jsonData.length > 0) {
      columns = Object.keys(jsonData[0]);
    }
    
    // If we still don't have columns or have fewer than expected, get them directly from the worksheet
    if (columns.length < columnCount) {
      // This is a more thorough way to extract all column headers
      columns = [];
      const headers = new Set<string>();
      
      // Iterate through cell references to find all possible headers
      Object.keys(worksheet).forEach(cell => {
        if (cell[0] !== '!') { // Ignore special properties starting with '!'
          const cellRef = utils.decode_cell(cell);
          if (cellRef.r === 0) { // Header row (row 0)
            // Get the column letter
            const colLetter = utils.encode_col(cellRef.c);
            // Get the column header (either from the cell or using the column letter)
            const headerValue = worksheet[cell]?.v || colLetter;
            headers.add(String(headerValue));
          }
        }
      });
      
      columns = Array.from(headers);
    }
    
    // Extract preview rows and infer column types
    const previewRows = jsonData.slice(0, previewRowCount);
    const columnTypes = this.inferColumnTypes(columns, jsonData);
    
    return {
      name: sheetName,
      columnCount,
      rowCount,
      columns,
      previewRows,
      columnTypes
    };
  }
  
  /**
   * Infer the data types of columns based on their content
   * @param columns - Column names
   * @param data - Sheet data as JSON
   * @returns Map of column names to their inferred types
   */
  private static inferColumnTypes(columns: string[], data: Record<string, any>[]): Record<string, ColumnType> {
    const columnTypes: Record<string, ColumnType> = {};
    
    // No data to infer from
    if (data.length === 0) {
      columns.forEach(col => {
        columnTypes[col] = 'string';
      });
      return columnTypes;
    }
    
    // For each column, analyze values from multiple rows to determine the most appropriate type
    columns.forEach(column => {
      // Get a sample of values from this column (up to 20 rows)
      const sampleValues = data.slice(0, 20).map(row => row[column]);
      const nonNullValues = sampleValues.filter(val => val !== null && val !== undefined && val !== '');
      
      // Default to string if no values to analyze
      if (nonNullValues.length === 0) {
        columnTypes[column] = 'string';
        return;
      }
      
      // Count type occurrences
      let numberCount = 0;
      let booleanCount = 0;
      let dateCount = 0;
      
      for (const value of nonNullValues) {
        // Check if value is a number
        if (typeof value === 'number' || (!isNaN(Number(value)) && value !== '')) {
          numberCount++;
        } 
        // Check if value is a boolean
        else if (
          typeof value === 'boolean' || 
          ['true', 'false', 'yes', 'no', 'y', 'n', '1', '0'].includes(String(value).toLowerCase())
        ) {
          booleanCount++;
        }
        // Check if value could be a date
        else if (
          // Excel date serial numbers
          (typeof value === 'number' && value > 35000 && value < 50000) ||
          // ISO date strings or common date formats
          (typeof value === 'string' && 
           (
             /^\d{4}-\d{2}-\d{2}/.test(value) || // ISO or YYYY-MM-DD
             /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(value) || // MM/DD/YYYY or DD/MM/YYYY
             /^[a-z]{3,} \d{1,2},? \d{2,4}/i.test(value) // Month DD, YYYY
           )
          )
        ) {
          dateCount++;
        }
      }
      
      // Calculate percentages
      const totalValues = nonNullValues.length;
      const numberPercent = numberCount / totalValues;
      const booleanPercent = booleanCount / totalValues;
      const datePercent = dateCount / totalValues;
      
      // Determine type based on highest percentage (with thresholds)
      if (booleanPercent > 0.8) {
        columnTypes[column] = 'boolean';
      } else if (datePercent > 0.7) {
        columnTypes[column] = 'date';
      } else if (numberPercent > 0.7) {
        columnTypes[column] = 'number';
      } else {
        columnTypes[column] = 'string';
      }
    });
    
    return columnTypes;
  }
  
  /**
   * Get full data from a specific sheet
   * @param file - Excel file 
   * @param sheetName - Name of the sheet to extract
   * @returns Promise with array of row objects
   */
  /**
   * Get data from all sheets in the workbook
   * @param file - Excel file
   * @returns Promise with map of sheet names to data arrays
   */
  static async getAllSheetsData(file: File): Promise<Record<string, Record<string, any>[]>> {
    try {
      // Read file
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: 'array' });
      
      // Process all sheets
      const result: Record<string, Record<string, any>[]> = {};
      
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        result[sheetName] = utils.sheet_to_json<Record<string, any>>(worksheet, {
          defval: null,
          raw: true
        });
      }
      
      return result;
    } catch (error) {
      console.error('[ExcelReader] Error extracting all sheets data:', error);
      throw new Error(`Failed to extract sheets data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  static async getSheetData(file: File, sheetName: string): Promise<Record<string, any>[]> {
    try {
      // Read file
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: 'array' });
      
      // Check if sheet exists
      if (!workbook.SheetNames.includes(sheetName)) {
        throw new Error(`Sheet "${sheetName}" not found in workbook`);
      }
      
      // Get worksheet and convert to JSON
      const worksheet = workbook.Sheets[sheetName];
      const data = utils.sheet_to_json<Record<string, any>>(worksheet);
      
      return data;
    } catch (error) {
      console.error('[ExcelReader] Error extracting sheet data:', error);
      throw new Error(`Failed to extract sheet data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Convert Excel date serial number to JavaScript Date
   * @param excelDate - Excel date serial number
   * @returns JavaScript Date object
   */
  static excelDateToJsDate(excelDate: number): Date {
    // Excel epoch is December 30, 1899
    const epoch = new Date(1899, 11, 30);
    const msPerDay = 24 * 60 * 60 * 1000;
    
    // Add days to epoch
    return new Date(epoch.getTime() + excelDate * msPerDay);
  }
}
