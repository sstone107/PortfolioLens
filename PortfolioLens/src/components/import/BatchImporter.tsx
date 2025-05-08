import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Button,
  Snackbar,
  IconButton,
} from '@mui/material';
import {
  SettingsBackupRestore as ResetIcon,
  Info as InfoIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

// Zustand Store
import { useBatchImportStore } from '../../store/batchImportStore';
import { shallow } from 'zustand/shallow';

// Services and utilities
import { DatabaseService } from './services/DatabaseService'; // Assuming this exists
import { FileReader } from './FileReader'; // Assuming this exists

// Hooks
import { useSchemaInfo, useBatchImportWorker } from './BatchImporterHooks';

// Types from ./types.ts - Consolidated and unique
import {
  type BatchImportState,
  type BatchColumnMapping,
  type ColumnMapping,
  type ColumnMappingSuggestions,
  type ColumnType, 
  type ConfidenceLevel,
  type FileType, 
  type GlobalStatus,
  type ImportJob,
  type ImportSettings,
  type MissingColumnInfo,
  type NewColumnProposal,
  type NewTableProposal,
  type RankedTableSuggestion,
  type ReviewStatus,
  type SheetInfo,
  type SheetProcessingState,
  type SheetReviewStatus,
  type TableColumn,
  type TableInfo,
  type TableInfoExtended,
  type WorkbookInfo
} from './types';

// Components
import { ImportSettingsDialog } from './ImportSettings'; // Corrected path
// import SheetDetailView from './SheetDetailView'; // Commented out as file not found
import { MissingColumnPreview } from './MissingColumnPreview';
import { ColumnMappingModal } from './ColumnMappingModal';

// Import workflow steps
import {
  FileUploadStep,
  TableMappingStep,
  ColumnMappingStep,
  ReviewImportStep
} from './steps';

interface BatchImporterProps {
  onImportComplete?: () => void;
}

/**
 * Component for batch importing multiple sheets from Excel files, using Zustand and Web Workers.
 */
export const BatchImporter: React.FC<BatchImporterProps> = ({ onImportComplete }) => {
  // Access store state directly without reactivity to avoid update loops
  const state = useBatchImportStore.getState();
  // Use useState to control when these values update rather than letting Zustand control it
  const [fileInfo, setLocalFileInfo] = useState<BatchImportState['fileInfo']>(state.fileInfo);
  const [sheets, setLocalSheets] = useState<BatchImportState['sheets']>(state.sheets);
  const [globalStatus, setLocalGlobalStatus] = useState<GlobalStatus>(state.globalStatus);
  const [commitProgress, setLocalCommitProgress] = useState<BatchImportState['commitProgress']>(state.commitProgress);
  const [storeError, setLocalStoreError] = useState<BatchImportState['error']>(state.error);
  const [schemaCacheStatus, setLocalSchemaCacheStatus] = useState<BatchImportState['schemaCacheStatus']>(state.schemaCacheStatus);
  const [storeImportSettings, setLocalImportSettings] = useState<ImportSettings | null>(state.importSettings);
  
  // Set up an effect to update local state only when needed
  useEffect(() => {
    const unsubscribe = useBatchImportStore.subscribe(
      (newState) => {
        // Only update if values have genuinely changed
        if (newState.fileInfo !== fileInfo) setLocalFileInfo(newState.fileInfo);
        if (newState.sheets !== sheets) setLocalSheets(newState.sheets);
        if (newState.globalStatus !== globalStatus) setLocalGlobalStatus(newState.globalStatus);
        if (newState.commitProgress !== commitProgress) setLocalCommitProgress(newState.commitProgress);
        if (newState.error !== storeError) setLocalStoreError(newState.error);
        if (newState.schemaCacheStatus !== schemaCacheStatus) setLocalSchemaCacheStatus(newState.schemaCacheStatus);
        if (newState.importSettings !== storeImportSettings) setLocalImportSettings(newState.importSettings);
      }
    );
    
    return () => unsubscribe();
  }, [fileInfo, sheets, globalStatus, commitProgress, storeError, schemaCacheStatus, storeImportSettings]);

  // Store actions using the getState() pattern to avoid infinite update loops
  const storeActions = React.useMemo(() => ({
    setFile: useBatchImportStore.getState().setFile,
    setSheetData: useBatchImportStore.getState().setSheetData,
    startProcessingSheets: useBatchImportStore.getState().startProcessingSheets,
    updateSheetSuggestions: useBatchImportStore.getState().updateSheetSuggestions,
    setSelectedTable: useBatchImportStore.getState().setSelectedTable,
    setGlobalStatus: useBatchImportStore.getState().setGlobalStatus,
    setSchemaCacheStatus: useBatchImportStore.getState().setSchemaCacheStatus,
    startCommit: useBatchImportStore.getState().startCommit,
    updateCommitProgress: useBatchImportStore.getState().updateCommitProgress,
    setCommitComplete: useBatchImportStore.getState().setCommitComplete,
    setSheetCommitStatus: useBatchImportStore.getState().setSheetCommitStatus,
    setError: useBatchImportStore.getState().setError,
    resetState: useBatchImportStore.getState().resetState,
    updateSheetProcessingState: useBatchImportStore.getState().updateSheetProcessingState,
    updateSheetMapping: useBatchImportStore.getState().updateSheetMapping,
    setImportSettings: useBatchImportStore.getState().setImportSettings
  }), []); // Memoize to avoid creating new references

  // --- Local UI State ---
  const [importStep, setImportStep] = useState<number>(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showMissingColumnPreview, setShowMissingColumnPreview] = useState(false);
  const [missingColumns, setMissingColumns] = useState<Record<string, MissingColumnInfo[]>>({});
  const [columnPreviewData, setColumnPreviewData] = useState<Record<string, any[]>>({});
  const [showColumnMappingModal, setShowColumnMappingModal] = useState(false);
  const [currentMappingSheet, setCurrentMappingSheet] = useState<string>('');
  const [currentMappingTable, setCurrentMappingTable] = useState<string>('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [localSelectedSheets, setLocalSelectedSheets] = useState<Record<string, boolean>>({});
  const [localSkippedSheets, setLocalSkippedSheets] = useState<Record<string, boolean>>({});
  const [importMode, setImportMode] = useState<'structureAndData' | 'structureOnly'>('structureAndData'); 

  // --- Custom Hooks ---
  const { tables, tableInfoMap, isLoadingTables, loadSchemaInfo } = useSchemaInfo();
  const { postWorkerTask } = useBatchImportWorker(tableInfoMap); 

  // Initialize storeImportSettings if null - only run once
  useEffect(() => {
    if (storeImportSettings === null) {
      storeActions.setImportSettings({
        useFirstRowAsHeader: true,
        useSheetNameForTableMatch: true,
        inferDataTypes: true,
        createMissingColumns: true,
        // Ensure all ImportSettings fields are initialized with defaults
        enableDataEnrichment: false, 
        applyGlobalAttributes: false,
        useSubServicerTags: false,
        createAuditTrail: true, // Reverted to true
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeImportSettings]); // Only depend on storeImportSettings, not on the action

  // Helper function to prepare example data for the modal
  const prepareExampleDataForModal = (sampleData: any[] | undefined, headers: string[] | undefined): Record<string, any[]> => {
    const preparedData: Record<string, any[]> = {};
    if (!sampleData || !headers) return preparedData;
    headers.forEach(header => {
        preparedData[header] = sampleData.map(row => row[header]).filter(value => value !== undefined && value !== null).slice(0, 5); 
    });
    return preparedData;
  };

  const dbService = useMemo(() => new DatabaseService(), []);

  const importSteps = ['Upload file', 'Map sheets to tables', 'Map columns', 'Review and save'];

  const goToNextStep = useCallback(() => {
    
    setImportStep(current => Math.min(current + 1, importSteps.length - 1));
  }, []);

  const goToPreviousStep = useCallback(() => {
    setImportStep(current => Math.max(current - 1, 0));
  }, []);

  const handleFileLoaded = useCallback(async (workbookInfo: WorkbookInfo, fileObj: File) => {
    storeActions.resetState();
    storeActions.setFile(fileObj);
    storeActions.setGlobalStatus('readingFile');

    try {
      const initialLocalSelected: Record<string, boolean> = {};
      const initialLocalSkipped: Record<string, boolean> = {};

      const sheetDataPromises = workbookInfo.sheets.map(async (sheet) => {
        try {
          const fullSheetData = await FileReader.getSheetData(fileObj, sheet.name);
          const headers = fullSheetData.length > 0 ? Object.keys(fullSheetData[0]) : [];
          const sampleData = fullSheetData.slice(0, 25); 
          storeActions.setSheetData(sheet.name, headers, sampleData, sheet.rowCount);
          initialLocalSelected[sheet.name] = true;
          initialLocalSkipped[sheet.name] = false;
        } catch (sheetError) {
          console.error(`[DEBUG BatchImporter] Error reading sheet ${sheet.name}:`, sheetError);
          storeActions.setSheetCommitStatus(sheet.name, 'error', `Failed to read sheet data: ${sheetError instanceof Error ? sheetError.message : String(sheetError)}`);
        }
      });

      await Promise.all(sheetDataPromises);

      setLocalSelectedSheets(initialLocalSelected);
      setLocalSkippedSheets(initialLocalSkipped);

      const readingErrorOccurred = Object.values<SheetProcessingState>(useBatchImportStore.getState().sheets).some(s => s.status === 'error');
      if (readingErrorOccurred) {
         console.error('[DEBUG BatchImporter] Errors occurred during sheet reading.');
         storeActions.setError("Errors occurred while reading sheet data. Please check individual sheets.");
         setSnackbarMessage("Error reading file. Check sheet statuses.");
         setSnackbarOpen(true);
         storeActions.setGlobalStatus('error');
         return;
      }

      setSnackbarMessage(`Successfully read ${workbookInfo.sheets.length} sheets. Waiting for schema analysis...`);
      setSnackbarOpen(true);

      storeActions.setGlobalStatus('fileReadComplete');

      const currentSchemaStatus = useBatchImportStore.getState().schemaCacheStatus;
      if (currentSchemaStatus !== 'ready') {
        storeActions.setSchemaCacheStatus('ready');
      }
    } catch (error) {
      console.error('[DEBUG BatchImporter] Error processing file:', error);
      storeActions.setError(`Failed to process the file: ${error instanceof Error ? error.message : String(error)}`);
      setSnackbarMessage(`Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSnackbarOpen(true);
      storeActions.setGlobalStatus('error');
    }
  }, [storeActions, goToNextStep]);

  const handleTableSelection = useCallback((sheetName: string, selectedValue: string | null) => {
    let finalSelectedValue = selectedValue;
    let isCreating = false;

    // Check if selectedValue indicates creating a new table
    if (selectedValue && selectedValue.startsWith('new:')) {
      isCreating = true;
      // finalSelectedValue is already in the correct format e.g., "new:desired_table_name"
      // No need for the prompt here if the UI passes the full "new:name" string
    } else if (selectedValue === 'create-new-table') { // Handle legacy or direct calls with this specific string
      const suggestedName = sheetName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').substring(0, 50);
      // Consider if this prompt is still needed or if UI should always provide the name via "new:name"
      const newTableName = prompt(`Enter a name for the new table (based on sheet "${sheetName}"):`, suggestedName);

      if (!newTableName || !newTableName.trim()) {
        // Revert to previous selection if prompt is cancelled
        storeActions.setSelectedTable(sheetName, sheets[sheetName]?.selectedTable || null, sheets[sheetName]?.isNewTable || false);
        return; 
      }
      finalSelectedValue = `new:${newTableName.trim()}`;
      isCreating = true;
    }
    // If selectedValue is not 'new:...' and not 'create-new-table', isCreating remains false, indicating mapping to an existing table.

    storeActions.setSelectedTable(sheetName, finalSelectedValue, isCreating); 

    // Delay to allow Zustand store to update before querying it
    setTimeout(() => {
        const updatedSheetState = useBatchImportStore.getState().sheets[sheetName];
        console.log(`[DEBUG BatchImporter] Fetched updated sheet state for ${sheetName} after selection:`, updatedSheetState ? { status: updatedSheetState.status, selectedTable: updatedSheetState.selectedTable } : 'NOT FOUND');

        if (updatedSheetState && updatedSheetState.status === 'analyzing') { 
          console.log(`[DEBUG BatchImporter] State being sent to worker for ${sheetName}:`, { sheetName: updatedSheetState.sheetName, selectedTable: updatedSheetState.selectedTable, headers: '...', sampleData: '...' }); 

          console.log(`[DEBUG BatchImporter] Calling postWorkerTask for sheet: ${sheetName}`);
          postWorkerTask(updatedSheetState); 

          // Always get a fresh reference to actions in async callbacks
          const { setSheetCommitStatus } = useBatchImportStore.getState();
          setSheetCommitStatus(sheetName, 'processing');
        } else {
          console.error(`[DEBUG BatchImporter] Could not find sheet state for ${sheetName} or status not 'analyzing' after selection update.`);
        }
    }, 100); 
  }, [storeActions, postWorkerTask, sheets]);

  const openColumnMapping = useCallback((sheetName: string) => {
    const sheetState = sheets[sheetName];
    if (!sheetState || !sheetState.selectedTable) {
      storeActions.setError(`Cannot open mapping for ${sheetName}. Ensure a table is selected or creation is intended.`);
      setSnackbarMessage(`Cannot open mapping for ${sheetName}. No table selected.`);
      setSnackbarOpen(true);
      return;
    }
    const tableNameOrIdentifier = sheetState.selectedTable;
    
    const isCreating = tableNameOrIdentifier.startsWith('new:') || 
                       sheetState.isNewTable === true || 
                       (tableNameOrIdentifier.startsWith('import_') && !tableInfoMap[tableNameOrIdentifier]);
                       
    if (!tableInfoMap[tableNameOrIdentifier] && !sheetState.isNewTable) {
      console.log(`[DEBUG BatchImporter] Setting isNewTable flag for ${sheetName} with table ${tableNameOrIdentifier} (table not found in schema)`);
      storeActions.updateSheetProcessingState(sheetName, {
        isNewTable: true
      });
    }
    
    const actualTableName = isCreating && tableNameOrIdentifier.startsWith('new:') ? 
                           tableNameOrIdentifier.substring(4) : 
                           tableNameOrIdentifier;

    if (isLoadingTables) {
        setSnackbarMessage(`Schema information is still loading. Please wait.`);
        setSnackbarOpen(true);
        return;
    }
    
    if (!isCreating && !tableInfoMap[actualTableName]) {
        console.warn(`[DEBUG BatchImporter] Table info for ${actualTableName} not found in map after loading. Modal might lack details or fail.`);
        storeActions.setError(`Failed to load schema details for table '${actualTableName}'. It may not exist or there was an issue fetching its information.`);
        setSnackbarMessage(`Error: Could not load details for table '${actualTableName}'. Please verify it exists and try again.`);
        setSnackbarOpen(true);
        return; 
    }

    if (sheetState.status === 'pending') {
      storeActions.updateSheetProcessingState(sheetName, {
        status: 'needsReview'
      });
    }

    setCurrentMappingSheet(sheetName);
    setCurrentMappingTable(tableNameOrIdentifier);
    console.log(`[DEBUG BatchImporter] Setting showColumnMappingModal = true for ${sheetName} targeting table/identifier ${tableNameOrIdentifier} (isCreating: ${isCreating})`);
    setShowColumnMappingModal(true);
  }, [sheets, storeActions, tableInfoMap, isLoadingTables]);

  const handleSheetSelectionToggle = useCallback((sheetName: string) => {
    if (localSkippedSheets[sheetName]) return;
    console.log(`[DEBUG BatchImporter] Toggling selection for sheet: ${sheetName}`);
    setLocalSelectedSheets(prev => ({ ...prev, [sheetName]: !prev[sheetName] }));
  }, [localSkippedSheets]);

  const handleSkipSheet = useCallback((sheetName: string, skipped: boolean) => {
    setLocalSkippedSheets(prev => ({ ...prev, [sheetName]: skipped }));
    if (skipped) {
      setLocalSelectedSheets(prev => ({ ...prev, [sheetName]: false }));
    }
  }, []);

  const handleSelectAll = useCallback((selected: boolean) => {
    const newSelection = Object.fromEntries(
      Object.keys(sheets)
        .filter(sheetName => !localSkippedSheets[sheetName])
        .map(sheetName => [sheetName, selected])
    );
    setLocalSelectedSheets(newSelection);
  }, [sheets, localSkippedSheets]);

  const checkColumnMappings = useCallback(() => {
    console.log('[DEBUG BatchImporter] checkColumnMappings called.');
    let allMappingsComplete = true;
    const unmappedItems: string[] = [];

    Object.entries(localSelectedSheets)
      .filter(([name, selected]) => selected && !localSkippedSheets[name])
      .forEach(([name]) => {
        const sheetState = sheets[name];
        if (!sheetState) {
          console.warn(`[DEBUG BatchImporter] Sheet state not found for selected sheet: ${name}`);
          allMappingsComplete = false;
          unmappedItems.push(`${name} (data error)`);
          return;
        }
        if (!sheetState.selectedTable) {
          console.warn(`[DEBUG BatchImporter] No table selected for sheet: ${name}`);
          allMappingsComplete = false;
          unmappedItems.push(`${name} (no table)`);
          return;
        }
        if (sheetState.sheetReviewStatus !== 'approved') {
           console.warn(`[DEBUG BatchImporter] Sheet not approved: ${name} (Status: ${sheetState.sheetReviewStatus})`);
           const needsReview = Object.values(sheetState.columnMappings).some(
               m => m.reviewStatus === 'pending' || m.reviewStatus === 'modified'
           );
           if (needsReview) {
               allMappingsComplete = false;
               unmappedItems.push(`${name} (columns need review)`);
           } else if (sheetState.sheetReviewStatus === 'rejected') {
               console.log(`[DEBUG BatchImporter] Sheet ${name} is rejected, skipping import.`);
           }
        }
      });

    if (!allMappingsComplete) {
      console.error(`[DEBUG BatchImporter] Column mapping check failed: ${unmappedItems.join(', ')}`);
      storeActions.setError(`Please complete and approve column mappings for: ${unmappedItems.join(', ')}`);
      return false;
    }
    console.log('[DEBUG BatchImporter] Column mapping check passed.');
    storeActions.setError(null);
    return true;
  }, [localSelectedSheets, localSkippedSheets, sheets, storeActions]);

  const convertMappingsForDbService = (batchMappings: { [header: string]: BatchColumnMapping }): Record<string, ColumnMapping> => {
      const columnMappingsForDb: Record<string, ColumnMapping> = {};
      for (const headerKey in batchMappings) {
          const bm = batchMappings[headerKey];
          if ((bm.action === 'map' && bm.mappedColumn) || (bm.action === 'create' && bm.newColumnProposal?.details.columnName)) {
              columnMappingsForDb[headerKey] = {
                  excelColumn: bm.header, 
                  dbColumn: bm.action === 'create' ? bm.newColumnProposal!.details.columnName : bm.mappedColumn!, 
                  type: bm.inferredDataType ?? 'string', 
                  isNew: bm.action === 'create',
              };
          }
      }
      return columnMappingsForDb;
  };

  const checkMissingColumnsForPreview = useCallback(async () => {
    console.log('[DEBUG BatchImporter] checkMissingColumnsForPreview called.');
    if (!fileInfo) return {};

    try {
      const previewDataForModal: Record<string, any[]> = {};
      const missingColumnsMap: Record<string, MissingColumnInfo[]> = {};
      let hasMissingColumns = false;

      for (const sheetName in localSelectedSheets) {
        if (localSelectedSheets[sheetName] && !localSkippedSheets[sheetName]) {
          const sheetState = sheets[sheetName];
          if (sheetState && sheetState.selectedTable && !sheetState.selectedTable.startsWith('new:') && sheetState.sheetReviewStatus === 'approved') {
            console.log(`[DEBUG BatchImporter] Checking missing columns for approved sheet: ${sheetName}, Table: ${sheetState.selectedTable}`);
            previewDataForModal[sheetName] = sheetState.sampleData;
            const tableName = sheetState.selectedTable;
            const batchMapping = sheetState.columnMappings || {};
            const columnMappingForDb = convertMappingsForDbService(batchMapping); 
            const missingCols = await dbService.detectMissingColumns(tableName, columnMappingForDb);
            if (missingCols.length > 0) {
              console.log(`[DEBUG BatchImporter] Missing columns found for ${sheetName}:`, missingCols);
              missingColumnsMap[sheetName] = missingCols;
              hasMissingColumns = true;
            }
          } else {
             console.log(`[DEBUG BatchImporter] Skipping missing column check for sheet: ${sheetName} (Not selected, skipped, new table, or not approved)`);
          }
        }
      }

      setMissingColumns(missingColumnsMap);
      setColumnPreviewData(previewDataForModal);

      // Check if storeImportSettings exists and createMissingColumns is true
      if (hasMissingColumns && storeImportSettings && storeImportSettings.createMissingColumns) {
        console.log('[DEBUG BatchImporter] Showing missing column preview modal.');
        setShowMissingColumnPreview(true);
        return true; 
      }
      console.log('[DEBUG BatchImporter] No missing columns found or create setting disabled.');
      return false; 
    } catch (error) {
      storeActions.setError('Error checking for missing columns.');
      return false;
    }
  }, [fileInfo, localSelectedSheets, localSkippedSheets, sheets, storeImportSettings, dbService, storeActions, convertMappingsForDbService]);

  const handleProceedToNextStep = useCallback(async () => {
    console.log(`[DEBUG BatchImporter] handleProceedToNextStep called for step: ${importStep}`);
    let canProceed = true;
    storeActions.setError(null); 

    switch(importStep) {
      case 0: 
        if (!fileInfo || globalStatus === 'error' || globalStatus === 'readingFile') {
          storeActions.setError('Please upload a valid file and wait for it to be read.');
          canProceed = false;
        } else {
          const currentSchemaStatus = useBatchImportStore.getState().schemaCacheStatus;
          if (currentSchemaStatus === 'ready') {
            
            const currentSheets = useBatchImportStore.getState().sheets;
            const hasProcessingSheets = Object.values(currentSheets).some(sheet =>
                sheet.status === 'processing' || sheet.status === 'needsReview' || sheet.status === 'ready'
            );
            
            if (!hasProcessingSheets && globalStatus !== 'analyzing') {
                console.log('[DEBUG BatchImporter handleProceed] No sheets being processed. Triggering analysis manually.');
                storeActions.startProcessingSheets(); 
                
            } else {
                console.log('[DEBUG BatchImporter handleProceed] Analysis already in progress or completed.');
            }
            canProceed = true; 
          } else if (currentSchemaStatus === 'loading') {
            storeActions.setError('Schema information is still loading. Please wait.');
            canProceed = false;
          } else { 
             storeActions.setError('Schema information failed to load. Cannot proceed.');
             canProceed = false;
          }
        }
        break;
      case 1: 
        const unmapped = Object.entries(localSelectedSheets)
          .filter(([name, selected]) => selected && !localSkippedSheets[name])
          .filter(([name]) => !sheets[name]?.selectedTable);
        if (unmapped.length > 0) {
          storeActions.setError(`Please map tables for: ${unmapped.map(([name]) => name).join(', ')}`);
          canProceed = false;
        }
        
        // Clear columnMappings for any unselected sheets to avoid showing them on next screen
        Object.entries(sheets).forEach(([sheetName, sheet]) => {
          if (!localSelectedSheets[sheetName] || localSkippedSheets[sheetName]) {
            storeActions.setSelectedTable(sheetName, null);
          }
        });
        break;
        
      case 2: 
        canProceed = checkColumnMappings(); 
        break;
      case 3: 
        break;
    }

    console.log(`[DEBUG BatchImporter] Proceed check result: ${canProceed}`);

    if (canProceed) {
      if (importStep === 2 && storeImportSettings && storeImportSettings.createMissingColumns) {
        const modalShown = await checkMissingColumnsForPreview();
        if (!modalShown) {
          goToNextStep();
        }
      } else { 
        console.log('[DEBUG BatchImporter] Proceeding to next step.');
        goToNextStep();
      }
    }
  }, [importStep, fileInfo, globalStatus, localSelectedSheets, localSkippedSheets, sheets, storeActions, checkColumnMappings, storeImportSettings, checkMissingColumnsForPreview, goToNextStep]);

  const startActualImport = useCallback(async () => {
      const currentFile = useBatchImportStore.getState().file;
      const currentSheets = useBatchImportStore.getState().sheets; 

      if (!currentFile) {
          storeActions.setError('Cannot start import: file object is missing.');
          return;
      }

      storeActions.startCommit(); 

      let importJobs: ImportJob[] = []; 
      let dataForImport: Record<string, any[]> = {}; 

      try {
          const sheetsToImport = Object.values<SheetProcessingState>(currentSheets).filter(sheet => 
              localSelectedSheets[sheet.sheetName] &&
              !localSkippedSheets[sheet.sheetName] &&
              sheet.sheetReviewStatus === 'approved' && 
              sheet.selectedTable 
          );
          console.log(`[DEBUG BatchImporter] Found ${sheetsToImport.length} sheets approved for import.`);

          if (sheetsToImport.length === 0) {
              storeActions.setError("No sheets are approved for import. Please review mappings.");
              storeActions.setGlobalStatus('review'); 
              return;
          }

          if (importMode === 'structureAndData') {
            console.log('[DEBUG BatchImporter] Mode: structureAndData. Reading full data...');
            dataForImport = {}; 
            for (const sheet of sheetsToImport) {
                try {
                    const data = await FileReader.getSheetData(currentFile, sheet.sheetName);
                    dataForImport[sheet.sheetName] = data;
                } catch (readError) {
                    console.error(`[DEBUG BatchImporter] Error reading full data for sheet ${sheet.sheetName}:`, readError);
                    // Always get fresh references to avoid stale closures
                    const { setSheetCommitStatus } = useBatchImportStore.getState();
                    setSheetCommitStatus(sheet.sheetName, 'error', `Failed to read sheet data for import.`);
                } 
            } 
          } else {
            console.log('[DEBUG BatchImporter] Mode: structureOnly. Skipping data read.');
            dataForImport = {}; 
          }
          importJobs = sheetsToImport 
              .filter(sheet => dataForImport[sheet.sheetName]) 
              .map(sheet => {
                  const proposals = Object.values(sheet.columnMappings)
                      .filter(mapping => mapping.action === 'create' && mapping.newColumnProposal)
                      .map(mapping => mapping.newColumnProposal!);

                  return {
                      id: `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      userId: 'current-user', 
                      fileName: fileInfo?.name ?? 'unknown',
                      tableName: sheet.selectedTable!, 
                      sheetName: sheet.sheetName,
                      mapping: convertMappingsForDbService(sheet.columnMappings),
                      newColumnProposals: proposals,
                      status: 'pending',
                      totalRows: sheet.rowCount,
                      processedRows: 0,
                      createdAt: new Date(),
                      updatedAt: new Date()
                  };
              }); 

          console.log(`[DEBUG BatchImporter] Created ${importJobs.length} import jobs.`);

          if (importJobs.length === 0) {
              storeActions.setError("No valid sheets could be prepared for import (check read errors).");
              storeActions.setGlobalStatus('error');
              return;
          }

          console.log('Calling processBatchImport with jobs:', importJobs.length);
          storeActions.updateCommitProgress(0, importJobs.length, importJobs[0]?.sheetName || null);

          if (importMode === 'structureAndData') {
            console.log('[DEBUG BatchImporter] Mode: structureAndData. Calling dbService.processBatchImport...');
            try {
                await dbService.processBatchImport(
                    importJobs,
                    dataForImport, 
                    storeImportSettings && storeImportSettings.createMissingColumns || false 
                );
                console.log('dbService.processBatchImport finished.');
            } catch (importError) {
                console.error('Error during dbService.processBatchImport:', importError);
                // Get fresh actions to avoid stale closures
                const { setError, setGlobalStatus, setSheetCommitStatus } = useBatchImportStore.getState();
                setError(`Import failed: ${importError instanceof Error ? importError.message : String(importError)}`);
                setGlobalStatus('error');
                importJobs.forEach(job => setSheetCommitStatus(job.sheetName, 'error', 'Batch processing failed'));
                return; 
            }
          } else {
            // Get fresh reference for bulk operations
            const { setSheetCommitStatus } = useBatchImportStore.getState();
            importJobs.forEach(job => setSheetCommitStatus(job.sheetName, 'committed', 'Schema structure applied (no data imported).'));
          }

          const finalSheetStates = useBatchImportStore.getState().sheets; 
          const failedSheets = importJobs.filter(job => finalSheetStates[job.sheetName]?.status === 'error');

          if (failedSheets.length > 0) {
              storeActions.setError(`Import completed with errors for sheets: ${failedSheets.map(j => j.sheetName).join(', ')}`);
              storeActions.setGlobalStatus('error');
          } else {
              storeActions.setCommitComplete(); 
              setSnackbarMessage('Import completed successfully!');
              setSnackbarOpen(true);
              if (onImportComplete) onImportComplete();
          }

      } catch (error) { 
          console.error('[DEBUG BatchImporter] Unexpected error during startActualImport:', error);
          storeActions.setError(`An unexpected error occurred during import: ${error instanceof Error ? error.message : String(error)}`);
          storeActions.setGlobalStatus('error');
          if (importJobs && importJobs.length > 0) {
             // Get fresh reference for actions in error handler
             const { setSheetCommitStatus } = useBatchImportStore.getState();
             importJobs.forEach(job => {
                if (useBatchImportStore.getState().sheets[job.sheetName]?.status !== 'error') {
                   setSheetCommitStatus(job.sheetName, 'error', 'Unexpected batch error');
                }
             });
          }
      }
  }, [ 
      localSelectedSheets, localSkippedSheets, storeActions,
      fileInfo, dbService, storeImportSettings,
      onImportComplete, setSnackbarMessage, setSnackbarOpen, convertMappingsForDbService,
      importMode
  ]);

  const handleStartImportClick = useCallback(async () => {
      storeActions.setError(null); 
      if (!checkColumnMappings()) {
          console.log('[DEBUG BatchImporter] Column mapping check failed in handleStartImportClick.');
          return;
      }

      if (storeImportSettings && storeImportSettings.createMissingColumns) {
          console.log('[DEBUG BatchImporter] Checking for missing columns preview...');
          const modalShown = await checkMissingColumnsForPreview();
          if (modalShown) {
              console.log('[DEBUG BatchImporter] Missing columns modal shown, waiting for user confirmation.');
              return; 
          }
          console.log('[DEBUG BatchImporter] No missing columns modal shown or needed.');
      } else {
          console.log('[DEBUG BatchImporter] Skipping missing columns check as createMissingColumns is false.');
      }

      await startActualImport();
  }, [ 
      storeActions, checkColumnMappings, storeImportSettings,
      checkMissingColumnsForPreview, startActualImport
  ]);

  const handleReset = useCallback(() => {
    storeActions.resetState();
    setImportStep(0);
    setSettingsOpen(false);
    setMissingColumns({});
    setShowMissingColumnPreview(false);
    setColumnPreviewData({});
    setShowColumnMappingModal(false);
    setCurrentMappingSheet('');
    setCurrentMappingTable('');
    setSnackbarOpen(false);
    setSnackbarMessage('');
    setLocalSelectedSheets({});
    setLocalSkippedSheets({});
    loadSchemaInfo();
    setSnackbarMessage('Import process reset.');
    setSnackbarOpen(true);
  }, [storeActions, loadSchemaInfo]);

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  const handleApplySettings = useCallback((newSettings: ImportSettings) => {
    storeActions.setImportSettings(newSettings); // Use memoized store action
    handleCloseSettings();
    const currentFile = useBatchImportStore.getState().file;
    if (currentFile) {
      console.log("Settings changed, re-processing file...");
      FileReader.readFile(currentFile).then(workbookInfo => handleFileLoaded(workbookInfo, currentFile));
    }
  }, [storeActions, handleCloseSettings, handleFileLoaded]);

  const reconstructedWorkbookInfo: WorkbookInfo | null = useMemo(() => {
      if (!fileInfo) return null;
      
      // Create stable sheet objects with memoization
      const memoizedSheets = Object.values(sheets).map(s => ({
          name: s.sheetName,
          columnCount: s.headers.length,
          rowCount: s.rowCount,
          columns: s.headers,
          // Don't recreate sample data reference if it hasn't changed
          previewRows: s.sampleData,
      }));
      
      return {
          fileName: fileInfo.name,
          fileType: fileInfo.type as FileType,
          sheets: memoizedSheets
      };
  }, [fileInfo, sheets]);

  const handleSettingsSave = (newSettings: ImportSettings) => {
    storeActions.setImportSettings(newSettings); // Use memoized store action
    setSettingsOpen(false);
    // Optionally, trigger re-processing or updates if settings changes affect current state
    // For example, if 'useFirstRowAsHeader' changes, re-evaluate headers for loaded sheets
  };

  const currentSheetNameForModal = currentMappingSheet;
  const currentSheetStateForModal = currentSheetNameForModal ? sheets[currentSheetNameForModal] || null : null;
  const isCreatingTableForModal: boolean = !!(currentSheetNameForModal 
    ? (currentMappingTable === 'create-new-table' || 
       !!currentMappingTable?.startsWith('new:') || 
       currentSheetStateForModal?.isNewTable === true ||
       sheets[currentSheetNameForModal]?.isNewTable === true ||
       (currentMappingTable && !tableInfoMap[currentMappingTable] && !currentMappingTable.startsWith('import_')) || // Explicitly treat non-schema, non-'import_' tables as new
       (currentMappingTable?.startsWith('import_') && !tableInfoMap[currentMappingTable])) // Treat 'import_' prefixed tables not in schema as new
    : false);

  // Debugging logs for modal state variables
  useEffect(() => {
    // Debug logging removed
  }, [currentSheetNameForModal, currentSheetStateForModal, isCreatingTableForModal]);

  let tableInfoForModal: TableInfo | null = null;
  if (currentSheetNameForModal) {
    if (isCreatingTableForModal) {
      const proposal = currentSheetStateForModal?.sheetSchemaProposals?.find(p => p.type === 'new_table');
      if (proposal && proposal.type === 'new_table') {
        tableInfoForModal = {
          tableName: proposal.details.name,
          columns: proposal.details.columns.map(col => ({
            columnName: col.columnName,
            dataType: col.sqlType, // map sqlType to dataType
            isNullable: col.isNullable === undefined ? true : col.isNullable, // provide default if undefined
            columnDefault: col.defaultValue,
            isPrimaryKey: col.is_primary_key || false,
            description: col.comment,
          })),
          description: proposal.details.comment,
        };
      }
    } else {
      const existingTableName = currentMappingTable;
      const existingTable = tableInfoMap[existingTableName];
      if (existingTable) {
        // Use the tableInfo directly since it should already be in the correct format
        tableInfoForModal = existingTable;
      }
    }
  }

  // Don't use selectors at all - just use tables directly
  const tableStoreTables = tables;

  // Adjusted handler for FileUploadStep
  const handleFileUploadedForStep = useCallback(async (info: WorkbookInfo, file: File) => {
    // Call the existing handleFileLoaded with the same arguments
    await handleFileLoaded(info, file);
  }, [handleFileLoaded]);

  const handleNext = () => {
    goToNextStep();
  }

  return (
    <>
      <Box sx={{ my: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>Template Mapping Tool</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Button startIcon={<InfoIcon />} onClick={handleOpenSettings} variant="outlined" size="small">
                Import Settings
              </Button>
              <Button 
                onClick={() => loadSchemaInfo()} 
                disabled={isLoadingTables || globalStatus !== 'idle'} 
                startIcon={<RefreshIcon />}
              >
                Refresh Schema
              </Button>
            </Box>

            <Stepper activeStep={importStep} sx={{ my: 3 }}>
              {importSteps.map((label) => (
                <Step key={label}><StepLabel>{label}</StepLabel></Step>
              ))}
            </Stepper>

            {storeError && (
              <Alert severity="error" sx={{ my: 2 }} action={
                <IconButton aria-label="close" color="inherit" size="small" onClick={() => storeActions.setError(null)}> 
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              }>{storeError}</Alert>
            )}

            {/* Step Content */}
            {importStep === 0 && (
              <FileUploadStep
                workbookInfo={reconstructedWorkbookInfo} 
                isLoadingTables={isLoadingTables} 
                onFileLoaded={handleFileUploadedForStep} 
                onContinue={handleNext} 
              />
            )}
            {importStep === 1 && fileInfo && (
              <TableMappingStep
                sheets={sheets}
                tables={tableStoreTables}
                localSelectedSheets={localSelectedSheets}
                localSkippedSheets={localSkippedSheets}
                onSheetSelectionToggle={handleSheetSelectionToggle}
                onTableSelection={handleTableSelection}
                onSelectAll={handleSelectAll}
                onSkipSheet={handleSkipSheet}
                onBack={goToPreviousStep}
                onContinue={handleProceedToNextStep}
                isProcessing={globalStatus === 'analyzing'}
              />
            )}
            {importStep === 2 && fileInfo && (
              <ColumnMappingStep
                 sheets={sheets}
                 localSelectedSheets={localSelectedSheets}
                 localSkippedSheets={localSkippedSheets}
                 isProcessing={false} // Force this to false to allow interaction
                 onOpenColumnMapping={openColumnMapping}
                 onContinue={handleProceedToNextStep}
                 onBack={goToPreviousStep}
              />
            )}
            {importStep === 3 && fileInfo && reconstructedWorkbookInfo && ( 
              <ReviewImportStep
                 workbookInfo={reconstructedWorkbookInfo} 
                 sheetTableMappings={Object.fromEntries(Object.entries(sheets).map(([name, state]) => [name, state.selectedTable || '']))}
                 selectedSheets={localSelectedSheets} 
                 importSettings={storeImportSettings || {
                   useFirstRowAsHeader: true,
                   useSheetNameForTableMatch: true,
                   inferDataTypes: true,
                   createMissingColumns: true,
                   enableDataEnrichment: false,
                   applyGlobalAttributes: false,
                   useSubServicerTags: false,
                   createAuditTrail: true,
                 }}
                 isImporting={globalStatus === 'committing'}
                 importProgress={commitProgress ? Math.round((commitProgress.processedSheets / commitProgress.totalSheets) * 100) : 0}
                 onStartImport={handleStartImportClick}
                 onBack={goToPreviousStep}
                 errors={storeError ? { global: storeError } : {}}
                 importResults={Object.fromEntries(Object.entries(sheets).map(([name, state]) => [name, { success: state.status === 'committed', message: state.error || (state.status === 'committed' ? 'Success' : ''), rowCount: state.rowCount }]))}
                 excelData={Object.fromEntries(Object.entries(sheets).map(([name, state]) => [name, state.sampleData]))}
                 columnMappings={Object.fromEntries(Object.entries(sheets).map(([name, state]) => [`${name}-${state.selectedTable}`, state.columnMappings]))}
                 importMode={importMode} 
                 onImportModeChange={setImportMode} 
              />
            )}

            {importStep > 0 && (
              <Box sx={{ mt: 3, borderTop: '1px solid #eee', pt: 2 }}>
                <Button variant="text" startIcon={<ResetIcon />} onClick={handleReset}
                  disabled={['readingFile', 'processingSheets', 'committing'].includes(globalStatus)}
                  color="error" sx={{ mt: 1 }}>
                  Reset Import Process
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Dialogs and Modals */}
        {storeImportSettings && (
          <ImportSettingsDialog
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            settings={storeImportSettings}
            onApply={(newSettings: ImportSettings) => { 
              storeActions.setImportSettings(newSettings);
              setSettingsOpen(false);
            }}
          />
        )}
        <MissingColumnPreview
          open={showMissingColumnPreview}
          missingColumns={missingColumns}
          previewData={columnPreviewData} 
          onClose={() => setShowMissingColumnPreview(false)}
          onConfirm={() => {
            setShowMissingColumnPreview(false);
            startActualImport();
          }}
        />
        {(showColumnMappingModal && currentSheetNameForModal && (
          <ColumnMappingModal
            open={showColumnMappingModal}
            onClose={() => {
              setShowColumnMappingModal(false);
              setCurrentMappingSheet('');
            }}
            onSave={(updatedMappings: Record<string, BatchColumnMapping>, newTableName: string | undefined) => {
              if (currentSheetNameForModal) {
                const sheetState = sheets[currentSheetNameForModal]; // Get current sheet state for comparison
                
                const allMappingsComplete = Object.values(updatedMappings).every(mapping => 
                  mapping.action === 'skip' || 
                  (mapping.action === 'map' && mapping.mappedColumn) || 
                  (mapping.action === 'create' && mapping.newColumnProposal)
                );
                
                const needsActualReview = Object.values(updatedMappings).some(mapping =>
                  mapping.action !== 'skip' && mapping.reviewStatus !== 'approved'
                );

                const isSheetFullyApproved = allMappingsComplete && !needsActualReview;
                
                const determinedSheetReviewStatus: SheetReviewStatus = isSheetFullyApproved ? 'approved' : (needsActualReview ? 'needsReview' : 'pending');

                // For new tables, we NEVER want to mark them as 'ready' even if all mappings are approved
                // They should always require review
                
                // CRITICAL FIX: Only consider a table "new" if it's explicitly marked as such:
                // 1. Being actively created in this modal session
                // 2. Has an explicit "new:" prefix in the selected table name
                // Nothing else should be considered "new"
                const isNewTable = isCreatingTableForModal || 
                  (sheetState?.selectedTable && sheetState.selectedTable.startsWith('new:'));
                
                const updatedData: Partial<SheetProcessingState> = {
                  columnMappings: updatedMappings,
                  // UPDATED: Always mark as 'ready' if fully approved, regardless of table type
                  // This ensures new tables can transition to ready state once mappings are saved
                  status: isSheetFullyApproved ? 'ready' : 'needsReview',
                  // UPDATED: If everything is mapped/approved, set sheetReviewStatus to 'approved'
                  // This allows users to complete the workflow for new tables
                  sheetReviewStatus: isSheetFullyApproved ? 'approved' : determinedSheetReviewStatus
                };

                // If creating a new table and a name was provided by the modal (e.g., user edited it)
                if (isCreatingTableForModal && newTableName && newTableName.trim() !== '') {
                  const sanitizedName = newTableName.trim().replace(/\s+/g, '_').replace(/_+/g, '_').substring(0, 50);
                  updatedData.selectedTable = `new:${sanitizedName}`;
                  updatedData.isNewTable = true; 
                } else if (sheetState?.selectedTable) {
                  // Preserve existing selectedTable if not changed by modal
                  updatedData.selectedTable = sheetState.selectedTable;
                  
                  // CRITICAL FIX: Explicitly set isNewTable based strictly on prefix
                  if (sheetState.selectedTable.startsWith('new:')) {
                    updatedData.isNewTable = true;
                  } else {
                    // Explicitly set non-new tables to false
                    updatedData.isNewTable = false;
                  }
                } else if (isCreatingTableForModal && !sheetState?.selectedTable && !newTableName) {
                  // Case: New table, but no name provided from modal and no existing 'new:' name (should not happen if UI enforces name for new tables)
                  // Create a fallback name or handle as an error
                  const fallbackName = `new_table_${currentSheetNameForModal.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`.substring(0,50);
                  updatedData.selectedTable = `new:${fallbackName}`;
                  updatedData.isNewTable = true;
                  console.warn(`[DEBUG BatchImporter] New table for ${currentSheetNameForModal} had no name, used fallback: ${updatedData.selectedTable}`);
                }

                // Handle the state transition for column mappings
                if (isCreatingTableForModal) {
                    const previousSheetState = sheets[currentSheetNameForModal];
                    const isFirstSaveForThisNewTableSetup = 
                        !previousSheetState?.columnMappings || 
                        Object.keys(previousSheetState.columnMappings).length === 0 ||
                        (!previousSheetState?.selectedTable?.startsWith('new:') && updatedData.selectedTable?.startsWith('new:'));

                    // Only set status for the very first save (no previous mappings)
                    if (isFirstSaveForThisNewTableSetup) {
                        console.log(`[DEBUG BatchImporter] First save for new table ${currentSheetNameForModal} (${updatedData.selectedTable}).`);
                        // Initialize with 'needsReview' only if it's the very first save with no mappings
                        updatedData.status = 'needsReview';
                        updatedData.sheetReviewStatus = 'pending'; 
                    } else {
                        // For subsequent saves when mappings are being updated, set to 'ready'
                        console.log(`[DEBUG BatchImporter] Subsequent save for new table ${currentSheetNameForModal} with mappings - setting to ready.`);
                        updatedData.status = 'ready';
                        updatedData.sheetReviewStatus = 'approved';
                    }
                }
                
                // If we have column mappings but the status wasn't explicitly set, ensure it's 'ready'
                if (updatedMappings && Object.keys(updatedMappings).length > 0 && !updatedData.status) {
                    updatedData.status = 'ready';
                    updatedData.sheetReviewStatus = 'approved';
                }
                
                storeActions.updateSheetProcessingState(currentSheetNameForModal, updatedData);

                setSnackbarMessage(`Mappings saved for ${currentSheetNameForModal}.`);
                setSnackbarOpen(true);
              }
              setShowColumnMappingModal(false); // Close modal regardless of currentSheetNameForModal
            }}
            sheetState={currentSheetStateForModal}
            tableInfo={tableInfoForModal}
            isCreatingTable={isCreatingTableForModal}
          />
        ))}
      </Box>

      <Snackbar open={snackbarOpen} autoHideDuration={6000} onClose={() => setSnackbarOpen(false)} message={snackbarMessage} action={
        <IconButton size="small" aria-label="close" color="inherit" onClick={() => setSnackbarOpen(false)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      } />
    </>
  );
};