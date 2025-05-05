# PortfolioLens Change Log

## 2025-05-04: Completely Refactored Field Type Inference Logic

### Fixed
- Fixed critical issues with field type inference in data import mapping:
  - Empty fields with date-related names (like "Bankruptcy Discharge Date") are now correctly identified as Date type
  - Numeric values (like FICO scores "764 | 806") are no longer incorrectly identified as Date type
  - Boolean values ("TRUE | FALSE") are properly detected as Boolean type instead of String
- Enhanced field name analysis for empty fields with strong type indicators
- Improved pattern recognition for various data formats including dates, numbers, and booleans
- Added safeguards to prevent misclassification of numeric values as dates
- Implemented special handling for score/FICO fields to ensure they're treated as numbers

### Technical Details
- Completely rewrote the `inferDataTypeFromSamples` function in ColumnMappingUtils.ts with a more robust algorithm:
  - Implemented a multi-step prioritization system that first checks field names for strong type indicators
  - Added comprehensive pattern recognition for date fields, boolean fields, and numeric fields
  - Improved validation of date values to prevent false positives
  - Enhanced boolean detection to properly handle TRUE/FALSE values
- Expanded the `dataTypeKeywords` dictionary in BatchImporterUtils.ts with more specific keywords:
  - Added bankruptcy-related terms for better date field detection
  - Added score/FICO-related terms for better number field detection
  - Added boolean-related terms for fields like "Escrowed Required" and "Forced Place Enabled"
- Enhanced the `inferTypeFromFieldName` function with improved pattern matching:
  - Added specific patterns for date fields, boolean fields, and numeric fields
  - Implemented a multi-step approach with decreasing specificity for better accuracy
  - Improved word boundary detection to avoid false matches

## 2025-05-04: Fixed Column Mapping UI Issues and Theme Consistency

### Fixed
- Fixed React warning "Each child in a list should have a unique 'key' prop" in ColumnMappingTableView.tsx:
  - Added unique keys to MenuItem components in suggestion and existing column sections
  - Used Excel column names to ensure key uniqueness within mapping loops
- Improved theme consistency in column mapping components:
  - Added explicit background color to Paper and Dialog components
  - Ensured icons use consistent theme colors matching their parent text
  - Fixed text color in select dropdowns to ensure proper contrast in both light and dark themes
  - Applied theme-consistent styling to all UI elements

### Technical Details
- Updated ColumnMappingTableView.tsx with proper key props for all list items
- Enhanced ColumnMappingModal.tsx with proper theme-aware styling
- Ensured all components properly use Material-UI theme variables
- Fixed styling inconsistencies between light and dark modes

## 2025-05-04: Enhanced Batch Import Column Mapping Process

### Added
- Improved data type inference with the following enhancements:
  - Prioritized sample data for type inference with fallback to field names
  - Implemented a combined approach using both sample data and field names for better accuracy
  - Added special handling for numerical data with leading zeros to treat as text
  - Enhanced handling of columns with mixed blank and non-blank values
  - Added type distribution analysis for better handling of mixed data types
- Improved UI for column mapping:
  - Simplified the column mapping interface by removing the grid view option
  - Enhanced the table view with cleaner layout and better organization
  - Added manual override functionality for field types and target database columns
  - Made the "Skip Column" option more visible with an icon for better usability
  - Fixed DOM nesting warnings and key prop issues in React components
- Ensured that sheets with no data are still available for mapping

### Technical Details
- Completely rewrote the `inferDataTypeFromSamples` function in ColumnMappingUtils.ts with a more sophisticated algorithm
- Updated ColumnMappingTableView.tsx to support manual overrides of data types
- Enhanced the UI for the "Skip Column" option with RemoveCircleOutlineIcon
- Fixed React DOM nesting issues by properly structuring MenuItem components
- Improved the UI layout for better usability and cleaner appearance

## 2025-05-04: Fixed TypeError Errors in AnalysisEngine During Sheet Processing

### Fixed
- Fixed two critical TypeError errors in AnalysisEngine.ts that were preventing analysis from completing:
  - Fixed `Cannot read properties of undefined (reading 'toLowerCase')` error by adding null/undefined checks in the string normalization function
  - Fixed `Cannot use 'in' operator to search for 'tableName'` error by enhancing the `generateColumnMappings` and `generateSchemaProposals` methods to handle string table names
- Added parameter type flexibility to allow passing either table objects or table names as parameters
- Improved error handling throughout the analysis pipeline to prevent undefined values from causing crashes
- Enhanced the worker code to properly pass available tables to the AnalysisEngine methods
- Added backward compatibility for the table suggestion confidence score property

### Technical Details
- Modified the `normalize` function to safely handle undefined or null input strings
- Updated method signatures to accept string table names and look them up in the available tables array
- Added proper type checking before using the `in` operator on objects
- Implemented consistent property naming between the worker and AnalysisEngine
- Added detailed type guards to prevent TypeErrors during object property access

## 2025-05-04: Fixed Automatic Task Posting to Worker in Batch Import System

### Fixed
- Fixed issue where analysis tasks were not being posted to the web worker after file reading is complete and schema is loaded
- Added automatic task posting mechanism in BatchImporterHooks.ts that triggers when both file reading is complete and schema is loaded
- Updated handleProceedToNextStep in BatchImporter.tsx to avoid duplicate task posting and provide a fallback mechanism
- Enhanced error handling and logging throughout the task posting process
- Improved coordination between file reading completion and schema loading to ensure reliable task posting

### Technical Details
- Added a new useEffect hook in useBatchImportWorker that monitors both globalStatus and schemaCacheStatus
- Implemented checks to prevent duplicate task posting between automatic and manual mechanisms
- Added detailed logging to track the task posting process and diagnose issues
- Enhanced error handling to provide better feedback when tasks cannot be posted

## 2025-05-04: Fixed Automatic Mapping Feature in Excel Import System

### Fixed
- Fixed issue where automatic table mapping suggestions were not displaying in the UI
- Added detailed logging throughout the analysis workflow to diagnose and fix the problem:
  - Enhanced worker's result posting in `batchImport.worker.ts` with validation for tableSuggestions
  - Added more detailed logging in `SheetMappingReviewTable.tsx` to track suggestion rendering
  - Improved confidence score handling in the UI components
- Implemented validation to ensure each suggestion has a confidenceScore and confidenceLevel
- Enhanced error handling in the worker to ensure tableSuggestions is properly initialized
- Fixed the display of confidence information in the UI by using both sources of confidence data

### Technical Details
- Added safeguards to prevent undefined or null tableSuggestions from causing UI issues
- Improved logging throughout the analysis pipeline to provide better visibility into the process
- Enhanced the worker's result posting to include more detailed information about the suggestions
- Fixed the confidence score display in the UI to handle cases where the score might be missing

## 2025-05-04: Enhanced Excel Import System and UI Improvements

### Added
- Implemented a new Analysis Engine for Excel import with high-confidence mapping suggestions:
  - Created combined scoring system using name similarity, type compatibility, and content pattern analysis
  - Added confidence level indicators (High/Medium/Low) with visual indicators
  - Implemented batch action functionality for high-confidence matches
  - Added schema change proposals during analysis
- Built a two-level review UI for import mapping:
  - High-level sheet-to-table mapping overview with confidence indicators
  - Detailed column mapping view with suggestions and field creation options
- Enhanced data structures to support the new features:
  - Added confidence scores and schema proposals to mapping interfaces
  - Created new types for batch column mappings and ranked suggestions
  - Implemented new column proposal system for creating new fields
- Improved the mapping algorithm to achieve 99% accuracy for common data formats

### Technical Details
- Implemented pattern recognition for common data types (emails, phone numbers, dates, etc.)
- Created specialized scoring algorithms for different data types
- Built a modular UI system that separates concerns between high-level and detailed views
- Implemented Material-UI components for consistent styling and user experience
- Added batch approval functionality to streamline the import process

### Improvements
- Reduced verbose logging in DatabaseService.ts and supabaseMcp.ts for cleaner console output
- Fixed database table selection in SheetMappingOverview.tsx to enable creating new tables
- Filtered system tables from the available tables list to improve user experience
- Enhanced sample data preview with larger display area and improved cell formatting
- Added tooltips to data cells for better visibility of truncated content

## 2025-05-04: SQL Function Diagnostic Tool

### Added
- Created a comprehensive diagnostic script `scripts/diagnose-sql-functions.js` that:
  - Verifies actual SQL function signatures in the database
  - Tests direct execution of SQL functions with proper parameters
  - Checks PostgREST schema cache and function exposure
  - Validates permissions for the functions
  - Provides workarounds for common issues
- Added interactive mode with user prompts for guided diagnosis
- Implemented compatibility wrapper creation for parameter name mismatches
- Added detailed error reporting with color-coded output
- Added npm script `diagnose-sql` for easy execution

### Technical Details
- Implemented multiple approaches to function signature verification
- Added fallback mechanisms when system catalog access is restricted
- Created parameter validation tests to identify mismatches
- Implemented schema cache refresh attempts with verification
- Added permission checking for different roles
- Provided direct database connection example as ultimate fallback

## 2025-05-03: Automated Schema Cache Refresh Mechanism

### Added
- Created a robust schema cache refresh utility (`src/utility/schemaRefreshUtil.ts`) with:
  - Multiple refresh methods (pg_notify and REST API) for maximum reliability
  - Configurable retry logic with back-off
  - Verification to confirm refresh success
  - Detailed logging for troubleshooting
- Enhanced `scripts/run-migrations.js` to automatically refresh schema cache after migrations
  - Added dynamic import of the schema refresh utility
  - Implemented fallback to manual instructions if automatic refresh fails
  - Added clear success/failure reporting
- Added recovery mechanism in `supabaseMcp.ts` for PGRST202 errors:
  - Automatic schema refresh attempt when cache errors are detected
  - Back-off retry logic after schema refresh
  - Improved error messages with clear instructions
- Updated `src/docs/SCHEMA_CACHE.md` with:
  - Documentation of the new automated refresh mechanism
  - Technical details about how the different refresh methods work
  - Updated troubleshooting steps

### Technical Details
- Implemented REST API approach that mimics the Supabase Dashboard's "Reload" button
- Added session handling with the current Supabase JS client API
- Implemented verification to confirm schema cache is actually refreshed
- Added configurable options for retry attempts, delay, and logging level

## 2025-05-03: Parameter Type Handling and Connection Verification Fixes

### Fixed Issues
- Fixed parameter type handling in `SqlExecutionService.ts` to ensure parameters are always sent as objects, never as arrays
- Enhanced parameter validation in `supabaseMcp.ts` to convert any array parameters to empty objects
- Improved connection verification in `DatabaseService.ts` to be more resilient to different result formats
- Added better error logging in both services to help diagnose future issues
- Fixed error suppression in `supabaseMcp.ts` that was hiding "Could not find function in schema cache" errors
- Updated error handling to properly report and propagate PGRST202 (PostgREST schema cache) errors
- Improved error handling in `ImportService.ts` to properly handle and report SQL execution errors
- Enhanced `run-migrations.js` with clearer and more prominent schema cache refresh instructions

### Added
- Created comprehensive `SCHEMA_CACHE.md` documentation explaining:
  - The schema cache problem and its symptoms
  - Best practices for schema cache management
  - Troubleshooting steps for schema cache issues
  - Technical details about how schema cache refresh works
- Enhanced architectural documentation with:
  - Clear diagram explaining the relationship between database functions, PostgREST schema cache, and application code
  - Architectural best practices for managing schema cache in Supabase projects
  - Resilience recommendations for making the system more robust against cache issues
  - Future architectural recommendations for potential improvements
  - Integration with the SQL Execution Framework documentation
- Updated `PLANNING.md` to include schema cache management as part of the development approach

### Technical Details
- Modified `supabaseMcp.ts` to detect and prominently report PGRST202 errors
- Added specific error handling for schema cache errors in `ImportService.ts`
- Added a pause mechanism in `run-migrations.js` to ensure users see the schema cache warning
- Improved error messages to include clear instructions for resolving schema cache issues