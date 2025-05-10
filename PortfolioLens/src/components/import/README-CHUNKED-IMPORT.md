# Smart Excel Import & Schema Mapping Tool

This module provides a comprehensive solution for importing Excel and CSV data into the Supabase database with intelligent schema mapping. It's designed to reduce user friction by automatically analyzing and mapping data, then presenting an intuitive UI for review and confirmation.

## Features

- **Multi-step Import Wizard**
  - Upload → Auto-Mapping → Table Mapping → Column Mapping → Review & Save
  - Pre-mapped data for minimal user intervention
  - Zustand for state management
  - Web Workers for large-file processing

- **Intelligent Sheet-to-Table Mapping**
  - Automatic table name normalization
  - Confidence-based matching
  - Header row selection
  - Table prefix support
  - PostgreSQL reserved word handling

- **Advanced Column-to-Field Mapping**
  - Data type inference from sample data and headers
  - Grouped field types for better organization
  - Confidence score display
  - Skip/Include field controls

- **Mapping Template Management**
  - Save and reuse mapping configurations
  - Export/Import templates as JSON
  - Duplicate/Edit existing templates
  - Auto-matching for recognized file patterns

- **Validation and Error Handling**
  - Pre-import validation checks
  - Detailed error reporting
  - Partial import recovery options

- **Audit Logging**
  - Comprehensive activity tracking
  - User attribution
  - Success/failure metrics

## Architecture

The import system is built with a modular architecture:

### Main Components
- `BatchImporter`: Main container component orchestrating the import workflow
- `FileUploader`: Handles file selection and initial processing
- `SampleDataTable`: Displays preview data from sheets
- Web workers for background processing

### Wizard Steps
1. `FileUploadStep`: File selection and global settings
2. `TableMappingStep`: Map sheets to database tables
3. `ColumnMappingStep`: Map columns to database fields
4. `ReviewImportStep`: Final validation and execution

### Store & Data Flow
- Zustand store (`batchImportStore.ts`) maintains import state
- Data processing happens in the background using web workers
- UI updates reactively as processing completes

### Database Structure
- `mapping_templates`: Stores reusable mapping configurations
- `import_activities`: Tracks import operations
- `audit_logs`: Records detailed user actions for compliance

## Usage Examples

### Basic Import
1. Navigate to /import/batch
2. Upload Excel/CSV file
3. Review auto-mapped tables and columns
4. Execute import

### Template Creation
1. Complete an import
2. On the review screen, click "Save as Template"
3. Provide a name and description

### Template Application
1. Upload a new file
2. Select an existing template from the dropdown
3. Review and adjust mappings as needed

## Development

### State Management
The application uses Zustand for state management. The store is defined in `batchImportStore.ts` and contains:
- File metadata
- Sheet mappings
- Progress tracking
- Import results

### Adding New Features
To extend the import functionality:
1. Update the appropriate store interfaces
2. Modify the component that handles the feature
3. Update relevant steps in the wizard

## Performance Considerations

- Large files are processed in web workers
- Chunked processing for datasets with many rows
- Partial imports and retry capabilities
- Optimized UI rendering with virtualization

## Security Considerations

- Row-level security policies for all tables
- User permissions checked before operations
- Audit logging for compliance
- Data validation before database insertion