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
} from '@mui/icons-material';

// Services and utilities
import { DatabaseService } from './services/DatabaseService';
import { FileReader } from './FileReader';

// Types
import { 
  WorkbookInfo, 
  TableInfo, 
  SheetProcessingState, 
  BatchColumnMapping, 
  ColumnMapping, 
  FileType, 
  ImportJob, 
  ColumnType, 
  NewColumnProposal, 
  ImportSettings, 
  MissingColumnInfo, 
  NewTableProposal 
} from './types'; 
import { useSchemaInfo, useBatchImportWorker } from './BatchImporterHooks'; 

// Components
import { ImportSettingsDialog } from './ImportSettings';
import { MissingColumnPreview } from './MissingColumnPreview';
import { ColumnMappingModal } from './ColumnMappingModal';

// Import workflow steps
import {
  FileUploadStep,
  TableMappingStep,
  ColumnMappingStep,
  ReviewImportStep
} from './steps';

// Store
import { useBatchImportStore } from '../../store/batchImportStore'; 

interface BatchImporterProps {
  onImportComplete?: () => void;
}

/**
 * Component for batch importing multiple sheets from Excel files, using Zustand and Web Workers.
 */
export const BatchImporter: React.FC<BatchImporterProps> = ({ onImportComplete }) => {
  // --- Zustand Store Integration ---
  const store = useBatchImportStore();
  const {
    fileInfo,
    sheets,
    globalStatus,
    commitProgress,
    error: storeError,
    schemaCacheStatus,
    // Destructure actions needed and rename to avoid conflicts
    setFile: _setFile,
    setSheetData: _setSheetData,
    startProcessingSheets: _startProcessingSheets,
    updateSheetSuggestions: _updateSheetSuggestions,
    setSelectedTable: _setSelectedTable,
    setGlobalStatus: _setGlobalStatus,
    setSchemaCacheStatus: _setSchemaCacheStatus,
    startCommit: _startCommit,
    updateCommitProgress: _updateCommitProgress,
    setCommitComplete: _setCommitComplete,
    setSheetCommitStatus: _setSheetCommitStatus,
    setError: _setError,
    resetState: _resetState,
    updateSheetProcessingState, // Added: New action for generic sheet state updates
    updateSheetMapping: _updateSheetMapping
  } = useBatchImportStore();
  // --- End Store Integration ---

  // --- Local UI State ---
  const [importStep, setImportStep] = useState<number>(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importSettings, setImportSettings] = useState<ImportSettings>({
    useFirstRowAsHeader: true,
    useSheetNameForTableMatch: true,
    inferDataTypes: true,
    createMissingColumns: true
  });
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
  // --- End Local UI State ---

  // --- Custom Hooks ---
  const { tables, tableInfoMap, isLoadingTables, loadSchemaInfo } = useSchemaInfo();
  const { postWorkerTask } = useBatchImportWorker(tableInfoMap); 
  // --- End Custom Hooks ---

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
    _resetState();
    _setFile(fileObj);
    _setGlobalStatus('readingFile');

    try {
      const initialLocalSelected: Record<string, boolean> = {};
      const initialLocalSkipped: Record<string, boolean> = {};

      const sheetDataPromises = workbookInfo.sheets.map(async (sheet) => {
        try {
          const fullSheetData = await FileReader.getSheetData(fileObj, sheet.name);
          const headers = fullSheetData.length > 0 ? Object.keys(fullSheetData[0]) : [];
          const sampleData = fullSheetData.slice(0, 25); 
          _setSheetData(sheet.name, headers, sampleData, sheet.rowCount);
          initialLocalSelected[sheet.name] = true;
          initialLocalSkipped[sheet.name] = false;
        } catch (sheetError) {
          console.error(`[DEBUG BatchImporter] Error reading sheet ${sheet.name}:`, sheetError);
          _setSheetCommitStatus(sheet.name, 'error', `Failed to read sheet data: ${sheetError instanceof Error ? sheetError.message : String(sheetError)}`);
        }
      });

      await Promise.all(sheetDataPromises);

      setLocalSelectedSheets(initialLocalSelected);
      setLocalSkippedSheets(initialLocalSkipped);

      const readingErrorOccurred = Object.values<SheetProcessingState>(useBatchImportStore.getState().sheets).some(s => s.status === 'error');
      if (readingErrorOccurred) {
         console.error('[DEBUG BatchImporter] Errors occurred during sheet reading.');
         _setError("Errors occurred while reading sheet data. Please check individual sheets.");
         setSnackbarMessage("Error reading file. Check sheet statuses.");
         setSnackbarOpen(true);
         _setGlobalStatus('error');
         return;
      }

      setSnackbarMessage(`Successfully read ${workbookInfo.sheets.length} sheets. Waiting for schema analysis...`);
      setSnackbarOpen(true);

      _setGlobalStatus('fileReadComplete');

      const currentSchemaStatus = useBatchImportStore.getState().schemaCacheStatus;
      if (currentSchemaStatus !== 'ready') {
        _setSchemaCacheStatus('ready');
      }
    } catch (error) {
      console.error('[DEBUG BatchImporter] Error processing file:', error);
      _setError(`Failed to process the file: ${error instanceof Error ? error.message : String(error)}`);
      setSnackbarMessage(`Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSnackbarOpen(true);
      _setGlobalStatus('error');
    }
  }, [_resetState, _setFile, _setGlobalStatus, importSettings.useFirstRowAsHeader, _setSheetData, _setSheetCommitStatus, _setError, goToNextStep]);

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
        _setSelectedTable(sheetName, sheets[sheetName]?.selectedTable || null, sheets[sheetName]?.isNewTable || false);
        return; 
      }
      finalSelectedValue = `new:${newTableName.trim()}`;
      isCreating = true;
    }
    // If selectedValue is not 'new:...' and not 'create-new-table', isCreating remains false, indicating mapping to an existing table.

    _setSelectedTable(sheetName, finalSelectedValue, isCreating); 

    // Delay to allow Zustand store to update before querying it
    setTimeout(() => {
        const updatedSheetState = useBatchImportStore.getState().sheets[sheetName];
        console.log(`[DEBUG BatchImporter] Fetched updated sheet state for ${sheetName} after selection:`, updatedSheetState ? { status: updatedSheetState.status, selectedTable: updatedSheetState.selectedTable } : 'NOT FOUND');

        if (updatedSheetState && updatedSheetState.status === 'analyzing') { 
          console.log(`[DEBUG BatchImporter] State being sent to worker for ${sheetName}:`, { sheetName: updatedSheetState.sheetName, selectedTable: updatedSheetState.selectedTable, headers: '...', sampleData: '...' }); 

          console.log(`[DEBUG BatchImporter] Calling postWorkerTask for sheet: ${sheetName}`);
          postWorkerTask(updatedSheetState); 

          _setSheetCommitStatus(sheetName, 'processing');
        } else {
          console.error(`[DEBUG BatchImporter] Could not find sheet state for ${sheetName} or status not 'analyzing' after selection update.`);
        }
    }, 100); 
  }, [_setSelectedTable, postWorkerTask, _setSheetCommitStatus, sheets]);

  const openColumnMapping = useCallback((sheetName: string) => {
    const sheetState = sheets[sheetName];
    if (!sheetState || !sheetState.selectedTable) {
      _setError(`Cannot open mapping for ${sheetName}. Ensure a table is selected or creation is intended.`);
      setSnackbarMessage(`Cannot open mapping for ${sheetName}. No table selected.`);
      setSnackbarOpen(true);
      return;
    }
    const tableNameOrIdentifier = sheetState.selectedTable;
    const isCreating = tableNameOrIdentifier.startsWith('new:');
    const actualTableName = isCreating ? tableNameOrIdentifier.substring(4) : tableNameOrIdentifier;

    if (isLoadingTables) {
        setSnackbarMessage(`Schema information is still loading. Please wait.`);
        setSnackbarOpen(true);
        return;
    }
    if (!isCreating && !tableInfoMap[actualTableName]) {
        console.warn(`[DEBUG BatchImporter] Table info for ${actualTableName} not found in map after loading. Modal might lack details or fail.`);
        _setError(`Failed to load schema details for table '${actualTableName}'. It may not exist or there was an issue fetching its information.`);
        setSnackbarMessage(`Error: Could not load details for table '${actualTableName}'. Please verify it exists and try again.`);
        setSnackbarOpen(true);
        return; 
    }

    setCurrentMappingSheet(sheetName);
    setCurrentMappingTable(tableNameOrIdentifier);
    console.log(`[DEBUG BatchImporter] Setting showColumnMappingModal = true for ${sheetName} targeting table/identifier ${tableNameOrIdentifier}`);
    setShowColumnMappingModal(true);
  }, [sheets, _setError, tableInfoMap, isLoadingTables]);

  const handleModalSave = ( 
    mappings: Record<string, BatchColumnMapping>, 
    updatedNewTableNameFromModal?: string // Renamed for clarity
  ) => {
    if (currentMappingSheet && sheets[currentMappingSheet]) {
      console.log(`[DEBUG BatchImporter] handleModalSave for sheet: ${currentMappingSheet}`, { mappings, updatedNewTableNameFromModal });

      const currentSheetState = sheets[currentMappingSheet];
      let newSheetDataUpdates: Partial<SheetProcessingState> = { 
        columnMappings: mappings, 
        sheetReviewStatus: Object.values(mappings).every(m => m.reviewStatus === 'approved') ? 'approved' : 'partiallyApproved',
      };

      if (updatedNewTableNameFromModal && currentSheetState.isNewTable) {
        const sanitizedNewName = updatedNewTableNameFromModal.trim().replace(/\s+/g, '_'); // Basic sanitization
        newSheetDataUpdates.selectedTable = `new:${sanitizedNewName}`; // Correctly prefix

        if (currentSheetState.sheetSchemaProposals) {
          newSheetDataUpdates.sheetSchemaProposals = currentSheetState.sheetSchemaProposals.map(proposal => {
            // Assuming the first NewTableProposal for this sheet is the one to update.
            // A more robust solution might involve proposal IDs if multiple NewTableProposals per sheet were possible.
            // Type guard for NewTableProposal: checks for unique properties 'tableName' and 'columns' (as an array)
            if ('tableName' in proposal && 
                'columns' in proposal && 
                Array.isArray((proposal as NewTableProposal).columns) && 
                (proposal as NewTableProposal).sourceSheet === currentMappingSheet
            ) {
              return { ...proposal, tableName: sanitizedNewName } as NewTableProposal; // Cast is safe here
            }
            return proposal;
          });
        }
      }
      
      updateSheetProcessingState(currentMappingSheet, newSheetDataUpdates);
      
      console.log(`[DEBUG BatchImporter] Updated sheet data for ${currentMappingSheet} in store with new mappings.`);
    }
    // Ensure modal closes and sheet context is cleared even if sheet/store update fails, or handle errors more gracefully.
    setShowColumnMappingModal(false);
    // setCurrentMappingSheet(null); // Consider if this should be cleared here or if modal closure handles it
  };

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
      _setError(`Please complete and approve column mappings for: ${unmappedItems.join(', ')}`);
      return false;
    }
    console.log('[DEBUG BatchImporter] Column mapping check passed.');
    _setError(null);
    return true;
  }, [localSelectedSheets, localSkippedSheets, sheets, _setError]);

  const convertMappingsForDbService = (batchMappings: { [header: string]: BatchColumnMapping }): Record<string, ColumnMapping> => {
      const columnMappingsForDb: Record<string, ColumnMapping> = {};
      for (const headerKey in batchMappings) {
          const bm = batchMappings[headerKey];
          if ((bm.action === 'map' && bm.mappedColumn) || (bm.action === 'create' && bm.newColumnProposal?.columnName)) {
              columnMappingsForDb[headerKey] = {
                  excelColumn: bm.header, 
                  dbColumn: bm.action === 'create' ? bm.newColumnProposal!.columnName : bm.mappedColumn!, 
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

      if (hasMissingColumns && importSettings.createMissingColumns) {
        console.log('[DEBUG BatchImporter] Showing missing column preview modal.');
        setShowMissingColumnPreview(true);
        return true; 
      }
      console.log('[DEBUG BatchImporter] No missing columns found or create setting disabled.');
      return false; 
    } catch (error) {
      _setError('Error checking for missing columns.');
      return false;
    }
  }, [fileInfo, localSelectedSheets, localSkippedSheets, sheets, importSettings.createMissingColumns, dbService, _setError]);

  const handleProceedToNextStep = useCallback(async () => {
    console.log(`[DEBUG BatchImporter] handleProceedToNextStep called for step: ${importStep}`);
    let canProceed = true;
    _setError(null); 

    switch(importStep) {
      case 0: 
        if (!fileInfo || globalStatus === 'error' || globalStatus === 'readingFile') {
          _setError('Please upload a valid file and wait for it to be read.');
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
                _startProcessingSheets(); 
                
            } else {
                console.log('[DEBUG BatchImporter handleProceed] Analysis already in progress or completed.');
            }
            canProceed = true; 
          } else if (currentSchemaStatus === 'loading') {
            _setError('Schema information is still loading. Please wait.');
            canProceed = false;
          } else { 
             _setError('Schema information failed to load. Cannot proceed.');
             canProceed = false;
          }
        }
        break;
      case 1: 
        const unmapped = Object.entries(localSelectedSheets)
          .filter(([name, selected]) => selected && !localSkippedSheets[name])
          .filter(([name]) => !sheets[name]?.selectedTable);
        if (unmapped.length > 0) {
          _setError(`Please map tables for: ${unmapped.map(([name]) => name).join(', ')}`);
          canProceed = false;
        }
        break;
      case 2: 
        canProceed = checkColumnMappings(); 
        break;
      case 3: 
        break;
    }

    console.log(`[DEBUG BatchImporter] Proceed check result: ${canProceed}`);

    if (canProceed) {
      if (importStep === 2 && importSettings.createMissingColumns) {
        const modalShown = await checkMissingColumnsForPreview();
        if (!modalShown) {
          goToNextStep();
        } else {
        }
      } else if (importStep !== 2 || !importSettings.createMissingColumns) { 
        console.log('[DEBUG BatchImporter] Proceeding to next step.');
        goToNextStep();
      }
    }
  }, [importStep, fileInfo, globalStatus, localSelectedSheets, localSkippedSheets, sheets, _setError, checkColumnMappings, importSettings.createMissingColumns, checkMissingColumnsForPreview, goToNextStep]);

  const startActualImport = useCallback(async () => {
      const currentFile = useBatchImportStore.getState().file;
      const currentSheets = useBatchImportStore.getState().sheets; 

      if (!currentFile) {
          _setError('Cannot start import: file object is missing.');
          return;
      }

      _startCommit(); 

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
              _setError("No sheets are approved for import. Please review mappings.");
              _setGlobalStatus('review'); 
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
                    _setSheetCommitStatus(sheet.sheetName, 'error', `Failed to read sheet data for import.`);
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
              _setError("No valid sheets could be prepared for import (check read errors).");
              _setGlobalStatus('error');
              return;
          }

          console.log('Calling processBatchImport with jobs:', importJobs.length);
          _updateCommitProgress(0, importJobs.length, importJobs[0]?.sheetName || null);

          if (importMode === 'structureAndData') {
            console.log('[DEBUG BatchImporter] Mode: structureAndData. Calling dbService.processBatchImport...');
            try {
                await dbService.processBatchImport(
                    importJobs,
                    dataForImport, 
                    importSettings.createMissingColumns 
                );
                console.log('dbService.processBatchImport finished.');
            } catch (importError) {
                console.error('Error during dbService.processBatchImport:', importError);
                _setError(`Import failed: ${importError instanceof Error ? importError.message : String(importError)}`);
                _setGlobalStatus('error');
                importJobs.forEach(job => _setSheetCommitStatus(job.sheetName, 'error', 'Batch processing failed'));
                return; 
            }
          } else {
            importJobs.forEach(job => _setSheetCommitStatus(job.sheetName, 'committed', 'Schema structure applied (no data imported).'));
          }

          const finalSheetStates = useBatchImportStore.getState().sheets; 
          const failedSheets = importJobs.filter(job => finalSheetStates[job.sheetName]?.status === 'error');

          if (failedSheets.length > 0) {
              _setError(`Import completed with errors for sheets: ${failedSheets.map(j => j.sheetName).join(', ')}`);
              _setGlobalStatus('error');
          } else {
              _setCommitComplete(); 
              setSnackbarMessage('Import completed successfully!');
              setSnackbarOpen(true);
              if (onImportComplete) onImportComplete();
          }

      } catch (error) { 
          console.error('[DEBUG BatchImporter] Unexpected error during startActualImport:', error);
          _setError(`An unexpected error occurred during import: ${error instanceof Error ? error.message : String(error)}`);
          _setGlobalStatus('error');
          if (importJobs && importJobs.length > 0) {
             importJobs.forEach(job => {
                if (useBatchImportStore.getState().sheets[job.sheetName]?.status !== 'error') {
                   _setSheetCommitStatus(job.sheetName, 'error', 'Unexpected batch error');
                }
             });
          }
      }
  }, [ 
      localSelectedSheets, localSkippedSheets, _setError, _setGlobalStatus, _startCommit,
      fileInfo, _setSheetCommitStatus, _updateCommitProgress, dbService, importSettings.createMissingColumns,
      _setCommitComplete, onImportComplete, setSnackbarMessage, setSnackbarOpen, convertMappingsForDbService
  ]);

  const handleStartImportClick = useCallback(async () => {
      _setError(null); 
      if (!checkColumnMappings()) {
          console.log('[DEBUG BatchImporter] Column mapping check failed in handleStartImportClick.');
          return;
      }

      if (importSettings.createMissingColumns) {
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
      _setError, checkColumnMappings, importSettings.createMissingColumns,
      checkMissingColumnsForPreview, startActualImport
  ]);

  const handleReset = useCallback(() => {
    _resetState();
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
  }, [_resetState, loadSchemaInfo]);

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  const handleApplySettings = useCallback((newSettings: ImportSettings) => {
    setImportSettings(newSettings);
    handleCloseSettings();
    const currentFile = useBatchImportStore.getState().file;
    if (currentFile) {
      console.log("Settings changed, re-processing file...");
      FileReader.readFile(currentFile).then(workbookInfo => handleFileLoaded(workbookInfo, currentFile));
    }
  }, [handleCloseSettings, handleFileLoaded]);

  const reconstructedWorkbookInfo: WorkbookInfo | null = useMemo(() => {
      if (!fileInfo) return null;
      return {
          fileName: fileInfo.name,
          fileType: fileInfo.type as FileType, 
          sheets: Object.values(sheets).map(s => ({
              name: s.sheetName,
              columnCount: s.headers.length,
              rowCount: s.rowCount,
              columns: s.headers,
              previewRows: s.sampleData,
          }))
      };
  }, [fileInfo, sheets]);

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
            </Box>

            <Stepper activeStep={importStep} sx={{ my: 3 }}>
              {importSteps.map((label) => (
                <Step key={label}><StepLabel>{label}</StepLabel></Step>
              ))}
            </Stepper>

            {storeError && (
              <Alert severity="error" sx={{ my: 2 }} action={
                <IconButton aria-label="close" color="inherit" size="small" onClick={() => _setError(null)}> 
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              }>{storeError}</Alert>
            )}

            {/* Step Content */}
            {importStep === 0 && (
              <FileUploadStep
                workbookInfo={reconstructedWorkbookInfo} 
                isLoadingTables={isLoadingTables || schemaCacheStatus === 'loading'}
                onFileLoaded={handleFileLoaded}
                onContinue={goToNextStep}
              />
            )}
            {importStep === 1 && fileInfo && (
              <TableMappingStep
                sheets={sheets}
                tables={tables}
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
                 isProcessing={globalStatus === 'analyzing'}
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
                 importSettings={importSettings}
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
        <ImportSettingsDialog open={settingsOpen} settings={importSettings} onClose={handleCloseSettings} onApply={handleApplySettings} />
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
        {(showColumnMappingModal && currentMappingSheet && (
          (() => {
            const sheetFromStore = sheets[currentMappingSheet];
            const tableTargetName = sheetFromStore?.selectedTable;
            const isCreatingNew = tableTargetName?.startsWith('new:') || false; 
            const actualTargetTableName = isCreatingNew && tableTargetName ? tableTargetName.substring(4) : tableTargetName;

            const tableInfoForModal = tableTargetName ? 
              (isCreatingNew ? 
                { tableName: actualTargetTableName || 'new_table_error', columns: [], isNew: true, tableIdentifier: tableTargetName } :
                (tableInfoMap && actualTargetTableName && tableInfoMap[actualTargetTableName] ? 
                  { ...tableInfoMap[actualTargetTableName], isNew: false, tableIdentifier: tableTargetName } :
                  null))
              : null;

            return (
              <ColumnMappingModal
                open={showColumnMappingModal}
                onClose={() => setShowColumnMappingModal(false)}
                onSave={handleModalSave} 
                sheetState={sheetFromStore} 
                tableInfo={tableInfoForModal} 
                isCreatingTable={isCreatingNew}
              />
            );
          })()
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