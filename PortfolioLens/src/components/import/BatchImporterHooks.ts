/**
 * Hooks for the BatchImporter component
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useBatchImportStore, SheetMapping } from '../../store/batchImportStore';
import { supabaseClient } from '../../utility/supabaseClient';
import { inferColumnType } from './dataTypeInference';
import { calculateSimilarity, normalizeString, normalizeForDb, normalizeName } from './utils/stringUtils';

/**
 * Hook to load database table metadata
 */
export const useTableMetadata = () => {
  const [tables, setTables] = useState<{ name: string; columns: any[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Load table metadata from Supabase
  const loadTables = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // // console.log('Loading tables from database...');
      const { data, error } = await supabaseClient
        .rpc('get_user_tables');

      if (error) {
        // // console.error('RPC Error:', error);
        throw error;
      }

      // Map returned data to expected format
      const processedTables = (data || []).map(table => ({
        name: table.name,
        schema: table.schema,
        columns: Array.isArray(table.columns) ? table.columns : [],
        description: table.description
      }));

      // // console.log('Loaded tables:', processedTables.length);
      setTables(processedTables);
    } catch (err) {
      // // console.error('Error loading table metadata:', err);
      setError(err instanceof Error ? err.message : 'Failed to load table metadata');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Load tables on mount
  useEffect(() => {
    loadTables();
  }, [loadTables]);
  
  // Set up event listener for schema cache refresh events
  useEffect(() => {
    const handleSchemaRefresh = (event: Event) => {
      // // console.log('Schema cache refresh event detected, reloading tables...');
      loadTables();
    };
    
    // Listen for the custom event we dispatch when schema cache is refreshed
    window.addEventListener('schema-cache-refreshed', handleSchemaRefresh);
    
    // Clean up the event listener on unmount
    return () => {
      window.removeEventListener('schema-cache-refreshed', handleSchemaRefresh);
    };
  }, [loadTables]);
  
  return { tables, loading, error, reload: loadTables };
};

/**
 * Hook to handle WebWorker for background processing
 */
export const useImportWorker = () => {
  const workerRef = useRef<Worker | null>(null);
  const { setProgress } = useBatchImportStore();
  
  // Initialize worker
  useEffect(() => {
    // Create worker
    workerRef.current = new Worker(
      new URL('./workers/batchImport.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    // Clean up on unmount
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);
  
  // Process file in worker
  const processFileInWorker = useCallback(async (
    file: ArrayBuffer,
    options: any
  ) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }
      
      // Handle worker messages
      const handleMessage = (event: MessageEvent) => {
        const { type, ...data } = event.data;
        
        if (type === 'progress') {
          setProgress(data);
        } else if (type === 'result') {
          resolve(data);
          cleanup();
        } else if (type === 'error') {
          reject(new Error(data.error));
          cleanup();
        }
      };
      
      // Clean up event listeners
      const cleanup = () => {
        if (workerRef.current) {
          workerRef.current.removeEventListener('message', handleMessage);
        }
      };
      
      // Set up event listener
      workerRef.current.addEventListener('message', handleMessage);
      
      // Send message to worker
      workerRef.current.postMessage({
        action: 'read_excel_file',
        payload: { file, options }
      });
    });
  }, [setProgress]);
  
  // Process mapping in worker
  const processMappingInWorker = useCallback(async (
    sheets: SheetMapping[],
    mappingRules: any,
    headerRow: number
  ) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }
      
      // Handle worker messages
      const handleMessage = (event: MessageEvent) => {
        const { type, ...data } = event.data;
        
        if (type === 'progress') {
          setProgress(data);
        } else if (type === 'mapping_result') {
          resolve(data);
          cleanup();
        } else if (type === 'error') {
          reject(new Error(data.error));
          cleanup();
        }
      };
      
      // Clean up event listeners
      const cleanup = () => {
        if (workerRef.current) {
          workerRef.current.removeEventListener('message', handleMessage);
        }
      };
      
      // Set up event listener
      workerRef.current.addEventListener('message', handleMessage);
      
      // Send message to worker
      workerRef.current.postMessage({
        action: 'process_mapping',
        payload: { sheets, mappingRules, headerRow }
      });
    });
  }, [setProgress]);
  
  // Import data in worker
  const importDataInWorker = useCallback(async (
    file: ArrayBuffer,
    sheets: SheetMapping[],
    headerRow: number
  ) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }
      
      // Handle worker messages
      const handleMessage = (event: MessageEvent) => {
        const { type, ...data } = event.data;
        
        if (type === 'progress') {
          setProgress(data);
        } else if (type === 'import_complete') {
          resolve(data.results);
          cleanup();
        } else if (type === 'error') {
          reject(new Error(data.error));
          cleanup();
        }
      };
      
      // Clean up event listeners
      const cleanup = () => {
        if (workerRef.current) {
          workerRef.current.removeEventListener('message', handleMessage);
        }
      };
      
      // Set up event listener
      workerRef.current.addEventListener('message', handleMessage);
      
      // Send message to worker
      workerRef.current.postMessage({
        action: 'batch_import',
        payload: { file, sheets, headerRow }
      });
    });
  }, [setProgress]);
  
  return {
    processFileInWorker,
    processMappingInWorker,
    importDataInWorker
  };
};

/**
 * Hook to find the best matching table and columns
 */
export const useTableMatcher = (dbTables: any[]) => {
  // Find best matching table for a sheet
  const findBestMatchingTable = useCallback((sheetName: string) => {
    const normalizedSheetName = normalizeString(sheetName);

    // Using imported normalizeName function that strips ln_ prefix

    // Check for exact matches first (ignoring ln_ prefix)
    const exactMatch = dbTables.find(table => {
      const normalizedTableName = normalizeString(normalizeName(table.name));
      return normalizedTableName === normalizedSheetName;
    });

    if (exactMatch) {
      return {
        tableName: exactMatch.name,
        confidence: 100
      };
    }

    // Calculate similarity scores for all tables, normalizing the table names
    const matches = dbTables.map(table => {
      // Strip ln_ prefix for similarity comparison
      const normalizedTableName = normalizeName(table.name);
      const similarity = calculateSimilarity(sheetName, normalizedTableName);
      return {
        tableName: table.name,
        confidence: similarity
      };
    });

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    // For debugging
    // // console.log(`Table matches for "${sheetName}":`, matches.slice(0, 3));

    // Special case handling for known tables mapping to expenses
    if (sheetName === "Servicing Expenses" || sheetName === "Passthrough Expenses") {
      const expensesTable = matches.find(m => {
        const normalizedName = normalizeName(m.tableName);
        return normalizedName === "expenses";
      });
      if (expensesTable) {
        return {
          tableName: expensesTable.tableName,
          confidence: Math.max(expensesTable.confidence, 95) // Ensure it gets auto-approved
        };
      }
    }

    // Only return matches with high confidence (≥95% per spec)
    if (matches.length > 0 && matches[0].confidence >= 95) {
      return matches[0];
    }

    // IMPORTANT FIX: Always return the best match regardless of confidence
    // This ensures TableMappingStep always receives a potential match to process
    // If confidence is less than 70%, TableMappingStep will handle it as "no good match"
    return matches.length > 0 ? matches[0] : null;
  }, [dbTables]);

  // Helper function to validate if a column exists in the table schema
  const validateColumnExists = useCallback((tableName: string, columnName: string): boolean => {
    if (!tableName || !columnName) return false;

    // First try exact match
    let table = dbTables.find(t => t.name === tableName);
    
    // If no exact match, try normalized match (ln_ prefix agnostic)
    if (!table) {
      table = dbTables.find(t => normalizeName(t.name) === normalizeName(tableName));
    }
    
    if (!table || !table.columns) return false;

    return table.columns.some((col: any) => col.name === columnName);
  }, [dbTables]);

  // Helper function to get column metadata from schema
  const getColumnMetadata = useCallback((tableName: string, columnName: string) => {
    if (!tableName || !columnName) return null;

    // First try exact match
    let table = dbTables.find(t => t.name === tableName);
    
    // If no exact match, try normalized match (ln_ prefix agnostic)
    if (!table) {
      table = dbTables.find(t => normalizeName(t.name) === normalizeName(tableName));
    }
    
    if (!table || !table.columns) return null;

    return table.columns.find((col: any) => col.name === columnName) || null;
  }, [dbTables]);

  // Find best matching columns for a sheet
  const findMatchingColumns = useCallback((sheet: SheetMapping, tableName: string) => {
    // Check if this is a new table (isNewTable flag set)
    const isCreatingNewTable = sheet.isNewTable || sheet.wasCreatedNew || sheet.createNewValue === tableName;
    
    // Find table schema, handling ln_ prefix
    // First try exact match
    let table = dbTables.find(t => t.name === tableName);
    
    // If no exact match, try normalized match
    if (!table) {
      table = dbTables.find(t => normalizeName(t.name) === normalizeName(tableName));
      if (table) {
        // // console.log(`Found table with normalized name: ${tableName} → ${table.name}`);
      }
    }
    
    if (!table) {
      // // console.log(`No table found for: ${tableName} (with or without ln_ prefix) - treating as new table`);
      // If this is a new table but we don't have schema info, we'll infer column mappings
      if (!isCreatingNewTable) {
        return [];
      }
      // Continue for new tables - we'll create all fields as new
    }

    // Create a map of all existing column names for fast lookups
    const existingColumnMap = new Map();
    if (table && table.columns) {
      table.columns.forEach((col: any) => {
        existingColumnMap.set(col.name.toLowerCase(), col);
      });
    }

    const matches = sheet.columns.map(column => {
      // If column already has a valid mapping, preserve it but ALWAYS use the database field's data type
      if (column.mappedName && validateColumnExists(tableName, column.mappedName)) {
        const metadata = getColumnMetadata(tableName, column.mappedName);
        return {
          ...column,
          // IMPORTANT: Always use the database field type for existing fields
          dataType: metadata?.type || column.dataType,
          confidence: 100 // We trust explicit mappings
        };
      }

      // Before doing a fuzzy match, check if the column name (after basic normalization)
      // already exists exactly in the database
      const basicNormalized = column.originalName
        .toLowerCase()
        .replace(/\s+/g, '_')    // Replace spaces with underscore
        .replace(/[^\w_]/g, '_') // Replace non-alphanumeric/underscore with underscore
        .replace(/_+/g, '_')     // Replace multiple underscores with single
        .trim()
        .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

      // Check for direct match in existing columns (exact or with underscores)
      const directMatch = existingColumnMap.get(basicNormalized);
      if (directMatch) {
        return {
          ...column,
          mappedName: directMatch.name,
          dataType: directMatch.type,
          confidence: 100 // It's an exact match
        };
      }

      // Find best matching DB column for unmapped columns
      // First check for exact matches after normalization (ignoring spaces, special chars, underscores)
      const columnMatches = table.columns.map((dbColumn: any) => {
        const similarity = calculateSimilarity(column.originalName, dbColumn.name);
        return {
          columnName: dbColumn.name,
          dataType: dbColumn.type,
          confidence: Math.min(100, similarity) // Cap at 100% to avoid values over 100
        };
      });

      // Sort by confidence
      columnMatches.sort((a: any, b: any) => b.confidence - a.confidence);

      // Get best match if confidence is high enough (70% or higher)
      const bestMatch = columnMatches[0]?.confidence >= 70 ? columnMatches[0] : null;

      // If we found a high-confidence match to an existing field, ALWAYS use that field's data type
      if (bestMatch) {
        return {
          ...column,
          mappedName: bestMatch.columnName,
          dataType: bestMatch.dataType, // Use database field type for existing fields
          confidence: bestMatch.confidence
        };
      } else {
        // For new fields - handle numeric prefixes by checking if the field already exists
        const normalizedName = normalizeForDb(column.originalName);

        // Handle the case with numeric prefixes - check if there's an existing column
        // with the same name after normalization (but without the col_ prefix)
        if (table && table.columns && /^col_\d/.test(normalizedName)) {
          // Try without the col_ prefix and see if it exists in the table schema
          const unprefixedName = normalizedName.substring(4); // Remove 'col_'
          // Check if this unprefixed name exists in our database
          if (table.columns.some((col: any) => col.name === unprefixedName)) {
            return {
              ...column,
              mappedName: unprefixedName,
              dataType: existingColumnMap.get(unprefixedName)?.type || column.dataType,
              confidence: 90 // High confidence but not a perfect match
            };
          }
        }

        // Is this part of a newly created table?
        if (isCreatingNewTable) {
          // Special case for new tables - set to _create_new_ to trigger auto field creation
          // The inferred data type should be prioritized here
          const inferredType = column.inferredDataType || 
                               (column.sample && column.sample.length > 0 ? 
                                inferColumnType(column.originalName, column.sample).type : 
                                column.dataType || 'text');

          return {
            ...column,
            mappedName: '_create_new_',
            createNewValue: normalizedName, // Store normalized name for when it gets created
            dataType: inferredType, // Use the inferred type if available
            confidence: 0,
            _isNewlyCreated: true, // Mark as newly created
            needsReview: false // Auto-approve for new tables
          };
        }

        // Default case - create new field
        return {
          ...column,
          mappedName: normalizedName,
          // Keep existing data type for new fields
          confidence: 0
        };
      }
    });

    return matches;
  }, [dbTables, validateColumnExists, getColumnMetadata]);

  return {
    findBestMatchingTable,
    findMatchingColumns,
    validateColumnExists,
    getColumnMetadata
  };
};

/**
 * Hook to load and manage mapping templates using RPC functions
 */
export const useMappingTemplates = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Load templates from database using RPC
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading mapping templates using RPC...');
      
      // Use the RPC function to get templates
      const { data, error } = await supabaseClient
        .rpc('get_mapping_templates');
      
      if (error) {
        console.error('RPC error loading templates:', error);
        throw error;
      }
      
      console.log(`Successfully loaded ${data?.length || 0} templates via RPC`);
      setTemplates(data || []);
    } catch (err) {
      console.error('Error loading mapping templates:', err);
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Save a template using RPC
  const saveTemplate = useCallback(async (template: any) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Saving template via RPC:', JSON.stringify(template, null, 2));
      
      // Extract the file extension for source file type
      const sourceFileType = template.sourceFileType || 
                            (template.filePattern ? template.filePattern.split('.').pop() : 'xlsx');
      
      // Use the RPC function to create or update template with source file type parameter
      const { data, error } = template.id
        ? await supabaseClient.rpc('update_mapping_template', {
            p_id: template.id,
            p_name: template.name,
            p_description: template.description || '',
            p_servicer_id: template.servicerId,
            p_file_pattern: template.filePattern,
            p_header_row: template.headerRow || 0,
            p_table_prefix: template.tablePrefix || null,
            p_sheet_mappings: template.sheetMappings,
            p_source_file_type: sourceFileType
          })
        : await supabaseClient.rpc('create_mapping_template', {
            p_name: template.name,
            p_description: template.description || '',
            p_servicer_id: template.servicerId,
            p_file_pattern: template.filePattern,
            p_header_row: template.headerRow || 0,
            p_table_prefix: template.tablePrefix || null,
            p_sheet_mappings: template.sheetMappings,
            p_source_file_type: sourceFileType
          });
      
      if (error) {
        console.error('RPC error saving template:', error);
        throw error;
      }
      
      console.log('Template saved successfully via RPC:', data);
      
      // Refresh templates
      await loadTemplates();
      
      return data;
    } catch (err) {
      console.error('Error saving mapping template:', err);
      setError(err instanceof Error ? err.message : 'Failed to save template');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadTemplates]);
  
  // Delete a template using RPC
  const deleteTemplate = useCallback(async (templateId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Deleting template via RPC:', templateId);
      
      // Use the RPC function to delete template
      const { data, error } = await supabaseClient
        .rpc('delete_mapping_template', {
          p_id: templateId
        });
      
      if (error) {
        console.error('RPC error deleting template:', error);
        throw error;
      }
      
      console.log('Template deleted successfully via RPC:', data);
      
      // Refresh templates
      await loadTemplates();
      
      return data;
    } catch (err) {
      console.error('Error deleting mapping template:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete template');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadTemplates]);
  
  // Find a matching template using RPC
  const findMatchingTemplate = useCallback(async (fileName: string) => {
    try {
      console.log('Finding matching template via RPC for:', fileName);
      
      // Use the RPC function to find matching template
      const { data, error } = await supabaseClient
        .rpc('find_matching_template', {
          p_file_name: fileName
        });
      
      if (error) {
        console.error('RPC error finding template:', error);
        throw error;
      }
      
      console.log('Template match result via RPC:', data);
      
      return data;
    } catch (err) {
      console.error('Error finding matching template:', err);
      return null;
    }
  }, []);
  
  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);
  
  return { 
    templates, 
    loading, 
    error, 
    loadTemplates, 
    saveTemplate,
    deleteTemplate,
    findMatchingTemplate
  };
};

/**
 * Hook to handle batch import process
 */
export const useBatchImport = () => {
  const { 
    sheets, 
    setImportResults, 
    fileData, 
    fileName,
    headerRow, 
    setProgress 
  } = useBatchImportStore();
  const { importDataInWorker } = useImportWorker();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Execute import
  const executeImport = useCallback(async (templateId?: string, navigate?: (path: string) => void) => {
    if (!fileData) {
      setError('No file data available');
      return false;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Update progress
      setProgress({
        stage: 'importing',
        message: 'Starting data import...',
        percent: 5
      });
      
      // First create an import job record in the database
      // Get current user
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // Create import job entry using RPC
      // Use the actual file name, not the sheet name
      const filename = fileName || 'import_file.xlsx';
      const { data: jobData, error: jobError } = await supabaseClient.rpc('create_import_job', {
        p_filename: filename,
        p_bucket_path: `${user.id}/${filename}`,
        p_template_id: templateId || null
      });
      
      if (jobError) {
        throw new Error(`Failed to create import job: ${jobError.message}`);
      }
      
      if (!jobData) {
        throw new Error('Failed to create import job: No data returned');
      }
      
      // --- DIAGNOSTIC: Try to fetch the job immediately from client-side ---
      console.log(`[DIAGNOSTIC] Attempting to fetch job ${jobData.id} from client-side immediately after RPC.`);
      const { data: clientFetchedJob, error: clientFetchError } = await supabaseClient
        .from('import_jobs')
        .select('*')
        .eq('id', jobData.id)
        .single();

      if (clientFetchError) {
        console.error(`[DIAGNOSTIC] Error fetching job ${jobData.id} from client-side:`, clientFetchError);
        // Potentially throw or handle, but for now, just log and continue to see if Edge Function fails
      }
      if (!clientFetchedJob) {
        console.warn(`[DIAGNOSTIC] Job ${jobData.id} NOT FOUND from client-side immediately after RPC.`);
      } else {
        console.log(`[DIAGNOSTIC] Successfully fetched job ${jobData.id} from client-side:`, clientFetchedJob);
      }
      // --- END DIAGNOSTIC ---
      
      // Create a Blob from the ArrayBuffer
      const blob = new Blob([fileData], { type: 'application/octet-stream' });
      const file = new File([blob], filename, { type: 'application/octet-stream' });
      
      // Upload the file to storage
      const filePath = `${user.id}/${filename}`;
      const { error: uploadError } = await supabaseClient.storage
        .from('imports')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });
      
      if (uploadError) {
        throw new Error(`Failed to upload file: ${uploadError.message}`);
      }
      
      // Update progress
      setProgress({
        stage: 'importing',
        message: 'File uploaded, processing data...',
        percent: 30
      });
      
      // Call the Edge Function to process the import
      const { error: functionError } = await supabaseClient.functions.invoke('process-import-job', {
        body: {
          job_id: jobData.id,
          filename: filename,
          user_id: user.id
        }
      });
      
      if (functionError) {
        throw new Error(`Failed to process import: ${functionError.message}`);
      }
      
      // Poll the job status until it's completed or failed
      let jobStatus = 'pending';
      let pollCount = 0;
      const maxPolls = 30; // Maximum number of poll attempts
      
      while (jobStatus === 'pending' || jobStatus === 'processing') {
        // Wait for 2 seconds between polls
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check job status using RPC
        const { data: job, error: statusError } = await supabaseClient.rpc('get_import_job_status', {
          p_job_id: jobData.id
        });
        
        if (statusError) {
          throw new Error(`Failed to get job status: ${statusError.message}`);
        }
        
        if (!job) {
          throw new Error('Import job not found');
        }
        
        jobStatus = job.status;
        
        // Update progress based on job percent_complete
        setProgress({
          stage: jobStatus,
          message: jobStatus === 'processing' 
            ? `Processing data (${job.percent_complete || 0}%)...` 
            : jobStatus === 'completed'
            ? 'Import completed successfully'
            : 'Import in progress...',
          percent: jobStatus === 'completed' 
            ? 100 
            : Math.min(30 + ((job.percent_complete || 0) * 0.7), 99) // Scale 0-100% to 30-99%
        });
        
        // Exit if job is completed or failed
        if (jobStatus === 'completed' || jobStatus === 'error') {
          break;
        }
        
        // Prevent infinite polling
        pollCount++;
        if (pollCount >= maxPolls) {
          throw new Error('Import is taking longer than expected. Please check the jobs page for status.');
        }
      }
      
      // Handle job completion
      if (jobStatus === 'error') {
        const { data: job } = await supabaseClient
          .from('import_jobs')
          .select('*')
          .eq('id', jobData.id)
          .single();
          
        throw new Error(`Import failed: ${job?.error_message || 'Unknown error'}`);
      }
      
      // Get final job data for results using RPC
      const { data: finalJob } = await supabaseClient.rpc('get_import_job_status', {
        p_job_id: jobData.id
      });
      
      // Create results from job data
      const results = {
        successSheets: [],
        failedSheets: [],
        totalRows: finalJob?.row_counts?.total || 0,
        importedRows: finalJob?.row_counts?.processed || 0,
        errors: [],
        createdTables: finalJob?.row_counts?.tables || []
      };
      
      // Update results in store
      setImportResults({
        success: true,
        ...results
      });
      
      // Update progress to completed
      setProgress({
        stage: 'complete',
        message: 'Import completed successfully',
        percent: 100
      });
      
      // Redirect to history page if navigate function provided
      if (navigate) {
        setTimeout(() => {
          navigate('/import/history');
        }, 1500); // Give user time to see success message
      }
      
      return true;
    } catch (err) {
      console.error('Error executing import:', err);
      setError(err instanceof Error ? err.message : 'Failed to import data');
      
      // Update progress to failed state
      setProgress({
        stage: 'failed',
        message: err instanceof Error ? err.message : 'Failed to import data',
        percent: 0
      });
      
      return false;
    } finally {
      setLoading(false);
    }
  }, [fileData, fileName, sheets, headerRow, importDataInWorker, setImportResults, setProgress]);
  
  return { executeImport, loading, error };
};