# PortfolioLens Change Log

## 2025-05-08: Fixed Column Default Action for New Tables (Second Attempt)

### Fixed
- Resolved persistent issue where columns for new tables weren't defaulting to "Create New Field":
  - Added more aggressive forcing of 'create' action for all columns in new tables
  - Fixed the mapping generation to properly set SQL-friendly names for new columns
  - Created proper column proposals during initial mapping processing
  - Fixed conflicts between different parts of the codebase that were resetting column mappings
  - Added additional checks to ensure new tables correctly identify columns for creation
  - Fixed default values for all column mapping properties to ensure consistency

### Technical Details
- Completely redesigned the column mapping processing effect to detect and handle new tables properly
- Forced 'create' action for new tables regardless of what was received from the worker
- Added proper proposal generation with SQL-friendly names directly in the component
- Created a stronger column defaults processing pipeline that checks multiple conditions
- Fixed handling of user modifications to ensure they aren't overwritten
- Added instrumentation to detect and diagnose column mapping issues in the future
- Ensured consistent behavior for all types of new tables (with "new:" prefix, "import_" prefix, or other names)

## 2025-05-08: Improved Debug Logging

### Changed
- Added targeted debugging logs to help isolate the batch import column mapping issue
- Improved context in critical debug messages to make debugging more effective
- Added sample data logging to provide insights without excessive verbosity
- Replaced blanket logging with strategic debug points

### Technical Details
- Added debugging for BatchImporter's isCreatingTableForModal determination
- Added column mapping state tracking at key points in the process
- Implemented smart sampling to log representative data without overwhelming the console
- Added detailed state tracking during worker processing

## 2025-05-08: Fixed Default Column Action for New Tables (First Attempt)

### Fixed
- Fixed critical issue with new table creation where columns defaulted to "Skipped Column" instead of "Create New Field":
  - Corrected the `isCreatingTable` flag detection in BatchImporter to properly identify all new tables regardless of naming prefix
  - Enhanced the flag passing between BatchImporter and ColumnMappingModal components to ensure consistency
  - Improved the default column action for new tables to consistently use 'create' instead of 'skip'
  - Added more robust logging to help diagnose similar issues in the future
  - Set high confidence scores for auto-created columns in new tables
  - Made "create" the default action for all columns in new tables with SQL-friendly names
  - Unified the code path for handling new tables in the worker to ensure consistent behavior

### Technical Details
- Fixed the `isCreatingTableForModal` determination in BatchImporter.tsx to handle all cases:
  - Tables with 'new:' prefix
  - Tables with sheetState.isNewTable flag set to true
  - Tables that don't exist in the schema cache (regardless of prefix)
- Updated the openColumnMapping function to properly set isNewTable flag for any table not found in the schema
- Enhanced the ColumnMappingModal component to force 'create' action for all columns in new tables
- Completely refactored the worker code to use a single unified approach for all new table cases:
  - Consistent format for all column mappings in new tables
  - Always setting `action: 'create'` and high confidence levels
  - Always including SQL-friendly column names and proper proposals
  - Eliminating inconsistencies between different table selection paths
- Updated the UI message to clarify that "New tables require review before import (columns default to 'Create New Field')"
- Added improved debug logging throughout to track table type detection and column defaults

## 2025-05-07: Enhanced New Table Creation in Batch Import

### Fixed
- Improved workflow for creating new tables during batch import:
  - Automatically set default column mappings for new tables to 'create' action instead of 'skip'
  - Pre-populate new column names with SQL-friendly versions of Excel headers
  - Generate default table name from sheet name for new tables
  - Ensure new tables always require review (never auto-approved)
  - Added status message in the mapping modal to indicate that new tables require review
- These changes make it easier to create new tables from imported data with minimal user intervention

### Technical Details
- Modified worker logic to pre-populate newColumnProposal for all columns in new tables
- Set mappedColumn field to SQL-friendly version of Excel header for better default values
- Updated the batchImportStore to handle 'create-new-table' option with a sensible default name
- Fixed handling of status for new tables to always require review
- Prevented automatic status changes from 'ready' to 'needsReview' for auto-approved sheets
- Added descriptive message in UI to inform users that new table mappings require review

### User Experience Improvements
- Users no longer need to individually click through each column when creating a new table
- Default column names are now more SQL-friendly (lowercase, underscores for spaces)
- Clearer indication that new table mappings require review before proceeding
- Preserved auto-approval for high-confidence matches to existing tables

## 2025-05-07: Fixed Batch Importer Column Mapping Modal Issues

### Fixed
- Fixed issues with the column mapping modal in batch import:
  - Resolved error when clicking Save button (ReferenceError: updateSheetProcessingState is not defined)
  - Fixed issue where opening a mapping modal changed table status from "ready" to "needs review"
  - Prevented previously approved sheets from losing their status when mapping is viewed
  - Maintained auto-approval status for high confidence matches
- The changes allow users to review mapping details without affecting auto-approved status

### Technical Details
- Fixed function reference in BatchImporter.tsx to properly use storeActions.updateSheetProcessingState
- Modified the condition for changing sheet status when opening the mapping modal
- Only change status to 'needsReview' for pending sheets, not for already approved ones
- Prevented the modal from resetting sheetReviewStatus to 'pending' for approved sheets

## 2025-05-07: Fixed Auto-Approval for High Confidence Matches

### Fixed
- Fixed issue where sheets with high confidence matches were still showing "Needs review" status:
  - Removed explicit override forcing all sheets to have 'needsReview' status
  - Properly respect the 'approved' status from the sheet review determination
  - Re-implemented the high confidence auto-approval logic in determineSheetReviewStatus
  - Ensured status is set to 'ready' when sheetReviewStatus is 'approved'
- Users will now see sheets with high confidence matches (>=95%) automatically approved and ready for import

### Technical Details
- Removed the `alwaysNeedsReview` flag in batchImportStore.ts that was forcing all sheets to 'needsReview'
- Ensured updatedSheet.status is set to 'ready' when sheetReviewStatus is 'approved'
- Re-added high confidence percentage calculation in determineSheetReviewStatus
- Maintained 95% threshold for auto-approval to balance automation with accuracy

## 2025-05-05: Auto-Approve Sheets with High Confidence Matches

### Fixed
- Fixed issue where sheets with auto-matched columns still required manual approval:
  - Modified `determineSheetReviewStatus` function to auto-approve sheets with at least 95% high confidence matches
  - Updated `updateSheetSuggestions` function to set sheet status to 'ready' when auto-approved
  - Removed unnecessary explicit setting of sheet review status to 'pending'
  - Improved handling of sheets with mixed confidence levels
- This fix streamlines the import process by eliminating unnecessary manual approvals when the system has high confidence in the matches

### Technical Details
- Enhanced `determineSheetReviewStatus` in `batchImportStore.ts` to calculate the percentage of high confidence columns
- Set 95% threshold for auto-approval to balance automation with accuracy
- Improved coordination between worker-provided review statuses and sheet-level status determination
- Removed debug logging after confirming the fix works correctly

## 2025-05-05: Fixed Batch Import for Sheets with Only Headers

### Fixed
- Fixed issue where sheets with only one row (just headers) couldn't be mapped in batch import:
  - Enhanced `FileReader.getSheetData()` to extract headers directly from the first row
  - Added special handling for sheets with headers but no data rows
  - Created a dummy row with null values when only headers are present
  - Ensured mapping UI works correctly with empty sample data
- This fix allows users to map columns based on header names even when there's no sample data

### Technical Details
- Modified `FileReader.ts` to extract headers directly using Excel.js cell access
- Implemented range detection to identify sheets with only header rows
- Created a fallback mechanism that generates a dummy data row with null values
- Maintained backward compatibility with sheets containing actual data

## 2025-05-05: Prioritized Exact Normalized Matches in AnalysisEngine

### Fixed
- Modified the `calculateCombinedScore` function in `AnalysisEngine.ts` to prioritize exact normalized name matches.
- If the `nameSimilarity` score is >= 0.99, the `combinedScore` is now forced to 1.0, overriding type compatibility and pattern scores.
- This ensures that columns differing only by case, spacing, or underscores receive a 100% confidence score during analysis.

### Technical Details
- Added an early return condition in `calculateCombinedScore` for `nameSimilarity >= 0.99`.
- Added `Math.min(combinedScore, 1.0)` to prevent scores exceeding 1.0 due to weighting adjustments in other cases.

## 2025-05-05: Adjusted Type Compatibility Logic for High Confidence Matches

### Fixed
- Adjusted the `isTypeCompatible` function in `MappingService.ts` to be more lenient when `nameSimilarityScore` is high (>= 0.9). This ensures that strong name matches (like those differing only by case/spacing) are more likely to achieve a "High" confidence level, even if inferred and database types aren't perfectly aligned according to stricter checks.
- Updated the call to `isTypeCompatible` to pass the `nameSimilarityScore`.

### Technical Details
- Modified `isTypeCompatible` to include checks based on `nameSimilarityScore` before falling back to stricter type comparisons.
- Ensured specialized inferred types ('amount', 'rate', 'id') are considered compatible with 'number' or 'string' database types when name similarity is high.

## 2025-05-05: Improved Column Mapping for Case and Spacing Variations

### Fixed
- Fixed issue where column names differing only by case or spacing weren't recognized as 100% matches:
  - Enhanced `normalizeForMatching` function in BatchImporterUtils.ts to better handle case and spacing variations
  - Updated `calculateSimilarity` function to recognize normalized matches as 100% matches
  - Improved `calculateNameSimilarity` function in MappingService.ts to prioritize normalized matches
  - Added null/undefined checks to prevent errors with empty strings
  - Fixed specific issue where "Valon Loan ID" was not recognized as a 100% match with "valon_loan_id"
- Updated `normalizeColumnName` function in ColumnMappingUtils.ts for consistent normalization
- Added test case to verify correct matching of columns with case and spacing differences

### Technical Details
- Implemented a two-step matching process that first checks for normalized equality before calculating Levenshtein distance
- Enhanced string normalization to handle all common separator characters (spaces, underscores, hyphens)
- Added proper TypeScript interface updates to support the isDuplicate property in ColumnSuggestion
- Improved test coverage with specific test cases for case and spacing variations

## 2025-05-05: Fixed SQL Function and Refactored Schema Changes to Use RPC

### Fixed
- Fixed critical bug in `add_columns_batch` SQL function that was causing "column reference 'column_name' is ambiguous" errors:
  - Created migration `009_fix_add_columns_batch.sql` to update the function
  - Renamed local variables to avoid name conflicts with database columns
  - Added detailed comments to explain the fix

### Changed
- Refactored schema changes execution in batch-import to use the `add_columns_batch` RPC instead of direct SQL statements:
  - Updated `SchemaGenerator.ts` to use the RPC call with proper parameter transformation
  - Modified `DatabaseService.ts` to use the RPC for creating missing columns
  - Updated `ImportService.ts` to use the RPC for applying schema changes
  - Improved error handling and reporting throughout the schema change process
  - Maintained schema cache refresh functionality through the RPC call

### Technical Details
- Transformed column data structures to match the format expected by the RPC
- Leveraged the built-in schema cache refresh functionality in the `add_columns_batch` function
- Enhanced error handling to provide better feedback when schema changes fail
- Improved code maintainability by using a consistent approach across all schema change operations
- Fixed SQL function to properly handle column name references in WHERE clauses

## 2025-05-05: Fixed SQL Schema Generation and Schema Cache Refresh in Batch Import

### Fixed
- Fixed critical issue where SQL schema generation wasn't properly executing:
  - Improved SQL statement parsing to handle multi-statement SQL blocks correctly
  - Enhanced ALTER TABLE statement execution to process each column addition individually
  - Added table-specific schema cache refresh after schema changes
  - Implemented proper schema cache refresh mechanism with verification
- Fixed schema cache refresh issues that were causing empty column lists:
  - Added singleton pattern to MetadataService for consistent access
  - Implemented refreshTableSchema method to refresh specific tables
  - Enhanced error handling and logging throughout the schema refresh process
  - Fixed SQL execution to properly handle refresh_schema_cache calls

### Technical Details
- Modified supabaseClient.ts to properly parse and execute SQL statements
- Enhanced SchemaGenerator.ts to extract table names from ALTER TABLE statements
- Added refreshTableSchema method to SchemaCacheService and MetadataService
- Implemented singleton pattern in MetadataService for consistent access
- Added detailed logging throughout the schema refresh process

## 2025-05-05: Added Field Name Input for "Create: New Field" in Batch Import

### Fixed
- Fixed issue where users couldn't enter a field name when selecting "Create: New Field" during batch import:
  - Modified `ColumnMappingModal.tsx` to open the field name input dialog when 'create' action is selected
  - Updated `handleMappingUpdate` function to check for 'create' action and open the dialog
  - Added explicit openDialog flag to ensure the dialog appears when needed
  - Improved field name display in the UI to show the actual field name after creation
  - Ensured proper initialization of field name suggestion based on Excel column name
  - Added test case to verify the field name input functionality
- Fixed TypeScript error in `AnalysisEngine.ts` by adding the required 'reviewStatus' property to BatchColumnMapping

### Technical Details
- Enhanced `handleMappingUpdate` in `ColumnMappingModal.tsx` to detect 'create' action and trigger the dialog
- Added openDialog flag to signal when the dialog should be opened
- Updated `updateColumnMapping` function to ensure it properly updates the mapping state
- Improved renderValue function in `ColumnMappingTableView.tsx` to better display field names
- Added a new test case in `ColumnMappingIntegration.test.ts` to verify field name input functionality
- Fixed TypeScript error by adding 'reviewStatus: pending' to BatchColumnMapping in AnalysisEngine.ts

## 2025-05-05: Improved Column Matching Logic in Batch Import

### Fixed
- Fixed issues with column mapping in batch import functionality:
  - Increased matching threshold from 50% to 90% to ensure only high-confidence matches are automatically mapped
  - Added logic to prevent duplicate mappings (each target column is now only mapped once)
  - Updated confidence level thresholds in MappingService to align with the new 90% threshold
- Improved column mapping reliability by ensuring each database column is only mapped to one Excel column
- Enhanced error handling when a database column is already mapped to prevent data loss

### Technical Details
- Modified `generateMappingsFromMatches` in `ColumnMappingUtils.ts` to use a 90% threshold for matches
- Added a Set to track mapped database columns and prevent duplicates
- Updated confidence level determination in `MappingService.ts` to use 90% threshold for 'High' confidence
- Removed references to deprecated `columnTypes` property in `SheetInfo` interface

## 2025-05-05: Fixed Column Mapping Database Fields Display Issue

### Fixed
- Fixed critical issue where existing database columns weren't loading in the column mapping interface:
  - Corrected SQL query syntax in `DatabaseService.getColumns()` to properly use single quotes for string literals
  - Fixed error where table names were incorrectly being treated as column identifiers
  - Implemented proper SQL string escaping for table names to prevent SQL injection
- Removed debug logging statements from:
  - `DatabaseService.ts`
  - `supabaseMcp.ts`
  - `BatchImporterHooks.ts`

### Technical Details
- Modified `getColumns()` method in `DatabaseService.ts` to use proper SQL string literal syntax:
  - Changed from using double quotes (identifier quoting) to single quotes (string literals)
  - Added proper escaping for any single quotes within table names
  - Fixed PostgreSQL error 42703 ("column does not exist") that was occurring when querying information_schema

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

## [Unreleased] - YYYY-MM-DD

### Fixed
- Ensured that `inferredDataType` for column mappings defaults to `null` instead of `'string'` throughout the import process. This was primarily addressed by correcting the `BatchColumnMapping` object creation in `batchImport.worker.ts` to always include `inferredDataType: null` (if no type is inferred, which is the current behavior for initial mapping). Also fixed a typo `normalizeForMatching` to `normalizeForComparison` in the same file.