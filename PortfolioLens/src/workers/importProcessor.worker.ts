// Import Processor Web Worker
// Handles background parsing of Excel/CSV files and progressive uploads

import * as XLSX from 'xlsx';

// Polyfill for Web Worker environment
declare const self: DedicatedWorkerGlobalScope;

interface ParseFileMessage {
  type: 'PARSE_FILE';
  file: File;
  jobId: string;
  templateId?: string;
  supabaseUrl: string;
  supabaseKey: string;
}

interface CancelMessage {
  type: 'CANCEL';
  jobId: string;
}

interface ProgressMessage {
  type: 'PROGRESS';
  jobId: string;
  progress: number;
  message: string;
  currentSheet?: string;
}

interface ErrorMessage {
  type: 'ERROR';
  jobId: string;
  error: string;
  details?: any;
}

interface CompleteMessage {
  type: 'COMPLETE';
  jobId: string;
  totalRows: number;
  totalSheets: number;
}

type WorkerMessage = ParseFileMessage | CancelMessage;
type WorkerResponse = ProgressMessage | ErrorMessage | CompleteMessage;

// Chunk configuration
const CHUNK_SIZE = 1000; // rows per chunk
const MAX_CONCURRENT_UPLOADS = 3;

// Track active jobs for cancellation
const activeJobs = new Map<string, boolean>();

// Helper to check if job is cancelled
function isJobCancelled(jobId: string): boolean {
  return activeJobs.get(jobId) === false;
}

// Helper to post messages
function postProgress(jobId: string, progress: number, message: string, currentSheet?: string) {
  self.postMessage({
    type: 'PROGRESS',
    jobId,
    progress,
    message,
    currentSheet
  } as ProgressMessage);
}

function postError(jobId: string, error: string, details?: any) {
  self.postMessage({
    type: 'ERROR',
    jobId,
    error,
    details
  } as ErrorMessage);
}

function postComplete(jobId: string, totalRows: number, totalSheets: number) {
  self.postMessage({
    type: 'COMPLETE',
    jobId,
    totalRows,
    totalSheets
  } as CompleteMessage);
}

// Parse Excel file
async function parseExcelFile(file: File, jobId: string): Promise<{ [sheetName: string]: any[] }> {
  postProgress(jobId, 10, 'Reading Excel file...');
  
  const arrayBuffer = await file.arrayBuffer();
  
  if (isJobCancelled(jobId)) throw new Error('Job cancelled');
  
  postProgress(jobId, 20, 'Parsing workbook...');
  
  // Parse with all options for better compatibility
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
    cellNF: true,
    cellText: true,
    raw: false
  });
  
  const sheets: { [sheetName: string]: any[] } = {};
  const totalSheets = workbook.SheetNames.length;
  
  postProgress(jobId, 30, `Found ${totalSheets} sheets`);
  
  // Process each sheet
  for (let i = 0; i < workbook.SheetNames.length; i++) {
    if (isJobCancelled(jobId)) throw new Error('Job cancelled');
    
    const sheetName = workbook.SheetNames[i];
    const progress = 30 + (i / totalSheets) * 40; // 30-70% for parsing
    
    postProgress(jobId, Math.round(progress), `Processing sheet: ${sheetName}`, sheetName);
    
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: null,
      blankrows: false
    });
    
    sheets[sheetName] = jsonData;
    
    console.log(`Parsed sheet ${sheetName}: ${jsonData.length} rows`);
  }
  
  return sheets;
}

// Parse CSV file
async function parseCSVFile(file: File, jobId: string): Promise<{ [sheetName: string]: any[] }> {
  postProgress(jobId, 10, 'Reading CSV file...');
  
  const text = await file.text();
  
  if (isJobCancelled(jobId)) throw new Error('Job cancelled');
  
  postProgress(jobId, 30, 'Parsing CSV data...');
  
  // Simple CSV parsing (you might want to use a proper CSV parser)
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }
  
  // Parse headers
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  // Parse data
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    if (isJobCancelled(jobId)) throw new Error('Job cancelled');
    
    if (i % 100 === 0) {
      const progress = 30 + ((i / lines.length) * 40);
      postProgress(jobId, Math.round(progress), `Processing row ${i} of ${lines.length}`);
    }
    
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || null;
    });
    
    data.push(row);
  }
  
  // CSV files are treated as a single "sheet"
  return { 'Sheet1': data };
}

// Send chunk to server
async function sendChunkToServer(
  jobId: string,
  sheetName: string,
  chunk: any[],
  chunkIndex: number,
  totalChunks: number,
  supabaseUrl: string,
  supabaseKey: string
): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/receive_import_chunk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({
      p_job_id: jobId,
      p_sheet_name: sheetName,
      p_chunk_index: chunkIndex,
      p_total_chunks: totalChunks,
      p_data: chunk,
      p_row_count: chunk.length
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload chunk: ${error}`);
  }
  
  const result = await response.json();
  
  // If all chunks received, trigger processing
  if (result.all_chunks_received) {
    console.log(`All chunks received for sheet ${sheetName}, server will process`);
  }
}

// Upload sheets in chunks
async function uploadSheetsInChunks(
  jobId: string,
  sheets: { [sheetName: string]: any[] },
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ totalRows: number }> {
  let totalRows = 0;
  let uploadedRows = 0;
  
  // Calculate total rows for progress
  for (const rows of Object.values(sheets)) {
    totalRows += rows.length;
  }
  
  // Process each sheet
  for (const [sheetName, rows] of Object.entries(sheets)) {
    if (isJobCancelled(jobId)) throw new Error('Job cancelled');
    
    // Calculate chunks
    const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
    
    postProgress(
      jobId, 
      70 + (uploadedRows / totalRows) * 25, // 70-95% for uploading
      `Uploading ${sheetName} (${rows.length} rows)...`,
      sheetName
    );
    
    // Upload chunks with concurrency control
    const uploadPromises = [];
    
    for (let i = 0; i < totalChunks; i++) {
      if (isJobCancelled(jobId)) throw new Error('Job cancelled');
      
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, rows.length);
      const chunk = rows.slice(start, end);
      
      const uploadPromise = sendChunkToServer(
        jobId,
        sheetName,
        chunk,
        i,
        totalChunks,
        supabaseUrl,
        supabaseKey
      ).then(() => {
        uploadedRows += chunk.length;
        const progress = 70 + (uploadedRows / totalRows) * 25;
        postProgress(
          jobId,
          Math.round(progress),
          `Uploaded ${uploadedRows}/${totalRows} rows`,
          sheetName
        );
      });
      
      uploadPromises.push(uploadPromise);
      
      // Control concurrency
      if (uploadPromises.length >= MAX_CONCURRENT_UPLOADS) {
        await Promise.race(uploadPromises);
        uploadPromises.splice(
          uploadPromises.findIndex(p => p === await Promise.race(uploadPromises)),
          1
        );
      }
    }
    
    // Wait for remaining uploads
    await Promise.all(uploadPromises);
  }
  
  return { totalRows };
}

// Main message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  
  switch (message.type) {
    case 'PARSE_FILE':
      const { file, jobId, supabaseUrl, supabaseKey } = message;
      
      // Mark job as active
      activeJobs.set(jobId, true);
      
      try {
        postProgress(jobId, 0, 'Starting import...');
        
        // Determine file type and parse
        let sheets: { [sheetName: string]: any[] };
        
        if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
          sheets = await parseExcelFile(file, jobId);
        } else if (file.name.toLowerCase().endsWith('.csv')) {
          sheets = await parseCSVFile(file, jobId);
        } else {
          throw new Error(`Unsupported file type: ${file.name}`);
        }
        
        // Upload sheets in chunks
        const { totalRows } = await uploadSheetsInChunks(
          jobId,
          sheets,
          supabaseUrl,
          supabaseKey
        );
        
        postProgress(jobId, 95, 'Finalizing import...');
        
        // Send completion message
        postComplete(jobId, totalRows, Object.keys(sheets).length);
        
      } catch (error) {
        console.error('Import error:', error);
        postError(
          jobId, 
          error instanceof Error ? error.message : 'Unknown error',
          error
        );
      } finally {
        // Clean up
        activeJobs.delete(jobId);
      }
      break;
      
    case 'CANCEL':
      // Mark job as cancelled
      activeJobs.set(message.jobId, false);
      postProgress(message.jobId, -1, 'Cancelling import...');
      break;
  }
};

// Export for TypeScript
export {};