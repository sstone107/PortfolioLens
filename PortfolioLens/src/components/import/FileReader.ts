/**
 * Generic file reading utilities to handle Excel and CSV files
 */

import { readExcelFile, isExcelFile, isCsvFile, ExcelReadOptions } from './ExcelReader';
import { SheetMapping } from '../../store/batchImportStore';

// CSV reading options
interface CsvReadOptions extends ExcelReadOptions {
  delimiter?: string;
  hasHeader?: boolean;
}

/**
 * Read a file based on its type
 */
export const readFile = async (
  file: File,
  options: ExcelReadOptions | CsvReadOptions = {}
): Promise<{
  sheets: SheetMapping[];
  fileName: string;
  fileType: 'excel' | 'csv' | 'unknown';
  fileSize: number;
}> => {
  try {
    // Read file as ArrayBuffer
    const buffer = await file.arrayBuffer();
    
    // Check file type
    if (isExcelFile(file.name)) {
      // Handle Excel file
      const sheets = await readExcelFile(buffer, options);
      return {
        sheets,
        fileName: file.name,
        fileType: 'excel',
        fileSize: file.size
      };
    } else if (isCsvFile(file.name)) {
      // Convert CSV to Excel-like format
      const sheets = await handleCsvFile(buffer, file.name, options as CsvReadOptions);
      return {
        sheets,
        fileName: file.name,
        fileType: 'csv',
        fileSize: file.size
      };
    } else {
      throw new Error('Unsupported file type. Please upload an Excel (.xlsx, .xls) or CSV file.');
    }
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
};

/**
 * Handle CSV file by converting it to Excel-like format (one sheet)
 */
const handleCsvFile = async (
  buffer: ArrayBuffer,
  fileName: string,
  options: CsvReadOptions = {}
): Promise<SheetMapping[]> => {
  // Get CSV content as text
  const text = new TextDecoder().decode(buffer);
  
  // Detect delimiter if not provided
  const delimiter = options.delimiter || detectCsvDelimiter(text);
  
  // For CSV, we create a temporary sheet name from the file name
  const sheetName = fileName.split('.')[0];
  
  // Convert CSV to a workbook with one sheet
  const XLSX = await import('xlsx');
  
  // Parse CSV to worksheet
  const worksheet = XLSX.utils.csv_to_sheet(text, { 
    delimiter,
    blankrows: false
  });
  
  // Create workbook with the worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  // Convert to array buffer
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  
  // Read as Excel file
  return readExcelFile(wbout, options);
};

/**
 * Detect CSV delimiter by analyzing the file content
 */
const detectCsvDelimiter = (csvText: string): string => {
  // Look at the first few lines
  const firstLines = csvText.split(/\\r?\\n/).slice(0, 5).join('\\n');
  
  const delimiters = [',', ';', '\\t', '|'];
  let mostFrequent = ',';
  let maxCount = 0;
  
  delimiters.forEach(delimiter => {
    const count = (firstLines.match(new RegExp(delimiter, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      mostFrequent = delimiter;
    }
  });
  
  return mostFrequent;
};