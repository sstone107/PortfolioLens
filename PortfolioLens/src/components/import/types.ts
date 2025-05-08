// File Import Types

export type ColumnType = 'string' | 'number' | 'boolean' | 'date';

export type FileType = 'xlsx' | 'xls' | 'csv' | 'tsv';

/**
 * Represents a mapping between an Excel column and a database column
 */
export interface ColumnMapping {
  excelColumn: string;
  dbColumn: string | null;
  type: ColumnType;
  required?: boolean;
  transform?: string; // Optional transformation function name
  isNew?: boolean; // Flag to indicate this is a proposal for a new DB column
  enrichment?: DataEnrichmentConfig; // Optional data enrichment configuration
  confidenceScore?: number; // Confidence score for the mapping (0.0 to 1.0)
  confidenceLevel?: ConfidenceLevel; // Confidence level for the mapping
}

/**
 * Configuration for data enrichment on a column
 */
export interface DataEnrichmentConfig {
  source?: string; // Source of enrichment (e.g., 'api', 'lookup', 'calculation')
  method?: string; // Method to use for enrichment
  parameters?: Record<string, any>; // Parameters for the enrichment method
  fallbackValue?: any; // Value to use if enrichment fails
}

/**
 * Global attributes that apply to all records in a batch
 */
export interface GlobalAttributes {
  id: string;
  name: string;
  attributes: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/**
 * Sub-servicer tag for applying metadata across import batches
 */
export interface SubServicerTag {
  id: string;
  name: string;
  description?: string;
  attributes: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Audit trail entry for data provenance
 */
export interface AuditTrailEntry {
  id: string;
  importJobId: string;
  action: 'import' | 'update' | 'transform' | 'enrich';
  description: string;
  metadata: Record<string, any>;
  timestamp: Date;
  userId: string;
}

/**
 * Versioned mapping template
 */
export interface MappingTemplate {
  id: string;
  name: string;
  description?: string;
  tableName: string;
  mapping: Record<string, ColumnMapping>;
  globalAttributes?: Record<string, any>;
  subServicerTags?: string[];
  version: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ImportMapping {
  tableName: string;
  sheet?: string;
  columns: Record<string, ColumnMapping>;
  globalAttributes?: Record<string, any>;
  subServicerTags?: string[];
  templateId?: string; // Reference to a mapping template if used
}

export interface SheetInfo {
  name: string;
  columnCount: number;
  rowCount: number;
  columns: string[];
  previewRows: Record<string, any>[];
  // columnTypes?: Record<string, ColumnType>; // Removed: Type inference is now done solely in the worker
}

export interface WorkbookInfo {
  fileName: string;
  fileType: FileType;
  sheets: SheetInfo[];
}

export interface ImportJob {
  id: string;
  userId: string;
  fileName: string;
  tableName: string;
  sheetName: string;
  mapping: Record<string, ColumnMapping>; // Columns to MAP data into
  newColumnProposals?: NewColumnProposal[]; // Columns to CREATE
  globalAttributes?: Record<string, any>;
  subServicerTags?: string[];
  templateId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalRows: number;
  processedRows: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  auditTrail?: AuditTrailEntry[];
}

export interface ImportPreviewRow {
  excelValue: any;
  dbValue: any;
  valid: boolean;
  errorMessage?: string;
  enriched?: boolean; // Indicates if the value was enriched
}

export interface ImportPreview {
  columnMappings: Record<string, ColumnMapping>;
  previewRows: Record<string, ImportPreviewRow>[];
  globalAttributes?: Record<string, any>;
  subServicerTags?: string[];
}

// Table metadata from database
export interface TableColumn {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: any;
  isPrimaryKey: boolean;
  description?: string;
}

export interface TableInfo {
  tableName: string;
  columns: TableColumn[];
  description?: string;
}

export type TableInfoExtended = TableInfo & { 
  isNewTableProposal?: boolean; 
  sourceSheet?: string; // Optional: if it's a new table, which sheet proposed it
};

// Missing column information for dynamic column creation
export interface MissingColumnInfo {
  columnName: string;
  suggestedType: string; // SQL data type (e.g., TEXT, DECIMAL(18,2))
  originalType: ColumnType;
}

// Suggested table mapping for Excel sheets
export interface TableMappingSuggestion {
  sheetName: string;
  tableName: string; // Empty if no match found
  confidenceScore: number; // 0-1 score, higher is better match (Reverted from matchScore)
  confidenceLevel?: ConfidenceLevel; // Confidence level for the table suggestion
  matchType: 'exact' | 'partial' | 'fuzzy' | 'none' | 'new'; // Added 'new' for proposed tables
  isNewTableProposal?: boolean; // Flag if this suggests creating a new table
  newTableProposal?: NewTableProposal; // Details if it's a new table proposal
}

// Import settings configuration
export interface ImportSettings {
  useFirstRowAsHeader: boolean;
  useSheetNameForTableMatch: boolean;
  inferDataTypes: boolean;
  createMissingColumns: boolean;
  enableDataEnrichment?: boolean;
  applyGlobalAttributes?: boolean;
  useSubServicerTags?: boolean;
  createAuditTrail?: boolean;
}

// --- Common Enums for Enhanced Import ---

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'modified';
export type SheetReviewStatus = 'pending' | 'approved' | 'rejected' | 'partiallyApproved';

// --- Batch Import Enhancement Types (Schema Cache & Ranking) ---

/**
 * Interface for a cached database column (stored in IndexedDB)
 */
export interface CachedDbColumn {
  columnName: string;
  dataType: string; // e.g., 'text', 'numeric', 'timestamp with time zone'
  isNullable: boolean;
  columnDefault: string | null;
  isPrimaryKey?: boolean; // Optional: Add if fetchable easily
}

/**
 * Interface for a cached database table (stored in IndexedDB)
 */
export interface CachedDbTable {
  tableName: string;
  columns: CachedDbColumn[];
  lastRefreshed?: number; // Optional: Timestamp for cache freshness
}

/**
 * Interface for the overall schema cache structure (stored in IndexedDB)
 */
export interface SchemaCache {
  tables: { [tableName: string]: CachedDbTable };
  lastRefreshed: number; // Timestamp of the last full refresh
  schemaVersion?: string; // Optional: Version identifier for schema compatibility
}

/**
 * Interface for a ranked table suggestion based on similarity
 */
export interface RankedTableSuggestion {
  tableName: string;
  confidenceScore: number; // 0.0 to 1.0 (higher is better)
  confidenceLevel: ConfidenceLevel; // Confidence level for the table suggestion
  matchType: 'exact' | 'partial' | 'fuzzy' | 'none' | 'new'; // How the suggestion was matched
  isNewTableProposal?: boolean; // Flag if this suggests creating a new table
  newTableProposal?: NewTableProposal; // Details if it's a new table proposal
}

/**
 * Interface for a ranked column suggestion based on similarity and type compatibility
 */
export interface RankedColumnSuggestion {
  columnName: string;
  confidenceScore: number; // 0.0 to 1.0 (higher is better)
  isTypeCompatible: boolean; // Whether the DB column type is compatible with inferred source type
  confidenceLevel: ConfidenceLevel; // Confidence level for the column suggestion
}

/**
 * Represents a suggestion for mapping a source column to a database column.
 */
export interface ColumnSuggestion {
  dbColumn: string; // The suggested database column name
  confidenceScore: number; // Score indicating how well it matches the source column header (0.0 to 1.0)
  isTypeCompatible: boolean; // Whether the DB column type is compatible with inferred source type
  isCreateNewField?: boolean; // Flag if this suggestion represents creating a new field
  confidenceLevel?: ConfidenceLevel; // Confidence level for the column suggestion
  isDuplicate?: boolean; // Flag to indicate if this column is already mapped to another source column
}

/**
 * Represents the suggestions for mapping a single source column.
 */
export interface ColumnMappingSuggestions {
  sourceColumn: string; // The original column header from the source file
  suggestions: ColumnSuggestion[]; // List of potential database column matches, including 'create new field' if applicable
  inferredDataType: ColumnType | null; // Inferred data type from sample data
}

// --- Batch Import Enhancement Types (Processing State) ---

/**
 * Interface for a proposed new column schema change
 */
export interface NewColumnProposal {
  type: 'new_column';
  details: {
    columnName: string; // Sanitized proposed name
    sqlType: string;
    isNullable?: boolean;
    defaultValue?: string;
    comment?: string; // Added comment
    sourceSheet?: string;
    sourceHeader?: string;
    createStructureOnly?: boolean; // if true, only schema, no data insert from this col
    is_primary_key?: boolean; // Added from BatchImporter usage
  };
}

/**
 * Interface for a proposed new table schema change
 */
export interface NewTableProposal {
  type: 'new_table';
  details: {
    name: string; // Changed from tableName for consistency with NewColumnProposal.details.name
    columns: NewColumnProposal['details'][]; // Array of column details, not full NewColumnProposal objects
    comment?: string; // Added comment
    sourceSheet: string;
  };
}

/**
 * Union type for any schema proposal
 */
export type SchemaProposal = NewTableProposal | NewColumnProposal;

/**
 * Interface for mapping a single sheet header to a DB column during batch processing
 */
export interface BatchColumnMapping {
  header: string; // Original sheet header
  sampleValue: any; // A sample value from the first few rows
  mappedColumn: string | null; // Target DB column name for UI display
  dbColumn?: string | null; // Target DB column name for schema generation (should match mappedColumn)
  confidenceScore?: number; // Confidence score for the mapped column (0.0 to 1.0)
  confidenceLevel?: ConfidenceLevel; // Confidence level for the mapped column
  suggestedColumns: RankedColumnSuggestion[]; // Top N column suggestions
  inferredDataType: ColumnType | null; // Inferred data type from sample data
  action: 'map' | 'skip' | 'create'; // Action for this column
  newColumnProposal?: NewColumnProposal; // Details if action is 'create'
  status: 'pending' | 'suggested' | 'userModified' | 'error'; // Current processing status
  reviewStatus: ReviewStatus; // User review status for this specific mapping
  errorMessage?: string;
}

/**
 * Interface for the processing state of a single sheet in a batch import
 */
export interface SheetProcessingState {
  sheetName: string;
  headers: string[];
  sampleData: Record<string, any>[]; // Array of row objects (e.g., 5 rows)
  selectedTable: string | null; // User-selected or top suggested table
  isNewTable?: boolean; // Flag indicating if the selected table is a new proposal
  tableConfidenceScore?: number; // Confidence score for the selected/suggested table (0.0 to 1.0)
  tableSuggestions: RankedTableSuggestion[];
  columnMappings: { [header: string]: BatchColumnMapping }; // Keyed by original header
  sheetSchemaProposals?: SchemaProposal[]; // Schema change proposals (new columns or new table) for this sheet
  status: SheetCommitStatus; // Processing status - Use the defined type
  sheetReviewStatus: SheetReviewStatus; // Overall review status for the sheet mapping
  error?: string;
  rowCount: number; // Total rows in this sheet
}

/**
 * Overall state for the batch import process
 */
export interface BatchImportState {
  fileInfo: { name: string, size: number, type: string } | null;
  file: File | null; // <-- ADDED file property
  sheets: { [sheetName: string]: SheetProcessingState };
  overallSchemaProposals?: SchemaProposal[]; // Aggregated schema change proposals from all sheets
  globalStatus: GlobalStatus; // Updated status - Use the defined type
  commitProgress: { processedSheets: number, totalSheets: number, currentSheet: string | null } | null;
  error: string | null;
  schemaCacheStatus: 'idle' | 'loading' | 'ready' | 'error';
  importSettings: ImportSettings | null; // Added importSettings
}

/**
 * Interface for database column information
 */
export interface DbColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: any;
  isPrimaryKey: boolean;
  description?: string;
}

// --- Exported Status Types ---

/**
 * Represents the overall status of the batch import process.
 */
export type GlobalStatus =
  | 'idle'          // Initial state, waiting for file
  | 'readingFile'   // File selected, reading sheets
  | 'fileReadComplete' // File sheets read, waiting for schema/analysis start
  | 'analyzing'     // Worker is processing sheets for suggestions
  | 'review'        // Analysis complete, user review needed
  | 'committing'    // Import process started, writing to DB
  | 'complete'      // Import finished successfully
  | 'error';        // An error occurred

/**
 * Represents the processing/commit status of a single sheet.
 */
export type SheetCommitStatus =
  | 'pending'       // Initial state after reading, before analysis
  | 'analyzing'     // Worker is currently analyzing this sheet
  | 'processing'    // Worker is processing this sheet (e.g., after table selection change)
  | 'needsReview'   // Analysis complete, requires user review/mapping
  | 'ready'         // Mappings complete/approved, ready for commit
  | 'committing'    // This sheet is currently being written to the DB
  | 'committed'     // This sheet was successfully imported
  | 'error';        // An error occurred during analysis or commit for this sheet
