import { read, utils, WorkBook, WorkSheet } from 'xlsx';
import { SheetInfo, WorkbookInfo, ColumnType, FileType } from './types';

/**
 * Service for reading and analyzing Excel and CSV files in the browser
 */
export class FileReader {
  /**
   * Read a file (Excel or CSV) and extract basic information
   * @param file - File object from file input
   * @param previewRowCount - Number of rows to extract for preview
   * @returns Promise with workbook info
   */
  static async readFile(file: File, previewRowCount = 5): Promise<WorkbookInfo> {
    try {
      // Detect file type
      const fileType = this.detectFileType(file);
      
      // Read file as array buffer
      const buffer = await file.arrayBuffer();
      
      // Parse workbook with appropriate options based on file type
      const options = fileType === 'csv' ?
        { type: 'array' as const, raw: true } :
        { type: 'array' as const };
      const workbook = read(buffer, options);
      
      // Extract info for each sheet
      const sheets: SheetInfo[] = workbook.SheetNames
        .map(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          return this.extractSheetInfo(worksheet, sheetName, previewRowCount);
        });
      
      return {
        fileName: file.name,
        fileType,
        sheets
      };
    } catch (error) {
      console.error('[FileReader] Error reading file:', error);
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Detect the type of file based on extension and content
   * @param file - File object to analyze
   * @returns Detected file type
   */
  static detectFileType(file: File): FileType {
    const fileName = file.name.toLowerCase();
    
    // Check by extension first
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xlsm')) {
      return 'xlsx';
    } else if (fileName.endsWith('.xls')) {
      return 'xls';
    } else if (fileName.endsWith('.csv')) {
      return 'csv';
    } else if (fileName.endsWith('.tsv') || fileName.endsWith('.txt')) {
      return 'tsv';
    }
    
    // Default to xlsx if we can't determine
    return 'xlsx';
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
    
    // Extract preview rows
    const previewRows = jsonData.slice(0, previewRowCount);
    // Removed call to this.inferColumnTypes
    
    return {
      name: sheetName,
      columnCount,
      rowCount,
      columns,
      previewRows,
      // Removed columnTypes property
    };
  }
  
  /**
   * Get data from all sheets in the workbook
   * @param file - File object
   * @returns Promise with map of sheet names to data arrays
   */
  static async getAllSheetsData(file: File): Promise<Record<string, Record<string, any>[]>> {
    try {
      // Read file
      const buffer = await file.arrayBuffer();
      const fileType = this.detectFileType(file);
      const options = fileType === 'csv' ?
        { type: 'array' as const, raw: true } :
        { type: 'array' as const };
      const workbook = read(buffer, options);
      
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
      console.error('[FileReader] Error extracting all sheets data:', error);
      throw new Error(`Failed to extract sheets data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get data from a specific sheet
   * @param file - File object
   * @param sheetName - Name of the sheet to extract
   * @returns Promise with array of row objects
   */
  static async getSheetData(file: File, sheetName: string): Promise<Record<string, any>[]> {
    try {
      // Read file
      const buffer = await file.arrayBuffer();
      const fileType = this.detectFileType(file);
      const options = fileType === 'csv' ?
        { type: 'array' as const, raw: true } :
        { type: 'array' as const };
      const workbook = read(buffer, options);
      
      // Check if sheet exists
      if (!workbook.SheetNames.includes(sheetName)) {
        throw new Error(`Sheet "${sheetName}" not found in workbook`);
      }
      
      // Get worksheet and convert to JSON
      const worksheet = workbook.Sheets[sheetName];
      const data = utils.sheet_to_json<Record<string, any>>(worksheet, {
        defval: null,
        raw: true
      });
      
      return data;
    } catch (error) {
      console.error('[FileReader] Error extracting sheet data:', error);
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