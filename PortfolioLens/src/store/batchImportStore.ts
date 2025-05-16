import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { normalizeForDb, normalizeTableName } from '../components/import/utils/stringUtils';
import { inferColumnType } from '../components/import/dataTypeInference';

// Types for sheet and column mapping
export interface ColumnMapping {
  originalName: string;
  mappedName: string;
  dataType: string;
  skip: boolean;
  confidence: number;
  originalIndex: number;
  sample?: unknown[];
  inferredDataType?: string;
  createNewValue?: string;
  needsReview?: boolean;
  _isNewlyCreated?: boolean; // Special flag to track newly created fields
  outOfRangeMapping?: boolean; // Flag for invalid data type
  customFieldMapping?: boolean; // Flag for custom field name not in standard list
}

export interface SheetMapping {
  id: string;
  originalName: string;
  mappedName: string;
  headerRow: number;
  skip: boolean;
  approved: boolean;
  needsReview: boolean;
  columns: ColumnMapping[];
  status: 'pending' | 'mapping' | 'ready' | 'approved' | 'failed';
  error?: string;
  firstRows?: unknown[][];
  isNewTable?: boolean;
  wasCreatedNew?: boolean;
  suggestedName?: string;
  createNewValue?: string;
}

export interface MappingTemplate {
  id: string;
  name: string;
  description: string;
  servicerId?: string;
  filePattern?: string;
  headerRow: number;
  tablePrefix?: string;
  sheetMappings: SheetMapping[];
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
  // Support for both camelCase and snake_case in DB responses
  created_at?: string;
  updated_at?: string;
  version: number;
  reviewOnly: boolean;
}

// Progress tracking
export interface ImportProgress {
  stage: 'idle' | 'reading' | 'analyzing' | 'mapping' | 'importing' | 'complete' | 'failed';
  message: string;
  sheet?: string;
  table?: string;
  percent: number;
}

// Batch import store state
export interface BatchImportState {
  // File data
  fileName: string;
  fileType: string;
  fileData: ArrayBuffer | null;
  fileSize: number;
  
  // Mapping state
  sheets: SheetMapping[];
  selectedSheetId: string | null;
  mappingInProgress: boolean;
  
  // Progress tracking
  progress: ImportProgress;
  
  // Import settings
  headerRow: number;
  tablePrefix: string;

  // Templates
  templates: MappingTemplate[];
  selectedTemplateId: string | null;

  // Similarity cache
  similarityMatrix: Record<string, Record<string, number>>;
  bestMatches: Record<string, { field: string; score: number }>;
  
  // Results
  importResults: {
    success: boolean;
    createdTables: string[];
    failedSheets: string[];
    totalRows: number;
    importedRows: number;
    errors: { sheet: string; message: string }[];
  };
  
  // Schema cache for dynamic/synthetic tables
  tableSchemas: Record<string, any>;
  columnMappings: Record<string, any[]>;
  sheetMappingStatus: Record<string, { approved: boolean; source: string }>;
  
  // Actions
  setFile: (fileName: string, fileType: string, fileData: ArrayBuffer, fileSize: number) => void;
  clearFile: () => void;
  
  // Dynamic schema creation
  createDynamicSchemaForSheet: (sheetId: string, tableName: string) => void;

  setSheets: (sheets: SheetMapping[]) => void;
  updateSheet: (sheetId: string, updates: Partial<SheetMapping>) => void;
  updateSheetColumn: (sheetId: string, originalName: string, updates: Partial<ColumnMapping>) => void;
  batchUpdateSheetColumns: (sheetId: string, updates: Record<string, Partial<ColumnMapping>>) => void;
  setSelectedSheetId: (id: string | null) => void;

  // Similarity related actions
  setSimilarityMatrix: (matrix: Record<string, Record<string, number>>) => void;
  setBestMatches: (matches: Record<string, { field: string; score: number }>) => void;
  
  setProgress: (progress: Partial<ImportProgress>) => void;
  
  setHeaderRow: (row: number) => void;
  setTablePrefix: (prefix: string) => void;
  
  setTemplates: (templates: MappingTemplate[]) => void;
  setSelectedTemplateId: (id: string | null) => void;
  
  setImportResults: (results: Partial<BatchImportState['importResults']>) => void;
  resetImportResults: () => void;
  
  setMappingInProgress: (inProgress: boolean) => void;
  reset: () => void;
}

// Initial state
const initialState: Omit<BatchImportState, 'setFile' | 'clearFile' | 'setSheets' | 'updateSheet' 
| 'updateSheetColumn' | 'batchUpdateSheetColumns' | 'setSelectedSheetId' | 'setProgress' | 'setHeaderRow' | 'setTablePrefix'
| 'setTemplates' | 'setSelectedTemplateId' | 'setSimilarityMatrix' | 'setBestMatches' | 'setImportResults' | 'resetImportResults' 
| 'setMappingInProgress' | 'reset'> = {
  fileName: '',
  fileType: '',
  fileData: null,
  fileSize: 0,
  
  sheets: [],
  selectedSheetId: null,
  mappingInProgress: false,
  
  progress: {
    stage: 'idle',
    message: '',
    percent: 0,
  },
  
  headerRow: 0,
  tablePrefix: '',

  templates: [],
  selectedTemplateId: null,

  similarityMatrix: {},
  bestMatches: {},

  importResults: {
    success: false,
    createdTables: [],
    failedSheets: [],
    totalRows: 0,
    importedRows: 0,
    errors: [],
  },
  
  // Schema cache
  tableSchemas: {},
  columnMappings: {},
  sheetMappingStatus: {},
};

// Create the store
export const useBatchImportStore = create<BatchImportState>()(
  devtools(
    (set) => ({
      ...initialState,
      
      setFile: (fileName, fileType, fileData, fileSize) => set({ 
        fileName, 
        fileType, 
        fileData, 
        fileSize 
      }),
      
      clearFile: () => set({ 
        fileName: '', 
        fileType: '', 
        fileData: null, 
        fileSize: 0 
      }),
      
      setSheets: (sheets) => set({ sheets }),
      
      updateSheet: (sheetId, updates) => set((state) => ({
        sheets: state.sheets.map((sheet) => 
          sheet.id === sheetId ? { ...sheet, ...updates } : sheet
        ),
      })),
      
      updateSheetColumn: (sheetId, originalName, updates) => set((state) => {
        const sheetIndex = state.sheets.findIndex(sheet => sheet.id === sheetId);
        if (sheetIndex === -1) return state;

        const columnIndex = state.sheets[sheetIndex].columns.findIndex(
          column => column.originalName === originalName
        );
        if (columnIndex === -1) return state;

        // Create new sheets array
        const newSheets = [...state.sheets];

        // Create new sheet with new columns array
        const newSheet = {
          ...newSheets[sheetIndex],
          columns: [...newSheets[sheetIndex].columns]
        };

        // Update the specific column with new properties
        newSheet.columns[columnIndex] = {
          ...newSheet.columns[columnIndex],
          ...updates
        };

        // Replace the sheet in the array
        newSheets[sheetIndex] = newSheet;

        // Return updated state
        return { ...state, sheets: newSheets };
      }),

      batchUpdateSheetColumns: (sheetId, updates) => set((state) => {
        // Create a new copy of the sheets array
        const sheetIndex = state.sheets.findIndex(sheet => sheet.id === sheetId);
        if (sheetIndex === -1) return state; // Sheet not found

        // Create a new copy of the sheet and its columns
        const updatedSheet = {
          ...state.sheets[sheetIndex],
          columns: [...state.sheets[sheetIndex].columns]
        };

        // Update each column in a single state change
        Object.entries(updates).forEach(([originalName, columnUpdates]) => {
          const columnIndex = updatedSheet.columns.findIndex(
            column => column.originalName === originalName
          );

          if (columnIndex !== -1) {
            // Create a new column with updates applied
            updatedSheet.columns[columnIndex] = {
              ...updatedSheet.columns[columnIndex],
              ...columnUpdates
            };
          }
        });

        // Create a new sheets array with the updated sheet
        const newSheets = [...state.sheets];
        newSheets[sheetIndex] = updatedSheet;

        // Return the new state
        return {
          ...state,
          sheets: newSheets
        };
      }),
      
      setSelectedSheetId: (id) => set({ selectedSheetId: id }),
      
      setProgress: (progress) => set((state) => ({ 
        progress: { ...state.progress, ...progress } 
      })),
      
      setHeaderRow: (headerRow) => set({ headerRow }),
      
      setTablePrefix: (tablePrefix) => set({ tablePrefix }),
      
      setTemplates: (templates) => set({ templates }),

      setSelectedTemplateId: (selectedTemplateId) => set({ selectedTemplateId }),

      // Similarity matrix actions
      setSimilarityMatrix: (matrix) => set({ similarityMatrix: matrix }),

      setBestMatches: (matches) => set({ bestMatches: matches }),

      setImportResults: (results) => set((state) => ({ 
        importResults: { ...state.importResults, ...results } 
      })),
      
      resetImportResults: () => set({ 
        importResults: initialState.importResults 
      }),
      
      setMappingInProgress: (mappingInProgress) => set({ mappingInProgress }),

      createDynamicSchemaForSheet: (sheetId, tableName) => {
        // Get the current state
        const currentState = useBatchImportStore.getState();
        
        // Logging the current state of schemas to debug
        console.log(`[AutoCreate] Current schemas before creation:`, 
          Object.keys(currentState.tableSchemas), 
          `Looking for sheet ${sheetId}`
        );
        
        return set((state) => {
        // Find the sheet by ID
        const sheet = state.sheets.find(s => s.id === sheetId);
        if (!sheet) {
          console.error(`[Schema Generation] Sheet ${sheetId} not found.`);
          return state;
        }
        
        console.log(`[Schema Generation] Creating dynamic schema for sheet ${sheet.originalName} -> ${tableName}`);
        
        // Create columns from sheet data
        const columns = sheet.columns.map((col, index) => {
          // Get the best field name
          const fieldName = col.createNewValue || 
                           (col.mappedName && col.mappedName !== '_create_new_' ? 
                            col.mappedName : normalizeForDb(col.originalName));
                            
          // Infer data type from sample data if available
          const inferenceResult = col.sample ? inferColumnType(col.originalName, col.sample) : null;
          const dataType = col.inferredDataType || 
                          (inferenceResult ? inferenceResult.type : col.dataType || 'text');
          
          // Return a complete column definition with UI properties
          return {
            name: fieldName,
            originalName: col.originalName,
            displayName: col.originalName,
            normalizedName: fieldName,
            type: dataType,
            dataType: dataType,
            is_nullable: 'YES',
            description: `Auto-generated from: ${col.originalName}`,
            ordinal: index,
            source: 'auto',
            import: true,
            reviewStatus: 'approved',
            created: true,
            confidence: 100,
            needsReview: false
          };
        });
        
        // Create schema object
        const schemaObject = {
          name: tableName,
          table_name: tableName,
          schema: 'public',
          description: `Auto-generated from sheet: ${sheet.originalName}`,
          createdAt: new Date().toISOString(),
          createdBy: 'auto',
          isDynamic: true,
          columns: columns
        };
        
        // Also update column mappings for this sheet
        const sheetColumnMappings = columns.map(col => ({
          ...col,
          mappedName: '_create_new_',
          createNewValue: col.name,
          dataType: col.type || col.dataType
        }));
        
        // Create updated state
        const updatedState = {
          ...state,
          // Update table schemas cache
          tableSchemas: {
            ...state.tableSchemas,
            [tableName]: schemaObject
          },
          // Update column mappings
          columnMappings: {
            ...state.columnMappings,
            [sheetId]: sheetColumnMappings
          },
          // Update sheet mapping status
          sheetMappingStatus: {
            ...state.sheetMappingStatus,
            [sheetId]: { approved: true, source: 'auto' }
          }
        };
        
        // Log schema details for validation
        console.log(`[AutoCreate] Injected schema for ${tableName}:`, schemaObject);
        console.log(`[AutoCreate] Updated Zustand column mappings:`, sheetColumnMappings);
        
        return updatedState;
      });
      },
      
      reset: () => set(state => ({
        ...initialState,
        // Keep the similarity matrix when resetting
        similarityMatrix: state.similarityMatrix,
        bestMatches: state.bestMatches,
      })),
    }),
    { name: 'batch-import-store' }
  )
);