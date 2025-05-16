# Sheet Mappings Structure Fix

## Problem

When editing templates that appeared to have good mappings, users encountered the message "No sheets found in this template" making it impossible to view or edit the existing column mappings.

## Root Cause

The issue was in how the sheet mappings were being extracted and processed in the database functions. There were multiple formats of storing sheet mappings data in the database:

1. In the `sheet_mappings` column as an object with a nested `sheets` key
2. In the `sheet_mappings` column as a direct array
3. In the `sheetMappings` column as an object with a nested `sheets` key
4. In the `sheetMappings` column as a direct array

The RPC functions `get_mapping_template_by_id` and `get_mapping_templates` did not fully account for all these variations, which resulted in empty sheet mappings being returned from the database in some cases.

Specifically, in `TemplateEditorDialog.tsx`, the function was attempting to properly parse sheet mappings, but the data wasn't coming from the database in a consistent format:

```typescript
// Process sheet mappings
let sheetMappings: SheetMapping[] = [];

// Handle different formats of sheet mappings in template
if (template.sheetMappings) {
  // If sheetMappings is already an array, use it directly
  if (Array.isArray(template.sheetMappings)) {
    sheetMappings = template.sheetMappings;
  } 
  // If sheetMappings is a string, try to parse it
  else if (typeof template.sheetMappings === 'string') {
    try {
      sheetMappings = JSON.parse(template.sheetMappings);
    } catch (e) {
      console.error('Failed to parse sheetMappings string:', e);
    }
  }
}

setSheets(sheetMappings);
```

## Solution

The fix implemented in `src/db/migrations/031_fix_template_sheet_mappings.sql` modifies the PostgreSQL functions to handle all possible storage formats:

1. The `get_mapping_template_by_id` function was updated to:
   - First extract the sheet mappings into a separate variable using a multi-step CASE statement
   - Handle all possible storage formats (`sheet_mappings.sheets`, direct array in `sheet_mappings`, `sheetMappings.sheets`, direct array in `sheetMappings`)
   - Use the extracted sheet mappings when building the final JSON result

2. The `get_mapping_templates` function was updated with the same logic using a CTE (Common Table Expression) to extract sheet mappings consistently.

3. A new diagnostic function `diagnose_template` was added to help troubleshoot template structure issues.

The SQL extract that shows the fix for sheet mappings extraction:

```sql
SELECT 
  -- Extract the sheet mappings using a multi-step approach
  CASE 
    -- Case 1: If sheet_mappings has a 'sheets' key, use that
    WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'sheets' THEN
      mt.sheet_mappings->'sheets'
    
    -- Case 2: If sheet_mappings is an array, use it directly
    WHEN jsonb_typeof(mt.sheet_mappings) = 'array' THEN
      mt.sheet_mappings
    
    -- Case 3: If sheetMappings is an array, use it 
    WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN
      mt."sheetMappings"
    
    -- Case 4: If sheetMappings has a 'sheets' key, use that
    WHEN jsonb_typeof(mt."sheetMappings") = 'object' AND mt."sheetMappings" ? 'sheets' THEN
      mt."sheetMappings"->'sheets'
      
    -- Default: Empty array
    ELSE '[]'::jsonb
  END INTO v_sheet_mappings
FROM mapping_templates mt
WHERE mt.id = p_id OR mt."templateId" = p_id;
```

## Deployment

The fix was applied using Supabase MCP's `apply_migration` function on May 15, 2025. A script `scripts/run-sheet-mappings-fix.js` was also created for applying the fix through the regular deployment process.

## Related Components

- **Frontend Dialog**: `src/components/import/dialogs/TemplateEditorDialog.tsx`
- **Database Functions**: 
  - `get_mapping_template_by_id`
  - `get_mapping_templates`
- **Migration Fix**: `src/db/migrations/031_fix_template_sheet_mappings.sql`
- **Fix Script**: `scripts/run-sheet-mappings-fix.js`

## Additional Notes

This fix complements the earlier delete template fix, ensuring that the template management functionality works consistently. The `diagnose_template` function provides a useful tool for future troubleshooting of template data structure issues.