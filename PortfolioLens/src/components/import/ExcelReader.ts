/**
 * Excel file reading and parsing utilities
 */

import * as XLSX from 'xlsx';
import { SheetMapping } from '../../store/batchImportStore';
import { inferColumnType } from './dataTypeInference';
import { normalizeForDb, normalizeTableName } from './utils/stringUtils';
import { v4 as uuidv4 } from 'uuid';

// Maximum number of rows to preview/sample
const MAX_PREVIEW_ROWS = 20;
// Default number of sample rows to use for type inference
const DEFAULT_SAMPLE_ROWS = 10;

/**
 * Options for reading Excel files
 */
export interface ExcelReadOptions {
  headerRow?: number;
  maxRows?: number;
  sampleRows?: number;
  tablePrefixOptions?: {
    usePrefix: boolean;
    prefix: string;
  };
}

/**
 * Read Excel file and extract sheet data, headers, and perform initial mapping
 */
export const readExcelFile = async (
  file: ArrayBuffer,
  options: ExcelReadOptions = {}
): Promise<SheetMapping[]> => {
  const {
    headerRow = 0,
    maxRows = MAX_PREVIEW_ROWS,
    sampleRows = DEFAULT_SAMPLE_ROWS,
    tablePrefixOptions = { usePrefix: false, prefix: '' }
  } = options;
  
  // Parse workbook
  const workbook = XLSX.read(file, { type: 'array' });
  const result: SheetMapping[] = [];
  
  // Process each sheet
  workbook.SheetNames.forEach(sheetName => {
    try {
      const sheet = workbook.Sheets[sheetName];
      
      // Convert sheet data to array of arrays (with header row)
      const jsonData = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        blankrows: false,
        range: headerRow
      }) as unknown[][];
      
      // Need at least one row of data
      if (jsonData.length === 0 || !jsonData[0]) {
        result.push({
          id: uuidv4(),
          originalName: sheetName,
          mappedName: normalizeTableName(sheetName),
          headerRow,
          skip: true, // Skip empty sheets
          approved: false,
          needsReview: true,
          columns: [],
          status: 'failed',
          error: 'Empty sheet',
          firstRows: [],
          rowCount: 0 // Empty sheet has 0 data rows
        });
        return;
      }
      
      // Get header row and data rows
      const headers = jsonData[0] as unknown[];
      
      // Get sample data rows for type inference
      const sampleData = jsonData.slice(1, Math.min(sampleRows + 1, jsonData.length));
      
      // Preview data (limited rows for display)
      const previewData = jsonData.slice(1, Math.min(maxRows + 1, jsonData.length));
      
      // Process columns
      const columns = headers.map((header, index) => {
        // Get sample values for this column
        const samples = sampleData.map(row => row[index]);
        
        // Convert header to string
        const headerStr = header ? String(header) : `Column_${index + 1}`;
        
        // Infer type from header and samples
        const typeInference = inferColumnType(headerStr, samples);
        
        return {
          originalName: headerStr,
          mappedName: normalizeForDb(headerStr),
          dataType: typeInference.type,
          confidence: typeInference.confidence,
          skip: false,
          originalIndex: index,
          sample: samples.slice(0, 5) // Just keep a few samples for reference
        };
      });
      
      // Generate mapped table name (with optional prefix)
      let mappedName = normalizeTableName(sheetName);
      if (tablePrefixOptions.usePrefix && tablePrefixOptions.prefix) {
        mappedName = `${tablePrefixOptions.prefix}${mappedName}`;
      }
      
      // Add sheet to result with rowCount property
      result.push({
        id: uuidv4(),
        originalName: sheetName,
        mappedName,
        headerRow,
        skip: false,
        approved: false,
        needsReview: true,
        columns,
        status: 'pending',
        firstRows: previewData,
        rowCount: jsonData.length - 1 // Exclude header row
      });
    } catch (error) {
      console.error(`Error processing sheet ${sheetName}:`, error);
      
      // Add error sheet to result with rowCount property
      result.push({
        id: uuidv4(),
        originalName: sheetName,
        mappedName: normalizeTableName(sheetName),
        headerRow,
        skip: true,
        approved: false,
        needsReview: true,
        columns: [],
        status: 'failed',
        error: `Failed to process sheet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        firstRows: [],
        rowCount: 0 // No rows for error sheets
      });
    }
  });
  
  return result;
};

/**
 * Check if a file is an Excel file based on extension
 */
export const isExcelFile = (fileName: string): boolean => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext === 'xlsx' || ext === 'xls' || ext === 'xlsm';
};

/**
 * Check if a file is a CSV file based on extension
 */
export const isCsvFile = (fileName: string): boolean => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext === 'csv';
};

/**
 * Get Excel file metadata (sheet names, etc.)
 */
export const getExcelMetadata = (file: ArrayBuffer): {
  sheetNames: string[];
  sheetCount: number;
} => {
  const workbook = XLSX.read(file, { type: 'array', bookSheets: true });
  
  return {
    sheetNames: workbook.SheetNames,
    sheetCount: workbook.SheetNames.length
  };
};