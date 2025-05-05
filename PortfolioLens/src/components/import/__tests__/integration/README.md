# Batch Import System Integration Tests

This directory contains integration tests for the enhanced batch import system. These tests verify that all components of the system work together correctly.

## Overview

The integration tests cover the following components and functionality:

1. **File Upload with Format Detection**
   - Tests file type detection (XLSX, XLS, CSV, TSV)
   - Tests file reading and parsing
   - Tests extraction of workbook and sheet information

2. **Column Mapping and Template Management**
   - Tests column mapping suggestions
   - Tests saving and retrieving mapping templates
   - Tests template versioning

3. **Schema Generation and Adaptation**
   - Tests SQL generation for creating tables and columns
   - Tests schema analysis from Excel data
   - Tests column type inference

4. **Data Enrichment and Tagging**
   - Tests data enrichment configurations
   - Tests global attributes
   - Tests sub-servicer tags
   - Tests audit trail creation

5. **SQL Execution with Role-Based Permissions**
   - Tests secure SQL execution
   - Tests role-based access controls
   - Tests audit logging

6. **End-to-End Import Process**
   - Tests the complete import workflow
   - Tests handling of large datasets (200+ columns)
   - Tests error handling and edge cases

## Running the Tests

### Prerequisites

- Node.js 14+
- npm or yarn
- Jest testing framework

### Running All Tests

To run all integration tests and generate a comprehensive report:

```bash
cd PortfolioLens
node src/components/import/__tests__/integration/runTests.js
```

This will:
1. Run all integration tests in this directory
2. Generate a JSON report in the `reports` subdirectory
3. Generate an HTML report for easier viewing
4. Display a summary of the test results in the console

### Running Individual Tests

To run a specific test file:

```bash
cd PortfolioLens
npx jest src/components/import/__tests__/integration/FileUploadIntegration.test.ts
```

Replace `FileUploadIntegration.test.ts` with the name of the test file you want to run.

## Test Files

- **FileUploadIntegration.test.ts**: Tests file upload and format detection
- **ColumnMappingIntegration.test.ts**: Tests column mapping and template management
- **SchemaGenerationIntegration.test.ts**: Tests schema generation and adaptation
- **DataEnrichmentIntegration.test.ts**: Tests data enrichment and tagging
- **SqlExecutionIntegration.test.ts**: Tests SQL execution with role-based permissions
- **EndToEndImportIntegration.test.ts**: Tests the complete end-to-end import process

## Test Reports

After running the tests, reports will be generated in the `reports` subdirectory:

- JSON reports: `integration-test-report-[timestamp].json`
- HTML reports: `integration-test-report-[timestamp].html`

The HTML reports provide a user-friendly view of the test results, including:
- Overall success rate
- Number of passed and failed tests
- Detailed output for each test

## Troubleshooting

If you encounter issues running the tests:

1. **Missing dependencies**: Run `npm install` to ensure all dependencies are installed
2. **TypeScript errors**: Make sure TypeScript is installed (`npm install -g typescript`)
3. **Jest configuration**: Verify that Jest is configured correctly in `package.json`
4. **Mock issues**: Check that all mocks are properly set up in the test files

## Adding New Tests

To add a new integration test:

1. Create a new file in this directory with the naming pattern `[Feature]Integration.test.ts`
2. Import the necessary components and types
3. Mock external dependencies (Supabase, file system, etc.)
4. Write test cases using Jest's `describe` and `it` functions
5. Run the tests to verify they work correctly

## Best Practices

- Keep tests focused on integration between components
- Use mocks for external dependencies
- Test both happy paths and error cases
- Include tests for edge cases and performance with large datasets
- Keep test files organized by feature area