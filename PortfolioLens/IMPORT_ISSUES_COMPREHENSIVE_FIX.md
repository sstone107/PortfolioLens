# Comprehensive Import Issues Fix

## Issues Found

1. **Skipped sheets still being processed**
   - The Summary sheet has `"skip": true` in the template but was still processed
   - Created a table called `_create_new_` and tried to insert data

2. **Wrong table prefix**
   - Tables created as `invoice_*` instead of `ln_invoice_*`
   - Template has incorrect table names

3. **Data type mismatch**
   - "Cannot parse 'Asset' as number for column ssid"
   - The Summary sheet has SSID column containing text values but mapped as numeric

4. **Schema cache issues**
   - "Could not find the 'as_of_date' column of 'invoice_passthrough_expenses' in the schema cache"
   - Tables created but columns not added properly, or schema cache not refreshed

5. **Empty error messages**
   - Some insert errors show as empty objects: `{}`

## Fixes Applied

### 1. Skip Sheet Check (✓ Fixed)
Added check for `skip` flag in sheet mapping:
```typescript
if (sheetMapping.skip === true) {
  console.log(`Sheet "${sheetName}" is marked to skip in template`)
  // Update status to skipped and return
}
```

### 2. Table Prefix Fix (Needs Template Update)
The template needs to be updated to use `ln_` prefix for all invoice tables.

### 3. Schema Cache Refresh
The Edge Function already calls `refresh_schema_cache()` after adding columns, but it might need to be more robust.

## Remaining Issues to Fix

### 1. Update Template Table Names
Need to update the template to change:
- `invoice_loan_activity` → `ln_invoice_loan_activity`
- `invoice_servicing_expenses` → `ln_invoice_servicing_expenses`
- `invoice_passthrough_expenses` → `ln_invoice_passthrough_expenses`
- `invoice_passthrough_income` → `ln_invoice_passthrough_income`
- `invoice_subservicing_fees` → `ln_invoice_subservicing_fees`
- `invoice_other` → `ln_invoice_other`

### 2. Fix Data Type Mapping
The Summary sheet should either:
- Be skipped entirely (which it now will be)
- Or have its SSID column mapped as text instead of numeric

## Next Steps

1. Deploy the updated Edge Function with skip check
2. Update the template to use correct table names
3. Clean up any incorrectly created tables
4. Retry the import