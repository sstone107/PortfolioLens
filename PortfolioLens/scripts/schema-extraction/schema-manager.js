import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

// Configuration (could be moved to .env file)
const CONFIG = {
  excelFiles: [
    {
      path: 'C:/Users/sston/Documents/temp/sample/greenway_2025-03-31_vc_daily_remittance_report.xlsx',
      type: 'remittance'
    },
    {
      path: 'C:/Users/sston/Documents/temp/sample/greenway_mortgage_funding_corporation_billing_report_02-2025.xlsx',
      type: 'billing'
    }
  ],
  outputDir: './scripts/schema-extraction/output',
  migrationsDir: './src/db/migrations',
  typesOutputDir: './src/types/schema',
  // Set these to your actual Supabase credentials
  supabase: {
    url: process.env.SUPABASE_URL || 'your-supabase-url',
    key: process.env.SUPABASE_SERVICE_KEY || 'your-service-key'
  }
};

// Ensure directories exist
[CONFIG.outputDir, CONFIG.migrationsDir, CONFIG.typesOutputDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Analyze an Excel file and extract schema information
 */
function analyzeExcelFile(filePath) {
  console.log(`Analyzing Excel file: ${filePath}`);
  const workbook = xlsx.readFile(filePath);
  
  const results = {};
  
  for (const sheetName of workbook.SheetNames) {
    console.log(`Processing sheet: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    
    // Get the range of the worksheet
    const range = worksheet['!ref'];
    if (!range) {
      continue; // Skip empty sheets
    }
    
    // Extract headers (assuming first row contains headers)
    const headers = [];
    const dataTypes = {};
    const sampleValues = {};
    
    // Get headers from first row
    for (const cellAddress in worksheet) {
      if (cellAddress[0] === '!') continue;
      
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
            
            dataTypes[headerName] = [];
            sampleValues[headerName] = [];
          }
        }
      }
    }
    
    // Analyze data in first 100 rows to determine types
    const maxRows = 100;
    for (let row = 2; row <= maxRows + 1; row++) {
      let rowHasData = false;
      
      headers.forEach(header => {
        const cellAddress = `${header.column}${row}`;
        if (worksheet[cellAddress]) {
          rowHasData = true;
          const cell = worksheet[cellAddress];
          const value = cell.v;
          
          // Detect type
          const type = cell.t || (typeof value);
          dataTypes[header.name].push(type);
          
          // Store sample (up to 5 per column)
          if (sampleValues[header.name].length < 5 && value !== undefined) {
            sampleValues[header.name].push(value);
          }
        }
      });
      
      if (!rowHasData && row > 5) break;
    }
    
    // Determine column types and generate schema
    const inferredSchema = headers.map(header => {
      const types = dataTypes[header.name];
      
      // Count occurrences of each type
      const typeCounts = types.reduce((counts, type) => {
        counts[type] = (counts[type] || 0) + 1;
        return counts;
      }, {});
      
      // Find most common type
      let mostCommonType = 'string';
      let maxCount = 0;
      
      for (const type in typeCounts) {
        if (typeCounts[type] > maxCount) {
          maxCount = typeCounts[type];
          mostCommonType = type;
        }
      }
      
      // Map Excel types to SQL/TypeScript types
      let sqlType = 'TEXT';
      let tsType = 'string';
      
      switch(mostCommonType) {
        case 'n': // number
          const hasDecimals = sampleValues[header.name].some(val => 
            val !== null && typeof val === 'number' && !Number.isInteger(val)
          );
          sqlType = hasDecimals ? 'DECIMAL(18,6)' : 'INTEGER';
          tsType = hasDecimals ? 'number' : 'number';
          break;
        case 'd': // date
          sqlType = 'TIMESTAMP';
          tsType = 'Date';
          break;
        case 'b': // boolean
          sqlType = 'BOOLEAN';
          tsType = 'boolean';
          break;
        case 's': // string
        default:
          // Estimate appropriate string length
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
          tsType = 'string';
      }
      
      return {
        columnName: header.name,
        inferredSqlType: sqlType,
        typescriptType: tsType,
        originalExcelType: mostCommonType,
        sampleValues: sampleValues[header.name]
      };
    });
    
    results[sheetName] = {
      sheetName,
      rowCount: worksheet['!ref'].split(':')[1].replace(/[A-Z]/g, ''),
      columnCount: headers.length,
      inferredSchema,
      suggestedTableName: sanitizeTableName(sheetName)
    };
  }
  
  return results;
}

/**
 * Sanitize a name for use as a table name
 */
function sanitizeTableName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/^[0-9]/, 'tbl_$&')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Sanitize a name for use as a column name
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
 * Generate SQL DDL script for creating database tables
 */
function generateSqlSchema(analysisResults) {
  let sql = `-- PortfolioLens Database Schema
-- Generated from Excel analysis on ${new Date().toISOString().split('T')[0]}

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

`;

  // Process each sheet/table
  for (const sheetName in analysisResults) {
    const analysis = analysisResults[sheetName];
    const tableName = analysis.suggestedTableName;
    
    sql += `-- Table for ${sheetName} data
CREATE TABLE IF NOT EXISTS "${tableName}" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
`;

    // Add columns
    analysis.inferredSchema.forEach(column => {
      const columnName = sanitizeColumnName(column.columnName);
      sql += `    "${columnName}" ${column.inferredSqlType},\n`;
    });

    // Add timestamps
    sql += `    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add index on common lookup columns
CREATE INDEX IF NOT EXISTS "idx_${tableName}_created_at" ON "${tableName}" ("created_at");

`;
  }

  // Add function for updating the updated_at timestamp
  sql += `
-- Function to update the updated_at column
CREATE OR REPLACE FUNCTION update_modified_column() 
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('CREATE TRIGGER set_updated_at
                        BEFORE UPDATE ON %I
                        FOR EACH ROW
                        EXECUTE FUNCTION update_modified_column()', t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
`;

  return sql;
}

/**
 * Generate TypeScript interfaces for the database schema
 */
function generateTypeScriptInterfaces(analysisResults) {
  let ts = `// PortfolioLens Database Schema TypeScript Interfaces
// Generated from Excel analysis on ${new Date().toISOString().split('T')[0]}

`;

  // Process each table/sheet
  for (const sheetName in analysisResults) {
    const analysis = analysisResults[sheetName];
    const interfaceName = analysis.suggestedTableName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    
    ts += `export interface ${interfaceName} {
  id: string; // UUID
`;

    // Add properties
    analysis.inferredSchema.forEach(column => {
      const propertyName = sanitizeColumnName(column.columnName);
      ts += `  ${propertyName}: ${column.typescriptType};\n`;
    });

    // Add timestamps
    ts += `  created_at: Date;
  updated_at: Date;
}

`;
  }

  return ts;
}

/**
 * Create a data loader script for importing Excel data to the database
 */
function generateDataLoaderScript(analysisResults, fileType) {
  const scriptName = `load-${fileType}-data.js`;
  
  let script = `import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

// Supabase connection
const supabaseUrl = process.env.SUPABASE_URL || 'your-supabase-url';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'your-service-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// Excel file to import
const excelFile = '${CONFIG.excelFiles.find(f => f.type === fileType).path}';

async function loadData() {
  console.log(\`Loading data from \${excelFile}\`);
  
  try {
    // Read the Excel file
    const workbook = xlsx.readFile(excelFile);
    
`;

  // Add sheet processing code for each sheet
  for (const sheetName in analysisResults) {
    const analysis = analysisResults[sheetName];
    const tableName = analysis.suggestedTableName;
    
    script += `    // Process ${sheetName} sheet
    console.log(\`Processing ${sheetName} sheet...\`);
    const ${tableName}Sheet = workbook.Sheets['${sheetName}'];
    if (${tableName}Sheet) {
      const ${tableName}Data = xlsx.utils.sheet_to_json(${tableName}Sheet);
      
      // Transform data to match database schema
      const transformed${tableName}Data = ${tableName}Data.map(row => ({
`;

    // Map Excel columns to database columns
    analysis.inferredSchema.forEach(column => {
      const columnName = sanitizeColumnName(column.columnName);
      script += `        ${columnName}: row['${column.columnName}'],\n`;
    });

    script += `      }));
      
      // Insert data in batches of 100
      const batchSize = 100;
      for (let i = 0; i < transformed${tableName}Data.length; i += batchSize) {
        const batch = transformed${tableName}Data.slice(i, i + batchSize);
        
        console.log(\`Inserting ${tableName} batch \${i/batchSize + 1} of \${Math.ceil(transformed${tableName}Data.length/batchSize)}\`);
        const { data, error } = await supabase
          .from('${tableName}')
          .insert(batch)
          .select();
          
        if (error) {
          console.error(\`Error inserting into ${tableName}:\`, error);
        } else {
          console.log(\`Successfully inserted \${data.length} rows into ${tableName}\`);
        }
      }
    }
    
`;
  }

  script += `    console.log('Data import completed successfully!');
  } catch (error) {
    console.error('Error importing data:', error);
  }
}

// Run the import
loadData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
`;

  // Write the script to file
  const scriptPath = path.join(CONFIG.outputDir, scriptName);
  fs.writeFileSync(scriptPath, script);
  console.log(`Data loader script generated: ${scriptPath}`);
  
  return scriptPath;
}

/**
 * Apply the schema to the Supabase database
 */
async function applySchemaToDb(schemaPath) {
  try {
    // You would use Supabase client to execute the SQL
    // For safety, this is commented out and would need to be manually reviewed
    console.log(`To apply the schema to your database, run:
    
# Option 1: Use Supabase CLI
supabase db reset --db-url ${CONFIG.supabase.url} --password ${CONFIG.supabase.key}

# Option 2: Import via SQL file in the Supabase dashboard
1. Go to the Supabase dashboard
2. Select your project
3. Go to the SQL Editor
4. Import the file: ${schemaPath}
5. Run the SQL script`);
  } catch (error) {
    console.error('Error applying schema to database:', error);
  }
}

/**
 * Main function to run the schema extraction and management process
 */
async function main() {
  try {
    // Process each Excel file
    for (const fileConfig of CONFIG.excelFiles) {
      console.log(`\nProcessing ${fileConfig.type} file: ${fileConfig.path}`);
      
      // Analyze Excel structure
      const analysisResults = analyzeExcelFile(fileConfig.path);
      
      // Output analysis to JSON
      const analysisPath = path.join(CONFIG.outputDir, `${fileConfig.type}_analysis.json`);
      fs.writeFileSync(analysisPath, JSON.stringify(analysisResults, null, 2));
      console.log(`Analysis written to: ${analysisPath}`);
      
      // Generate SQL schema
      const sqlSchema = generateSqlSchema(analysisResults);
      const schemaPath = path.join(CONFIG.outputDir, `${fileConfig.type}_schema.sql`);
      fs.writeFileSync(schemaPath, sqlSchema);
      console.log(`SQL schema written to: ${schemaPath}`);
      
      // Generate TypeScript interfaces
      const tsInterfaces = generateTypeScriptInterfaces(analysisResults);
      const tsPath = path.join(CONFIG.typesOutputDir, `${fileConfig.type}.ts`);
      fs.writeFileSync(tsPath, tsInterfaces);
      console.log(`TypeScript interfaces written to: ${tsPath}`);
      
      // Generate data loader script
      generateDataLoaderScript(analysisResults, fileConfig.type);
      
      // Copy the schema file to migrations directory
      const migrationPath = path.join(CONFIG.migrationsDir, `001_${fileConfig.type}_tables.sql`);
      fs.copyFileSync(schemaPath, migrationPath);
      console.log(`Migration file created: ${migrationPath}`);
    }
    
    // Generate a combined migration file
    console.log('\nGenerating combined migration file...');
    const allSchemaFiles = CONFIG.excelFiles.map(f => 
      path.join(CONFIG.outputDir, `${f.type}_schema.sql`)
    );
    
    let combinedSchema = '';
    for (const schemaFile of allSchemaFiles) {
      const schema = fs.readFileSync(schemaFile, 'utf8');
      combinedSchema += schema + '\n\n';
    }
    
    const combinedPath = path.join(CONFIG.migrationsDir, '001_combined_schema.sql');
    fs.writeFileSync(combinedPath, combinedSchema);
    console.log(`Combined migration file created: ${combinedPath}`);
    
    // Instructions for applying the schema
    console.log('\nSchema extraction complete!');
    applySchemaToDb(combinedPath);
    
  } catch (error) {
    console.error('Error in schema manager:', error);
  }
}

// Run the script
main().catch(console.error);
