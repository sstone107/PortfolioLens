import { SheetProcessingState } from './types'; // <-- ADDED Import
import * as React from 'react'; // <-- ADDED React import
import { useState, useCallback, useMemo, useEffect } from 'react';
import { DatabaseService } from './services/DatabaseService';
import { TableInfo } from './types';
import { useBatchImportStore } from '../../store/batchImportStore';

/**
 * Custom hook to manage loading and caching of database schema information.
 */
export const useSchemaInfo = () => {
  const { setSchemaCacheStatus, setError: setStoreError } = useBatchImportStore();
  const [tables, setTables] = useState<string[]>([]);
  const [tableInfoMap, setTableInfoMap] = useState<Record<string, TableInfo>>({});
  const [isLoadingTables, setIsLoadingTables] = useState(false);

  // Memoize DatabaseService instance
  const dbService = useMemo(() => new DatabaseService(), []);

  const loadSchemaInfo = useCallback(async () => {
    setIsLoadingTables(true);
    setSchemaCacheStatus('loading');
    try {
      // TODO: Replace with SchemaCacheService fetch later if available
      const fetchedTables = await dbService.getTables();
      setTables(fetchedTables);

      // Pre-load table info (can be optimized later)
      const infoMap: Record<string, TableInfo> = {};
      // Consider Promise.all for parallel fetching if dbService supports it
      for (const tableName of fetchedTables) {
        try {
          infoMap[tableName] = await dbService.getTableInfo(tableName);
        } catch (infoError) {
          console.warn(`Failed to preload info for ${tableName}:`, infoError);
          // Optionally store partial results or handle errors differently
        }
      }
      setTableInfoMap(infoMap);
      setSchemaCacheStatus('ready');
      console.log('Schema info loaded.');
    } catch (error) {
      console.error('Error loading schema info:', error);
      setStoreError(`Error loading database schema: ${error instanceof Error ? error.message : String(error)}`);
      setSchemaCacheStatus('error');
    } finally {
      setIsLoadingTables(false);
    }
  }, [dbService, setSchemaCacheStatus, setStoreError]);

  // Load schema on initial hook mount
  useEffect(() => {
    loadSchemaInfo();
  }, [loadSchemaInfo]);

  return {
    tables,
    tableInfoMap,
    isLoadingTables,
    loadSchemaInfo, // Expose reload function if needed
};
}
/**
 * Custom hook to manage the Web Worker for batch import processing.
 */
export const useBatchImportWorker = (
    tableInfoMap: Record<string, TableInfo> // Pass tableInfoMap as argument
) => {
    const workerRef = React.useRef<Worker | null>(null);
    const {
        sheets,
        globalStatus,
        schemaCacheStatus,
        // Removed tableInfoMap from store destructuring
        updateSheetSuggestions: _updateSheetSuggestions,
        setSheetCommitStatus: _setSheetCommitStatus,
        setError: _setError,
    } = useBatchImportStore();

    // Initialize worker and setup message/error handlers
    useEffect(() => {
        workerRef.current = new Worker(new URL('./workers/batchImport.worker.ts', import.meta.url), { type: 'module' });
        console.log('[DEBUG useBatchImportWorker] Worker initialized.');

        workerRef.current.onmessage = (event: MessageEvent<any>) => {
            console.log('[DEBUG useBatchImportWorker] Received message from worker:', {
                status: event.data?.status,
                sheetName: event.data?.sheetProcessingState?.sheetName,
                tableSuggestionsCount: event.data?.sheetProcessingState?.tableSuggestions?.length,
                columnMappingsCount: event.data?.sheetProcessingState?.columnMappings ? Object.keys(event.data.sheetProcessingState.columnMappings).length : 0,
                hasTableConfidenceScore: event.data?.sheetProcessingState?.tableConfidenceScore !== undefined,
                hasSchemaProposals: event.data?.sheetProcessingState?.sheetSchemaProposals !== undefined,
                error: event.data?.error
            });
            
            // Destructure based on the actual worker result structure
            const { sheetProcessingState, status, error } = event.data;

            if (!sheetProcessingState && status !== 'error') {
                console.error('[DEBUG useBatchImportWorker] Received invalid message structure from worker:', event.data);
                _setError('Received invalid data from processing worker.');
                return;
            }

            const sheetName = sheetProcessingState?.sheetName || 'unknown sheet'; // Get sheetName safely
            console.log(`[DEBUG useBatchImportWorker] Processing result for sheet: ${sheetName}, Status: ${status}`);

            if (status === 'processed' && sheetProcessingState) {
                console.log(`[DEBUG useBatchImportWorker] Calling _updateSheetSuggestions for ${sheetName}`, {
                    tableSuggestions: sheetProcessingState.tableSuggestions?.map((s: RankedTableSuggestion) => ({
                        tableName: s.tableName,
                        confidenceScore: s.confidenceScore,
                        confidenceLevel: s.confidenceLevel,
                        isNewTableProposal: s.isNewTableProposal
                    })),
                    tableConfidenceScore: sheetProcessingState.tableConfidenceScore,
                    hasColumnMappings: !!sheetProcessingState.columnMappings,
                    hasSchemaProposals: !!sheetProcessingState.sheetSchemaProposals
                });
                
                // Call store action with correct arguments from sheetProcessingState
                _updateSheetSuggestions(
                    sheetProcessingState.sheetName,
                    sheetProcessingState.tableSuggestions || [],
                    sheetProcessingState.columnMappings || {},
                    sheetProcessingState.tableConfidenceScore, // Pass confidence score
                    sheetProcessingState.sheetSchemaProposals // Pass schema proposals
                );
                // NOTE: updateSchemaProposals is now handled within _updateSheetSuggestions in the store
                // if (sheetProcessingState.sheetSchemaProposals) {
                //     useBatchImportStore.getState().updateSchemaProposals(sheetProcessingState.sheetName, sheetProcessingState.sheetSchemaProposals);
                // }

                 // Update sheet status based on worker result (e.g., needsReview, ready)
                 // This might be redundant if _updateSheetSuggestions already sets it to 'needsReview'
                 console.log(`[DEBUG useBatchImportWorker] Calling _setSheetCommitStatus for ${sheetName} with status: ${sheetProcessingState.status}`);
                 _setSheetCommitStatus(sheetProcessingState.sheetName, sheetProcessingState.status); // Use status from worker result

            } else if (status === 'error') {
                console.error(`[DEBUG useBatchImportWorker] Worker reported error for sheet ${sheetName}:`, error);
                _setSheetCommitStatus(sheetName, 'error', `Worker processing failed: ${error}`);
            } else {
                 console.warn(`[DEBUG useBatchImportWorker] Received unhandled message status: ${status} for sheet ${sheetName}`);
            }
        };

        workerRef.current.onerror = (error) => {
            console.error('[DEBUG useBatchImportWorker] Worker onerror:', error);
            _setError(`Worker error: ${error.message}`);
            // Potentially set global status to error?
        };

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                console.log('[DEBUG useBatchImportWorker] Worker terminated.');
                workerRef.current = null;
            }
        };
    }, [_updateSheetSuggestions, _setSheetCommitStatus, _setError]); // Dependencies are store actions

    // Function to post a single task to the worker
    const postWorkerTask = useCallback((sheet: SheetProcessingState) => {
        if (workerRef.current && schemaCacheStatus === 'ready') {
            console.log(`[DEBUG useBatchImportWorker] Posting task for sheet "${sheet.sheetName}" to worker. Selected Table: ${sheet.selectedTable}`);
            const schemaCacheData = { tables: tableInfoMap }; // Use passed argument
            const taskData = {
                sheetName: sheet.sheetName,
                headers: sheet.headers,
                sampleData: sheet.sampleData, // Consider limiting sample data size if large
                schemaCache: schemaCacheData,
                selectedTable: sheet.selectedTable, // Pass the current selected table
            };
            // Log task data without large arrays
            console.log('[DEBUG useBatchImportWorker] Task Data:', { ...taskData, sampleData: `(${taskData.sampleData?.length ?? 0} rows)`, schemaCache: `(${Object.keys(taskData.schemaCache?.tables ?? {}).length} tables)` });
            workerRef.current.postMessage(taskData);
            // Optionally update sheet status to 'processing'
            console.log(`[DEBUG useBatchImportWorker] Setting sheet "${sheet.sheetName}" status to 'processing'`);
            _setSheetCommitStatus(sheet.sheetName, 'processing'); // Set status to processing
        } else {
            console.warn(`[DEBUG useBatchImportWorker] Cannot post task for "${sheet.sheetName}". Worker ready: ${!!workerRef.current}, Schema ready: ${schemaCacheStatus === 'ready'}`);
            // Optionally set sheet status to error if it couldn't be posted?
            // _setSheetCommitStatus(sheet.sheetName, 'error', 'Failed to initiate processing.');
        }
    }, [schemaCacheStatus, tableInfoMap, _setSheetCommitStatus]); // Added _setSheetCommitStatus dependency

    // Effect to automatically post tasks when file reading is complete and schema is ready
    useEffect(() => {
        console.log(`[DEBUG useBatchImportWorker] Checking conditions for auto-posting tasks - Schema: ${schemaCacheStatus}, Global Status: ${globalStatus}`);
        
        // Only proceed if schema is ready and global status indicates file reading is complete
        if (schemaCacheStatus === 'ready' && globalStatus === 'fileReadComplete') {
            console.log('[DEBUG useBatchImportWorker] Schema ready and file reading complete. Checking for pending sheets...');
            
            // Get the current sheets from the store
            const currentSheets = Object.values(sheets);
            let tasksPosted = 0;
            
            // Post tasks for all pending sheets
            currentSheets.forEach(sheet => {
                if (sheet.status === 'pending') {
                    console.log(`[DEBUG useBatchImportWorker] Auto-posting task for pending sheet: "${sheet.sheetName}"`);
                    postWorkerTask(sheet);
                    tasksPosted++;
                }
            });
            
            console.log(`[DEBUG useBatchImportWorker] Auto-posted ${tasksPosted} tasks after file read completion.`);
            
            // If tasks were posted, update global status to analyzing
            if (tasksPosted > 0) {
                console.log('[DEBUG useBatchImportWorker] Setting global status to analyzing');
                useBatchImportStore.getState().setGlobalStatus('analyzing');
            }
        }
    }, [schemaCacheStatus, globalStatus, sheets, postWorkerTask]);

    // Return the function to post tasks manually (still needed for re-processing on table change)
    return { postWorkerTask };
};


// Add other hooks here as needed (e.g., useImportStepper, etc.)