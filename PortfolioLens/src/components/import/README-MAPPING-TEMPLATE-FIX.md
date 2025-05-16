# Mapping Templates Fix Documentation

## Problem Summary

The PortfolioLens application was experiencing two issues:

1. The mapping templates dropdown in FileUploadStep.tsx was empty 
2. A React warning was showing up due to missing key props in the MenuItem components

## Root Causes

1. **Empty Mapping Templates Dropdown:**
   - The mapping_templates table was not accessible via the frontend due to Row-Level Security (RLS) issues
   - The table had a mismatch between field naming conventions used in code vs. the database

2. **React Key Prop Warning:**
   - The mapping template MenuItem components weren't properly supplied with unique key props

## Solutions Implemented

### 1. Frontend Changes:

- Fixed the React key prop warning in FileUploadStep.tsx by adding a fallback when template.id is undefined:
  ```jsx
  <MenuItem key={template.id || `template-${template.name}`} value={template.id}>
  ```

- Updated BatchImporterHooks.ts to use RPC functions instead of direct table access:
  - Modified loadTemplates() to call get_mapping_templates() RPC
  - Enhanced saveTemplate() to use either create_mapping_template or update_mapping_template RPCs
  - Added proper error handling and logging throughout

- Updated mappingLogic.ts to use the RPC function for finding matching templates with a client-side fallback

### 2. Backend Changes:

- Enabled Row Level Security (RLS) on the mapping_templates table
- Created a SELECT policy that allows all authenticated users to view templates
- Added RPC functions for mapping template operations:
  - `get_mapping_templates()` - Retrieves all templates
  - `get_mapping_template_by_id(p_id uuid)` - Gets a specific template
  - Added permission grants to allow authenticated users to execute these functions

## Technical Details

### RPC Function Implementation

The get_mapping_templates() function handles field name differences by using COALESCE to try both conventions:

```sql
SELECT json_build_object(
  'id', COALESCE(mt.id, mt."templateId"),
  'name', COALESCE(mt.name, mt."templateName"),
  'description', mt.description,
  'createdAt', mt."createdAt"
)
FROM mapping_templates mt
```

### RLS Policy

The following policy enables all authenticated users to view mapping templates:

```sql
CREATE POLICY "mapping_templates_select_policy" 
ON public.mapping_templates
FOR SELECT 
USING (true);
```

## Testing

To verify the fix:
1. Navigate to the import batch page 
2. Upload a file and check if the mapping templates dropdown populates correctly
3. Verify no key prop warnings appear in the console

## Future Improvements

1. Consider adding a proper edit/delete UI for mapping templates
2. Add additional RPC functions for more complex template operations
3. Standardize field naming conventions across the database
4. Add unit tests for template management functionality