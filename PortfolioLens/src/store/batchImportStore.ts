import { create } from 'zustand';
import {
  BatchImportState,
  SheetProcessingState,
  BatchColumnMapping,
  RankedTableSuggestion,
  RankedColumnSuggestion,
  SchemaProposal,
  NewColumnProposal,
  NewTableProposal,
  SheetReviewStatus,
  ReviewStatus,
  GlobalStatus,
  SheetCommitStatus,
  ColumnType,
  ImportSettings
} from '../components/import/types';

// Helper function to map abstract ColumnType to a basic SQL type
const mapColumnTypeToSqlType = (columnType: ColumnType | null): string => {
  if (!columnType) return 'TEXT'; // Default SQL type
  switch (columnType) {
    case 'string': return 'TEXT';
    case 'number': return 'NUMERIC'; // Or INTEGER, REAL, etc. depending on expected precision
    case 'boolean': return 'BOOLEAN';
    case 'date': return 'TIMESTAMP'; // Or DATE, DATETIME
    default: return 'TEXT';
  }
};

// Define the interface for the store's actions
interface BatchImportActions {
  setFile: (file: File | null) => void;
  setSheetData: (sheetName: string, headers: string[], sampleData: Record<string, any>[], rowCount: number) => void;
  startProcessingSheets: () => void; 
  updateSheetSuggestions: (
    sheetName: string,
    tableSuggestions: RankedTableSuggestion[],
    columnMappings: { [header: string]: BatchColumnMapping },
    tableConfidenceScore?: number,
    sheetSchemaProposals?: SchemaProposal[] 
  ) => void;
  updateSheetMapping: ( 
    sheetName: string,
    header: string,
    mappingUpdate: Partial<BatchColumnMapping>
  ) => void;
  batchUpdateSheetMappings: ( 
    sheetName: string,
    headers: string[],
    action: 'map' | 'skip' | 'create'
  ) => void;
  setSelectedTable: (sheetName: string, tableName: string | null, isNew?: boolean) => void; 
  setGlobalStatus: (status: GlobalStatus) => void; 
  setSchemaCacheStatus: (status: BatchImportState['schemaCacheStatus']) => void;
  // updateSchemaProposals: (sheetName: string, proposals: SchemaProposal[]) => void; 
  updateOverallSchemaProposals: () => void; 
  startCommit: () => void;
  updateCommitProgress: (processedSheets: number, totalSheets: number, currentSheet: string | null) => void;
  setCommitComplete: () => void;
  setSheetCommitStatus: (sheetName: string, status: SheetCommitStatus, error?: string) => void; 
  setError: (errorMessage: string | null) => void;
  resetState: () => void;
  setImportSettings: (settings: ImportSettings | null) => void;

  // --- Review and Approval Actions ---
  approveSheetMapping: (sheetName: string) => void; 
  rejectSheetMapping: (sheetName: string) => void; 
  approveColumnMapping: (sheetName: string, header: string) => void; 
  rejectColumnMapping: (sheetName: string, header: string) => void; 
  approveAllHighConfidenceSheets: () => void; 
  approveAllColumnsInSheet: (sheetName: string) => void; 
  rejectAllColumnsInSheet: (sheetName: string) => void; 
  setSheetReviewStatus: (sheetName: string, status: SheetProcessingState['sheetReviewStatus']) => void; 
  setColumnReviewStatus: (sheetName: string, header: string, status: BatchColumnMapping['reviewStatus']) => void; 
  updateSheetProcessingState: (sheetName: string, updates: Partial<SheetProcessingState>) => void;
  updateNewTableNameForSheet: (sheetName: string, newRawTableName: string) => void; 
}

// Define the initial state
const initialState: BatchImportState = {
  fileInfo: null,
  file: null,
  sheets: {},
  overallSchemaProposals: [], 
  globalStatus: 'idle',
  commitProgress: null,
  error: null,
  schemaCacheStatus: 'idle',
  importSettings: null,
};

// Create the Zustand store
export const useBatchImportStore = create<BatchImportState & BatchImportActions>((set, get) => ({
  ...initialState,

  setFile: (file) => set({
    fileInfo: file ? { name: file.name, size: file.size, type: file.type } : null,
    file: file, 
    sheets: {}, 
    globalStatus: file ? 'readingFile' : 'idle',
    commitProgress: null,
    error: null,
  }),

  setSheetData: (sheetName, headers, sampleData, rowCount) => set((state) => ({
    sheets: {
      ...state.sheets,
      [sheetName]: {
        sheetName,
        headers,
        sampleData,
        rowCount,
        selectedTable: null,
        tableSuggestions: [],
        columnMappings: {}, 
        status: 'pending', 
        sheetReviewStatus: 'pending', 
        error: undefined,
      },
    },
  })),

  startProcessingSheets: () => set({ globalStatus: 'analyzing' }), 

  updateSheetSuggestions: (sheetName, tableSuggestions, columnMappings, tableConfidenceScore, sheetSchemaProposals) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet) {
          return {};
      }

      // Determine the top suggestion and its confidence
      const topExistingSuggestion = tableSuggestions.find(s => !s.isNewTableProposal);
      const newTableSuggestion = tableSuggestions.find(s => s.isNewTableProposal);
      
      let autoSelectedTable: string | null = null;
      let autoSelectedScore: number | undefined = undefined;
      let isNewTableSelected = false;

      // Prioritize high-confidence existing tables
      if (topExistingSuggestion && topExistingSuggestion.confidenceScore >= 0.8) {
          autoSelectedTable = topExistingSuggestion.tableName;
          autoSelectedScore = topExistingSuggestion.confidenceScore;
      }
      // If no high-confidence existing table, consider the new table proposal if it exists
      else if (newTableSuggestion) {
          autoSelectedTable = newTableSuggestion.tableName;
          autoSelectedScore = undefined; 
          isNewTableSelected = true;
      }
      // Otherwise, select the best existing suggestion, even if low confidence
      else if (topExistingSuggestion) {
          autoSelectedTable = topExistingSuggestion.tableName;
          autoSelectedScore = topExistingSuggestion.confidenceScore;
      }

      // Special case: For empty sheets mapped to existing tables, auto-approve them
      const isEmptySheetMappedToExistingTable = sheet.rowCount === 0 && sheet.headers.length > 0 && 
                                               sheet.selectedTable && !sheet.isNewTable;

      // Process previously mapped columns and preserve their review status
      const reviewedColumnMappings = Object.entries(columnMappings).reduce((acc, [header, mapping]) => {
          // Look for existing mapping
          const existingMapping = sheet.columnMappings && sheet.columnMappings[header];
          
          // If we have an existing mapping with the same mapped column, preserve its review status
          if (existingMapping && existingMapping.mappedColumn === mapping.mappedColumn) {
              acc[header] = {
                  ...mapping,
                  reviewStatus: existingMapping.reviewStatus || mapping.reviewStatus,
              };
          } else {
              acc[header] = mapping;
          }
          return acc;
      }, {} as { [header: string]: BatchColumnMapping });
      
      // Determine the review status
      let sheetReviewStatus: SheetReviewStatus = sheet.sheetReviewStatus;
      
      // Only recalculate if not already approved
      if (sheet.sheetReviewStatus !== 'approved' || Object.keys(sheet.columnMappings || {}).length === 0) {
          if (isEmptySheetMappedToExistingTable) {
              sheetReviewStatus = 'approved'; // Auto-approve empty sheets mapped to existing tables
          } else {
              sheetReviewStatus = determineSheetReviewStatus(reviewedColumnMappings);
          }
      }
      
      // Determine if we should auto-approve
      const hasSelectedTable = sheet.selectedTable || autoSelectedTable;
            // Determine isNewTable based on multiple indicators to be thorough
       // Log individual conditions for debugging
       console.log(`[DEBUG STORE] updateSheetSuggestions for sheet: ${sheetName}, evaluating new table status...`);
       console.log(`[DEBUG STORE] Current sheet.selectedTable = '${sheet.selectedTable}', sheet.isNewTable = ${sheet.isNewTable}`);
       console.log(`[DEBUG STORE] isNewTableSelected = ${isNewTableSelected}, autoSelectedTable = '${autoSelectedTable}'`);
       
       // FIXED: Only consider a sheet new if it's explicitly marked as new or has 'new:' prefix
       // Don't assume it's new just because selectedTable is null
       const condition1 = sheet.isNewTable === true;
       const condition2 = !!(sheet.selectedTable && sheet.selectedTable.startsWith('new:'));
       const condition3 = !!(autoSelectedTable && autoSelectedTable.startsWith('new:'));
       
       console.log(`[DEBUG STORE] New table conditions: [explicit isNewTable: ${condition1}], [selectedTable 'new:' prefix: ${condition2}], [autoSelectedTable 'new:' prefix: ${condition3}]`);
       
       const effectiveIsNewTable: boolean = !!(condition1 || condition2 || condition3);
       console.log(`[DEBUG STORE] Final effectiveIsNewTable determination: ${effectiveIsNewTable}`);

       const updatedSheet: SheetProcessingState = {
           ...sheet,
           tableSuggestions,
           columnMappings: reviewedColumnMappings, 
           tableConfidenceScore: autoSelectedScore, 
           selectedTable: sheet.selectedTable ?? autoSelectedTable, 
           isNewTable: effectiveIsNewTable, 
           sheetSchemaProposals: sheetSchemaProposals, 
           // Set sheetReviewStatus based on the determination function
           sheetReviewStatus: sheetReviewStatus,
           // Set status to 'needsReview' for new tables regardless of their approval status
           // Only mark as 'ready' if it's both approved AND not a new table
           status: ((sheetStatus) => {
               const shouldBeReady = sheetReviewStatus === 'approved' && !effectiveIsNewTable;
               const finalStatus = shouldBeReady ? 'ready' : 'needsReview';
               console.log(`[DEBUG STORE] Status determination for ${sheetName}:`);
               console.log(`[DEBUG STORE]   - sheetReviewStatus: ${sheetReviewStatus}`);
               console.log(`[DEBUG STORE]   - effectiveIsNewTable: ${effectiveIsNewTable}`);
               console.log(`[DEBUG STORE]   - shouldBeReady: ${shouldBeReady}`);
               console.log(`[DEBUG STORE]   - Current sheet.status: ${sheet.status}`);
               console.log(`[DEBUG STORE]   - SETTING NEW STATUS TO: ${finalStatus}`);
               return finalStatus;
           })(),
       };
      
      const updatedSheets = { ...state.sheets, [sheetName]: updatedSheet };

      // Check if all sheets have finished analysis to move to global review state
      const allSheetsAnalyzed = Object.values(updatedSheets)
          .every(s => s.status !== 'pending' && s.status !== 'analyzing');
          
      return {
          sheets: updatedSheets,
          globalStatus: allSheetsAnalyzed ? 'review' : state.globalStatus,
      };
  }),

  updateSheetProcessingState: (sheetName, updates) => set((state) => {
    const sheet = state.sheets[sheetName];
    if (!sheet) return {};
    
    // CRITICAL DEBUGGING: Log updateSheetProcessingState calls when status is changing
    if (updates.status !== undefined) {
      console.log(`
      ⚠️⚠️⚠️ updateSheetProcessingState CHANGING STATUS ⚠️⚠️⚠️
      Sheet: ${sheetName}
      Current status: ${sheet.status}
      New status: ${updates.status}
      isNewTable: ${!!sheet.isNewTable}
      selectedTable: ${sheet.selectedTable || 'null'}
      `); 
    }
    
    // PROTECTION: Check if trying to set a new table to 'ready'
    if (updates.status === 'ready') {
      // Multiple checks to identify a new table
      const isNewTableByFlag = !!sheet.isNewTable;
      const isNewTableByPrefix = !!(sheet.selectedTable && 
                                  (sheet.selectedTable.startsWith('new:') || 
                                   sheet.selectedTable.startsWith('import_')));
      const isEffectivelyNew = isNewTableByFlag || isNewTableByPrefix;
      
      if (isEffectivelyNew) {
        console.log(`
        🛑🛑🛑 CRITICAL PROTECTION: Blocking 'ready' status for new table 🛑🛑🛑
        Sheet: ${sheetName}
        Caller: ${new Error().stack}
        `);
        
        // Override status update to 'needsReview' for new tables
        updates = {
          ...updates,
          status: 'needsReview' as SheetCommitStatus
        };
      }
    }
    
    // Apply updates with potential override
    const updatedSheet = { ...sheet, ...updates };

    // If columnMappings were part of the update, re-determine sheetReviewStatus
    if (updates.columnMappings) {
      updatedSheet.sheetReviewStatus = determineSheetReviewStatus(updatedSheet.columnMappings);
      
      // FINAL PROTECTION: After updating review status, if it's a new table, ensure status is not 'ready'
      if (updatedSheet.isNewTable && updatedSheet.status === 'ready') {
        console.log(`
        ⛔⛔⛔ LAST LINE OF DEFENSE: Forcing new table to 'needsReview' ⛔⛔⛔
        Sheet: ${sheetName}
        `);
        updatedSheet.status = 'needsReview';
      }
    }

    return {
      sheets: {
        ...state.sheets,
        [sheetName]: updatedSheet,
      },
    };
  }),

  updateSheetMapping: (sheetName, header, mappingUpdate) => set((state) => {
    const sheet = state.sheets[sheetName];
    if (!sheet || !sheet.columnMappings[header]) return {};

    return {
      sheets: {
        ...state.sheets,
        [sheetName]: {
          ...sheet,
          columnMappings: {
            ...sheet.columnMappings,
            [header]: {
              ...sheet.columnMappings[header],
              ...mappingUpdate,
              reviewStatus: mappingUpdate.reviewStatus !== undefined ? mappingUpdate.reviewStatus : sheet.columnMappings[header]?.reviewStatus ?? 'modified',
            },
          },
          sheetReviewStatus: determineSheetReviewStatus({ ...sheet.columnMappings, [header]: { ...sheet.columnMappings[header], ...mappingUpdate, reviewStatus: mappingUpdate.reviewStatus ?? 'modified' } as BatchColumnMapping }), 
        },
      },
    };
  }),

  setSelectedTable: (sheetName, tableName, isNew = false) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet) return {};

      // If tableName is null, just clear the selected table without triggering analysis
      if (tableName === null) {
          return {
              sheets: {
                  ...state.sheets,
                  [sheetName]: {
                      ...sheet,
                      selectedTable: null,
                      isNewTable: false,
                      tableConfidenceScore: undefined,
                      columnMappings: {}, // Reset column mappings
                      sheetSchemaProposals: [],
                      status: 'pending',
                      sheetReviewStatus: 'pending',
                  },
              },
          };
      }
      
      // If "Create New Table" option was selected, generate a default name from sheet name
      if (tableName === 'create-new-table') {
          // Generate a SQL-friendly name from sheet name
          const sanitizedSheetName = sheetName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
          tableName = `new:${sanitizedSheetName}`;
          isNew = true;
      }

      // Find the confidence score for the selected table if it exists in suggestions
      const selectedSuggestion = sheet.tableSuggestions.find(s => s.tableName === tableName);
      const newConfidenceScore = selectedSuggestion ? selectedSuggestion.confidenceScore : undefined;

      // When table changes, mappings need recalculation/review.
      // Reset column mappings and statuses. Worker should regenerate suggestions.
      const resetColumnMappings = Object.keys(sheet.columnMappings || {}).reduce((acc, header) => {
          // Initialize with default values for a new column mapping
          acc[header] = {
              header: header,
              sampleValue: sheet.sampleData?.[0]?.[header] || '',
              mappedColumn: null,
              suggestedColumns: [],
              inferredDataType: 'string', // Default to string
              action: 'create', // Default to creating new columns
              status: 'pending',
              reviewStatus: 'pending',
              confidenceScore: undefined,
              confidenceLevel: undefined,
              // Create a default proposal based on the header name
              newColumnProposal: {
                  type: 'new_column',
                  details: {
                      columnName: header.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_'),
                      sqlType: 'TEXT',
                      isNullable: true,
                      sourceSheet: sheetName,
                      sourceHeader: header
                  }
              }
          };
          return acc;
      }, {} as { [header: string]: BatchColumnMapping });

      // For new tables, populate the sheetSchemaProposals with a default table proposal
      let sheetSchemaProposals = sheet.sheetSchemaProposals || [];
      if (isNew) {
          // Create a table name without the "new:" prefix if it exists
          const newTableName = tableName.startsWith('new:') ? tableName.substring(4) : tableName;
          
          // Create a new table proposal
          const newProposal: NewTableProposal = {
              type: 'new_table',
              details: {
                  name: newTableName,
                  sourceSheet: sheetName,
                  columns: sheet.headers.map(header => ({
                      columnName: header.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_'),
                      sqlType: 'TEXT',
                      isNullable: true,
                      sourceHeader: header
                  }))
              }
          };
          
          // Replace any existing new table proposal or add this one
          const existingIndex = sheetSchemaProposals.findIndex(
            p => p.type === 'new_table' && p.details.sourceSheet === sheetName
          );

          if (existingIndex !== -1) {
              sheetSchemaProposals[existingIndex] = newProposal;
          } else {
              sheetSchemaProposals = [...sheetSchemaProposals, newProposal];
          }
      }

      return {
          sheets: {
              ...state.sheets,
              [sheetName]: {
                  ...sheet,
                  selectedTable: tableName,
                  isNewTable: isNew, 
                  tableConfidenceScore: newConfidenceScore, 
                  columnMappings: resetColumnMappings,
                  sheetSchemaProposals: sheetSchemaProposals,
                  // Set to needsReview instead of analyzing to avoid blocking UI
                  status: 'needsReview', 
                  sheetReviewStatus: 'pending', 
              },
          },
          // Don't set global status to analyzing, keep current status
          // globalStatus: 'analyzing',
      };
  }),

  batchUpdateSheetMappings: (sheetName, headers, action) => set((state) => {
    const sheet = state.sheets[sheetName];
    if (!sheet) return {};

    // Create a new columnMappings object with updated actions for the selected headers
    const updatedColumnMappings = { ...sheet.columnMappings };
    
    headers.forEach(header => {
      if (updatedColumnMappings[header]) {
        updatedColumnMappings[header] = {
          ...updatedColumnMappings[header],
          action,
          status: 'userModified',
        };
      }
    });

    // Check if all columns are now mapped or skipped to update sheet status
    const allMappedOrSkipped = Object.values(updatedColumnMappings)
      .every(m => m.action === 'skip' || m.mappedColumn || m.action === 'create');

    return {
      sheets: {
        ...state.sheets,
        [sheetName]: {
          ...sheet,
          columnMappings: updatedColumnMappings,
          status: allMappedOrSkipped ? 'ready' : 'needsReview',
        },
      },
    };
  }),

  updateNewTableNameForSheet: (sheetName, newRawTableName) => set((state) => {
      if (!state || !state.sheets) {
        console.error("[DEBUG Store] updateNewTableNameForSheet: State or state.sheets is undefined.");
        return {}; // Critical error, return empty partial state
      }
      const sheet = state.sheets[sheetName];
      if (!sheet) { 
        console.warn(`[DEBUG Store] updateNewTableNameForSheet: Sheet ${sheetName} not found.`);
        return {}; // Sheet not found, return empty partial state
      } 
      if (!sheet.isNewTable) {
        console.warn(`[DEBUG Store] updateNewTableNameForSheet: Sheet ${sheetName} is not marked as a new table.`);
        return {}; // Not a new table, return empty partial state
      }

      const sanitizedNewName = newRawTableName.trim().replace(/\s+/g, '_'); 
      let updatedSheetSchemaProposals = sheet.sheetSchemaProposals ? [...sheet.sheetSchemaProposals] : [];
      // Find the NewTableProposal to update
      const proposalIndex = updatedSheetSchemaProposals.findIndex(
        proposal => 
          proposal.type === 'new_table' && 
          proposal.details.name === sheet.selectedTable?.substring(4) && // Use details.name
          proposal.details.sourceSheet === sheetName // Use details.sourceSheet
      );

      if (proposalIndex !== -1) {
        const oldProposal = updatedSheetSchemaProposals[proposalIndex] as NewTableProposal;
        updatedSheetSchemaProposals[proposalIndex] = { 
          ...oldProposal, 
          details: { ...oldProposal.details, name: sanitizedNewName } // Update details.name
        };
      } else {
        console.warn(`[DEBUG Store] updateNewTableNameForSheet: No matching NewTableProposal found for sheet ${sheetName} with old name ${sheet.selectedTable}. Creating/Updating.`);
        let foundAndUpdated = false;
        updatedSheetSchemaProposals = updatedSheetSchemaProposals.map(p => {
            if (p.type === 'new_table' && p.details.sourceSheet === sheetName) { // Use details.sourceSheet
                foundAndUpdated = true;
                return { ...(p as NewTableProposal), details: { ...(p as NewTableProposal).details, name: sanitizedNewName } }; // Update details.name
            }
            return p;
        });
        if (!foundAndUpdated) {
            updatedSheetSchemaProposals.push({
                type: 'new_table',
                details: {
                    name: sanitizedNewName,
                    sourceSheet: sheetName,
                    columns: sheet.columnMappings ? Object.entries(sheet.columnMappings).map(([excelCol, cm]) => ({
                        columnName: cm.dbColumn || excelCol, 
                        sqlType: mapColumnTypeToSqlType(cm.inferredDataType), 
                        isNullable: true, 
                        sourceHeader: excelCol,
                        // Ensure all required fields for NewColumnProposal['details'] are present or handled
                    })) : [],
                    // comment: '' // Optional, can be added if needed
                }
            } as NewTableProposal);
        }
      }

      const updatedSheetState = {
        ...sheet,
        selectedTable: `new:${sanitizedNewName}`,
        sheetSchemaProposals: updatedSheetSchemaProposals,
      };

      return {
        sheets: {
          ...state.sheets,
          [sheetName]: updatedSheetState,
        },
      };
  }),

  resetState: () => set((state) => {
    return initialState;
  }),

  setImportSettings: (settings) => set({ importSettings: settings }),

  // --- Review and Approval Action Implementations ---
  approveSheetMapping: (sheetName) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet) return {};

      // Approve all pending/modified columns within the sheet
      const approvedColumnMappings = Object.entries(sheet.columnMappings).reduce((acc, [header, mapping]) => {
          acc[header] = {
              ...mapping,
              reviewStatus: (mapping.reviewStatus === 'pending' || mapping.reviewStatus === 'modified') ? 'approved' : mapping.reviewStatus,
          };
          return acc;
      }, {} as { [header: string]: BatchColumnMapping });

      return {
          sheets: {
              ...state.sheets,
              [sheetName]: {
                  ...sheet,
                  columnMappings: approvedColumnMappings,
                  sheetReviewStatus: 'approved',
                  status: 'ready', 
              },
          },
      };
  }),

  rejectSheetMapping: (sheetName) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet) return {};

       // Reject all columns within the sheet
      const rejectedColumnMappings = Object.entries(sheet.columnMappings).reduce((acc, [header, mapping]) => {
          acc[header] = { ...mapping, reviewStatus: 'rejected' };
          return acc;
      }, {} as { [header: string]: BatchColumnMapping });


      return {
          sheets: {
              ...state.sheets,
              [sheetName]: {
                  ...sheet,
                  columnMappings: rejectedColumnMappings,
                  sheetReviewStatus: 'rejected',
                  status: 'ready', 
              },
          },
      };
  }),

  approveColumnMapping: (sheetName, header) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet || !sheet.columnMappings[header]) return {};

      const updatedMappings = {
          ...sheet.columnMappings,
          [header]: { ...sheet.columnMappings[header], reviewStatus: 'approved' as ReviewStatus }, 
      };

      const newSheetState: SheetProcessingState = {
          ...sheet,
          columnMappings: updatedMappings,
          sheetReviewStatus: determineSheetReviewStatus(updatedMappings),
      };

      return {
          sheets: {
              ...state.sheets,
              [sheetName]: newSheetState,
          },
      };
  }),

  rejectColumnMapping: (sheetName, header) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet || !sheet.columnMappings[header]) return {};

       const updatedMappings = {
          ...sheet.columnMappings,
          [header]: { ...sheet.columnMappings[header], reviewStatus: 'rejected' as ReviewStatus }, 
       };

       const newSheetState: SheetProcessingState = {
          ...sheet,
          columnMappings: updatedMappings,
          sheetReviewStatus: determineSheetReviewStatus(updatedMappings),
      };

      return {
          sheets: {
              ...state.sheets,
              [sheetName]: newSheetState,
          },
      };
  }),

  approveAllHighConfidenceSheets: () => set((state) => {
    const updatedSheets = { ...state.sheets };
    let actualChangesMade = false;

    for (const sheetName in updatedSheets) {
      const currentSheet = updatedSheets[sheetName]; // This is the sheet we might replace

      // Use type guard to ensure proper type checking
      const reviewStatus = currentSheet.sheetReviewStatus as 'pending' | 'approved' | 'rejected' | 'partiallyApproved' | 'needsReview';
      
      if (reviewStatus === 'pending' && currentSheet.selectedTable) {
        const isHighConfidenceMatch = 
          !currentSheet.isNewTable && 
          currentSheet.tableConfidenceScore && 
          currentSheet.tableConfidenceScore >= 0.8;

        if (isHighConfidenceMatch) {
          let newColumnMappingsData = { ...currentSheet.columnMappings };
          let madeColumnChanges = false;

          for (const header in newColumnMappingsData) {
            const column = newColumnMappingsData[header];
            if (column.reviewStatus === 'pending' || column.reviewStatus === 'modified') {
              newColumnMappingsData[header] = { ...column, reviewStatus: 'approved' };
              madeColumnChanges = true;
            }
          }

          // If column statuses were changed, or if sheet status itself needs update
          // Cast to specific union types to avoid TypeScript comparison errors
          const sheetReviewStatus = currentSheet.sheetReviewStatus as 'pending' | 'approved' | 'rejected' | 'partiallyApproved' | 'needsReview';
          const sheetStatus = currentSheet.status as 'pending' | 'ready' | 'processing' | 'analyzing' | 'needsReview' | 'committing' | 'committed' | 'error';
          
          if (madeColumnChanges || sheetReviewStatus !== 'approved' || sheetStatus !== 'ready') {
            // Check if this is a new table using the same isNewTable check as before
            const isEffectivelyNewTable = currentSheet.selectedTable && (
              currentSheet.selectedTable.startsWith('new:') ||
              currentSheet.selectedTable.startsWith('import_') ||
              !!currentSheet.isNewTable
            );
            
            updatedSheets[sheetName] = {
              ...currentSheet,
              columnMappings: newColumnMappingsData,
              sheetReviewStatus: 'approved',
              // If it's a new table, keep it as 'pending' so it needs review
              status: isEffectivelyNewTable ? 'pending' : 'ready',
            };
            actualChangesMade = true;
          }
        }
      }
    }

    if (actualChangesMade) {
      return { sheets: updatedSheets };
    }
    return {}; // No actual sheet objects were replaced or changed, so no state update
  }),

  approveAllColumnsInSheet: (sheetName) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet) return {};
      
      const approvedColumnMappings = Object.entries(sheet.columnMappings).reduce((acc, [header, mapping]) => {
          acc[header] = { ...mapping, reviewStatus: 'approved' };
          return acc;
      }, {} as { [header: string]: BatchColumnMapping });
      
      // Check if this is a new table
      const isNewTable = 
          (sheet.selectedTable && 
           (sheet.selectedTable.startsWith('new:') || 
            sheet.selectedTable.startsWith('import_'))) || 
          !!sheet.isNewTable;

      return {
          sheets: {
              ...state.sheets,
              [sheetName]: {
                  ...sheet,
                  columnMappings: approvedColumnMappings,
                  sheetReviewStatus: 'approved',
                  // Only mark as ready if it's not a new table
                  status: isNewTable ? 'pending' : 'ready',
              },
          },
      };
  }),

  rejectAllColumnsInSheet: (sheetName) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet) return {};
      
      const rejectedColumnMappings = Object.entries(sheet.columnMappings).reduce((acc, [header, mapping]) => {
          acc[header] = { ...mapping, reviewStatus: 'rejected' };
          return acc;
      }, {} as { [header: string]: BatchColumnMapping });
      
      return {
          sheets: {
              ...state.sheets,
              [sheetName]: {
                  ...sheet,
                  columnMappings: rejectedColumnMappings,
                  sheetReviewStatus: 'rejected',
                  status: 'ready', 
              },
          },
      };
  }),

  setSheetReviewStatus: (sheetName, status) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet) return {};
      
      return {
          sheets: {
              ...state.sheets,
              [sheetName]: {
                  ...sheet,
                  sheetReviewStatus: status,
              },
          },
      };
  }),

  setColumnReviewStatus: (sheetName, header, status) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet || !sheet.columnMappings[header]) return {};
      
      const updatedMappings = {
          ...sheet.columnMappings,
          [header]: { ...sheet.columnMappings[header], reviewStatus: status },
      };
      
      return {
          sheets: {
              ...state.sheets,
              [sheetName]: {
                  ...sheet,
                  columnMappings: updatedMappings,
                  sheetReviewStatus: determineSheetReviewStatus(updatedMappings),
              },
          },
      };
  }),

  updateOverallSchemaProposals: () => set((state) => {
    const allProposals: SchemaProposal[] = [];
    Object.values(state.sheets).forEach(sheet => {
      if (sheet.sheetSchemaProposals) {
        allProposals.push(...sheet.sheetSchemaProposals);
      }
    });

    // Deduplicate proposals based on type and name/columnName + sourceSheet
    const newProposalsMap: { [key: string]: SchemaProposal } = {};
    allProposals.forEach(proposal => {
      let uniqueKey = '';
      if (proposal.type === 'new_table') {
        uniqueKey = `table-${proposal.details.name}-${proposal.details.sourceSheet}`;
        // Ensure existing is also checked for type before merging
        const existing = newProposalsMap[uniqueKey];
        if (existing && existing.type === 'new_table') {
            newProposalsMap[uniqueKey] = { 
                ...existing, 
                details: { ...existing.details, ...proposal.details } 
            };
        } else {
            newProposalsMap[uniqueKey] = proposal;
        }
      } else if (proposal.type === 'new_column') {
        // For NewColumnProposal, unique key might involve table name if applicable, 
        // or be based on columnName and sourceSheet if it's adding to an existing table not yet defined in this batch's NewTableProposals
        // Assuming for now it's about the column within its source sheet context or a target table name if provided
        // This part of the key might need refinement based on how NewColumnProposals are associated with tables.
        // Let's use sourceHeader if available for uniqueness within a sheet context if columnName is not unique enough.
        uniqueKey = `column-${proposal.details.columnName}-${proposal.details.sourceSheet}-${proposal.details.sourceHeader || ''}`;
        const existing = newProposalsMap[uniqueKey];
        if (existing && existing.type === 'new_column') {
            newProposalsMap[uniqueKey] = { 
                ...existing, 
                details: { ...existing.details, ...proposal.details } 
            };
        } else {
            newProposalsMap[uniqueKey] = proposal;
        }
      }      
    });

    return {
      overallSchemaProposals: Object.values(newProposalsMap),
    };
  }),

  setGlobalStatus: (status) => set({ globalStatus: status }),

  setSchemaCacheStatus: (status) => set({ schemaCacheStatus: status }),

  startCommit: () => set((state) => ({
      globalStatus: 'committing',
      commitProgress: { processedSheets: 0, totalSheets: Object.keys(state.sheets).length, currentSheet: null },
      error: null,
  })),

  updateCommitProgress: (processedSheets, totalSheets, currentSheet) => set({
    commitProgress: { processedSheets, totalSheets, currentSheet },
  }),

  setCommitComplete: () => set({ globalStatus: 'complete', commitProgress: null }),

  setSheetCommitStatus: (sheetName, status, error) => set((state) => { 
      // ================ CRITICAL DEBUGGING ================
      console.log(`
      ============================================================
      🔥🔥🔥 SETTING SHEET STATUS: ${sheetName} => ${status} 🔥🔥🔥
      ============================================================
      `);
      
      // Get stack trace to find who's calling this function
      const stackTrace = new Error().stack || '';
      console.log(`CALLER STACK:`, stackTrace);
      
      // Standard state checks
      if (!state) {
        console.error(`State is undefined - critical error`);  
        return {}; 
      }
      if (!state.sheets) {
        console.error(`State.sheets is undefined for: ${sheetName}`);
        return {}; 
      }

      const sheetToUpdate = state.sheets[sheetName]; 
      if (!sheetToUpdate) {
        console.warn(`Sheet not found: ${sheetName}`);
        return {}; 
      } 
      
      // SUPER VISIBLE DEBUG INFO - exact state of the sheet
      console.log(`
      ================== SHEET STATE DUMP ==================
      Sheet: ${sheetName}
      Current Status: ${sheetToUpdate.status}
      IsNewTable Flag: ${!!sheetToUpdate.isNewTable}
      Selected Table: ${sheetToUpdate.selectedTable || 'null'}
      Review Status: ${sheetToUpdate.sheetReviewStatus}
      ======================================================
      `);
      
      // Type-safe status conversion
      const typedStatus: SheetCommitStatus = status as SheetCommitStatus;
      
      // Multiple ways to detect if a table is new
      const hasNewTableFlag = !!sheetToUpdate.isNewTable;
      const hasNewPrefix = !!(sheetToUpdate.selectedTable && 
                            sheetToUpdate.selectedTable.startsWith('new:'));
      const hasImportPrefix = !!(sheetToUpdate.selectedTable && 
                              sheetToUpdate.selectedTable.startsWith('import_'));
      const isEffectivelyNew = hasNewTableFlag || hasNewPrefix || hasImportPrefix;
      
      // Super visible debug info about table detection
      console.log(`
      =========== TABLE TYPE DETECTION ===========
      HasNewTableFlag: ${hasNewTableFlag}
      HasNewPrefix: ${hasNewPrefix}
      HasImportPrefix: ${hasImportPrefix}
      IS EFFECTIVELY NEW: ${isEffectivelyNew}
      ===========================================
      `);
      
      // CRITICAL FIX: If table is new and trying to set to 'ready', OVERRIDE
      if (typedStatus === 'ready' && isEffectivelyNew) {
        console.log(`
        🚨🚨🚨 CRITICAL OVERRIDE 🚨🚨🚨
        Prevented new table from being marked 'ready': ${sheetName}
        This is a new table that must not be marked as 'ready'
        FORCING STATUS: needsReview
        🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨
        `);
        
        // Create updated sheets with the override status
        const overrideSheets = {
          ...state.sheets,
          [sheetName]: {
            ...sheetToUpdate,
            status: 'needsReview' as SheetCommitStatus,
            // Also flag it explicitly as a new table
            isNewTable: true,
            error: error,
          },
        };
        return { sheets: overrideSheets };
      }
      
      // Normal flow for non-new tables or other statuses
      const updatedSheets = {
        ...state.sheets,
        [sheetName]: {
          ...sheetToUpdate,
          status: typedStatus,
          error: error,
        },
      };
      
      console.log(`STATUS UPDATED: ${sheetName} => ${typedStatus} (isNew: ${isEffectivelyNew})`);
      return { sheets: updatedSheets };
  }),

  setError: (errorMessage) => set({ error: errorMessage, globalStatus: 'error' }),
}));

// Helper function to determine sheet review status based on column review statuses
const determineSheetReviewStatus = (columnMappings: { [header: string]: BatchColumnMapping }, headers?: string[]): SheetReviewStatus => {
    // If there are headers but no column mappings, sheet is pending
    if ((!columnMappings || Object.keys(columnMappings).length === 0) && headers && headers.length > 0) {
        return 'pending';
    }
    // If no headers and no mappings, it's approved (nothing to map)
    if ((!columnMappings || Object.keys(columnMappings).length === 0) && (!headers || headers.length === 0)) {
        return 'approved';
    }
    
    const columnStatuses = Object.values(columnMappings).map(m => m.reviewStatus);
    
    // Special case: If all columns have 'skip' action, consider the sheet approved
    const allColumnsSkipped = Object.values(columnMappings).every(m => m.action === 'skip');
    if (allColumnsSkipped) {
        return 'approved';
    }
    
    // If any column is rejected, the sheet is partially approved
    if (columnStatuses.includes('rejected')) {
        return 'partiallyApproved';
    }
    
    // If all columns are approved, the sheet is approved
    if (columnStatuses.every(s => s === 'approved')) {
        return 'approved';
    }
    
    // If some are approved and none are rejected or pending, it's still partially approved (e.g. some skipped)
    if (columnStatuses.some(s => s === 'approved') && !columnStatuses.some(s => s === 'pending' || s === 'rejected')) {
        return 'partiallyApproved';
    }
    
    // Count high confidence columns
    const totalColumns = Object.values(columnMappings).length;
    const highConfidenceCount = Object.values(columnMappings).filter(m =>
        m.confidenceLevel === 'High' && m.action === 'map'
    ).length;
    
    // Calculate percentage of high confidence columns
    const highConfidencePercentage = totalColumns > 0 ? (highConfidenceCount / totalColumns) * 100 : 0;
    
    // Auto-approve if at least 95% of columns have high confidence
    if (highConfidencePercentage >= 95) {
        return 'approved';
    }
    
    // If any column is pending review, the sheet is pending review
    if (columnStatuses.some(s => s === 'pending')) {
        return 'pending';
    }
    
    // Default to pending if no other conditions met
    return 'pending'; 
};