# Numeric Column Name Solution

## Problem
PostgreSQL doesn't allow column names to start with numbers unless they're quoted. This causes issues when importing files with columns like:
- 30_dpd_count
- 60_dpd_count
- 90_dpd_count
- 24_month_pay_history

## Comprehensive Solution

### 1. Edge Function - Automatic Transformation
The Edge Function automatically transforms column names starting with numbers by prefixing them with 'n_':
```javascript
// Safe column name function
if (/^\d/.test(safeName)) {
  safeName = 'n_' + safeName
}
```

### 2. Database - Template Fix
Created a migration to automatically fix existing templates:
- Updates all templates to use the safe column names
- Adds a trigger to fix new templates on insert/update
- Ensures consistency between templates and actual column names

### 3. Frontend - Visual Feedback
Updated the Template Editor to:
- Show warnings when a column name will be transformed
- Display what the final column name will be (e.g., "30_dpd_count → n_30_dpd_count")
- Provide tooltips explaining the transformation

### 4. Schema Cache - Automatic Refresh
Added automatic schema cache refresh after columns are added:
```javascript
// Refresh schema cache after adding columns
await supabaseAdmin.rpc('refresh_schema_cache')
```

## How It Works

1. **Import Process**:
   - User uploads file with column "30_dpd_count"
   - Edge Function creates column "n_30_dpd_count" in database
   - Schema cache is refreshed
   - Data is inserted into the renamed column

2. **Template Creation**:
   - User creates template mapping to "30_dpd_count"
   - System automatically saves it as "n_30_dpd_count"
   - UI shows warning about transformation

3. **Template Usage**:
   - Template looks for data in original column name
   - Edge Function applies the same transformation
   - Mapping works seamlessly

## Files Modified

1. **Edge Function**: `/supabase/functions/process-import-sheet/index.ts`
   - Added `safeColumnName` transformation
   - Added schema cache refresh
   - Fixed loan_id logic for ln_loan_information

2. **Database Migration**: `/src/db/migrations/054_fix_template_numeric_columns.sql`
   - Fixes existing templates
   - Adds trigger for new templates

3. **Frontend Utils**: `/src/components/import/utils/columnNameUtils.ts`
   - Shared column name transformation logic
   - Common problematic column mappings

4. **Template Editor**: `/src/components/import/dialogs/TemplateEditorDialog.tsx`
   - Visual warnings for transformations
   - Helper text showing final column names

## Result
- No more "Invalid column name" errors
- Templates work correctly with numeric column names
- Users are informed when transformations occur
- System handles edge cases automatically