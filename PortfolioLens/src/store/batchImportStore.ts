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
  ColumnType
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

      // Initialize review status for columns
      const reviewedColumnMappings = Object.entries(columnMappings).reduce((acc, [header, mapping]) => {
          acc[header] = {
              ...mapping,
              reviewStatus: mapping.reviewStatus,
          };
          return acc;
      }, {} as { [header: string]: BatchColumnMapping });
      
      const updatedSheet: SheetProcessingState = {
          ...sheet,
          tableSuggestions,
          columnMappings: reviewedColumnMappings, 
          tableConfidenceScore: autoSelectedScore, 
          selectedTable: sheet.selectedTable ?? autoSelectedTable, 
          isNewTable: sheet.selectedTable ? sheet.isNewTable : isNewTableSelected, 
          sheetSchemaProposals: sheetSchemaProposals, 
          sheetReviewStatus: determineSheetReviewStatus(reviewedColumnMappings),
          status: determineSheetReviewStatus(reviewedColumnMappings) === 'approved' ? 'ready' : 'needsReview',
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

    const updatedSheet = { ...sheet, ...updates };

    // If columnMappings were part of the update, re-determine sheetReviewStatus
    if (updates.columnMappings) {
      updatedSheet.sheetReviewStatus = determineSheetReviewStatus(updatedSheet.columnMappings);
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

      // Find the confidence score for the selected table if it exists in suggestions
      const selectedSuggestion = sheet.tableSuggestions.find(s => s.tableName === tableName);
      const newConfidenceScore = selectedSuggestion ? selectedSuggestion.confidenceScore : undefined;

      // When table changes, mappings need recalculation/review.
      // Reset column mappings and statuses. Worker should regenerate suggestions.
      const resetColumnMappings = Object.keys(sheet.columnMappings).reduce((acc, header) => {
          acc[header] = {
              ...sheet.columnMappings[header],
              mappedColumn: null,
              suggestedColumns: [],
              confidenceScore: undefined,
              confidenceLevel: undefined,
              action: 'skip', 
              newColumnProposal: undefined,
              status: 'pending', 
              reviewStatus: sheet.columnMappings[header]?.reviewStatus !== 'pending' ? sheet.columnMappings[header]?.reviewStatus : 'pending',
          };
          return acc;
      }, {} as { [header: string]: BatchColumnMapping });

      return {
          sheets: {
              ...state.sheets,
              [sheetName]: {
                  ...sheet,
                  selectedTable: tableName,
                  isNewTable: isNew, 
                  tableConfidenceScore: newConfidenceScore, 
                  columnMappings: resetColumnMappings,
                  sheetSchemaProposals: [], 
                  status: 'analyzing', 
                  sheetReviewStatus: 'pending', 
              },
          },
          globalStatus: 'analyzing', 
      };
      // NOTE: The worker needs to listen for this state change and re-run analysis
      // for the specific sheet based on the newly selected table.
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
      const proposalIndex = updatedSheetSchemaProposals.findIndex(proposal => 'tableName' in proposal && proposal.tableName === sheet.selectedTable?.substring(4) && proposal.sourceSheet === sheetName);

      if (proposalIndex !== -1) {
        const oldProposal = updatedSheetSchemaProposals[proposalIndex] as NewTableProposal;
        updatedSheetSchemaProposals[proposalIndex] = { ...oldProposal, tableName: sanitizedNewName };
      } else {
        // If no existing proposal, create one (this might need adjustment based on exact logic)
        // This case might indicate that selectedTable was `new:...` but no proposal was initially made, or name changed so much it didn't match.
        // For now, let's assume if isNewTable is true, we should ensure a proposal reflects the new name.
        console.warn(`[DEBUG Store] updateNewTableNameForSheet: No matching NewTableProposal found for sheet ${sheetName} with old name ${sheet.selectedTable}. Creating/Updating.`);
        // Attempt to find *any* NewTableProposal for this sheet or add a new one.
        // This logic might need to be more robust based on application flow.
        let foundAndUpdated = false;
        updatedSheetSchemaProposals = updatedSheetSchemaProposals.map(p => {
            if ('tableName' in p && p.sourceSheet === sheetName) {
                foundAndUpdated = true;
                return { ...(p as NewTableProposal), tableName: sanitizedNewName };
            }
            return p;
        });
        if (!foundAndUpdated) {
            updatedSheetSchemaProposals.push({
                sourceSheet: sheetName,
                tableName: sanitizedNewName,
                columns: sheet.columnMappings ? Object.entries(sheet.columnMappings).map(([excelCol, cm]) => ({
                    columnName: cm.dbColumn || excelCol, 
                    sqlType: mapColumnTypeToSqlType(cm.inferredDataType), 
                    isNullable: true, 
                    sourceHeader: excelCol, 
                })) : [],
            });
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
      
      // Process each sheet
      Object.entries(updatedSheets).forEach(([sheetName, sheet]) => {
          // Only auto-approve sheets with high confidence
          if (sheet.tableConfidenceScore && sheet.tableConfidenceScore >= 0.8) {
              // Approve all pending/modified columns within the sheet
              const approvedColumnMappings = Object.entries(sheet.columnMappings).reduce((acc, [header, mapping]) => {
                  acc[header] = {
                      ...mapping,
                      reviewStatus: (mapping.reviewStatus === 'pending' || mapping.reviewStatus === 'modified') ? 'approved' : mapping.reviewStatus,
                  };
                  return acc;
              }, {} as { [header: string]: BatchColumnMapping });
              
              // Update the sheet
              updatedSheets[sheetName] = {
                  ...sheet,
                  columnMappings: approvedColumnMappings,
                  sheetReviewStatus: 'approved',
                  status: 'ready', 
              };
          }
      });
      
      return { sheets: updatedSheets };
  }),

  approveAllColumnsInSheet: (sheetName) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet) return {};
      
      const approvedColumnMappings = Object.entries(sheet.columnMappings).reduce((acc, [header, mapping]) => {
          acc[header] = { ...mapping, reviewStatus: 'approved' };
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
    const aggregatedProposals: SchemaProposal[] = [];
    const proposalKeys = new Set<string>();
    Object.values(state.sheets).forEach(sheet => {
      if (sheet.sheetReviewStatus !== 'rejected' && sheet.sheetSchemaProposals) {
        sheet.sheetSchemaProposals.forEach(proposal => {
          let key: string;
          if ('sourceHeader' in proposal && proposal.sourceHeader !== undefined) { 
            key = `${sheet.selectedTable}:${proposal.columnName}`;
          } else if ('tableName' in proposal) { 
            key = `new_table:${proposal.tableName}`;
          } else {
            return;
          }
          if (!proposalKeys.has(key)) {
            if ('sourceHeader' in proposal) {
              const colMapping = sheet.columnMappings[proposal.sourceHeader!];
              if (colMapping && colMapping.reviewStatus !== 'rejected') {
                aggregatedProposals.push(proposal);
                proposalKeys.add(key);
              }
            } else {
              aggregatedProposals.push(proposal);
              proposalKeys.add(key);
            }
          }
        });
      }
    });
    return { overallSchemaProposals: aggregatedProposals };
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
      if (!state) {
        console.error("[DEBUG Store] setSheetCommitStatus: 'state' is undefined. This should not happen.");
        return {}; // Return empty partial state on critical error
      }
      if (!state.sheets) {
        console.error(`[DEBUG Store] setSheetCommitStatus: 'state.sheets' is undefined. SheetName: ${sheetName}`);
        return {}; // Return empty partial state
      }

      const sheetToUpdate = state.sheets[sheetName]; 
      if (!sheetToUpdate) {
        console.warn(`[DEBUG Store] setSheetCommitStatus: Sheet ${sheetName} not found in state.sheets.`);
        return {}; // Return empty partial state if sheet not found
      } 
      
      // Create a new sheets object with the updated sheet
      const newSheets = {
        ...state.sheets,
        [sheetName]: {
          ...sheetToUpdate,
          status: status,
          error: error,
        },
      };
      return { sheets: newSheets }; // Return the updated part of the state
  }),

  setError: (errorMessage) => set({ error: errorMessage, globalStatus: 'error' }),
}));

// Helper function to determine sheet review status based on column review statuses
const determineSheetReviewStatus = (columnMappings: { [header: string]: BatchColumnMapping }): SheetReviewStatus => { 
    const columnStatuses = Object.values(columnMappings).map(m => m.reviewStatus);
    
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
    
    // If any column is pending review, the sheet is pending review
    if (columnStatuses.some(s => s === 'pending')) {
        return 'pending';
    }
    
    // Default to pending if no other conditions met (e.g. all skipped, no actual mappings)
    return 'pending'; 
};