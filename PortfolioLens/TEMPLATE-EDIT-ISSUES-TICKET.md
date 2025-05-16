# Bug Ticket: Import Template Editing Issues

## Summary
Multiple issues persist with the template management functionality after recent fixes. While we've addressed the delete function error and attempted to fix sheet mapping structure issues, templates still do not display properly in the editor UI and updates do not correctly modify the original template.

## Description

### Issue 1: Templates not displaying correctly in editor
After selecting a template to edit, the UI shows "No sheets found in this template" despite the template having sheet mappings stored in the database. Our backend function changes to extract sheet mappings are not resulting in properly structured data for the frontend.

### Issue 2: Template updates not saving correctly
When attempting to update a template, the changes don't clearly modify the original template - instead, it appears a new version is created or the updates aren't persisted correctly. There's no clear indication in the UI that the update succeeded, and reloading shows seemingly unchanged data.

## Steps to Reproduce
1. Go to Import → Templates
2. Select any existing template with the "Edit" button
3. Observe that sheet mappings are not displayed ("No sheets found in this template")
4. Make a change to template settings (e.g., name, description)
5. Save the template
6. Reload the templates list
7. Select the same template again
8. Observe that the changes don't appear to be properly persisted

## Attempted Fixes

### Fix 1: Delete Template Function
- Created and applied migration `030_fix_delete_template_function.sql`
- Fixed the boolean comparison error in the `delete_mapping_template` function
- Status: **Fixed** - Delete functionality now works correctly

### Fix 2: Sheet Mappings Structure
- Created and applied migration `031_fix_template_sheet_mappings.sql`
- Modified `get_mapping_template_by_id` and `get_mapping_templates` functions to extract sheet mappings from multiple storage formats
- Added diagnostic function `diagnose_template` to help troubleshoot
- Status: **Partially Fixed** - Backend functions execute without errors but frontend still does not display sheets properly

## Technical Analysis

The issue involves a mismatch between:
1. **Data Storage**: Template sheet mappings are stored in multiple formats across two columns (`sheet_mappings` and `sheetMappings`)
2. **Data Extraction**: Our RPC functions attempt to normalize these formats
3. **Frontend Expectations**: The UI components expect a specific structure

Specifically, in `TemplateEditorDialog.tsx` (line ~154), the component processes sheet mappings with this code:
```typescript
// Set sheets state with mappings from template
setSheets(sheetMappings);
setSelectedSheetIndex(sheetMappings.length > 0 ? 0 : -1);
```

But the data arriving from the backend may still not be in the expected array format despite our extraction efforts.

## Possible Solutions to Explore

1. **Complete Frontend-Backend Data Format Synchronization**:
   - Modify `TemplateEditorDialog.tsx` to handle additional sheet mapping structures
   - Add more robust parsing/normalization in the frontend component
   - Add detailed console logging to see exactly what structure is being received

2. **Data Migration Approach**:
   - Create a one-time migration script to normalize ALL existing templates in the database to a consistent format
   - Standardize on either `sheet_mappings` or `sheetMappings` column
   - Ensure consistent structure (e.g., always an array of sheet objects)

3. **Diagnostics Enhancement**:
   - Add more detailed error reporting to the template editor
   - Add a frontend utility to visualize the raw template data structure
   - Integrate the `diagnose_template` function with a UI element for admins

## Impact
Users cannot effectively create or edit import templates, which blocks their ability to configure new data imports or modify existing import mappings. This is a critical feature for the core import workflow.

## Priority
**High** - This blocks a core workflow for importing data and configuring mappings.

## Assignee
[Developer Name]

## Additional Context
- Template data structure has evolved over time, leading to inconsistency
- Our recent fixes addressed specific errors but not the underlying data structure inconsistency
- A complete redesign of the template storage format may be needed for long-term stability