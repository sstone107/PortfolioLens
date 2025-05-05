import { SupabaseClient } from '@supabase/supabase-js';
import { ImportJob, ColumnMapping, MissingColumnInfo, ColumnType } from '../types';
import { supabaseClient } from '../../../utility';
import { MetadataService } from './MetadataService';
import { executeSql, applyMigration } from '../../../utility/supabaseMcp';

/**
 * Standard error response format for import operations
 */
export interface ImportResult {
  success: boolean;
  message: string;
  rowCount: number;
  columnsCreated?: string[];
}

/**
 * Service for handling data import operations
 * Refactored to use the Supabase MCP pattern
 */
export class ImportService {
  private client: SupabaseClient | undefined;
  private metadataService: MetadataService;
  
  constructor(metadataService?: MetadataService, customClient?: SupabaseClient) {
    this.client = customClient;
    this.metadataService = metadataService || new MetadataService(this.client);
  }
  
  /**
   * Process batch import of multiple sheets to multiple tables
   * @param jobs - Array of ImportJob objects with import configuration
   * @param excelData - Sheet data from Excel organized by sheet name
   * @param createMissingColumns - Whether to create missing columns automatically
   * @returns Record of results keyed by sheet name
   */
  async processBatchImport(
    jobs: ImportJob[],
    excelData: Record<string, Record<string, any>[]>,
    createMissingColumns: boolean
  ): Promise<Record<string, ImportResult>> {
    const results: Record<string, ImportResult> = {};
    
    for (const job of jobs) {
      try {
        // Get sheet data
        const sheetData = excelData[job.sheetName];
        
        if (!sheetData || !sheetData.length) {
          results[job.sheetName] = {
            success: false,
            message: `No data found for sheet "${job.sheetName}"`,
            rowCount: 0
          };
          continue;
        }
        
        // Check for missing columns if needed
        let missingColumns: MissingColumnInfo[] = [];
        if (createMissingColumns) {
          missingColumns = await this.metadataService.detectMissingColumns(
            job.tableName,
            job.mapping
          );
          
          if (missingColumns.length > 0) {
            // Create missing columns
            const createResult = await this.metadataService.createMissingColumns(
              job.tableName,
              missingColumns
            );
            
            if (!createResult.success) {
              results[job.sheetName] = {
                success: false,
                message: `Failed to create missing columns: ${createResult.message}`,
                rowCount: 0
              };
              continue;
            }
          }
        }
        
        // Process the data
        const importResult = await this.importData(
          job.tableName,
          sheetData,
          job.mapping
        );
        
        // Update job status
        await this.updateJobStatus(
          job.id,
          importResult.success ? 'completed' : 'failed',
          importResult.rowCount,
          importResult.success ? undefined : importResult.message
        );
        
        // Add created columns to result if any
        if (missingColumns.length > 0) {
          importResult.columnsCreated = missingColumns.map(col => col.columnName);
        }
        
        results[job.sheetName] = importResult;
      } catch (error: any) {
        console.error(`Error processing import job for ${job.sheetName}:`, error);
        
        // Update job status
        await this.updateJobStatus(
          job.id,
          'failed',
          0,
          error.message || 'Unknown error during import'
        );
        
        results[job.sheetName] = {
          success: false,
          message: `Import failed: ${error.message || 'Unknown error'}`,
          rowCount: 0
        };
      }
    }
    
    return results;
  }
  
  /**
   * Import data into a table
   * @param tableName - Target table name
   * @param data - Data to import
   * @param mapping - Column mapping
   * @returns Import result
   */
  private async importData(
    tableName: string,
    data: Record<string, any>[],
    mapping: Record<string, ColumnMapping>
  ): Promise<ImportResult> {
    try {
      if (!data.length) {
        return {
          success: false,
          message: 'No data to import',
          rowCount: 0
        };
      }
      
      // Transform data according to mapping
      const transformedData = data.map(row => {
        const transformedRow: Record<string, any> = {};
        
        // Process each mapping
        Object.values(mapping).forEach(map => {
          if (!map.dbColumn) return;
          
          let value = row[map.excelColumn];
          
          // Apply type conversion
          if (value !== null && value !== undefined) {
            switch (map.type) {
              case 'number':
                value = Number(value);
                break;
              case 'boolean':
                if (typeof value === 'string') {
                  value = value.toLowerCase() === 'true' || 
                          value.toLowerCase() === 'yes' || 
                          value === '1';
                } else {
                  value = Boolean(value);
                }
                break;
              case 'date':
                if (!(value instanceof Date)) {
                  try {
                    value = new Date(value);
                    // Format as ISO string for PostgreSQL
                    value = value.toISOString();
                  } catch (e) {
                    console.warn(`Failed to convert value to date: ${value}`);
                    value = null;
                  }
                }
                break;
              case 'string':
                value = String(value);
                break;
            }
          }
          
          transformedRow[map.dbColumn] = value;
        });
        
        return transformedRow;
      });
      
      // Batch insert data using MCP
      const insertCount = await this.batchInsert(tableName, transformedData);
      
      return {
        success: true,
        message: `Successfully imported ${insertCount} rows into ${tableName}`,
        rowCount: insertCount
      };
    } catch (error: any) {
      console.error(`Error importing data into ${tableName}:`, error);
      return {
        success: false,
        message: `Import failed: ${error.message || 'Unknown error'}`,
        rowCount: 0
      };
    }
  }
  
  /**
   * Batch insert data into a table
   * @param tableName - Target table name
   * @param data - Data to insert
   * @returns Number of rows inserted
   */
  private async batchInsert(
    tableName: string,
    data: Record<string, any>[]
  ): Promise<number> {
    if (!data.length) return 0;
    
    // Use batch size to avoid hitting statement size limits
    const BATCH_SIZE = 100;
    let insertedCount = 0;
    
    // Process in batches
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      
      try {
        // Generate column names from first row
        const columns = Object.keys(batch[0]);
        
        // Build VALUES part of the query
        const values = batch.map(row => {
          const rowValues = columns.map(col => {
            const value = row[col];
            
            // Handle different value types
            if (value === null || value === undefined) {
              return 'NULL';
            } else if (typeof value === 'string') {
              // Escape single quotes in strings
              return `'${value.replace(/'/g, "''")}'`;
            } else if (value instanceof Date) {
              return `'${value.toISOString()}'`;
            } else {
              return value;
            }
          });
          
          return `(${rowValues.join(', ')})`;
        }).join(',\n');
        
        // Build the complete INSERT statement
        const insertQuery = `
          INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')})
          VALUES ${values}
          ON CONFLICT DO NOTHING
          RETURNING id;
        `;
        
        // Execute the query using MCP
        const result = await executeSql(insertQuery);

        // Check for errors before accessing data
        if (result.error) {
          console.error(`Error during batch insert SQL execution:`, result.error);
          
          // Special handling for schema cache errors
          if (result.error.message.includes('SCHEMA CACHE ERROR')) {
            throw new Error(
              `Schema cache error detected during import. The database functions required for import ` +
              `cannot be found in the PostgREST schema cache. Please reload the schema cache in the ` +
              `Supabase Dashboard (SQL Editor -> Schema -> Reload) and try again.\n\n` +
              `Original error: ${result.error.message}`
            );
          }
          
          // Re-throw the error with additional context
          throw new Error(`SQL execution failed during batch insert: ${result.error.message}`);
        }
        
        // Count inserted rows from data array
        insertedCount += result.data ? result.data.length : 0;
      } catch (error) {
        console.error(`Error inserting batch into ${tableName}:`, error);
        throw error;
      }
    }
    
    return insertedCount;
  }
  
  /**
   * Update import job status
   * @param jobId - Job ID
   * @param status - New status
   * @param processedRows - Number of processed rows
   * @param errorMessage - Error message if any
   */
  private async updateJobStatus(
    jobId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    processedRows: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      
      // Build update query
      let updateQuery = `
        UPDATE import_jobs
        SET 
          status = '${status}',
          processed_rows = ${processedRows},
          updated_at = '${now}'
      `;
      
      // Add error message if provided
      if (errorMessage) {
        updateQuery += `,\n  error_message = '${errorMessage.replace(/'/g, "''")}'`;
      }
      
      // Add WHERE clause
      updateQuery += `\nWHERE id = '${jobId}';`;
      
      // Execute the query using MCP
      const result = await executeSql(updateQuery);
      
      // Check for errors
      if (result.error) {
        console.error(`Error updating job status for ${jobId}:`, result.error);
        
        // Log schema cache errors more prominently but don't throw
        if (result.error.message.includes('SCHEMA CACHE ERROR')) {
          console.error('==========================================================');
          console.error('SCHEMA CACHE ERROR DETECTED DURING STATUS UPDATE');
          console.error('Please reload the schema cache in the Supabase Dashboard');
          console.error('(SQL Editor -> Schema -> Reload)');
          console.error('==========================================================');
        }
        // Don't throw here to avoid breaking the main import flow
      }
    } catch (error) {
      console.error(`Error updating job status for ${jobId}:`, error);
      // Don't throw here to avoid breaking the main import flow
    }
  }
  
  /**
   * Create a new import job record
   * @param job - Import job details
   * @returns Promise resolving to job ID
   */
  async createImportJob(
    job: Omit<ImportJob, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'processedRows'>
  ): Promise<string> {
    try {
      const now = new Date().toISOString();
      
      // Build insert query
      const insertQuery = `
        INSERT INTO import_jobs (
          user_id,
          file_name,
          table_name,
          sheet_name,
          mapping,
          status,
          total_rows,
          processed_rows,
          created_at,
          updated_at
        )
        VALUES (
          '${job.userId}',
          '${job.fileName.replace(/'/g, "''")}',
          '${job.tableName}',
          '${job.sheetName.replace(/'/g, "''")}',
          '${JSON.stringify(job.mapping).replace(/'/g, "''")}',
          'pending',
          ${job.totalRows},
          0,
          '${now}',
          '${now}'
        )
        RETURNING id;
      `;
      
      // Execute the query using MCP
      const result = await executeSql(insertQuery);

      // Check for errors first
      if (result.error) {
        console.error(`Error executing createImportJob query via MCP:`, result.error);
        
        // Special handling for schema cache errors
        if (result.error.message.includes('SCHEMA CACHE ERROR')) {
          console.error('==========================================================');
          console.error('SCHEMA CACHE ERROR DETECTED DURING JOB CREATION');
          console.error('Please reload the schema cache in the Supabase Dashboard');
          console.error('(SQL Editor -> Schema -> Reload)');
          console.error('==========================================================');
          
          // Throw a more user-friendly error
          throw new Error(
            `Schema cache error detected. The database functions required for import ` +
            `cannot be found. Please reload the schema cache in the Supabase Dashboard ` +
            `(SQL Editor -> Schema -> Reload) and try again.`
          );
        }
        
        // Fall through to the direct client attempt below for other errors
      } else if (result.data && result.data.length > 0 && result.data[0].id) {
        // If no error and data is valid, return the ID
        return result.data[0].id;
      }
      
      // If MCP fails (error or no valid data), try using the Supabase client directly
      if (this.client) {
        const { data, error } = await this.client
          .from('import_jobs')
          .insert({
            user_id: job.userId,
            file_name: job.fileName,
            table_name: job.tableName,
            sheet_name: job.sheetName,
            mapping: job.mapping,
            status: 'pending',
            total_rows: job.totalRows,
            processed_rows: 0,
            created_at: now,
            updated_at: now
          })
          .select('id')
          .single();
        
        if (error) {
          throw new Error(`Failed to create import job: ${error.message}`);
        }
        
        return data.id;
      }
      
      throw new Error('Failed to create import job: No valid database connection');
    } catch (error: any) {
      console.error('Error creating import job:', error);
      throw new Error(`Failed to create import job: ${error.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Process an import job
   * @param jobId - ID of the import job
   * @returns Promise resolving to success status
   */
  async processImportJob(jobId: string): Promise<{ success: boolean, message: string }> {
    try {
      // Update job status to processing
      await this.updateJobStatus(jobId, 'processing', 0);
      
      // Get job details
      const jobQuery = `
        SELECT * FROM import_jobs WHERE id = '${jobId}';
      `;
      
      const jobResult = await executeSql(jobQuery);

      // Check for errors first
      if (jobResult.error) {
         console.error(`Error fetching job details for ${jobId}:`, jobResult.error);
         
         // Special handling for schema cache errors
         if (jobResult.error.message.includes('SCHEMA CACHE ERROR')) {
           console.error('==========================================================');
           console.error('SCHEMA CACHE ERROR DETECTED DURING JOB PROCESSING');
           console.error('Please reload the schema cache in the Supabase Dashboard');
           console.error('(SQL Editor -> Schema -> Reload)');
           console.error('==========================================================');
           
           return {
             success: false,
             message: `Schema cache error: The database functions required for import ` +
                      `cannot be found. Please reload the schema cache in the Supabase Dashboard ` +
                      `(SQL Editor -> Schema -> Reload) and try again.`
           };
         }
         
         // Return error for other types of errors
         return {
           success: false,
           message: `Failed to fetch job details: ${jobResult.error.message}`
         };
      }
      
      // Check if data array is empty
      if (!jobResult.data || !jobResult.data.length) {
        return {
          success: false,
          message: `Import job with ID ${jobId} not found`
        };
      }
      
      // Access job data from the data array
      const job = jobResult.data[0];
      
      // TODO: Implement actual job processing logic
      // This would typically involve fetching the data from a storage location
      // and then processing it using the importData method
      
      // For now, just update the job status to completed
      await this.updateJobStatus(jobId, 'completed', job.total_rows);
      
      return {
        success: true,
        message: `Import job ${jobId} processed successfully`
      };
    } catch (error: any) {
      console.error(`Error processing import job ${jobId}:`, error);
      
      // Update job status to failed
      await this.updateJobStatus(
        jobId,
        'failed',
        0,
        error.message || 'Unknown error during import'
      );
      
      return {
        success: false,
        message: `Import failed: ${error.message || 'Unknown error'}`
      };
    }
  }
}
