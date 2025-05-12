/**
 * Import Module Index
 * Exports the main components for the import functionality
 * Optimized for performance with large datasets
 */

// Main components
export { default as BatchImporter } from './BatchImporter';
export { default as FileUploader } from './FileUploader';
export { default as SampleDataTable } from './SampleDataTable';

// Steps
export * from './steps';
export { default as ColumnMappingStepVirtualized } from './steps/ColumnMappingStepVirtualized';

// Services
export { recordMetadataService } from './services/RecordMetadataService';
export {
  generateMappings,
  clearSimilarityCaches
} from './services/SimilarityService';
export {
  normalizeDataType,
  normalizeString,
  normalizeForMatching,
  normalizeForDb
} from './services/mappingEngine';

// Utils
export {
  exportTemplate,
  importTemplate,
  saveTemplate,
  loadTemplates
} from './mappingLogic';

// Types
export type {
  SheetMapping,
  ColumnMapping,
  MappingTemplate
} from '../../store/batchImportStore';
export type {
  MappingOptions,
  ColumnInfo,
  DbFieldInfo,
  MappingResult
} from './services/mappingEngine';