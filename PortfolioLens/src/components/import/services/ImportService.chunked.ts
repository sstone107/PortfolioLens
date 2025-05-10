import { SupabaseClient } from '@supabase/supabase-js';
import { ImportJob, ColumnMapping, MissingColumnInfo, ColumnType, NewColumnProposal } from '../types';
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
 * Refactored to use the chunked approach with staging tables to handle large mappings
 */
export class ImportService {
  private client: SupabaseClient | undefined;
  private metadataService: MetadataService;
  
  // Constructor now requires MetadataService
  constructor(metadataService: MetadataService, customClient?: SupabaseClient) {
    this.client = customClient; // Keep client for potential direct use if needed, though MCP is preferred
    if (!metadataService) {
      throw new Error("ImportService requires a MetadataService instance.");
    }
    this.metadataService = metadataService;
  }

  /**
   * Process batch import of multiple sheets to multiple tables
   * Uses a chunked approach to handle large mapping data
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
    console.log(`[ImportService] Processing batch import with ${jobs.length} jobs using chunked approach`);
    
    try {
      // Log incoming jobs and their mappings
      console.log(`[ImportService] processBatchImport received ${jobs.length} jobs. Inspecting mappings...`);
      jobs.forEach((job, index) => {
        console.log(`[ImportService] Job ${index} (${job.sheetName}) mapping keys:`, Object.keys(job.mapping || {}));
        // Log the size of the mapping object to help diagnose size issues
        console.log(`[ImportService] Job ${index} (${job.sheetName}) mapping size:`, 
          JSON.stringify(job.mapping).length, 'bytes');
      });
      
      // Initialize results object
      const results: Record<string, ImportResult> = {};
      
      // Process each job individually
      for (const job of jobs) {
        try {
          // 1. Store mapping data in the staging table
          await this.storeJobMapping(job.id, job.mapping);
          
          // 2. Process just one sheet at a time
          const sheetData = excelData[job.sheetName] || [];
          console.log(`[ImportService] Processing sheet ${job.sheetName} with ${sheetData.length} rows`);
          
          // Log sample data for debugging (first row only)
          if (sheetData.length > 0) {
            console.log(`[ImportService] Sample data for ${job.sheetName}:`, 
              JSON.stringify(sheetData[0], null, 2));
          }
          
          const jobResult = await this.processIndividualJob(
            job.id,
            sheetData,
            createMissingColumns
          );
          
          // Store the result
          results[job.sheetName] = jobResult;
        } catch (error: any) {
          console.error(`[ImportService] Error processing job for sheet ${job.sheetName}:`, error);
          
          // Create error result for this job
          results[job.sheetName] = {
            success: false,
            message: `Import failed: ${error.message || 'Unknown error'}`,
            rowCount: 0
          };
          
          // Update job status
          await this.updateJobStatus(
            job.id,
            'failed',
            0,
            error.message || 'Unknown error during import'
          );
        }
      }
      
      // Return combined results from all jobs
      return results;
    } catch (error: any) {
      console.error(`[ImportService] Error in processBatchImport:`, error);
      
      // Create error results for all jobs
      const errorResults: Record<string, ImportResult> = {};
      for (const job of jobs) {
        errorResults[job.sheetName] = {
          success: false,
          message: `Import failed: ${error.message || 'Unknown error'}`,
          rowCount: 0
        };
        
        // Update job status
        await this.updateJobStatus(
          job.id,
          'failed',
          0,
          error.message || 'Unknown error during import'
        );
      }
      
      return errorResults;
    }
  }
  
  /**
   * Store job mapping in staging table to avoid RPC size limitations
   * @param jobId - ID of the import job
   * @param mapping - Mapping data to store
   */
  private async storeJobMapping(
    jobId: string, 
    mapping: Record<string, ColumnMapping>
  ): Promise<void> {
    try {
      console.log(`[ImportService] Storing mapping for job ${jobId} in staging table`);
      
      // Import supabaseClient directly to use direct table operations
      const { supabaseClient } = await import('../../../utility/supabaseClient');
      
      // Store the mapping in the staging table using upsert
      const { error } = await supabaseClient
        .from('import_job_mappings')
        .upsert({ 
          job_id: jobId, 
          mapping 
        });
      
      // Check for errors
      if (error) {
        console.error(`[ImportService] Error storing mapping for job ${jobId}:`, error);
        
        // Special handling for schema cache errors
        if (error.message.includes('SCHEMA CACHE ERROR') ||
            error.message.includes('relation "import_job_mappings" does not exist')) {
          console.error('==========================================================');
          console.error('SCHEMA CACHE ERROR DETECTED OR TABLE NOT CREATED YET');
          console.error('Error details:', error);
          console.error('Attempting to run migration for import_job_mappings table...');
          
          // Try to run the migration to create the table
          try {
            await applyMigration('017_import_job_mappings_staging.sql');
            console.log('Migration applied. Retrying operation in 2 seconds...');
            
            // Wait 2 seconds for the operation to complete
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Retry the operation
            const retryResult = await supabaseClient
              .from('import_job_mappings')
              .upsert({ 
                job_id: jobId, 
                mapping 
              });
            
            if (retryResult.error) {
              console.error('Retry failed after migration:', retryResult.error);
              throw new Error(`Failed to store mapping after migration: ${retryResult.error.message}`);
            }
            
            console.log('Mapping stored successfully after migration!');
            return;
          } catch (migrationError) {
            console.error('Migration failed:', migrationError);
            throw new Error(`Failed to create staging table: ${error.message}`);
          }
        }
        
        throw new Error(`Failed to store mapping: ${error.message}`);
      }
      
      console.log(`[ImportService] Mapping stored successfully for job ${jobId}`);
    } catch (error: any) {
      console.error(`[ImportService] Error in storeJobMapping:`, error);
      throw new Error(`Failed to store mapping: ${error.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Process a single job with data from the staging table
   * @param jobId - ID of the import job
   * @param sheetData - Data from the Excel sheet
   * @param createMissingColumns - Whether to create missing columns automatically
   * @returns Result of the import operation
   */
  private async processIndividualJob(
    jobId: string,
    sheetData: Record<string, any>[],
    createMissingColumns: boolean
  ): Promise<ImportResult> {
    try {
      console.log(`[ImportService] Processing individual job ${jobId} with ${sheetData.length} rows`);
      
      // Import supabaseClient directly to use RPC
      const { supabaseClient } = await import('../../../utility/supabaseClient');
      
      // Call the process_individual_job RPC function
      const { data, error } = await supabaseClient.rpc('process_individual_job', {
        p_job_id: jobId,
        p_data: sheetData,
        p_create_missing_columns: createMissingColumns
      });
      
      // Check for errors
      if (error) {
        console.error(`[ImportService] RPC error processing job ${jobId}:`, error);
        
        // Special handling for schema cache errors
        if (error.message.includes('SCHEMA CACHE ERROR') ||
            error.message.includes('function process_individual_job') ||
            error.code === 'PGRST202') {
          console.error('==========================================================');
          console.error('SCHEMA CACHE ERROR DETECTED FOR PROCESSING FUNCTION');
          console.error('Error details:', error);
          console.error('Attempting to refresh schema cache automatically...');
          
          try {
            // Try to refresh the schema cache
            await supabaseClient.rpc('refresh_schema_cache');
            
            // Also try to notify PostgREST to reload schema
            await supabaseClient.rpc('exec_sql', {
              sql: "SELECT pg_notify('pgrst', 'reload schema');"
            });
            
            console.log('Schema cache refresh attempted. Retrying operation in 2 seconds...');
            
            // Wait 2 seconds for the cache to refresh
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Retry the operation
            const retryResult = await supabaseClient.rpc('process_individual_job', {
              p_job_id: jobId,
              p_data: sheetData,
              p_create_missing_columns: createMissingColumns
            });
            
            if (retryResult.error) {
              console.error('Retry failed after schema cache refresh:', retryResult.error);
              throw new Error(`Failed to process job after schema refresh: ${retryResult.error.message}`);
            }
            
            console.log('Retry successful after schema cache refresh!');
            return this.convertRpcResultToImportResult(retryResult.data);
          } catch (refreshError) {
            console.error('Schema cache refresh failed:', refreshError);
            throw new Error(`Schema cache refresh failed: ${error.message}`);
          }
        }
        
        // Update job status to failed
        await this.updateJobStatus(
          jobId,
          'failed',
          0,
          `RPC error: ${error.message || 'Unknown error'}`
        );
        
        return {
          success: false,
          message: `Import failed: ${error.message || 'Unknown RPC error'}`,
          rowCount: 0
        };
      }
      
      // Process successful result
      console.log(`[ImportService] RPC individual job processed successfully:`, data);
      
      // Convert RPC result to expected format
      return this.convertRpcResultToImportResult(data);
    } catch (error: any) {
      console.error(`[ImportService] Error in processIndividualJob:`, error);
      
      // Update job status to failed
      await this.updateJobStatus(
        jobId,
        'failed',
        0,
        error.message || 'Unknown error during import'
      );
      
      return {
        success: false,
        message: `Import failed: ${error.message || 'Unknown error'}`,
        rowCount: 0
      };
    }
  }
  
  /**
   * Convert RPC result to ImportResult format
   * @param data - Data returned from RPC function
   * @returns Formatted import result
   */
  private convertRpcResultToImportResult(data: any): ImportResult {
    if (!data) {
      return {
        success: false,
        message: 'No result returned from RPC function',
        rowCount: 0
      };
    }
    
    return {
      success: data.success || false,
      message: data.message || 'No result message',
      rowCount: data.rowCount || 0
    };
  }

  /**
   * Apply schema changes (add columns) based on proposals.
   * @param tableName - Target table name
   * @param proposals - Array of NewColumnProposal objects
   * @returns Result indicating success and columns created
   */
  private async applySchemaChanges(
    tableName: string,
    proposals: NewColumnProposal[]
  ): Promise<{ success: boolean; message: string; columnsCreated?: string[] }> {
    if (!proposals || proposals.length === 0) {
      return { success: true, message: 'No schema changes proposed.' };
    }

    console.log(`[ImportService] Applying schema changes for ${tableName} using add_columns_batch RPC`);

    // DEBUG: Log the raw proposals to check their types
    console.log(`[ImportService] Raw schema proposals for ${tableName}:`,
      JSON.stringify(proposals.map(p => ({
        column: p.details.columnName,
        type: p.details.sqlType,
        sourceHeader: p.details.sourceHeader
      })), null, 2));

    try {
      // Transform the proposals to the format expected by add_columns_batch
      const transformedColumns = proposals.map(col => {
        // NOTE: We no longer need to handle pipe-delimited values as there are no actual pipe-delimited values in the data
        // The pipe character in debug logs is just for displaying sample values and is not part of the data
        const isPipeDelimited = false; // Previously was checking for pipe characters

        // Override type if needed
        let finalType = col.details.sqlType || 'TEXT';
        if (isPipeDelimited) {
          console.log(`[ImportService] FORCE OVERRIDE: Setting column ${col.details.columnName} to TEXT type (contains pipe-delimited data)`);
          finalType = 'TEXT';
        }

        // Add special handling for numeric fields that need to be stored as text
        if (col.details.preserveAsText && finalType === 'NUMERIC') {
          console.log(`[ImportService] Column ${col.details.columnName} marked 'preserveAsText' - forcing TEXT type`);
          finalType = 'TEXT';
        }

        return {
          name: col.details.columnName,
          type: finalType
        };
      });

      // DEBUG: Log the transformed columns to verify types before SQL execution
      console.log(`[ImportService] Transformed columns for ${tableName}:`,
        JSON.stringify(transformedColumns, null, 2));

      // Call the add_columns_batch RPC
      const { data, error } = await supabaseClient.rpc('add_columns_batch', {
        p_table_name: tableName,
        p_columns: transformedColumns
      });

      console.log('[ImportService] add_columns_batch RPC result:', data);
      
      // Check for errors
      if (error) {
        const errorMsg = error.message || JSON.stringify(error);
        console.error(`[ImportService] Error adding columns to ${tableName}:`, errorMsg);
        return {
          success: false,
          message: `Failed to add columns to ${tableName}: ${errorMsg}`
        };
      }
      
      // Check the result format from the RPC
      if (data && data.success) {
        // Extract the list of columns that were actually created
        const createdColumns = proposals
          .filter((_, index) => {
            // If we have column-specific results, filter based on the 'added' flag
            if (data.columns && Array.isArray(data.columns) && data.columns[index]) {
              return data.columns[index].added === true;
            }
            // Otherwise assume all were created
            return true;
          })
          .map(p => p.details.columnName);
        
        return {
          success: true,
          message: `Successfully added columns to ${tableName}.`,
          columnsCreated: createdColumns
        };
      } else {
        const errorMsg = data?.error || 'Unknown error';
        console.error(`[ImportService] Failed to add columns to ${tableName}: ${errorMsg}`);
        return {
          success: false,
          message: `Failed to add columns to ${tableName}: ${errorMsg}`
        };
      }
    } catch (error) {
      console.error(`[ImportService] Error applying schema changes for ${tableName}:`, error);
      return {
        success: false,
        message: `Error applying schema changes: ${error instanceof Error ? error.message : String(error)}`
      };
    }
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
      // Import supabaseClient directly to use RPC
      const { supabaseClient } = await import('../../../utility/supabaseClient');
      
      // Use RPC function to update job status
      const { error } = await supabaseClient.rpc('update_import_job_status', {
        p_job_id: jobId,
        p_status: status,
        p_processed_rows: processedRows,
        p_error_message: errorMessage || null
      });
      
      // Check for errors
      if (error) {
        console.error(`[ImportService] Error updating job status for ${jobId}:`, error);
        
        // Log schema cache errors more prominently but don't throw
        if (error.message.includes('SCHEMA CACHE ERROR')) {
          console.error('==========================================================');
          console.error('SCHEMA CACHE ERROR DETECTED DURING STATUS UPDATE');
          console.error('Please reload the schema cache in the Supabase Dashboard');
          console.error('(SQL Editor -> Schema -> Reload)');
          console.error('==========================================================');
        }
        // Don't throw here to avoid breaking the main import flow
      }
    } catch (error) {
      console.error(`[ImportService] Error updating job status for ${jobId}:`, error);
      // Don't throw here to avoid breaking the main import flow
    }
  }
  
  /**
   * Create a new import job record
   * @param job - Import job details
   * @returns Promise resolving to job ID
   */
  async createImportJob(
    job: Omit<ImportJob, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'processedRows' | 'userId'>
  ): Promise<string> {
    try {
      console.log(`[ImportService] Creating import job for sheet ${job.sheetName} using RPC function`);
      
      // Import supabaseClient directly to use RPC
      const { supabaseClient } = await import('../../../utility/supabaseClient');
      
      // Call the create_import_job RPC function with the new signature (no user_id parameter)
      const { data, error } = await supabaseClient.rpc('create_import_job', {
        p_file_name: job.fileName,
        p_table_name: job.tableName,
        p_sheet_name: job.sheetName,
        p_mapping: job.mapping,
        p_total_rows: job.totalRows,
        p_new_column_proposals: job.newColumnProposals || null
      });
      
      // Check for errors
      if (error) {
        console.error(`[ImportService] RPC error during job creation:`, error);
        
        // Special handling for schema cache errors
        if (error.message.includes('SCHEMA CACHE ERROR') ||
            error.message.includes('Could not find the function') ||
            error.code === 'PGRST202') {
          console.error('==========================================================');
          console.error('SCHEMA CACHE ERROR DETECTED DURING JOB CREATION');
          console.error('Error details:', error);
          console.error('Attempting to refresh schema cache automatically...');
          
          try {
            // Import supabaseClient directly to use RPC
            const { supabaseClient } = await import('../../../utility/supabaseClient');
            
            // Try to refresh the schema cache
            await supabaseClient.rpc('refresh_schema_cache');
            
            // Also try to notify PostgREST to reload schema
            await supabaseClient.rpc('exec_sql', {
              sql: "SELECT pg_notify('pgrst', 'reload schema');"
            });
            
            console.log('Schema cache refresh attempted. Retrying operation in 2 seconds...');
            
            // Wait 2 seconds for the cache to refresh
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Retry the operation with updated signature (no user_id parameter)
            const retryResult = await supabaseClient.rpc('create_import_job', {
              p_file_name: job.fileName,
              p_table_name: job.tableName,
              p_sheet_name: job.sheetName,
              p_mapping: job.mapping,
              p_total_rows: job.totalRows,
              p_new_column_proposals: job.newColumnProposals || null
            });
            
            if (retryResult.error) {
              console.error('Retry failed after schema cache refresh:', retryResult.error);
              throw new Error(`Failed to create import job after schema refresh: ${retryResult.error.message}`);
            }
            
            console.log('Retry successful after schema cache refresh!');
            return retryResult.data;
          } catch (refreshError) {
            console.error('Schema cache refresh failed:', refreshError);
            console.error('Please reload the schema cache in the Supabase Dashboard');
            console.error('(SQL Editor -> Schema -> Reload)');
          }
          
          console.error('==========================================================');
        }
        
        throw new Error(`Failed to create import job: ${error.message}`);
      }
      
      // Check if we got a valid result with an ID
      if (data) {
        console.log(`[ImportService] Successfully created import job with ID: ${data}`);
        return data;
      }
      
      // If we get here, we couldn't get an ID
      throw new Error('Failed to create import job: No ID returned from RPC function');
    } catch (error: any) {
      console.error('Error creating import job:', error);
      throw new Error(`Failed to create import job: ${error.message || 'Unknown error'}`);
    }
  }
  
  /**
   * Process a single import job
   * @param jobId - Job ID to process
   * @returns Promise resolving to success status
   */
  async processImportJob(jobId: string): Promise<{ success: boolean, message: string }> {
    try {
      // Update job status to processing
      await this.updateJobStatus(jobId, 'processing', 0);
      
      // Fetch job details
      const jobQuery = `
        SELECT * FROM import_jobs WHERE id = '${jobId}';
      `;
      
      const jobResult = await executeSql(jobQuery);
      
      // Check for errors
      if (jobResult.error) {
         console.error(`Error fetching job details for ${jobId}:`, jobResult.error);
         
         // Special handling for schema cache errors
         if (jobResult.error.message.includes('SCHEMA CACHE ERROR')) {
           console.error('==========================================================');
           console.error('SCHEMA CACHE ERROR DETECTED DURING JOB PROCESSING');
           console.error('Please reload the schema cache in the Supabase Dashboard');
           console.error('(SQL Editor -> Schema -> Reload)');
           console.error('==========================================================');
         }
         
         // Update job status to failed
         await this.updateJobStatus(
           jobId,
           'failed',
           0,
           `Failed to fetch job details: ${jobResult.error.message}`
         );
         
         return {
           success: false,
           message: `Failed to fetch job details: ${jobResult.error.message}`
         };
      }
      
      // Check if we got a valid job
      if (!jobResult.data || !jobResult.data.length) {
        // Update job status to failed
        await this.updateJobStatus(
          jobId,
          'failed',
          0,
          'Job not found'
        );
        
        return {
          success: false,
          message: 'Job not found'
        };
      }
      
      const job = jobResult.data[0];
      
      // TODO: Implement actual job processing logic here
      // For now, just mark as completed
      
      // Update job status to completed
      await this.updateJobStatus(jobId, 'completed', job.total_rows);
      
      return {
        success: true,
        message: `Job ${jobId} processed successfully`
      };
    } catch (error: any) {
      console.error(`Error processing import job ${jobId}:`, error);
      
      // Update job status to failed
      await this.updateJobStatus(
        jobId,
        'failed',
        0,
        error.message || 'Unknown error during job processing'
      );
      
      return {
        success: false,
        message: `Failed to process job: ${error.message || 'Unknown error'}`
      };
    }
  }
  
  /**
   * Clean up mapping data from staging table
   * @param days - Number of days to keep data for (default: 7)
   */
  async cleanupMappingData(days: number = 7): Promise<void> {
    try {
      console.log(`[ImportService] Cleaning up mapping data older than ${days} days`);
      
      // Import supabaseClient directly to use RPC
      const { supabaseClient } = await import('../../../utility/supabaseClient');
      
      // Call the cleanup function
      const { error } = await supabaseClient.rpc('cleanup_import_job_mappings', {
        p_days: days
      });
      
      // Check for errors
      if (error) {
        console.error(`[ImportService] Error cleaning up mapping data:`, error);
        // Don't throw to avoid breaking other processes
      } else {
        console.log(`[ImportService] Successfully cleaned up old mapping data`);
      }
    } catch (error) {
      console.error(`[ImportService] Error in cleanupMappingData:`, error);
      // Don't throw to avoid breaking other processes
    }
  }
}