import { SheetProcessingState, RankedTableSuggestion } from './types'; // <-- ADDED Import + RankedTableSuggestion
import * as React from 'react'; // <-- ADDED React import
import { useCallback, useMemo, useEffect } from 'react';
// Use React.useState instead of useState directly
const { useState } = React;
import { DatabaseService } from './services/DatabaseService';
import { TableInfo } from './types';
import { useBatchImportStore } from '../../store/batchImportStore';
import { shallow } from 'zustand/shallow';

/**
 * Custom hook to manage loading and caching of database schema information.
 */
export const useSchemaInfo = () => {
  // Get store actions but memoize them to ensure stable reference
  const storeActions = useMemo(() => ({
    setSchemaCacheStatus: useBatchImportStore.getState().setSchemaCacheStatus,
    setError: useBatchImportStore.getState().setError
  }), []);

  const [tables, setTables] = useState<string[]>([]);
  const [tableInfoMap, setTableInfoMap] = useState<Record<string, TableInfo>>({});
  const [isLoadingTables, setIsLoadingTables] = useState(false);

  // Memoize DatabaseService instance
  const dbService = useMemo(() => new DatabaseService(), []);

  const loadSchemaInfo = useCallback(async () => {
    setIsLoadingTables(true);
    storeActions.setSchemaCacheStatus('loading');
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
      storeActions.setSchemaCacheStatus('ready');
    } catch (error) {
      storeActions.setError(`Error loading database schema: ${error instanceof Error ? error.message : String(error)}`);
      storeActions.setSchemaCacheStatus('error');
    } finally {
      setIsLoadingTables(false);
    }
  }, [dbService, storeActions]); // Include storeActions in dependencies

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
    const [globalStatus, setLocalGlobalStatus] = useState(useBatchImportStore.getState().globalStatus);
    const [schemaCacheStatus, setLocalSchemaCacheStatus] = useState(useBatchImportStore.getState().schemaCacheStatus);
    
    // Update only when needed
    useEffect(() => {
      const unsubscribe = useBatchImportStore.subscribe((state) => {
        setSheets(state.sheets);
        setLocalGlobalStatus(state.globalStatus);
        setLocalSchemaCacheStatus(state.schemaCacheStatus);
      });
      return () => unsubscribe();
    }, []);
    
    // Get store actions directly from getState to avoid subscription and re-renders
    const storeActions = useBatchImportStore.getState();

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
                storeActions.setError('Received invalid data from processing worker.');
                return;
            }

            const sheetName = sheetProcessingState?.sheetName || 'unknown sheet'; // Get sheetName safely

            if (status === 'processed' && sheetProcessingState) {
                // Timestamp for correlated logs
                const timestamp = new Date().toISOString();
                console.log(`[DEBUG ${timestamp}] Worker processing completed for:`, sheetProcessingState.sheetName);
                
                if (sheetProcessingState.selectedTable) {
                    const selectedTable = sheetProcessingState.selectedTable;
                    
                    // Get full trace of who's calling and current status
                    console.log(`[DEBUG ${timestamp}] Processing sheet with selected table:`, {
                        sheetName: sheetProcessingState.sheetName,
                        selectedTable: selectedTable,
                        currentStatus: sheetProcessingState.status,
                        isNewTable: sheetProcessingState.isNewTable,
                        sheetReviewStatus: sheetProcessingState.sheetReviewStatus,
                        callStack: new Error().stack,
                    });
                    
                    // Enhanced new table detection - check multiple indicators
                    const isNewTableByPrefix = selectedTable.startsWith('new:') || selectedTable.startsWith('import_');
                    const isNewTableByFlag = !!sheetProcessingState.isNewTable;
                    const isEffectivelyNewTable = isNewTableByPrefix || isNewTableByFlag;
                    
                    console.log(`[DEBUG ${timestamp}] New table detection for ${sheetProcessingState.sheetName}:`, {
                        byPrefix: isNewTableByPrefix,
                        byFlag: isNewTableByFlag,
                        effectivelyNew: isEffectivelyNewTable,
                    });
                    
                    // Set proper review status based on whether it's a new table
                    if (!isEffectivelyNewTable) {
                        // Auto-approve existing tables
                        console.log(`[DEBUG ${timestamp}] Auto-approving existing table: ${sheetProcessingState.sheetName}`);
                        storeActions.setSheetReviewStatus(sheetProcessingState.sheetName, 'approved');
                    } else {
                        // Never auto-approve new tables - they need manual review
                        console.log(`[DEBUG ${timestamp}] Setting new table to 'pending': ${sheetProcessingState.sheetName}`);
                        storeActions.setSheetReviewStatus(sheetProcessingState.sheetName, 'pending');
                    }
                    
                    // Now call store action with mapping data
                    console.log(`[DEBUG ${timestamp}] Updating sheet suggestions for: ${sheetProcessingState.sheetName}`);
                    storeActions.updateSheetSuggestions(
                        sheetProcessingState.sheetName,
                        sheetProcessingState.tableSuggestions || [],
                        sheetProcessingState.columnMappings || {},
                        sheetProcessingState.tableConfidenceScore,
                        sheetProcessingState.sheetSchemaProposals
                    );
                    
                    // Determine commit status based on whether it's a new table or existing
                    if (isEffectivelyNewTable) {
                        // CRITICAL FIX: Always force new tables to 'needsReview' status
                        // This prevents them being automatically set to 'ready'
                        console.log(`[DEBUG ${timestamp}] IMPORTANT: Setting new table ${sheetProcessingState.sheetName} to 'needsReview'`);
                        storeActions.setSheetCommitStatus(sheetProcessingState.sheetName, 'needsReview');
                    } else {
                        // Existing tables can be set to 'ready'
                        console.log(`[DEBUG ${timestamp}] Setting existing table ${sheetProcessingState.sheetName} to 'ready'`);
                        storeActions.setSheetCommitStatus(sheetProcessingState.sheetName, 'ready');
                    }
                } else {
                    // No table selected for the sheet
                    console.log(`[DEBUG ${timestamp}] No selected table for sheet ${sheetProcessingState.sheetName}, setting status to:`, sheetProcessingState.status);
                    storeActions.setSheetCommitStatus(sheetProcessingState.sheetName, sheetProcessingState.status as SheetCommitStatus);
                }
            } else if (status === 'error') {
               storeActions.setSheetCommitStatus(sheetName, 'error', `Worker processing failed: ${error}`);
           }
        };

        const handleWorkerError = (error: ErrorEvent) => {
            storeActions.setError(`Worker error: ${error.message}`);
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
            
            // Use our storeActions reference
            storeActions.setSheetCommitStatus(sheet.sheetName, 'processing'); // Set status to processing
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
                // Use our storeActions reference
                storeActions.setGlobalStatus('analyzing');
            }
        }
    }, [schemaCacheStatus, globalStatus, sheets, postWorkerTask]); 

    // Return the function to post tasks manually with memoization to maintain stable reference
    return useMemo(() => ({ 
        postWorkerTask 
    }), [postWorkerTask]);
};


// Add other hooks here as needed (e.g., useImportStepper, etc.)