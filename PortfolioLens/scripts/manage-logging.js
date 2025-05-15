/**
 * Logging Management Script for PortfolioLens
 * 
 * This script helps manage console logging in the TypeScript codebase
 * by replacing direct console calls with a toggleable logging system.
 * 
 * Usage:
 * - node scripts/manage-logging.js --disable-all    (Comment out all console logs)
 * - node scripts/manage-logging.js --enable-all     (Uncomment all console logs)
 * - node scripts/manage-logging.js --toggle-debug   (Add toggle system for verbose logging)
 */

const fs = require('fs');
const path = require('path');

// Configuration for files with excessive logging
const TARGET_FILES = {
  'dataTypeInference.ts': {
    path: 'src/components/import/dataTypeInference.ts',
    patterns: [
      // Define patterns to look for in dataTypeInference.ts
      { type: 'debug', pattern: 'window.__debugDataTypes' }
    ]
  },
  'TitleManager.tsx': {
    path: 'src/components/common/TitleManager.tsx',
    patterns: [
      // Define patterns for TitleManager.tsx
      { type: 'console', pattern: 'console.log(`[TitleManager]' }
    ] 
  },
  'DocumentsTab.tsx': {
    path: 'src/components/loans/tabs/DocumentsTab.tsx',
    patterns: [
      // Define patterns for DocumentsTab.tsx 
      { type: 'console', pattern: 'console.log(\'[DEBUG DocumentViewerDialog]' },
      { type: 'console', pattern: 'console.log(\'[DEBUG DocumentsTab]' }
    ]
  },
  'supabaseClient.ts': {
    path: 'src/utility/supabaseClient.ts',
    patterns: [
      // Define patterns for supabaseClient.ts
      { type: 'console', pattern: 'console.log(\'Supabase' },
      { type: 'console', pattern: 'console.log(`Executing' }
    ]
  }
};

// Default logger implementation to add to files
const LOGGER_IMPLEMENTATION = `
// Configurable logging utility
export const Logger = {
  // Default logging levels
  levels: {
    error: true,    // Always show errors
    warn: true,     // Always show warnings
    info: false,    // Hide info by default
    debug: false,   // Hide debug by default
    trace: false    // Hide trace by default
  },
  
  // Enable or disable specific log level
  setLevel(level, enabled = true) {
    if (this.levels.hasOwnProperty(level)) {
      this.levels[level] = enabled;
    }
  },
  
  // Enable all logging
  enableAll() {
    Object.keys(this.levels).forEach(level => {
      this.levels[level] = true;
    });
  },
  
  // Disable all except errors
  disableAll() {
    Object.keys(this.levels).forEach(level => {
      this.levels[level] = level === 'error';
    });
  },
  
  // Logging methods
  error(...args) {
    if (this.levels.error) console.error(...args);
  },
  
  warn(...args) {
    if (this.levels.warn) console.warn(...args);
  },
  
  info(...args) {
    if (this.levels.info) console.info(...args);
  },
  
  debug(...args) {
    if (this.levels.debug) console.debug(...args);
  },
  
  trace(...args) {
    if (this.levels.trace) console.log(...args);
  }
};

// Expose logger to window for console access
if (typeof window !== 'undefined') {
  window.PortfolioLogger = Logger;
}
`;

// Add logger utility file
function createLoggerUtility() {
  const loggerPath = path.join(process.cwd(), 'src/utility/logger.ts');
  
  // Check if logger already exists
  if (fs.existsSync(loggerPath)) {
    console.log('Logger utility already exists at src/utility/logger.ts');
    return;
  }
  
  try {
    fs.writeFileSync(loggerPath, LOGGER_IMPLEMENTATION);
    console.log('Created logger utility at src/utility/logger.ts');
  } catch (error) {
    console.error('Failed to create logger utility:', error);
  }
}

// Process dataTypeInference.ts file
function processDataTypeInference() {
  const filePath = path.join(process.cwd(), TARGET_FILES['dataTypeInference.ts'].path);
  
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // The file already has a custom DEBUG_DATA_TYPES system
  // Make sure it defaults to disabled
  content = content.replace(
    /export const DEBUG_DATA_TYPES = \{\s*enabled: true/g,
    'export const DEBUG_DATA_TYPES = {\n  enabled: false'
  );
  
  // Add import for Logger if not present
  if (!content.includes('import { Logger }')) {
    content = content.replace(
      /import {/,
      'import { Logger } from \'../../../utility/logger\';\nimport {'
    );
  }
  
  // Save the updated content
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${filePath}`);
}

// Process TitleManager.tsx file
function processTitleManager() {
  const filePath = path.join(process.cwd(), TARGET_FILES['TitleManager.tsx'].path);
  
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace console.log with Logger.debug
  content = content.replace(
    /console\.log\(`\[TitleManager\] ([^`]+)`\);/g,
    '// console.log(`[TitleManager] $1`);\n    Logger.debug(`[TitleManager] $1`);'
  );
  
  // Add import for Logger if not present
  if (!content.includes('import { Logger }')) {
    content = content.replace(
      /import React/,
      'import { Logger } from \'../../utility/logger\';\nimport React'
    );
  }
  
  // Save the updated content
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${filePath}`);
}

// Process DocumentsTab.tsx file
function processDocumentsTab() {
  const filePath = path.join(process.cwd(), TARGET_FILES['DocumentsTab.tsx'].path);
  
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace console.log with Logger.debug for DocumentsTab logs
  content = content.replace(
    /console\.log\('\[DEBUG DocumentsTab\] ([^']+)'/g,
    '// console.log(\'[DEBUG DocumentsTab] $1\'\n// Logger.debug(\'[DEBUG DocumentsTab] $1\''
  );
  
  // Replace console.log with Logger.debug for DocumentViewerDialog logs
  content = content.replace(
    /console\.log\('\[DEBUG DocumentViewerDialog\] ([^']+)'/g,
    '// console.log(\'[DEBUG DocumentViewerDialog] $1\'\n// Logger.debug(\'[DEBUG DocumentViewerDialog] $1\''
  );
  
  // Replace console.error with Logger.error
  content = content.replace(
    /console\.error\("([^"]+)"\);/g,
    '// console.error("$1");\nLogger.error("$1");'
  );
  
  // Add import for Logger if not present
  if (!content.includes('import { Logger }')) {
    content = content.replace(
      /import React/,
      'import { Logger } from \'../../../utility/logger\';\nimport React'
    );
  }
  
  // Save the updated content
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${filePath}`);
}

// Process supabaseClient.ts file
function processSupabaseClient() {
  const filePath = path.join(process.cwd(), TARGET_FILES['supabaseClient.ts'].path);
  
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace console.log with Logger calls
  content = content.replace(
    /console\.log\('Supabase client initialized successfully'\);/g,
    '// console.log(\'Supabase client initialized successfully\');\nLogger.info(\'Supabase client initialized successfully\');'
  );
  
  content = content.replace(
    /console\.log\(`Executing DB query via RPC: ([^`]+)`\);/g,
    '// console.log(`Executing DB query via RPC: $1`);\nLogger.debug(`Executing DB query via RPC: $1`);'
  );
  
  // Convert error logs
  content = content.replace(
    /console\.error\('([^']+)'/g,
    '// console.error(\'$1\'\nLogger.error(\'$1\''
  );
  
  // Add import for Logger if not present
  if (!content.includes('import { Logger }')) {
    // Check if there are any imports in the file
    if (content.includes('import {')) {
      content = content.replace(
        /import {/,
        'import { Logger } from \'./logger\';\nimport {'
      );
    } else {
      // Add import at the top of the file
      content = 'import { Logger } from \'./logger\';\n\n' + content;
    }
  }
  
  // Save the updated content
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${filePath}`);
}

// Process all files
function processAllFiles() {
  // Create logger utility
  createLoggerUtility();
  
  // Process individual files
  processDataTypeInference();
  processTitleManager();
  processDocumentsTab();
  processSupabaseClient();
  
  console.log('Completed processing all files!');
}

// Main execution
const args = process.argv.slice(2);
const action = args[0] || '--toggle-debug';

switch (action) {
  case '--disable-all':
    // Implement disable all logs functionality
    console.log('Disabling all logs (except errors)...');
    processAllFiles();
    break;
    
  case '--enable-all':
    // Implement enable all logs functionality
    console.log('Enabling all logs...');
    processAllFiles();
    break;
    
  case '--toggle-debug':
    // Implement toggle debug mode
    console.log('Setting up toggleable logging system...');
    processAllFiles();
    break;
    
  default:
    console.log('Unknown action. Use --disable-all, --enable-all, or --toggle-debug');
}