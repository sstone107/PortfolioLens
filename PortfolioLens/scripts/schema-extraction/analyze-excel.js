import xlsx from 'xlsx';
const { readFile } = xlsx;
import path from 'path';
import fs from 'fs';

// Excel file paths
const remittanceReportPath = path.resolve('C:/Users/sston/Documents/temp/sample/greenway_2025-03-31_vc_daily_remittance_report.xlsx');
const billingReportPath = path.resolve('C:/Users/sston/Documents/temp/sample/greenway_mortgage_funding_corporation_billing_report_02-2025.xlsx');

// Output directory for the analysis results
const outputDir = path.resolve('./scripts/schema-extraction/output');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Analyzes an Excel sheet and generates potential schema information
 * @param {object} worksheet - The XLSX worksheet
 * @param {string} sheetName - Name of the worksheet
 * @returns {object} Schema analysis
 */
function analyzeSheet(worksheet, sheetName) {
  console.log(`Analyzing sheet: ${sheetName}`);
  
  // Get worksheet range
  const range = worksheet['!ref'];
  if (!range) {
    return { error: 'Empty sheet' };
  }
  
  // Extract column headers (assuming first row contains headers)
  const headers = [];
  const dataTypes = {}; // Will hold detected data types for each column
  const sampleValues = {}; // Will hold sample values for each column
  
  // Parse the sheet headers
  const decoder = new TextDecoder('utf-8');
  for (const cellAddress in worksheet) {
    if (cellAddress[0] === '!') continue; // Skip special properties
    
    // Check if the cell is in the first row
    if (cellAddress.match(/^[A-Z]+1$/)) {
      const cell = worksheet[cellAddress];
      
      if (cell && cell.v !== undefined) {
        const headerName = cell.v.toString().trim();
        if (headerName) {
          headers.push({
            address: cellAddress,
            name: headerName,
            column: cellAddress.replace('1', '')
          });
          
          // Initialize data type arrays and sample values
          dataTypes[headerName] = [];
          sampleValues[headerName] = [];
        }
      }
    }
  }
  
  // Analyze data types and collect samples (check up to 100 rows)
  const maxRows = 100;
  for (let row = 2; row <= maxRows + 1; row++) {
    let rowHasData = false;
    
    headers.forEach(header => {
      const cellAddress = `${header.column}${row}`;
      if (worksheet[cellAddress]) {
        rowHasData = true;
        const cell = worksheet[cellAddress];
        const value = cell.v;
        
        // Detect data type
        const type = cell.t || (typeof value);
        dataTypes[header.name].push(type);
        
        // Store sample value if we have fewer than 5 samples
        if (sampleValues[header.name].length < 5 && value !== undefined) {
          sampleValues[header.name].push(value);
        }
      }
    });
    
    // If we've hit an empty row and already have some data, we can stop
    if (!rowHasData && row > 5) {
      break;
    }
  }
  
  // Determine most common data type for each column
  const inferredSchema = headers.map(header => {
    const types = dataTypes[header.name];
    
    // Count occurrences of each type
    const typeCounts = types.reduce((counts, type) => {
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {});
    
    // Find the most common type
    let mostCommonType = 'string'; // Default
    let maxCount = 0;
    
    for (const type in typeCounts) {
      if (typeCounts[type] > maxCount) {
        maxCount = typeCounts[type];
        mostCommonType = type;
      }
    }
    
    // Handle specific type conversions for SQL
    let sqlType = 'TEXT';
    switch(mostCommonType) {
      case 'n':
        // Check if it's likely an integer or decimal
        const hasDecimals = sampleValues[header.name].some(val => 
          val !== null && typeof val === 'number' && !Number.isInteger(val)
        );
        sqlType = hasDecimals ? 'DECIMAL(18,6)' : 'INTEGER';
        break;
      case 'd':
        sqlType = 'TIMESTAMP';
        break;
      case 'b':
        sqlType = 'BOOLEAN';
        break;
      case 's':
      default:
        // Estimate string length
        const maxLength = Math.max(
          ...sampleValues[header.name]
            .filter(val => val !== null)
            .map(val => val.toString().length)
        );
        
        if (maxLength <= 0) {
          sqlType = 'TEXT';
        } else if (maxLength <= 50) {
          sqlType = `VARCHAR(${Math.min(255, maxLength * 2)})`;
        } else if (maxLength <= 255) {
          sqlType = `VARCHAR(255)`;
        } else {
          sqlType = 'TEXT';
        }
    }
    
    return {
      columnName: header.name,
      inferredSqlType: sqlType,
      originalExcelType: mostCommonType,
      sampleValues: sampleValues[header.name]
    };
  });
  
  return {
    sheetName,
    rowCount: worksheet['!ref'].split(':')[1].replace(/[A-Z]/g, ''),
    columnCount: headers.length,
    inferredSchema,
    suggestedTableName: sanitizeTableName(sheetName)
  };
}

/**
 * Converts a sheet name to a valid SQL table name
 */
function sanitizeTableName(sheetName) {
  return sheetName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_') // Replace non-alphanumeric with underscore
    .replace(/^[0-9]/, 'tbl_$&') // Ensure doesn't start with number
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Trim leading/trailing underscores
}

/**
 * Generate SQL DDL statement for a table based on schema analysis
 */
function generateSqlDdl(schemaAnalysis) {
  const { suggestedTableName, inferredSchema } = schemaAnalysis;
  
  // Create column definitions
  const columnDefinitions = inferredSchema.map(column => {
    const sanitizedName = column.columnName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/^[0-9]/, 'col_$&')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
      
    return `    "${sanitizedName}" ${column.inferredSqlType}`;
  }).join(',\n');
  
  // Generate the complete CREATE TABLE statement
  return `-- Table generated from Excel sheet: ${schemaAnalysis.sheetName}
CREATE TABLE IF NOT EXISTS "${suggestedTableName}" (
    "id" SERIAL PRIMARY KEY,
${columnDefinitions},
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add an example comment to the table
COMMENT ON TABLE "${suggestedTableName}" IS 'Generated from Excel sheet: ${schemaAnalysis.sheetName}';
`;
}

/**
 * Process an Excel file and analyze all its sheets
 */
async function processExcelFile(filePath, outputPrefix) {
  console.log(`Processing file: ${filePath}`);
  
  try {
    // Read the Excel file
    const workbook = readFile(filePath);
    
    // Process each sheet
    const results = {};
    const sqlStatements = [];
    
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const analysis = analyzeSheet(worksheet, sheetName);
      results[sheetName] = analysis;
      
      // Generate SQL DDL
      const sql = generateSqlDdl(analysis);
      sqlStatements.push(sql);
    }
    
    // Write the analysis to a JSON file
    const analysisOutput = path.join(outputDir, `${outputPrefix}_analysis.json`);
    fs.writeFileSync(
      analysisOutput, 
      JSON.stringify(results, null, 2)
    );
    console.log(`Analysis written to: ${analysisOutput}`);
    
    // Write the SQL DDL to a file
    const sqlOutput = path.join(outputDir, `${outputPrefix}_schema.sql`);
    fs.writeFileSync(
      sqlOutput,
      sqlStatements.join('\n\n')
    );
    console.log(`SQL DDL written to: ${sqlOutput}`);
    
    return results;
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return { error: error.message };
  }
}

// Main execution
async function main() {
  console.log('Starting Excel schema analysis...');
  
  // Process both files
  await processExcelFile(remittanceReportPath, 'remittance_report');
  await processExcelFile(billingReportPath, 'billing_report');
  
  console.log('Analysis complete!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
