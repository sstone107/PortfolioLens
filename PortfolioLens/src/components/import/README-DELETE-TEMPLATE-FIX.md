# Delete Template Function Fix

## Problem

The delete template functionality was failing with the following error:

```
Error deleting template dea70286-8f1b-41b1-b214-a2c9b3e78488: {
  code: '42883', 
  details: null, 
  hint: 'No operator matches the given name and argument types. You might need to add explicit type casts.', 
  message: 'operator does not exist: boolean > integer'
}
```

## Root Cause

The issue was in the `delete_mapping_template` PostgreSQL function defined in `src/db/migrations/027_mapping_templates_rpc.sql`:

```sql
CREATE OR REPLACE FUNCTION delete_mapping_template(p_id uuid)
RETURNS boolean AS $$
DECLARE
  v_current_user uuid := auth.uid();
  v_is_admin boolean;
  v_is_owner boolean;
  v_success boolean;
BEGIN
  -- ... authorization checks ...
  
  -- Delete the template
  DELETE FROM mapping_templates
  WHERE id = p_id OR "templateId" = p_id;
  
  GET DIAGNOSTICS v_success = ROW_COUNT;
  RETURN v_success > 0; -- HERE IS THE ISSUE: comparing boolean > integer
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

The problem was that:

1. `GET DIAGNOSTICS v_success = ROW_COUNT` was assigning an integer to the `v_success` boolean variable.
2. Then, `RETURN v_success > 0` was trying to compare a boolean with an integer, which is not a valid operation in PostgreSQL.

Meanwhile, the frontend code in `mappingLogic.ts` was expecting a boolean response and using it directly:

```typescript
// Check if the deletion was successful 
if (data === false) {
  throw new Error(`Failed to delete template with ID ${id}`);
}
```

## Solution

The fix implemented in `src/db/migrations/030_fix_delete_template_function.sql` changes the variable type to match the operation:

```sql
CREATE OR REPLACE FUNCTION delete_mapping_template(p_id uuid)
RETURNS boolean AS $$
DECLARE
  v_current_user uuid := auth.uid();
  v_is_admin boolean;
  v_is_owner boolean;
  v_row_count int; -- Changed from boolean to int
BEGIN
  -- ... authorization checks ...
  
  -- Delete the template
  DELETE FROM mapping_templates
  WHERE id = p_id OR "templateId" = p_id;
  
  -- Get number of rows affected
  GET DIAGNOSTICS v_row_count = ROW_COUNT; -- Store in int variable
  
  -- Return true if at least one row was deleted, false otherwise
  RETURN v_row_count > 0; -- Compare int > int, return boolean
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This fix ensures the PostgreSQL function performs a valid integer comparison and returns a boolean as expected by the frontend code.

## Deployment

The fix was applied using Supabase MCP's `apply_migration` function on May 15, 2025. A script `scripts/run-delete-template-fix.js` was also created for applying the fix through the regular deployment process.

## Related Components

- **Frontend Logic**: `src/components/import/mappingLogic.ts` (deleteTemplate function)
- **Database Function**: `src/db/migrations/027_mapping_templates_rpc.sql` (original function)
- **Migration Fix**: `src/db/migrations/030_fix_delete_template_function.sql` (fixed function)
- **Fix Script**: `scripts/run-delete-template-fix.js` (deployment script)