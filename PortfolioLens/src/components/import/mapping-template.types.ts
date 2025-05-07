// src/components/import/mapping-template.types.ts

export enum MappingAction {
  MAP_TO_FIELD = 'MAP_TO_FIELD',
  SKIP_FIELD = 'SKIP_FIELD',
  CREATE_NEW_FIELD = 'CREATE_NEW_FIELD',
}

export interface ColumnMapping {
  sourceColumnHeader: string;
  sourceColumnIndex?: number; // Original 0-indexed position in Excel
  targetDatabaseColumn: string | null; // Null if SKIPPED or CREATE_NEW_FIELD and not yet defined
  mappingAction: MappingAction;
  newFieldSqlName?: string; // If CREATE_NEW_FIELD
  newFieldDataType?: string; // Suggested SQL data type, e.g., VARCHAR(255), DECIMAL(18,2)
  dataTypeHint?: 'string' | 'number' | 'date' | 'boolean'; // Optional
  isRequired?: boolean; // Optional
  defaultValue?: any; // Optional
  isUniqueKey?: boolean; // Optional
  transformationLogic?: string; // Optional, simple string or structured for future
  matchPercentage?: number; // Optional, confidence score from auto-mapping
}

export interface SheetMapping {
  sourceSheetName: string;
  targetTableName: string;
  headerRowIndex: number; // 0-indexed or 1-indexed
  dataStartRowIndex: number;
  columnMappings: ColumnMapping[];
}

export interface MappingTemplate {
  templateId: string; // System-generated unique ID
  templateName: string; // User-friendly name
  description?: string; // Optional
  subservicerId?: string; // Optional
  sourceFileType: 'xlsx' | 'csv'; // Or other relevant types
  originalFileNamePattern?: string; // e.g., "loan_data_*.xlsx"
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
  version: number;
  sheetMappings: SheetMapping[];
}
