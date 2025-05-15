/**
 * Clean Import Component Logs
 * 
 * This script specifically targets the import components to remove
 * excessive console.log statements.
 * 
 * Usage:
 * - node scripts/clean-imports-logs.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of files in the import components to clean
const targetFiles = [
  'src/components/import/steps/ColumnMappingStepVirtualized.tsx',
  'src/components/import/steps/TableMappingStepVirtualized.tsx',
  'src/components/import/dataTypeInference.ts',
  'src/components/import/steps/TableMappingStep.tsx',
  'src/components/import/BatchImporterHooks.ts',
  'src/components/import/BatchImporter.tsx',
  'src/components/import/services/SimilarityService.ts',
  'src/components/import/services/mappingEngine.ts'
];

// Process a file to comment out console.log statements
function processFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    return;
  }
  
  try {
    let content = fs.readFileSync(fullPath, 'utf8');
    let originalLength = content.length;
    let logCount = 0;
    
    // Replace various console logging patterns
    // Pattern 1: Standard console.log, console.error, etc.
    content = content.replace(
      /(console\.(log|error|warn|debug|info))\(/g, 
      (match, p1) => {
        logCount++;
        return `// ${p1}(`;
      }
    );
    
    // Save the file if changes were made
    if (originalLength !== content.length) {
      fs.writeFileSync(fullPath, content);
      console.log(`Updated ${filePath} - commented out ${logCount} console statements`);
    } else {
      console.log(`No console statements found in ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

// Process all target files
function processAllFiles() {
  console.log('Starting to process import component files...');
  
  targetFiles.forEach(file => {
    processFile(file);
  });
  
  console.log('Completed processing all files!');
}

// Execute the script
processAllFiles();