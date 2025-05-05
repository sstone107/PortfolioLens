import { create } from 'zustand';
import {
  BatchImportState,
  SheetProcessingState,
  BatchColumnMapping,
  RankedTableSuggestion,
  RankedColumnSuggestion,
  SchemaProposal,
  NewColumnProposal,
  SheetReviewStatus,
  ReviewStatus,
  GlobalStatus, // <-- Import GlobalStatus type
  SheetCommitStatus, // <-- Import SheetCommitStatus type
} from '../components/import/types'; // Adjust path as needed
import { AnalysisEngine } from '../components/import/services/AnalysisEngine'; // Added import

// Define the interface for the store's actions
interface BatchImportActions {
  setFile: (file: File | null) => void;
  setSheetData: (sheetName: string, headers: string[], sampleData: Record<string, any>[], rowCount: number) => void;
  startProcessingSheets: () => void; // Consider renaming or clarifying if this triggers analysis worker
  updateSheetSuggestions: (
    sheetName: string,
    tableSuggestions: RankedTableSuggestion[],
    columnMappings: { [header: string]: BatchColumnMapping },
    tableConfidenceScore?: number,
    sheetSchemaProposals?: SchemaProposal[] // Added schema proposals from analysis
  ) => void;
  updateSheetMapping: ( // Updates a single column mapping within a sheet
    sheetName: string,
    header: string,
    mappingUpdate: Partial<BatchColumnMapping>
  ) => void;
  batchUpdateSheetMappings: ( // Updates multiple column mappings within a sheet (e.g., set all to skip)
    sheetName: string,
    headers: string[],
    action: 'map' | 'skip' | 'create'
  ) => void;
  setSelectedTable: (sheetName: string, tableName: string | null, isNew?: boolean) => void; // Added isNew flag
  setGlobalStatus: (status: GlobalStatus) => void; // <-- Use imported GlobalStatus type
  setSchemaCacheStatus: (status: BatchImportState['schemaCacheStatus']) => void;
  // updateSchemaProposals: (sheetName: string, proposals: SchemaProposal[]) => void; // Combined into updateSheetSuggestions
  updateOverallSchemaProposals: () => void; // Recalculates based on current sheet states
  startCommit: () => void;
  updateCommitProgress: (processedSheets: number, totalSheets: number, currentSheet: string | null) => void;
  setCommitComplete: () => void;
  setSheetCommitStatus: (sheetName: string, status: SheetCommitStatus, error?: string) => void; // <-- Use imported SheetCommitStatus type
  setError: (errorMessage: string | null) => void;
  resetState: () => void;

  // --- Review and Approval Actions ---
  approveSheetMapping: (sheetName: string) => void; // Approve sheet-level mapping
  rejectSheetMapping: (sheetName: string) => void; // Reject sheet-level mapping
  approveColumnMapping: (sheetName: string, header: string) => void; // Approve column-level mapping
  rejectColumnMapping: (sheetName: string, header: string) => void; // Reject column-level mapping
  approveAllHighConfidenceSheets: () => void; // Batch approve high-confidence sheets
  approveAllColumnsInSheet: (sheetName: string) => void; // Batch approve all columns in a sheet
  rejectAllColumnsInSheet: (sheetName: string) => void; // Batch reject all columns in a sheet
  setSheetReviewStatus: (sheetName: string, status: SheetProcessingState['sheetReviewStatus']) => void; // Explicitly set sheet review status
  setColumnReviewStatus: (sheetName: string, header: string, status: BatchColumnMapping['reviewStatus']) => void; // Explicitly set column review status
}

// Define the initial state
const initialState: BatchImportState = {
  fileInfo: null,
  file: null,
  sheets: {},
  overallSchemaProposals: [], // Aggregated proposals ready for commit
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
    file: file, // <-- STORE the actual file object
    sheets: {}, // Reset sheets when a new file is set
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
        columnMappings: {}, // Initialize empty, worker will populate
        status: 'pending', // Ready for worker processing
        sheetReviewStatus: 'pending', // Initialize sheet review status
        error: undefined,
      },
    },
  })),

  startProcessingSheets: () => set({ globalStatus: 'analyzing' }), // Corrected status

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
          autoSelectedScore = undefined; // Score not applicable for new
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
              reviewStatus: 'pending', // Ensure all start as pending
          };
          return acc;
      }, {} as { [header: string]: BatchColumnMapping });
      
      const updatedSheet: SheetProcessingState = {
          ...sheet,
          tableSuggestions,
          columnMappings: reviewedColumnMappings, // Use mappings with initialized review status
          tableConfidenceScore: autoSelectedScore, // Store score of the auto-selected table
          selectedTable: sheet.selectedTable ?? autoSelectedTable, // Keep user selection if already made, else auto-select
          isNewTable: sheet.selectedTable ? sheet.isNewTable : isNewTableSelected, // Reflect if the selected table is new
          sheetSchemaProposals: sheetSchemaProposals, // Store proposals from analysis
          status: 'needsReview', // Always needs review after suggestions
          sheetReviewStatus: 'pending', // Reset sheet review status on new suggestions
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
              // status: 'userModified', // Keep original status ('suggested' or 'error') unless review changes
              reviewStatus: mappingUpdate.reviewStatus ?? 'modified', // Set to modified if not explicitly set
            },
          },
          // Determine sheet review status based on column statuses
          sheetReviewStatus: determineSheetReviewStatus({ ...sheet.columnMappings, [header]: { ...sheet.columnMappings[header], ...mappingUpdate, reviewStatus: mappingUpdate.reviewStatus ?? 'modified' } as BatchColumnMapping }), // Added type assertion
          // Sheet processing status ('needsReview', 'ready') might depend on review status now
          // status: determineSheetProcessingStatus(...) // TODO: Define this logic if needed
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
              action: 'skip', // Default to skip until re-analyzed
              newColumnProposal: undefined,
              status: 'pending', // Needs re-analysis
              reviewStatus: 'pending', // Reset review
          };
          return acc;
      }, {} as { [header: string]: BatchColumnMapping });

      return {
          sheets: {
              ...state.sheets,
              [sheetName]: {
                  ...sheet,
                  selectedTable: tableName,
                  isNewTable: isNew, // Set if the selected table is a new proposal
                  tableConfidenceScore: newConfidenceScore, // Update confidence score
                  // Reset column mappings and statuses for re-analysis
                  columnMappings: resetColumnMappings,
                  sheetSchemaProposals: [], // Clear old proposals
                  status: 'analyzing', // Trigger re-analysis by worker
                  sheetReviewStatus: 'pending', // Reset sheet review status
              },
          },
          globalStatus: 'analyzing', // Go back to analyzing state
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

  // updateSchemaProposals: (sheetName: string, proposals: SchemaProposal[]) => set((state) => { // Added types to signature
  //   const sheet = state.sheets[sheetName];
  //   if (!sheet) return {};

  //   return {
  //     sheets: {
  //       ...state.sheets,
  //       [sheetName]: {
  //         ...sheet,
  //         sheetSchemaProposals: proposals,
  //       },
  //     },
  //   };
  // }),

  updateOverallSchemaProposals: () => set((state) => {
      // Aggregate unique schema proposals from all sheets that are NOT rejected
      const aggregatedProposals: SchemaProposal[] = [];
      const proposalKeys = new Set<string>(); // To track uniqueness (e.g., "table:col" or "new_table")

      Object.values(state.sheets).forEach(sheet => {
          // Only include proposals from sheets that haven't been fully rejected
          if (sheet.sheetReviewStatus !== 'rejected' && sheet.sheetSchemaProposals) {
              sheet.sheetSchemaProposals.forEach(proposal => {
                  let key: string;
                  // Type guard to correctly access properties
                  if ('sourceHeader' in proposal && proposal.sourceHeader !== undefined) { // NewColumnProposal
                      // Key based on target table and column name
                      key = `${sheet.selectedTable}:${proposal.columnName}`;
                  } else if ('tableName' in proposal) { // NewTableProposal
                      key = `new_table:${proposal.tableName}`;
                  } else {
                      // Should not happen with current types, but good for safety
                      return; // Skip unknown proposal types
                  }

                  if (!proposalKeys.has(key)) {
                      // Check column review status if it's a column proposal
                      if ('sourceHeader' in proposal) {
                          const colMapping = sheet.columnMappings[proposal.sourceHeader!];
                          // Only add if the column mapping itself isn't rejected
                          if (colMapping && colMapping.reviewStatus !== 'rejected') {
                              aggregatedProposals.push(proposal);
                              proposalKeys.add(key);
                          }
                      } else {
                          // Add new table proposals directly if sheet isn't rejected
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
      error: null, // Clear previous errors
  })),

  updateCommitProgress: (processedSheets, totalSheets, currentSheet) => set({
    commitProgress: { processedSheets, totalSheets, currentSheet },
  }),

  setCommitComplete: () => set({ globalStatus: 'complete', commitProgress: null }),

  setSheetCommitStatus: (sheetName, status, error) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet) return {};
      return {
          sheets: {
              ...state.sheets,
              [sheetName]: {
                  ...sheet,
                  status: status,
                  error: error,
              }
          }
      }
  }),

  setError: (errorMessage) => set({ error: errorMessage, globalStatus: 'error' }),

  resetState: () => set(initialState),

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
                  status: 'ready', // Mark sheet as ready for commit
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
                  status: 'ready', // Still 'ready' in terms of processing, but won't be committed
              },
          },
      };
  }),

  approveColumnMapping: (sheetName, header) => set((state) => {
      const sheet = state.sheets[sheetName];
      if (!sheet || !sheet.columnMappings[header]) return {};

      const updatedMappings = {
          ...sheet.columnMappings,
          [header]: { ...sheet.columnMappings[header], reviewStatus: 'approved' as ReviewStatus }, // Ensure correct type
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
          [header]: { ...sheet.columnMappings[header], reviewStatus: 'rejected' as ReviewStatus }, // Ensure correct type
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
                  status: 'ready', // Mark sheet as ready for commit
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
                  status: 'ready', // Mark sheet as ready for commit
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
                  status: 'ready', // Still 'ready' in terms of processing, but won't be committed
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
}));

// Helper function to determine sheet review status based on column review statuses
const determineSheetReviewStatus = (columnMappings: { [header: string]: BatchColumnMapping }): SheetReviewStatus => { // Ensure correct return type
    const columnStatuses = Object.values(columnMappings).map(m => m.reviewStatus);
    
    // If any column is rejected, the sheet is partially approved
    if (columnStatuses.includes('rejected')) {
        return 'partiallyApproved';
    }
    
    // If all columns are approved, the sheet is approved
    if (columnStatuses.every(s => s === 'approved')) {
        return 'approved';
    }
    
    // If any column is modified, the sheet is pending
    if (columnStatuses.includes('modified')) {
        return 'pending';
    }
    
    // Default to pending
    return 'pending';
};