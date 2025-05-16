# Template Management System Fixes

## Overview

This document describes a series of fixes implemented to address issues with the template management system, specifically focusing on delete functionality and sheet mapping display problems.

## Issues Addressed

### 1. Delete Template Function Error
- **Issue**: Error when deleting templates showing "operator does not exist: boolean > integer"
- **Root Cause**: Type mismatch in the `delete_mapping_template` PostgreSQL function, where a boolean variable was assigned an integer (row count) and then compared against an integer
- **Fix**: Migration `030_fix_delete_template_function.sql` - Updated function to use proper integer variable type

### 2. Sheet Mappings Not Loading in Template Editor
- **Issue**: Templates showing "No sheets found in this template" despite having mappings
- **Root Cause**: Inconsistent data formats between storage and retrieval; sheet mappings were stored in different formats across the database
- **Fixes**:
  - Migration `031_fix_template_sheet_mappings.sql` - Enhanced extraction of sheet mappings from different formats
  - Migration `032_enhanced_template_diagnosis.sql` - Added detailed diagnostic functions
  - Migration `033_enhance_template_rpc_functions.sql` - Made RPC functions more robust in handling different data formats
  - Frontend updates in `TemplateEditorDialog.tsx` - Enhanced parsing of different sheet mapping formats

### 3. Template Update Issues
- **Issue**: Template updates not consistently modifying the original template
- **Root Cause**: Inconsistent update process in database functions
- **Fix**: Enhanced `update_mapping_template` function to standardize storage format and ensure updates are applied consistently

## Implementation Details

### Database Changes

1. **Fix Delete Template Function** (Migration 030)
   - Changed the variable type for row count from boolean to integer
   - Fixed boolean comparison issue

2. **Fix Template Sheet Mappings** (Migration 031)
   - Enhanced extraction logic with a multi-step CASE statement to handle various storage formats
   - Added database functions to standardize all templates

3. **Enhanced Diagnosis** (Migration 032)
   - Added detailed diagnostic functions to inspect template data structures
   - Created functions to fix individual templates or all templates at once

4. **Enhanced RPC Functions** (Migration 033)
   - Rewrote template retrieval and modification functions to be more robust
   - Standardized data format between storage and retrieval
   - Ensured consistent handling of different data formats

### Frontend Changes

1. **Enhanced Template Editor**
   - Improved processing of sheet mappings with multiple parsing strategies
   - Added robust handling of legacy data formats
   - Enhanced debug logging to identify data format issues
   - Fixed handling of column mappings

## Data Formats Supported

The fixes ensure compatibility with the following sheet mapping storage formats:

1. **Standard Format** (Preferred)
   ```json
   {
     "sheet_mappings": {
       "headerRow": 0,
       "tablePrefix": "loan_",
       "sheets": [
         { "originalName": "Sheet1", "mappedName": "loans", "columns": [...] },
         { "originalName": "Sheet2", "mappedName": "payments", "columns": [...] }
       ]
     },
     "sheetMappings": [
       { "originalName": "Sheet1", "mappedName": "loans", "columns": [...] },
       { "originalName": "Sheet2", "mappedName": "payments", "columns": [...] }
     ]
   }
   ```

2. **Legacy Formats**
   ```json
   // Format A: Direct array in sheet_mappings
   {
     "sheet_mappings": [
       { "originalName": "Sheet1", "mappedName": "loans", "columns": [...] }
     ]
   }
   
   // Format B: Direct array in sheetMappings
   {
     "sheetMappings": [
       { "originalName": "Sheet1", "mappedName": "loans", "columns": [...] }
     ]
   }
   
   // Format C: Sheets nested in sheetMappings
   {
     "sheetMappings": {
       "sheets": [
         { "originalName": "Sheet1", "mappedName": "loans", "columns": [...] }
       ]
     }
   }
   
   // Format D: String formats (parsed automatically)
   {
     "sheetMappings": "[{\"originalName\":\"Sheet1\",\"mappedName\":\"loans\",\"columns\":[...]}]"
   }
   ```

## Deployment

1. Apply all migration files in sequence:
   - `030_fix_delete_template_function.sql`
   - `031_fix_template_sheet_mappings.sql`
   - `032_enhanced_template_diagnosis.sql`
   - `033_enhance_template_rpc_functions.sql`

2. Use the script `scripts/run-template-fixes.js` to apply all fixes in one step

3. Run `fix_all_template_storage()` to standardize all existing templates

## Diagnosing Template Issues

For future troubleshooting, use the following:

1. **Diagnostic Function**: 
   ```sql
   SELECT diagnose_template_full('template-id-here');
   ```

2. **Diagnostic Script**:
   ```bash
   node scripts/diagnose-template.js template-id-here
   ```

3. **Frontend Logging**:
   The TemplateEditorDialog now includes enhanced console logging to help identify data format issues.

## Conclusion

These fixes address the core issues with template management by standardizing data formats, enhancing parsing logic, and making the system more robust against different data representations. The template system should now correctly display sheet mappings, allow proper updates, and handle deletions without errors.