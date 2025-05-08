import { SheetProcessingState, RankedTableSuggestion } from './types'; // <-- ADDED Import + RankedTableSuggestion
import * as React from 'react'; // <-- ADDED React import
import { useState, useCallback, useMemo, useEffect } from 'react';
import { DatabaseService } from './services/DatabaseService';
import { TableInfo } from './types';
import { useBatchImportStore } from '../../store/batchImportStore';
import { shallow } from 'zustand/shallow';

/**
 * Custom hook to manage loading and caching of database schema information.
 */
export const useSchemaInfo = () => {
  // Get store actions directly from getState to avoid subscription and re-renders
  const { setSchemaCacheStatus, setError } = useBatchImportStore.getState();

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
          console.error(`[useSchemaInfo] Error loading table info for ${tableName}:`, infoError);
          infoMap[tableName] = null as any; // Explicitly set to null on error
        }
      }
      setTableInfoMap(infoMap);
      setSchemaCacheStatus('ready');
    } catch (error) {
      setError(`Error loading database schema: ${error instanceof Error ? error.message : String(error)}`);
      setSchemaCacheStatus('error');
    } finally {
      setIsLoadingTables(false);
    }
  }, [dbService]); // Only depend on dbService, not on store actions

  // Load schema on initial hook mount
  useEffect(() => {
    loadSchemaInfo();
  }, [loadSchemaInfo]);

  // Return a stable reference to the state object
  return useMemo(() => ({
    tables,
    tableInfoMap,
    isLoadingTables,
    loadSchemaInfo,
  }), [tables, tableInfoMap, isLoadingTables, loadSchemaInfo]);
}
/**
 * Custom hook to manage the Web Worker for batch import processing.
 */
export const useBatchImportWorker = (
    tableInfoMap: Record<string, TableInfo> // Pass tableInfoMap as argument
) => {
    const workerRef = React.useRef<Worker | null>(null);
    
    // Don't subscribe to store changes - manually get the data when we need it
    // Using getState to avoid triggering re-renders due to Zustand subscriptions
    const [sheets, setSheets] = useState(useBatchImportStore.getState().sheets);
    const [globalStatus, setGlobalStatus] = useState(useBatchImportStore.getState().globalStatus);
    const [schemaCacheStatus, setSchemaCacheStatus] = useState(useBatchImportStore.getState().schemaCacheStatus);
    
    // Update only when needed
    useEffect(() => {
      const unsubscribe = useBatchImportStore.subscribe((state) => {
        setSheets(state.sheets);
        setGlobalStatus(state.globalStatus);
        setSchemaCacheStatus(state.schemaCacheStatus);
      });
      return () => unsubscribe();
    }, []);
    
    // Get store actions directly from getState to avoid subscription and re-renders
    const { 
        updateSheetSuggestions, 
        setSheetCommitStatus, 
        setError, 
        setSheetReviewStatus, 
        setGlobalStatus 
    } = useBatchImportStore.getState();

    // Initialize worker and setup message/error handlers
    useEffect(() => {
        // Create a URL with a timestamp parameter the Vite-compatible way
        const workerUrl = new URL('./workers/batchImport.worker.ts', import.meta.url);
        // Add timestamp as a search parameter rather than in the URL string
        workerUrl.searchParams.append('v', Date.now().toString());
        
        workerRef.current = new Worker(workerUrl, { type: 'module' });
        console.log(`[INFO] Initializing worker with cache-busting timestamp: ${workerUrl.searchParams.get('v')}`);

        const handleWorkerMessage = (event: MessageEvent<any>) => {
            // Destructure based on the actual worker result structure
            const { sheetProcessingState, status, error } = event.data;

            if (!sheetProcessingState && status !== 'error') {
                setError('Received invalid data from processing worker.');
                return;
            }

            const sheetName = sheetProcessingState?.sheetName || 'unknown sheet'; // Get sheetName safely

           if (status === 'processed' && sheetProcessingState) {
                console.log('[DEBUG BatchImporterHooks] Worker processing completed for:', sheetProcessingState.sheetName);
                
                // Only auto-approve sheets that have a selected table that is NOT a new table
                // New tables (starting with 'import_' or containing 'new:') need manual column mapping
                if (sheetProcessingState.selectedTable) {
                    const selectedTable = sheetProcessingState.selectedTable;
                    
                    // Don't auto-approve if this is a new table that needs to have columns mapped
                    const isNewTable = selectedTable.startsWith('new:') || 
                                      selectedTable.startsWith('import_') || 
                                      !!sheetProcessingState.isNewTable;
                                      
                    if (!isNewTable) {
                        console.log('[DEBUG BatchImporterHooks] Auto-approving existing table:', {
                            sheet: sheetProcessingState.sheetName,
                            selectedTable: selectedTable,
                            nowStatus: 'approved'
                        });
                        setSheetReviewStatus(sheetProcessingState.sheetName, 'approved');
                    } else {
                        console.log('[DEBUG BatchImporterHooks] Not auto-approving new table (requires column mapping):', {
                            sheet: sheetProcessingState.sheetName,
                            selectedTable: selectedTable,
                            isNewTable: true
                        });
                        // Explicitly set to 'pending' to ensure manual mapping
                        setSheetReviewStatus(sheetProcessingState.sheetName, 'pending');
                    }
                }
                
                // Now call store action with mapping data
                updateSheetSuggestions(
                    sheetProcessingState.sheetName,
                    sheetProcessingState.tableSuggestions || [],
                    sheetProcessingState.columnMappings || {},
                    sheetProcessingState.tableConfidenceScore,
                    sheetProcessingState.sheetSchemaProposals
                );
                
                // Force sheet to ready status regardless of what worker sent
                if (sheetProcessingState.selectedTable) {
                    setSheetCommitStatus(sheetProcessingState.sheetName, 'ready');
                } else {
                    setSheetCommitStatus(sheetProcessingState.sheetName, sheetProcessingState.status);
                }

           } else if (status === 'error') {
               setSheetCommitStatus(sheetName, 'error', `Worker processing failed: ${error}`);
           }
        };

        const handleWorkerError = (error: ErrorEvent) => {
            setError(`Worker error: ${error.message}`);
        };

        workerRef.current.onmessage = handleWorkerMessage;
        workerRef.current.onerror = handleWorkerError;

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []); // Empty dependency array to initialize only once

    // Function to post a single task to the worker
    const postWorkerTask = useCallback((sheet: SheetProcessingState) => {
        if (workerRef.current && schemaCacheStatus === 'ready') {
            const schemaCacheData = { tables: tableInfoMap }; // Use passed argument
            const taskData = {
                sheetName: sheet.sheetName,
                headers: sheet.headers,
                sampleData: sheet.sampleData, // Consider limiting sample data size if large
                schemaCache: schemaCacheData,
                selectedTable: sheet.selectedTable, // Pass the current selected table
            };
            // Log task data without large arrays
            workerRef.current.postMessage(taskData);
            
            // Get fresh reference to the action
            const { setSheetCommitStatus } = useBatchImportStore.getState();
            setSheetCommitStatus(sheet.sheetName, 'processing'); // Set status to processing
        }
    }, [schemaCacheStatus, tableInfoMap]); // Dependencies that won't cause infinite loops

    // Effect to automatically post tasks when file reading is complete and schema is ready
    useEffect(() => {
        // Only proceed if schema is ready and global status indicates file reading is complete
        if (schemaCacheStatus === 'ready' && globalStatus === 'fileReadComplete') {
            // Get the current sheets from the store
            const currentSheets = Object.values(sheets);
            let tasksPosted = 0;
            
            // Post tasks for all pending sheets
            currentSheets.forEach(sheet => {
                if (sheet.status === 'pending') {
                    postWorkerTask(sheet);
                    tasksPosted++;
                }
            });
            
            // If tasks were posted, update global status to analyzing
            if (tasksPosted > 0) {
                // Get fresh reference to the action
                const { setGlobalStatus } = useBatchImportStore.getState();
                setGlobalStatus('analyzing');
            }
        }
    }, [schemaCacheStatus, globalStatus, sheets, postWorkerTask]); 

    // Return the function to post tasks manually with memoization to maintain stable reference
    return useMemo(() => ({ 
        postWorkerTask 
    }), [postWorkerTask]);
};


// Add other hooks here as needed (e.g., useImportStepper, etc.)