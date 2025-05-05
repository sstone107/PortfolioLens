import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const csvFilePath = path.resolve('PortfolioLens', 'data', 'sample_import.csv');
const excelFilePath = path.resolve('PortfolioLens', 'data', 'sample_import.xlsx');
const dataDir = path.dirname(excelFilePath);

try {
  // Ensure the data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`Created directory: ${dataDir}`);
  }

  // Read the CSV file content
  const csvData = fs.readFileSync(csvFilePath, 'utf8');
  console.log('Read CSV file successfully.');

  // Parse the CSV data
  // Using type: 'string' as we read the file content as a string
  const workbook = XLSX.read(csvData, { type: 'string', raw: true });
  console.log('Parsed CSV data.');

  // Write the workbook to an Excel file buffer
  // bookType: 'xlsx' for .xlsx format
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  console.log('Generated Excel buffer.');

  // Write the buffer to the Excel file
  fs.writeFileSync(excelFilePath, excelBuffer);
  console.log(`Successfully created Excel file: ${excelFilePath}`);

} catch (error) {
  console.error('Error creating Excel file:', error);
  process.exit(1); // Exit with error code
}