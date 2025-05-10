/**
 * Hooks for the BatchImporter component
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useBatchImportStore, SheetMapping } from '../../store/batchImportStore';
import { supabaseClient } from '../../utility/supabaseClient';
import { inferColumnType } from './dataTypeInference';
import { calculateSimilarity, normalizeString, normalizeForDb } from './utils/stringUtils';

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

      console.log('Loading tables from database...');
      const { data, error } = await supabaseClient
        .rpc('get_user_tables');

      if (error) {
        console.error('RPC Error:', error);
        throw error;
      }

      // Map returned data to expected format
      const processedTables = (data || []).map(table => ({
        name: table.name,
        schema: table.schema,
        columns: Array.isArray(table.columns) ? table.columns : [],
        description: table.description
      }));

      console.log('Loaded tables:', processedTables.length);
      setTables(processedTables);
    } catch (err) {
      console.error('Error loading table metadata:', err);
      setError(err instanceof Error ? err.message : 'Failed to load table metadata');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Load tables on mount
  useEffect(() => {
    loadTables();
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

    // Check for exact matches first
    const exactMatch = dbTables.find(table =>
      normalizeString(table.name) === normalizedSheetName
    );

    if (exactMatch) {
      return {
        tableName: exactMatch.name,
        confidence: 100
      };
    }

    // Calculate similarity scores for all tables
    const matches = dbTables.map(table => {
      const similarity = calculateSimilarity(sheetName, table.name);
      return {
        tableName: table.name,
        confidence: similarity
      };
    });

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    // For debugging
    console.log(`Table matches for "${sheetName}":`, matches.slice(0, 3));

    // Only return matches with high confidence (≥95% per spec)
    if (matches.length > 0 && matches[0].confidence >= 95) {
      return matches[0];
    }

    // Return best match if confidence is high enough for suggestion (not auto-selection)
    return matches[0]?.confidence >= 70 ? {
      ...matches[0],
      isAutoMatch: false // Flag that this is a suggestion, not auto-match
    } : null;
  }, [dbTables]);
  
  // Find best matching columns for a sheet
  const findMatchingColumns = useCallback((sheet: SheetMapping, tableName: string) => {
    // Find table schema
    const table = dbTables.find(t => t.name === tableName);
    if (!table) return [];
    
    const matches = sheet.columns.map(column => {
      // Find best matching DB column
      const columnMatches = table.columns.map((dbColumn: any) => {
        const similarity = calculateSimilarity(column.originalName, dbColumn.name);
        return {
          columnName: dbColumn.name,
          dataType: dbColumn.type,
          confidence: similarity
        };
      });
      
      // Sort by confidence
      columnMatches.sort((a: any, b: any) => b.confidence - a.confidence);
      
      // Get best match if confidence is high enough
      const bestMatch = columnMatches[0]?.confidence >= 70 ? columnMatches[0] : null;
      
      return {
        ...column,
        mappedName: bestMatch ? bestMatch.columnName : normalizeForDb(column.originalName),
        dataType: bestMatch ? bestMatch.dataType : column.dataType,
        confidence: bestMatch ? bestMatch.confidence : 0
      };
    });
    
    return matches;
  }, [dbTables]);
  
  return { findBestMatchingTable, findMatchingColumns };
};

/**
 * Hook to load and manage mapping templates
 */
export const useMappingTemplates = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Load templates from database
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabaseClient
        .from('mapping_templates')
        .select('*')
        .order('createdAt', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      setTemplates(data || []);
    } catch (err) {
      console.error('Error loading mapping templates:', err);
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Save a template
  const saveTemplate = useCallback(async (template: any) => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabaseClient
        .from('mapping_templates')
        .insert(template)
        .select()
        .single();
      
      if (error) {
        throw error;
      }
      
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
  
  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);
  
  return { 
    templates, 
    loading, 
    error, 
    loadTemplates, 
    saveTemplate 
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
    headerRow, 
    setProgress 
  } = useBatchImportStore();
  const { importDataInWorker } = useImportWorker();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Execute import
  const executeImport = useCallback(async () => {
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
      
      // Process import in worker
      const results = await importDataInWorker(fileData, sheets, headerRow);
      
      // Update results in store
      setImportResults({
        success: true,
        ...results
      });
      
      // Update progress
      setProgress({
        stage: 'complete',
        message: 'Import completed successfully',
        percent: 100
      });
      
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
  }, [fileData, sheets, headerRow, importDataInWorker, setImportResults, setProgress]);
  
  return { executeImport, loading, error };
};