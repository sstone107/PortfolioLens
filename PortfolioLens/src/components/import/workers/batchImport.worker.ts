/**
 * Web Worker for batch import processing
 * Handles file reading, data mapping, and background processing
 */

// Define worker context
const ctx: Worker = self as any;

// Import libraries using dynamic import (for worker)
const loadDependencies = async () => {
  const XLSX = await import('xlsx');
  return { XLSX };
};

// Message event handlers
ctx.addEventListener('message', async (event) => {
  const { action, payload } = event.data;
  
  try {
    switch (action) {
      case 'read_excel_file':
        await handleReadExcelFile(payload);
        break;
        
      case 'process_mapping':
        await handleProcessMapping(payload);
        break;
        
      case 'batch_import':
        await handleBatchImport(payload);
        break;
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Handle excel file reading in the worker
 */
async function handleReadExcelFile(payload: { file: ArrayBuffer; options: any }) {
  const { file, options } = payload;
  const { XLSX } = await loadDependencies();
  
  // Update progress
  ctx.postMessage({
    type: 'progress',
    stage: 'reading',
    message: 'Reading Excel file...',
    percent: 10
  });
  
  // Read workbook
  const workbook = XLSX.read(file, { type: 'array' });
  
  // Get sheet count for progress tracking
  const sheetCount = workbook.SheetNames.length;
  let processedSheets = 0;
  
  // Process each sheet
  const sheets = [];
  
  for (const sheetName of workbook.SheetNames) {
    // Update progress
    ctx.postMessage({
      type: 'progress',
      stage: 'analyzing',
      message: `Analyzing sheet: ${sheetName}`,
      sheet: sheetName,
      percent: 10 + Math.round((processedSheets / sheetCount) * 40)
    });
    
    try {
      const sheet = workbook.Sheets[sheetName];
      
      // Extract sheet data
      const jsonData = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        blankrows: false,
        range: options.headerRow || 0
      });
      
      // Process sheet data (simplified - full implementation in ExcelReader.ts)
      const headers = jsonData[0] || [];
      const sampleData = jsonData.slice(1, Math.min(10, jsonData.length));
      
      // Just get basic info in the worker
      sheets.push({
        name: sheetName,
        rowCount: jsonData.length - 1, // Exclude header
        columnCount: headers.length,
        headers,
        sampleData: sampleData.slice(0, 5) // Limit sample data
      });
      
      // Update processed count
      processedSheets++;
      
    } catch (error) {
      console.error(`Error processing sheet ${sheetName}:`, error);
      sheets.push({
        name: sheetName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  // Send result back to main thread
  ctx.postMessage({
    type: 'result',
    sheets,
    sheetCount
  });
}

/**
 * Handle mapping processing in the worker
 */
async function handleProcessMapping(payload: { 
  sheets: any[]; 
  mappingRules: any;
  headerRow: number;
}) {
  const { sheets, mappingRules, headerRow } = payload;
  
  // Update progress
  ctx.postMessage({
    type: 'progress',
    stage: 'mapping',
    message: 'Applying mapping rules...',
    percent: 20
  });
  
  // Process mapping for each sheet (simplified)
  const mappedSheets = [];
  let processedCount = 0;
  
  for (const sheet of sheets) {
    // Update progress for each sheet
    ctx.postMessage({
      type: 'progress',
      stage: 'mapping',
      message: `Mapping sheet: ${sheet.name}`,
      sheet: sheet.name,
      percent: 20 + Math.round((processedCount / sheets.length) * 60)
    });
    
    // Apply mapping rules (simplification - actual logic in separate modules)
    const mappedSheet = {
      ...sheet,
      mapped: true,
      // Apply mapping rules would happen here
    };
    
    mappedSheets.push(mappedSheet);
    processedCount++;
  }
  
  // Delay response slightly to show progress
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Send result back to main thread
  ctx.postMessage({
    type: 'mapping_result',
    mappedSheets
  });
}

/**
 * Handle batch import processing in the worker
 */
async function handleBatchImport(payload: {
  file: ArrayBuffer;
  sheets: any[];
  headerRow: number;
}) {
  const { file, sheets, headerRow } = payload;
  const { XLSX } = await loadDependencies();
  
  // Read workbook
  const workbook = XLSX.read(file, { type: 'array' });
  
  // Track import results
  const results = {
    successSheets: [],
    failedSheets: [],
    totalRows: 0,
    importedRows: 0,
    errors: []
  };
  
  // Process each sheet
  let processedSheets = 0;
  
  for (const sheetConfig of sheets) {
    // Skip sheets marked for skipping
    if (sheetConfig.skip) {
      processedSheets++;
      continue;
    }
    
    const sheetName = sheetConfig.originalName;
    const mappedName = sheetConfig.mappedName;
    
    // Update progress
    ctx.postMessage({
      type: 'progress',
      stage: 'importing',
      message: `Importing data from ${sheetName} to ${mappedName}`,
      sheet: sheetName,
      table: mappedName,
      percent: 20 + Math.round((processedSheets / sheets.length) * 80)
    });
    
    try {
      // Get sheet data
      const sheet = workbook.Sheets[sheetName];
      
      // Extract sheet data
      const jsonData = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        blankrows: false,
        range: headerRow
      });
      
      // Update totals
      results.totalRows += jsonData.length - 1; // Exclude header
      
      // Simulate successful import
      results.importedRows += jsonData.length - 1;
      results.successSheets.push(sheetName);
      
    } catch (error) {
      console.error(`Error importing sheet ${sheetName}:`, error);
      results.failedSheets.push(sheetName);
      results.errors.push({
        sheet: sheetName,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    processedSheets++;
  }
  
  // Complete import
  ctx.postMessage({
    type: 'import_complete',
    results
  });
}