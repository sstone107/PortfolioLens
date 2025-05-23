import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

// Function to analyze data types and formats
function analyzeDataFormats(filePath) {
  console.log(`\n=== Analyzing: ${path.basename(filePath)} ===\n`);
  
  try {
    // Read the Excel file
    const workbook = xlsx.readFile(filePath);
    
    // Analyze each sheet
    for (const sheetName of workbook.SheetNames) {
      console.log(`\n--- Sheet: ${sheetName} ---`);
      
      // Convert to JSON to analyze
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet, { 
        header: 1, 
        raw: false,
        dateNF: 'yyyy-mm-dd'
      });
      
      if (data.length === 0) {
        console.log('Empty sheet');
        continue;
      }
      
      // Get headers
      const headers = data[0];
      console.log(`\nColumns (${headers.length} total):`);
      
      // Analyze each column
      const columnAnalysis = {};
      
      headers.forEach((header, colIndex) => {
        const columnData = [];
        const analysis = {
          name: header,
          startsWithNumber: /^\d/.test(header),
          hasSpecialChars: /[^a-zA-Z0-9_\s]/.test(header),
          samples: new Set(),
          types: new Set(),
          hasNulls: false,
          hasQuotes: false,
          hasCommas: false,
          dateFormats: new Set(),
          numberFormats: new Set(),
          maxLength: 0
        };
        
        // Analyze data in this column
        for (let rowIndex = 1; rowIndex < Math.min(data.length, 100); rowIndex++) {
          const value = data[rowIndex][colIndex];
          
          if (value === undefined || value === null || value === '') {
            analysis.hasNulls = true;
            continue;
          }
          
          // Add to samples (max 5)
          if (analysis.samples.size < 5) {
            analysis.samples.add(value);
          }
          
          // Check for quotes
          if (typeof value === 'string' && (value.includes('"') || value.includes("'"))) {
            analysis.hasQuotes = true;
          }
          
          // Check for commas in numbers
          if (typeof value === 'string' && /^\$?[\d,]+\.?\d*$/.test(value)) {
            analysis.hasCommas = true;
            analysis.numberFormats.add(value);
          }
          
          // Detect type
          if (typeof value === 'number') {
            analysis.types.add('number');
          } else if (typeof value === 'boolean') {
            analysis.types.add('boolean');
          } else if (typeof value === 'string') {
            // Check if it's a date
            if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/.test(value) || 
                /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(value)) {
              analysis.types.add('date');
              analysis.dateFormats.add(value);
            } else if (/^\$?[\d,]+\.?\d*$/.test(value)) {
              analysis.types.add('currency/number');
            } else {
              analysis.types.add('text');
            }
            
            analysis.maxLength = Math.max(analysis.maxLength, value.length);
          }
        }
        
        columnAnalysis[header] = analysis;
      });
      
      // Print analysis
      Object.entries(columnAnalysis).forEach(([header, analysis]) => {
        console.log(`\n${header}:`);
        if (analysis.startsWithNumber) {
          console.log('  ⚠️  STARTS WITH NUMBER - will be prefixed with "n_"');
        }
        if (analysis.hasSpecialChars) {
          console.log('  ⚠️  HAS SPECIAL CHARACTERS');
        }
        console.log(`  Types: ${Array.from(analysis.types).join(', ')}`);
        if (analysis.hasNulls) console.log('  Has null/empty values');
        if (analysis.hasQuotes) console.log('  Contains quotes');
        if (analysis.hasCommas) console.log('  Numbers with commas');
        if (analysis.dateFormats.size > 0) {
          console.log(`  Date formats: ${Array.from(analysis.dateFormats).slice(0, 3).join(', ')}`);
        }
        if (analysis.numberFormats.size > 0) {
          console.log(`  Number formats: ${Array.from(analysis.numberFormats).slice(0, 3).join(', ')}`);
        }
        console.log(`  Max length: ${analysis.maxLength}`);
        console.log(`  Samples: ${Array.from(analysis.samples).slice(0, 3).join(', ')}`);
      });
      
      // Also get raw data for first few rows to see exact formats
      console.log('\n--- First 3 Rows (Raw) ---');
      const rawData = xlsx.utils.sheet_to_json(sheet, { 
        header: 1, 
        raw: true,
        defval: null
      });
      
      for (let i = 0; i < Math.min(3, rawData.length); i++) {
        console.log(`Row ${i}:`, JSON.stringify(rawData[i].slice(0, 5)) + '...');
      }
    }
    
  } catch (error) {
    console.error('Error reading file:', error.message);
  }
}

// Analyze multiple files
const sampleDir = '/mnt/c/Users/sston/Dropbox/-- Greenway/sample';
const files = [
  'greenway_2025-03-31_vc_daily_remittance_report - loan only.xlsx',
  'greenway_mortgage_funding_corporation_billing_report_02-2025.xlsx'
];

files.forEach(file => {
  const filePath = path.join(sampleDir, file);
  if (fs.existsSync(filePath)) {
    analyzeDataFormats(filePath);
  }
});