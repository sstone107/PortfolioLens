import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { program } from 'commander';

// Load environment variables
dotenv.config();

// Parse command line arguments
program
  .option('-f, --file <path>', 'Path to Excel file')
  .option('-t, --table <name>', 'Table name to import into')
  .option('-s, --sheet <name>', 'Specific sheet to import (optional)')
  .option('-m, --map <path>', 'JSON mapping file for column transformations (optional)')
  .option('-b, --batch <size>', 'Batch size for inserts', '100')
  .option('-d, --dryrun', 'Dry run, don\'t insert data', false)
  .parse(process.argv);

const options = program.opts();

// Validate required options
if (!options.file) {
  console.error('Error: Excel file path is required');
  process.exit(1);
}

if (!options.table && !options.map) {
  console.error('Error: Either table name or mapping file is required');
  process.exit(1);
}

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Clean column names for database compatibility
 */
function sanitizeColumnName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/^[0-9]/, 'col_$&')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Convert Excel cell value to appropriate JavaScript type
 */
function convertCellValue(value, type) {
  if (value === undefined || value === null) {
    return null;
  }

  switch (type) {
    case 'number':
      return typeof value === 'number' ? value : Number(value) || null;
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        if (['true', 'yes', 'y', '1'].includes(lower)) return true;
        if (['false', 'no', 'n', '0'].includes(lower)) return false;
      }
      return Boolean(value);
    case 'date':
      if (value instanceof Date) return value;
      try {
        // Handle Excel date numbers
        if (typeof value === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          const msPerDay = 24 * 60 * 60 * 1000;
          return new Date(excelEpoch.getTime() + value * msPerDay);
        }
        return new Date(value);
      } catch (e) {
        console.warn(\`Could not convert "\${value}" to date\`);
        return null;
      }
    case 'string':
    default:
      return String(value);
  }
}

/**
 * Process an Excel sheet and prepare data for insertion
 */
function processSheet(sheet, mapping = null) {
  // Convert sheet to JSON
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
  if (rows.length === 0) {
    console.warn('Sheet is empty or has no headers');
    return [];
  }

  // Get column names from first row
  const firstRow = rows[0];
  const columnNames = Object.keys(firstRow);

  // Create mapping if not provided
  if (!mapping) {
    mapping = {};
    for (const col of columnNames) {
      const sanitized = sanitizeColumnName(col);
      mapping[col] = {
        dbColumn: sanitized,
        type: typeof firstRow[col] === 'number' ? 'number' : 'string'
      };
    }
  }

  // Transform data
  return rows.map(row => {
    const transformed = {};
    
    // Process each column according to mapping
    for (const [excelCol, config] of Object.entries(mapping)) {
      if (row[excelCol] !== undefined) {
        transformed[config.dbColumn] = convertCellValue(row[excelCol], config.type);
      }
    }
    
    // Add metadata
    transformed.created_at = new Date();
    transformed.updated_at = new Date();
    
    return transformed;
  });
}

/**
 * Load a mapping file if provided
 */
function loadMapping(mapPath) {
  try {
    const content = fs.readFileSync(mapPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading mapping file:', error);
    process.exit(1);
  }
}

/**
 * Main function to import Excel data
 */
async function importExcelData() {
  console.log(\`Processing Excel file: \${options.file}\`);
  
  try {
    // Load mapping if provided
    const mapping = options.map ? loadMapping(options.map) : null;
    
    // Read Excel file
    const workbook = xlsx.readFile(options.file);
    
    // Determine which sheets to process
    const sheetsToProcess = options.sheet 
      ? [options.sheet]
      : workbook.SheetNames;
    
    // Process each sheet
    for (const sheetName of sheetsToProcess) {
      if (!workbook.Sheets[sheetName]) {
        console.warn(\`Sheet "\${sheetName}" not found in workbook, skipping\`);
        continue;
      }
      
      console.log(\`Processing sheet: \${sheetName}\`);
      
      // Determine target table name
      const tableName = mapping?.tableName || options.table || sanitizeColumnName(sheetName);
      
      // Process sheet data
      const worksheet = workbook.Sheets[sheetName];
      const data = processSheet(worksheet, mapping?.columns);
      
      if (data.length === 0) {
        console.warn(\`No data to import from sheet "\${sheetName}"\`);
        continue;
      }
      
      console.log(\`Processed \${data.length} rows from "\${sheetName}"\`);
      
      // Skip actual insertion in dry run mode
      if (options.dryrun) {
        console.log(\`[DRY RUN] Would insert \${data.length} rows into "\${tableName}"\`);
        console.log('Sample row:', JSON.stringify(data[0], null, 2));
        continue;
      }
      
      // Insert data in batches
      const batchSize = parseInt(options.batch, 10);
      let inserted = 0;
      
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        console.log(\`Inserting batch \${Math.floor(i / batchSize) + 1}/\${Math.ceil(data.length / batchSize)}\`);
        
        const { error } = await supabase
          .from(tableName)
          .insert(batch);
        
        if (error) {
          console.error(\`Error inserting batch into \${tableName}:\`, error);
          if (i === 0) {
            // Show sample data for debugging on first error
            console.log('Sample row:', JSON.stringify(batch[0], null, 2));
            console.log('Available columns should match your database schema');
          }
        } else {
          inserted += batch.length;
          console.log(\`Successfully inserted batch, total: \${inserted}/\${data.length} rows\`);
        }
      }
      
      console.log(\`Completed import for sheet "\${sheetName}" into table "\${tableName}"\`);
    }
    
    console.log('Import process completed');
    
  } catch (error) {
    console.error('Error importing data:', error);
    process.exit(1);
  }
}

// Run the import
importExcelData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
