/**
 * Enhance Data Type Inference Logging
 * 
 * This script specifically modifies the dataTypeInference.ts file
 * to improve the debug logging system by:
 * 
 * 1. Ensuring DEBUG_DATA_TYPES defaults to disabled (false)
 * 2. Adding a more robust toggle interface for enabling/disabling logging
 * 3. Making it easier to use the console to toggle debugging
 * 
 * Usage:
 * - node scripts/enhance-data-type-logs.cjs
 */

const fs = require('fs');
const path = require('path');

// Target file
const TARGET_FILE = 'src/components/import/dataTypeInference.ts';

// Process the dataTypeInference.ts file
function processDataTypeInference() {
  const filePath = path.join(process.cwd(), TARGET_FILE);
  
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 1. Ensure DEBUG_DATA_TYPES.enabled defaults to false
    content = content.replace(
      /export const DEBUG_DATA_TYPES = \{\s*enabled: true/g,
      'export const DEBUG_DATA_TYPES = {\n  enabled: false'
    );
    
    // 2. Add/enhance debug toggle info
    const DEBUG_TOGGLE_INFO = `
/**
 * Toggle Data Type Inference Debugging
 * 
 * To enable detailed logging of data type inference:
 * 1. Open browser console
 * 2. Run: window.toggleDataTypeDebugging()
 * 
 * Or, set directly: window.__debugDataTypes = true
 */`;
    
    // Add info before toggleDataTypeDebugging function
    if (content.includes('export const toggleDataTypeDebugging')) {
      content = content.replace(
        /export const toggleDataTypeDebugging/,
        `${DEBUG_TOGGLE_INFO}\nexport const toggleDataTypeDebugging`
      );
    }
    
    // 3. Make console message more informative
    content = content.replace(
      /Data type inference debugging (enabled|disabled)/g,
      'Data type inference debugging $1. In browser console, use window.toggleDataTypeDebugging() to toggle.'
    );
    
    // 4. Save the file
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${TARGET_FILE} - Enhanced debug toggle system`);
    
  } catch (error) {
    console.error(`Error processing ${TARGET_FILE}:`, error);
  }
}

// Execute the script
processDataTypeInference();