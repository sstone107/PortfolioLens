/**
 * Integration Test Runner for Batch Import System
 * 
 * This script runs all integration tests for the batch import system
 * and generates a comprehensive report of the results.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const TEST_DIR = __dirname;
const REPORT_DIR = path.join(TEST_DIR, 'reports');
const TEST_PATTERN = '*.test.ts';

// Ensure report directory exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Get all test files
const getTestFiles = () => {
  const files = fs.readdirSync(TEST_DIR);
  return files.filter(file => 
    file.match(TEST_PATTERN) && 
    !file.includes('runTests')
  );
};

// Run a single test file
const runTest = (testFile) => {
  console.log(`\n🧪 Running test: ${testFile}`);
  
  try {
    // Execute the test using Jest
    const command = `npx jest ${path.join(TEST_DIR, testFile)} --verbose`;
    const output = execSync(command, { encoding: 'utf8' });
    
    console.log(`✅ Test ${testFile} completed successfully`);
    return {
      file: testFile,
      success: true,
      output
    };
  } catch (error) {
    console.error(`❌ Test ${testFile} failed`);
    console.error(error.stdout || error.message);
    
    return {
      file: testFile,
      success: false,
      output: error.stdout || error.message
    };
  }
};

// Run all tests
const runAllTests = () => {
  console.log('🚀 Starting Batch Import System Integration Tests');
  console.log('===============================================');
  
  const testFiles = getTestFiles();
  console.log(`Found ${testFiles.length} test files to run`);
  
  const results = [];
  let successCount = 0;
  let failureCount = 0;
  
  for (const testFile of testFiles) {
    const result = runTest(testFile);
    results.push(result);
    
    if (result.success) {
      successCount++;
    } else {
      failureCount++;
    }
  }
  
  // Generate summary
  console.log('\n📊 Test Summary');
  console.log('===============');
  console.log(`Total Tests: ${testFiles.length}`);
  console.log(`Passed: ${successCount}`);
  console.log(`Failed: ${failureCount}`);
  console.log(`Success Rate: ${Math.round((successCount / testFiles.length) * 100)}%`);
  
  // Generate report
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const reportPath = path.join(REPORT_DIR, `integration-test-report-${timestamp}.json`);
  
  const report = {
    timestamp: new Date().toISOString(),
    totalTests: testFiles.length,
    passed: successCount,
    failed: failureCount,
    successRate: (successCount / testFiles.length),
    results: results.map(result => ({
      file: result.file,
      success: result.success,
      // Truncate output to avoid huge reports
      output: result.output.substring(0, 1000) + (result.output.length > 1000 ? '...' : '')
    }))
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📝 Report saved to: ${reportPath}`);
  
  return {
    success: failureCount === 0,
    report
  };
};

// Generate a comprehensive HTML report
const generateHtmlReport = (report) => {
  const htmlReportPath = path.join(REPORT_DIR, `integration-test-report-${report.timestamp.replace(/:/g, '-')}.html`);
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Batch Import Integration Test Report</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3 {
      color: #333;
    }
    .summary {
      background-color: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }
    .success-rate {
      font-size: 24px;
      font-weight: bold;
      color: ${report.successRate === 1 ? 'green' : report.successRate > 0.8 ? 'orange' : 'red'};
    }
    .test-result {
      margin-bottom: 20px;
      padding: 15px;
      border-radius: 5px;
      border-left: 5px solid;
    }
    .test-success {
      background-color: #e6ffed;
      border-left-color: #28a745;
    }
    .test-failure {
      background-color: #ffeef0;
      border-left-color: #dc3545;
    }
    .output {
      background-color: #f8f9fa;
      padding: 10px;
      border-radius: 3px;
      font-family: monospace;
      white-space: pre-wrap;
      max-height: 300px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <h1>Batch Import Integration Test Report</h1>
  <p>Generated on: ${new Date(report.timestamp).toLocaleString()}</p>
  
  <div class="summary">
    <h2>Summary</h2>
    <p>Total Tests: ${report.totalTests}</p>
    <p>Passed: ${report.passed}</p>
    <p>Failed: ${report.failed}</p>
    <p>Success Rate: <span class="success-rate">${Math.round(report.successRate * 100)}%</span></p>
  </div>
  
  <h2>Test Results</h2>
  ${report.results.map(result => `
    <div class="test-result ${result.success ? 'test-success' : 'test-failure'}">
      <h3>${result.file} ${result.success ? '✅' : '❌'}</h3>
      <div class="output">${result.output.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>
  `).join('')}
</body>
</html>
  `;
  
  fs.writeFileSync(htmlReportPath, html);
  console.log(`\n📊 HTML Report saved to: ${htmlReportPath}`);
};

// Main execution
const main = () => {
  const { success, report } = runAllTests();
  generateHtmlReport(report);
  
  // Exit with appropriate code
  process.exit(success ? 0 : 1);
};

// Run the tests
main();