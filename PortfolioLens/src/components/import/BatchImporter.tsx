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
import { WorkbookInfo, MissingColumnInfo, ImportSettings, TableInfo, SheetProcessingState, ColumnMapping, BatchColumnMapping, FileType, ImportJob } from './types'; // Added FileType, ImportJob
import { useSchemaInfo, useBatchImportWorker } from './BatchImporterHooks'; // <-- Import the new hooks

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
import { useBatchImportStore } from '../../store/batchImportStore'; // <-- Store Import

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
  // --- End Local UI State ---

  // --- Custom Hooks ---
  const { tables, tableInfoMap, isLoadingTables, loadSchemaInfo } = useSchemaInfo();
  const { postWorkerTask } = useBatchImportWorker(tableInfoMap); // Get postWorkerTask
  // --- End Custom Hooks ---

  // --- Effects ---
  // REMOVED: useEffect for automatically triggering analysis based on state changes.
  // Triggering is now handled explicitly in handleProceedToNextStep for step 0.
  // --- End Effects ---


  const dbService = useMemo(() => new DatabaseService(), []);

  const importSteps = ['Upload file', 'Map sheets to tables', 'Map columns', 'Review and import'];

  const goToNextStep = useCallback(() => {
    console.log('[DEBUG BatchImporter] goToNextStep called.');
    setImportStep(current => Math.min(current + 1, importSteps.length - 1));
  }, []);

  const goToPreviousStep = useCallback(() => {
    console.log('[DEBUG BatchImporter] goToPreviousStep called.');
    setImportStep(current => Math.max(current - 1, 0));
  }, []);

  const handleFileLoaded = useCallback(async (workbookInfo: WorkbookInfo, fileObj: File) => {
    console.log('[DEBUG BatchImporter] handleFileLoaded:', fileObj.name);
    _resetState();
    _setFile(fileObj);
    _setGlobalStatus('readingFile');

    try {
      const initialLocalSelected: Record<string, boolean> = {};
      const initialLocalSkipped: Record<string, boolean> = {};

      const sheetDataPromises = workbookInfo.sheets.map(async (sheet) => {
        try {
          console.log(`[DEBUG BatchImporter] Reading sheet: ${sheet.name}`);
          const fullSheetData = await FileReader.getSheetData(fileObj, sheet.name);
          const headers = fullSheetData.length > 0 ? Object.keys(fullSheetData[0]) : [];
          const sampleData = fullSheetData.slice(0, 25); // Increased sample size to 25
          console.log(`[DEBUG BatchImporter] Calling _setSheetData for ${sheet.name} with ${sampleData.length} sample rows.`);
          _setSheetData(sheet.name, headers, sampleData, sheet.rowCount);
          initialLocalSelected[sheet.name] = true;
          initialLocalSkipped[sheet.name] = false;
        } catch (sheetError) {
          console.error(`[DEBUG BatchImporter] Error reading sheet ${sheet.name}:`, sheetError);
          _setSheetCommitStatus(sheet.name, 'error', `Failed to read sheet data: ${sheetError instanceof Error ? sheetError.message : String(sheetError)}`);
        }
      });

      await Promise.all(sheetDataPromises);
      console.log('[DEBUG BatchImporter] Finished reading all sheets.');

      setLocalSelectedSheets(initialLocalSelected);
      setLocalSkippedSheets(initialLocalSkipped);

      const readingErrorOccurred = Object.values<SheetProcessingState>(useBatchImportStore.getState().sheets).some(s => s.status === 'error');
      if (readingErrorOccurred) {
         console.error('[DEBUG BatchImporter] Errors occurred during sheet reading.');
         _setError("Errors occurred while reading sheet data. Please check individual sheets.");
         setSnackbarMessage("Error reading file. Check sheet statuses.");
         setSnackbarOpen(true);
         _setGlobalStatus('error');
         // REMOVED: goToNextStep(); - Let user manually proceed even on read errors to see details.
         return;
      }

      setSnackbarMessage(`Successfully read ${workbookInfo.sheets.length} sheets. Waiting for schema analysis...`);
      setSnackbarOpen(true);

      // Set status to indicate file reading is done, let the useEffect handle processing start
      console.log('[DEBUG BatchImporter] Setting globalStatus to fileReadComplete.');
      
      // Ensure schema cache status is ready before setting fileReadComplete
      const currentSchemaStatus = useBatchImportStore.getState().schemaCacheStatus;
      if (currentSchemaStatus !== 'ready') {
        console.log(`[DEBUG BatchImporter] Schema cache status is ${currentSchemaStatus}, setting to ready.`);
        _setSchemaCacheStatus('ready');
      }
      
      _setGlobalStatus('fileReadComplete');

      // REMOVED: Explicit trigger logic - moved to useEffect


    } catch (error) {
      console.error('[DEBUG BatchImporter] Error processing file:', error);
      _setError(`Failed to process the file: ${error instanceof Error ? error.message : String(error)}`);
      setSnackbarMessage(`Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSnackbarOpen(true);
      _setGlobalStatus('error');
    }
  }, [_resetState, _setFile, _setGlobalStatus, importSettings.useFirstRowAsHeader, _setSheetData, _setSheetCommitStatus, _setError, goToNextStep]); // Removed schemaCacheStatus, _startProcessingSheets

  const handleTableSelection = useCallback((sheetName: string, selectedValue: string | null) => {
    console.log(`[DEBUG BatchImporter] handleTableSelection - Sheet: ${sheetName}, Selected Value: ${selectedValue}`);
    let finalSelectedValue = selectedValue;
    let isCreating = false;

    if (selectedValue === 'create-new-table') {
      const suggestedName = sheetName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').substring(0, 50);
      // Basic prompt for now, replace with a proper dialog later
      const newTableName = prompt(`Enter a name for the new table (based on sheet "${sheetName}"):`, suggestedName);

      if (!newTableName || !newTableName.trim()) {
        console.log('[DEBUG BatchImporter] Table creation cancelled or invalid name.');
        // If cancelled, reset selection in store to trigger re-render if needed
        _setSelectedTable(sheetName, sheets[sheetName]?.selectedTable || null); // Revert to previous or null
        return; // Don't proceed if cancelled or empty
      }
      finalSelectedValue = `new:${newTableName.trim()}`;
      isCreating = true;
      console.log(`[DEBUG BatchImporter] Determined final value (new table): ${finalSelectedValue}`);
    } else {
      console.log(`[DEBUG BatchImporter] Determined final value (existing table): ${finalSelectedValue}`);
    }

    // Update the store with the selected table (or new table identifier)
    console.log(`[DEBUG BatchImporter] Calling _setSelectedTable - Sheet: ${sheetName}, Value: ${finalSelectedValue}, IsNew: ${isCreating}`);
    _setSelectedTable(sheetName, finalSelectedValue, isCreating); // Pass isCreating flag

    // Get the latest sheet state *after* the update
    // Use a slight delay to increase chance of state update propagation
    // This delay might still be problematic, consider Zustand's subscribe or selectors if issues persist
    setTimeout(() => {
        const updatedSheetState = useBatchImportStore.getState().sheets[sheetName];
        console.log(`[DEBUG BatchImporter] Fetched updated sheet state for ${sheetName} after selection:`, updatedSheetState ? { status: updatedSheetState.status, selectedTable: updatedSheetState.selectedTable } : 'NOT FOUND');

        if (updatedSheetState && updatedSheetState.status === 'analyzing') { // Check if status correctly set to analyzing
          // Ensure the selectedTable in the state reflects the *new* selection for the worker task
          // The store should already have the latest selectedTable due to the _setSelectedTable call above
          console.log(`[DEBUG BatchImporter] State being sent to worker for ${sheetName}:`, { sheetName: updatedSheetState.sheetName, selectedTable: updatedSheetState.selectedTable, headers: '...', sampleData: '...' }); // Avoid logging large data

          console.log(`[DEBUG BatchImporter] Calling postWorkerTask for sheet: ${sheetName}`);
          postWorkerTask(updatedSheetState); // Send the whole updated state object

          // Setting status to 'processing' might be redundant if worker sets it, but can be useful UI feedback
          // console.log(`[DEBUG BatchImporter] Calling _setSheetCommitStatus - Sheet: ${sheetName}, Status: processing`);
          // _setSheetCommitStatus(sheetName, 'processing');
        } else {
          console.error(`[DEBUG BatchImporter] Could not find sheet state for ${sheetName} or status not 'analyzing' after selection update.`);
          // _setError(`Failed to reprocess sheet ${sheetName} after table selection.`); // Avoid setting error if it's just a timing issue
        }
    }, 100); // Increased delay slightly - consider removing if store updates are reliable enough

  }, [_setSelectedTable, postWorkerTask, _setSheetCommitStatus, _setError, sheets]); // Added sheets dependency

  const openColumnMapping = useCallback((sheetName: string) => {
    const sheetState = sheets[sheetName];
    if (!sheetState || !sheetState.selectedTable) {
      _setError(`Cannot open mapping for ${sheetName}. Ensure a table is selected or creation is intended.`);
      return;
    }
    const tableNameOrIdentifier = sheetState.selectedTable;
    console.log('[DEBUG BatchImporter] Opening column mapping modal for', sheetName, tableNameOrIdentifier);

    const isCreating = tableNameOrIdentifier.startsWith('new:');
    const actualTableName = isCreating ? tableNameOrIdentifier.substring(4) : tableNameOrIdentifier;

    if (!isCreating && !tableInfoMap[actualTableName]) {
        console.warn(`[DEBUG BatchImporter] Table info for ${actualTableName} not found in map. Modal might lack details.`);
    }

    setCurrentMappingSheet(sheetName);
    setCurrentMappingTable(tableNameOrIdentifier);
    setShowColumnMappingModal(true);
  }, [sheets, _setError, tableInfoMap]);

  const handleSaveColumnMappings = useCallback((updatedMappings: Record<string, Partial<BatchColumnMapping>>) => {
    console.log(`[DEBUG BatchImporter] Saving column mappings for ${currentMappingSheet}`);
    Object.entries(updatedMappings).forEach(([header, mappingUpdate]) => {
      _updateSheetMapping(currentMappingSheet, header, mappingUpdate);
    });

    // After updating individual mappings, check if the sheet is now fully mapped
    // Use setTimeout to allow store updates to propagate before checking
    setTimeout(() => {
        const latestSheetState = useBatchImportStore.getState().sheets[currentMappingSheet];
        if (latestSheetState) {
            const allColumnsHandled = Object.values(latestSheetState.columnMappings).every(
                m => m.action === 'skip' || m.action === 'map' || m.action === 'create'
            );

            if (allColumnsHandled) {
                console.log(`[DEBUG BatchImporter] All columns handled for ${currentMappingSheet}. Setting status to 'ready'.`);
                // Use _setSheetCommitStatus or a dedicated action if available
                // Assuming _setSheetCommitStatus updates the main 'status' field used by ColumnMappingStep
                 useBatchImportStore.getState().setSheetCommitStatus(currentMappingSheet, 'ready');
            } else {
                console.log(`[DEBUG BatchImporter] Columns still need review for ${currentMappingSheet}. Setting status to 'needsReview'.`);
                 useBatchImportStore.getState().setSheetCommitStatus(currentMappingSheet, 'needsReview');
            }
        } else {
             console.warn(`[DEBUG BatchImporter] Could not find sheet state for ${currentMappingSheet} after saving mappings.`);
        }
    }, 100); // Small delay for store update

    setShowColumnMappingModal(false);
    setSnackbarMessage(`Mappings saved for sheet: ${currentMappingSheet}`);
    setSnackbarOpen(true);
  }, [currentMappingSheet, _updateSheetMapping]); // Keep dependencies minimal, access store directly in timeout

  const handleSheetSelectionToggle = useCallback((sheetName: string) => {
    if (localSkippedSheets[sheetName]) return;
    console.log(`[DEBUG BatchImporter] Toggling selection for sheet: ${sheetName}`);
    setLocalSelectedSheets(prev => ({ ...prev, [sheetName]: !prev[sheetName] }));
  }, [localSkippedSheets]);

  const handleSkipSheet = useCallback((sheetName: string, skipped: boolean) => {
    console.log(`[DEBUG BatchImporter] Setting skip status for sheet: ${sheetName} to ${skipped}`);
    setLocalSkippedSheets(prev => ({ ...prev, [sheetName]: skipped }));
    if (skipped) {
      setLocalSelectedSheets(prev => ({ ...prev, [sheetName]: false }));
    }
  }, []);

  const handleSelectAll = useCallback((selected: boolean) => {
    console.log(`[DEBUG BatchImporter] Setting select all to: ${selected}`);
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
      .filter(([sheetName, selected]) => selected && !localSkippedSheets[sheetName])
      .forEach(([sheetName]) => {
        const sheetState = sheets[sheetName];
        if (!sheetState) {
          console.warn(`[DEBUG BatchImporter] Sheet state not found for selected sheet: ${sheetName}`);
          allMappingsComplete = false;
          unmappedItems.push(`${sheetName} (data error)`);
          return;
        }
        if (!sheetState.selectedTable) {
          console.warn(`[DEBUG BatchImporter] No table selected for sheet: ${sheetName}`);
          allMappingsComplete = false;
          unmappedItems.push(`${sheetName} (no table)`);
          return;
        }
        // Check review status instead of processing status
        if (sheetState.sheetReviewStatus !== 'approved') {
           console.warn(`[DEBUG BatchImporter] Sheet not approved: ${sheetName} (Status: ${sheetState.sheetReviewStatus})`);
           // Check if *any* column is still pending or modified
           const needsReview = Object.values(sheetState.columnMappings).some(
               m => m.reviewStatus === 'pending' || m.reviewStatus === 'modified'
           );
           if (needsReview) {
               allMappingsComplete = false;
               unmappedItems.push(`${sheetName} (columns need review)`);
           } else if (sheetState.sheetReviewStatus === 'rejected') {
               // If sheet is rejected, it's "complete" in terms of review, but won't be imported
               console.log(`[DEBUG BatchImporter] Sheet ${sheetName} is rejected, skipping import.`);
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
      const columnMappings: Record<string, ColumnMapping> = {};
      for (const header in batchMappings) {
          const bm = batchMappings[header];
          // Only include mappings that are approved and not skipped/create
          if (bm.action === 'map' && bm.mappedColumn && bm.inferredDataType && bm.reviewStatus === 'approved') {
              columnMappings[header] = {
                  excelColumn: bm.header,
                  dbColumn: bm.mappedColumn,
                  type: bm.inferredDataType,
              };
          }
      }
      return columnMappings;
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
          // Only check approved sheets with existing tables
          if (sheetState && sheetState.selectedTable && !sheetState.selectedTable.startsWith('new:') && sheetState.sheetReviewStatus === 'approved') {
            console.log(`[DEBUG BatchImporter] Checking missing columns for approved sheet: ${sheetName}, Table: ${sheetState.selectedTable}`);
            previewDataForModal[sheetName] = sheetState.sampleData;
            const tableName = sheetState.selectedTable;
            const batchMapping = sheetState.columnMappings || {};
            const columnMappingForDb = convertMappingsForDbService(batchMapping); // Uses approved mappings
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
        return true; // Modal will be shown
      }
      console.log('[DEBUG BatchImporter] No missing columns found or create setting disabled.');
      return false; // Modal not shown
    } catch (error) {
      console.error('[DEBUG BatchImporter] Error checking missing columns for preview:', error);
      _setError('Error checking for missing columns.');
      return false;
    }
  }, [fileInfo, localSelectedSheets, localSkippedSheets, sheets, importSettings.createMissingColumns, dbService, _setError]);


  const handleProceedToNextStep = useCallback(async () => {
    console.log(`[DEBUG BatchImporter] handleProceedToNextStep called for step: ${importStep}`);
    let canProceed = true;
    _setError(null); // Clear previous errors

    switch(importStep) {
      case 0: // Upload Step -> Trigger Analysis before proceeding
        if (!fileInfo || globalStatus === 'error' || globalStatus === 'readingFile') {
          _setError('Please upload a valid file and wait for it to be read.');
          canProceed = false;
        } else {
          // Check if schema is ready before allowing progression
          const currentSchemaStatus = useBatchImportStore.getState().schemaCacheStatus;
          if (currentSchemaStatus === 'ready') {
            console.log('[DEBUG BatchImporter handleProceed] Schema ready. Checking if analysis has started.');
            
            // Check if any sheets are already being processed
            const currentSheets = useBatchImportStore.getState().sheets;
            const hasProcessingSheets = Object.values(currentSheets).some(sheet =>
                sheet.status === 'processing' || sheet.status === 'needsReview' || sheet.status === 'ready'
            );
            
            // Log the current state of sheets
            console.log('[DEBUG BatchImporter handleProceed] Current sheets state:',
              Object.entries(currentSheets).map(([name, sheet]) => ({
                name,
                status: sheet.status,
                hasTableSuggestions: !!sheet.tableSuggestions && sheet.tableSuggestions.length > 0,
                selectedTable: sheet.selectedTable
              }))
            );
            
            // If no sheets are being processed yet, trigger analysis
            // This is a fallback in case the automatic task posting in useBatchImportWorker didn't work
            if (!hasProcessingSheets && globalStatus !== 'analyzing') {
                console.log('[DEBUG BatchImporter handleProceed] No sheets being processed. Triggering analysis manually.');
                _startProcessingSheets(); // Set global status to 'analyzing'
                
                // Let the useEffect in useBatchImportWorker handle the task posting
                // This avoids duplicate task posting
            } else {
                console.log('[DEBUG BatchImporter handleProceed] Analysis already in progress or completed.');
            }
            canProceed = true; // Allow proceeding to next step
          } else if (currentSchemaStatus === 'loading') {
            _setError('Schema information is still loading. Please wait.');
            canProceed = false;
          } else { // Error or idle (shouldn't happen if file loaded)
             _setError('Schema information failed to load. Cannot proceed.');
             canProceed = false;
          }
        }
        break;
      case 1: // Table Mapping Step
        const unmapped = Object.entries(localSelectedSheets)
          .filter(([name, selected]) => selected && !localSkippedSheets[name])
          .filter(([name]) => !sheets[name]?.selectedTable);
        if (unmapped.length > 0) {
          _setError(`Please map tables for: ${unmapped.map(([name]) => name).join(', ')}`);
          canProceed = false;
        }
        break;
      case 2: // Column Mapping Step
        canProceed = checkColumnMappings(); // Checks if all selected/approved sheets have columns reviewed
        break;
      case 3: // Review Step - Always allow proceeding to import attempt
        break;
    }

    console.log(`[DEBUG BatchImporter] Proceed check result: ${canProceed}`);

    if (canProceed) {
      // Special check before leaving Column Mapping step (only relevant if proceeding from step 2)
      if (importStep === 2 && importSettings.createMissingColumns) {
        console.log('[DEBUG BatchImporter] Checking for missing columns before proceeding from step 2.');
        const modalShown = await checkMissingColumnsForPreview();
        if (!modalShown) {
          console.log('[DEBUG BatchImporter] No missing columns modal shown, proceeding to next step.');
          goToNextStep();
        } else {
          console.log('[DEBUG BatchImporter] Missing columns modal shown, staying on step 2.');
        }
      } else if (importStep !== 2 || !importSettings.createMissingColumns) { // Proceed normally if not step 2 or not creating columns
        console.log('[DEBUG BatchImporter] Proceeding to next step.');
        goToNextStep();
      }
    }
    // Add postWorkerTask and _startProcessingSheets to dependencies
  }, [importStep, fileInfo, globalStatus, localSelectedSheets, localSkippedSheets, sheets, _setError, checkColumnMappings, importSettings.createMissingColumns, checkMissingColumnsForPreview, goToNextStep, postWorkerTask, _startProcessingSheets]);

  const startActualImport = useCallback(async () => {
      console.log('[DEBUG BatchImporter] startActualImport called.');
      // Access state directly inside the function to ensure freshness
      const currentFile = useBatchImportStore.getState().file;
      const currentSheets = useBatchImportStore.getState().sheets; // Get current sheets state

      if (!currentFile) {
          console.error('[DEBUG BatchImporter] Cannot start import: file object is missing.');
          _setError('Cannot start import: file object is missing.');
          return;
      }

      _startCommit(); // Sets globalStatus to 'committing'

      let importJobs: ImportJob[] = []; // Define within scope
      let dataForImport: Record<string, any[]> = {}; // Define within scope

      try {
          // Filter sheets based on local selection, skip status, AND review status
          const sheetsToImport = Object.values<SheetProcessingState>(currentSheets).filter(sheet => // Use currentSheets
              localSelectedSheets[sheet.sheetName] &&
              !localSkippedSheets[sheet.sheetName] &&
              sheet.sheetReviewStatus === 'approved' && // Only import approved sheets
              sheet.selectedTable // Ensure a table is selected
          );
          console.log(`[DEBUG BatchImporter] Found ${sheetsToImport.length} sheets approved for import.`);

          if (sheetsToImport.length === 0) {
              _setError("No sheets are approved for import. Please review mappings.");
              _setGlobalStatus('review'); // Go back to review state
              return;
          }

          console.log('[DEBUG BatchImporter] Reading full data for selected sheets...');
          dataForImport = {}; // Initialize
          for (const sheet of sheetsToImport) {
              try {
                  const data = await FileReader.getSheetData(currentFile, sheet.sheetName);
                  dataForImport[sheet.sheetName] = data;
              } catch (readError) {
                  console.error(`[DEBUG BatchImporter] Error reading full data for sheet ${sheet.sheetName}:`, readError);
                  _setSheetCommitStatus(sheet.sheetName, 'error', `Failed to read sheet data for import.`);
              }
          }

          // Create import jobs only for sheets where data was successfully read
          importJobs = sheetsToImport // Assign
              .filter(sheet => dataForImport[sheet.sheetName]) // Ensure data exists
              .map(sheet => {
                  // Extract column proposals for creation
                  const proposals = Object.values(sheet.columnMappings)
                      .filter(mapping => mapping.action === 'create' && mapping.newColumnProposal)
                      .map(mapping => mapping.newColumnProposal!);

                  return {
                      id: `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      userId: 'current-user', // Replace later
                      fileName: fileInfo?.name ?? 'unknown',
                      tableName: sheet.selectedTable!, // Should be defined
                      sheetName: sheet.sheetName,
                      mapping: convertMappingsForDbService(sheet.columnMappings),
                      newColumnProposals: proposals,
                      status: 'pending',
                      totalRows: sheet.rowCount,
                      processedRows: 0,
                      createdAt: new Date(),
                      updatedAt: new Date()
                  };
              }); // Semicolon removed as it's end of assignment

          console.log(`[DEBUG BatchImporter] Created ${importJobs.length} import jobs.`);

          if (importJobs.length === 0) {
              _setError("No valid sheets could be prepared for import (check read errors).");
              _setGlobalStatus('error');
              return;
          }

          console.log('Calling processBatchImport with jobs:', importJobs.length);
          _updateCommitProgress(0, importJobs.length, importJobs[0]?.sheetName || null);

          console.log('Calling dbService.processBatchImport...');
          try {
              await dbService.processBatchImport(
                  importJobs,
                  dataForImport,
                  importSettings.createMissingColumns // Pass the setting
              );
              console.log('dbService.processBatchImport finished.');

          } catch (importError) {
              console.error('Error during dbService.processBatchImport:', importError);
              _setError(`Import failed: ${importError instanceof Error ? importError.message : String(importError)}`);
              _setGlobalStatus('error');
              importJobs.forEach(job => _setSheetCommitStatus(job.sheetName, 'error', 'Batch processing failed'));
              return;
          }

          // Check final status after successful or partially successful import
          const finalSheetStates = useBatchImportStore.getState().sheets; // Get latest state again
          const failedSheets = importJobs.filter(job => finalSheetStates[job.sheetName]?.status === 'error');

          if (failedSheets.length > 0) {
              _setError(`Import completed with errors for sheets: ${failedSheets.map(j => j.sheetName).join(', ')}`);
              _setGlobalStatus('error');
          } else {
              _setCommitComplete(); // Sets globalStatus to 'complete'
              setSnackbarMessage('Import completed successfully!');
              setSnackbarOpen(true);
              if (onImportComplete) onImportComplete();
          }

      } catch (error) { // Outer catch
          console.error('[DEBUG BatchImporter] Unexpected error during startActualImport:', error);
          _setError(`An unexpected error occurred during import: ${error instanceof Error ? error.message : String(error)}`);
          _setGlobalStatus('error');
          // Ensure sheets that were part of the attempt are marked as error
          if (importJobs && importJobs.length > 0) {
             importJobs.forEach(job => {
                if (useBatchImportStore.getState().sheets[job.sheetName]?.status !== 'error') {
                   _setSheetCommitStatus(job.sheetName, 'error', 'Unexpected batch error');
                }
             });
          }
      }
  }, [ // Ensure ALL external variables/functions used inside are listed
      localSelectedSheets, localSkippedSheets, _setError, _setGlobalStatus, _startCommit,
      fileInfo, _setSheetCommitStatus, _updateCommitProgress, dbService, importSettings.createMissingColumns,
      _setCommitComplete, onImportComplete, setSnackbarMessage, setSnackbarOpen, convertMappingsForDbService
      // Note: `sheets` from the store is accessed via getState() inside, so not needed here
  ]);

  const handleStartImportClick = useCallback(async () => {
      _setError(null); // Use action from store
      if (!checkColumnMappings()) {
          console.log('[DEBUG BatchImporter] Column mapping check failed in handleStartImportClick.');
          return;
      }

      if (importSettings.createMissingColumns) {
          console.log('[DEBUG BatchImporter] Checking for missing columns preview...');
          const modalShown = await checkMissingColumnsForPreview();
          if (modalShown) {
              console.log('[DEBUG BatchImporter] Missing columns modal shown, waiting for user confirmation.');
              return; // Wait for modal confirmation
          }
          console.log('[DEBUG BatchImporter] No missing columns modal shown or needed.');
      } else {
          console.log('[DEBUG BatchImporter] Skipping missing columns check as createMissingColumns is false.');
      }

      // If no modal shown or createMissingColumns is false, proceed
      console.log('[DEBUG BatchImporter] Proceeding to actual import...');
      await startActualImport();
  }, [ // Ensure ALL external variables/functions used inside are listed
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

  // --- Render Logic ---
  // Helper to construct WorkbookInfo for child components that need it
  const reconstructedWorkbookInfo: WorkbookInfo | null = useMemo(() => {
      if (!fileInfo) return null;
      return {
          fileName: fileInfo.name,
          fileType: fileInfo.type as FileType, // Assuming fileInfo.type is compatible
          sheets: Object.values(sheets).map(s => ({
              name: s.sheetName,
              columnCount: s.headers.length,
              rowCount: s.rowCount,
              columns: s.headers,
              previewRows: s.sampleData,
              // columnTypes might be missing, add if available/needed
          }))
      };
  }, [fileInfo, sheets]);

  return (
    <>
      <Box sx={{ my: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>Batch Excel Import</Typography>
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
                <IconButton aria-label="close" color="inherit" size="small" onClick={() => _setError(null)}> {/* Use store action */}
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              }>{storeError}</Alert>
            )}

            {/* Step Content */}
            {importStep === 0 && (
              <FileUploadStep
                workbookInfo={reconstructedWorkbookInfo} // Pass reconstructed or null
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
            {importStep === 3 && fileInfo && reconstructedWorkbookInfo && ( // Ensure reconstructedWorkbookInfo is not null
              <ReviewImportStep
                 workbookInfo={reconstructedWorkbookInfo} // Pass non-null WorkbookInfo
                 sheetTableMappings={Object.fromEntries(Object.entries(sheets).map(([name, state]) => [name, state.selectedTable || '']))}
                 selectedSheets={localSelectedSheets} // Pass correct prop name
                 importSettings={importSettings}
                 isImporting={globalStatus === 'committing'}
                 importProgress={commitProgress ? Math.round((commitProgress.processedSheets / commitProgress.totalSheets) * 100) : 0}
                 onStartImport={handleStartImportClick}
                 onBack={goToPreviousStep}
                 errors={storeError ? { global: storeError } : {}}
                 importResults={Object.fromEntries(Object.entries(sheets).map(([name, state]) => [name, { success: state.status === 'committed', message: state.error || (state.status === 'committed' ? 'Success' : ''), rowCount: state.rowCount }]))}
                 excelData={Object.fromEntries(Object.entries(sheets).map(([name, state]) => [name, state.sampleData]))}
                 columnMappings={Object.fromEntries(Object.entries(sheets).map(([name, state]) => [`${name}-${state.selectedTable}`, state.columnMappings]))}
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
{/* --- DEBUG LOGGING --- */}
        {showColumnMappingModal && console.log('[DEBUG BatchImporter Render] Modal Props:', {
            sheet: currentMappingSheet,
            tableIdentifier: currentMappingTable,
            isCreating: currentMappingTable.startsWith('new:'),
            tableInfoFromMap: tableInfoMap[currentMappingTable.startsWith('new:') ? currentMappingTable.substring(4) : currentMappingTable]
        })}
        {/* --- END DEBUG LOGGING --- */}
        <ColumnMappingModal
          open={showColumnMappingModal}
          onClose={() => setShowColumnMappingModal(false)}
          onSave={handleSaveColumnMappings}
          sheetState={sheets[currentMappingSheet]}
          tableInfo={tableInfoMap[currentMappingTable.startsWith('new:') ? '' : currentMappingTable]}
          isCreatingTable={currentMappingTable.startsWith('new:')}
          // Removed incorrect columnSuggestions prop
        />
      </Box>

      <Snackbar open={snackbarOpen} autoHideDuration={6000} onClose={() => setSnackbarOpen(false)} message={snackbarMessage} action={
        <IconButton size="small" aria-label="close" color="inherit" onClick={() => setSnackbarOpen(false)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      } />
    </>
  );
};