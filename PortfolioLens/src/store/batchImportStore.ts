import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

// Types for sheet and column mapping
export interface ColumnMapping {
  originalName: string;
  mappedName: string;
  dataType: string;
  skip: boolean;
  confidence: number;
  originalIndex: number;
  sample?: unknown[];
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
  
  // Results
  importResults: {
    success: boolean;
    createdTables: string[];
    failedSheets: string[];
    totalRows: number;
    importedRows: number;
    errors: { sheet: string; message: string }[];
  };
  
  // Actions
  setFile: (fileName: string, fileType: string, fileData: ArrayBuffer, fileSize: number) => void;
  clearFile: () => void;
  
  setSheets: (sheets: SheetMapping[]) => void;
  updateSheet: (sheetId: string, updates: Partial<SheetMapping>) => void;
  updateSheetColumn: (sheetId: string, originalName: string, updates: Partial<ColumnMapping>) => void;
  setSelectedSheetId: (id: string | null) => void;
  
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
| 'updateSheetColumn' | 'setSelectedSheetId' | 'setProgress' | 'setHeaderRow' | 'setTablePrefix'
| 'setTemplates' | 'setSelectedTemplateId' | 'setImportResults' | 'resetImportResults' 
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
  
  importResults: {
    success: false,
    createdTables: [],
    failedSheets: [],
    totalRows: 0,
    importedRows: 0,
    errors: [],
  },
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
      
      updateSheetColumn: (sheetId, originalName, updates) => set((state) => ({
        sheets: state.sheets.map((sheet) => 
          sheet.id === sheetId 
            ? {
                ...sheet,
                columns: sheet.columns.map((column) => 
                  column.originalName === originalName 
                    ? { ...column, ...updates } 
                    : column
                ),
              } 
            : sheet
        ),
      })),
      
      setSelectedSheetId: (id) => set({ selectedSheetId: id }),
      
      setProgress: (progress) => set((state) => ({ 
        progress: { ...state.progress, ...progress } 
      })),
      
      setHeaderRow: (headerRow) => set({ headerRow }),
      
      setTablePrefix: (tablePrefix) => set({ tablePrefix }),
      
      setTemplates: (templates) => set({ templates }),
      
      setSelectedTemplateId: (selectedTemplateId) => set({ selectedTemplateId }),
      
      setImportResults: (results) => set((state) => ({ 
        importResults: { ...state.importResults, ...results } 
      })),
      
      resetImportResults: () => set({ 
        importResults: initialState.importResults 
      }),
      
      setMappingInProgress: (mappingInProgress) => set({ mappingInProgress }),
      
      reset: () => set(initialState),
    }),
    { name: 'batch-import-store' }
  )
);