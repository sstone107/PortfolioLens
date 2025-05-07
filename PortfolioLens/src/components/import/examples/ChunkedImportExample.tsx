import React, { useState, useEffect } from 'react';
import { DatabaseService } from '../services/DatabaseService.chunked';
import { ImportJob, ImportResult } from '../types';

/**
 * Example component demonstrating how to use the chunked import system
 */
const ChunkedImportExample: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<Record<string, ImportResult> | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Function to handle batch import
  const handleBatchImport = async (
    jobs: ImportJob[], 
    excelData: Record<string, Record<string, any>[]>
  ) => {
    setLoading(true);
    setError(null);
    
    try {
      // Create an instance of the DatabaseService (chunked version)
      const databaseService = new DatabaseService();
      
      // Process the batch import using the chunked approach
      const results = await databaseService.processBatchImport(
        jobs,
        excelData,
        true // createMissingColumns
      );
      
      // Update state with results
      setResults(results);
      
      // Check if any sheets failed
      const failedSheets = Object.entries(results)
        .filter(([_, result]) => !result.success)
        .map(([sheetName, result]) => `${sheetName}: ${result.message}`);
      
      if (failedSheets.length > 0) {
        setError(`Some sheets failed to import: ${failedSheets.join('; ')}`);
      }
    } catch (err: any) {
      setError(`Import failed: ${err.message || 'Unknown error'}`);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };
  
  // Example of creating import jobs
  const createExampleJobs = async (
    fileName: string,
    tableMappings: Array<{sheetName: string, tableName: string}>,
    columnMappings: Record<string, Record<string, any>>,
    totalRows: Record<string, number>
  ): Promise<ImportJob[]> => {
    try {
      const databaseService = new DatabaseService();
      const jobs: ImportJob[] = [];
      
      // Create a job for each sheet
      for (const mapping of tableMappings) {
        const { sheetName, tableName } = mapping;
        
        // Create the import job
        const jobId = await databaseService.createImportJob({
          fileName,
          tableName,
          sheetName,
          mapping: columnMappings[sheetName] || {},
          totalRows: totalRows[sheetName] || 0,
          newColumnProposals: [] // Optional: Add new column proposals if needed
        });
        
        // Add the job to our list
        jobs.push({
          id: jobId,
          userId: 'current-user', // This will be set by the backend
          fileName,
          tableName,
          sheetName,
          mapping: columnMappings[sheetName] || {},
          status: 'pending',
          totalRows: totalRows[sheetName] || 0,
          processedRows: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      return jobs;
    } catch (err: any) {
      setError(`Failed to create import jobs: ${err.message || 'Unknown error'}`);
      return [];
    }
  };
  
  return (
    <div>
      <h2>Chunked Import Example</h2>
      
      {loading && <div>Processing import, please wait...</div>}
      
      {error && (
        <div style={{ color: 'red', marginTop: '10px' }}>
          Error: {error}
        </div>
      )}
      
      {results && (
        <div style={{ marginTop: '20px' }}>
          <h3>Import Results</h3>
          <table>
            <thead>
              <tr>
                <th>Sheet</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(results).map(([sheetName, result]) => (
                <tr key={sheetName}>
                  <td>{sheetName}</td>
                  <td style={{ color: result.success ? 'green' : 'red' }}>
                    {result.success ? 'Success' : 'Failed'}
                  </td>
                  <td>{result.rowCount}</td>
                  <td>{result.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      <div style={{ marginTop: '20px' }}>
        <p>
          This example demonstrates how to use the chunked import system.
          To use it in your application:
        </p>
        <ol>
          <li>Import DatabaseService from '../services/DatabaseService.chunked'</li>
          <li>Create import jobs with createImportJob()</li>
          <li>Process the batch with processBatchImport()</li>
        </ol>
        <p>
          The chunked approach handles large mapping data without truncation
          and processes one sheet at a time for better error isolation.
        </p>
      </div>
    </div>
  );
};

export default ChunkedImportExample;