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
      
      // Forcefully set status to 'ready' whenever a table is selected to fix the persistent "needs review" issue
      const shouldBeReady = sheet.selectedTable || autoSelectedTable;
      
      const updatedSheet: SheetProcessingState = {
          ...sheet,
          tableSuggestions,
          columnMappings: reviewedColumnMappings, 
          tableConfidenceScore: autoSelectedScore, 
          selectedTable: sheet.selectedTable ?? autoSelectedTable, 
          isNewTable: sheet.selectedTable ? sheet.isNewTable : isNewTableSelected, 
          sheetSchemaProposals: sheetSchemaProposals, 
          // Force sheet to approved status if it has a selected table
          sheetReviewStatus: shouldBeReady ? 'approved' : sheetReviewStatus,
          // Force status to ready if it has a selected table
          status: shouldBeReady ? 'ready' : 'needsReview',
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
    
    // If any column is pending review, the sheet is pending review
    if (columnStatuses.some(s => s === 'pending')) {
        return 'pending';
    }
    
    // Default to pending if no other conditions met
    return 'pending'; 
};