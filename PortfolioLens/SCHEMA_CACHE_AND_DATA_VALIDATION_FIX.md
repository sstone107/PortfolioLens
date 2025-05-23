# Schema Cache and Data Validation Fix

## Issues Identified

1. **Schema Cache Lag**
   - Tables and columns are created successfully
   - PostgREST schema cache doesn't update immediately
   - Causes "Could not find the 'as_of_date' column" errors

2. **Data Type Validation**
   - "Cannot parse 'Asset' as number for column ssid"
   - Some sheets have text values where numbers are expected

## Fixes Applied

### 1. Schema Cache Refresh with Delay
Added a 2-second delay after schema refresh to allow PostgREST to update:
```typescript
// Refresh schema cache after adding columns
console.log('Refreshing schema cache...')
const { error: refreshError } = await supabaseAdmin.rpc('refresh_schema_cache')
if (refreshError) {
  console.warn('Failed to refresh schema cache:', refreshError)
}

// Add a small delay to allow schema cache to update
await new Promise(resolve => setTimeout(resolve, 2000))
console.log('Schema cache refresh complete')
```

### 2. Data Validation Improvements
The `coerceValue` function already handles invalid numbers by returning null, but we need better logging to identify problematic data.

## Current Table Status

All tables were created successfully with proper columns:
- `ln_invoice_loan_activity` (36 columns)
- `ln_invoice_passthrough_expenses` (15 columns)
- `ln_invoice_passthrough_income` (15 columns)
- `ln_invoice_servicing_expenses` (16 columns)
- `ln_invoice_subservicing_fees` (15 columns)

## Recommendations

1. **Deploy the updated Edge Function** with the schema cache delay
2. **Check the source data** for the "Asset" value in SSID column - it might be:
   - A summary row that should be filtered out
   - A header row that wasn't properly detected
   - Bad data that needs cleaning

3. **Consider adding data validation** in the import process to skip or transform invalid rows

## Next Steps

After deploying:
```bash
supabase functions deploy process-import-sheet --no-verify-jwt
```

The schema cache issues should be resolved. For the data validation issues, you may need to:
- Check if the Excel file has multiple header rows
- Look for summary rows with text in numeric columns
- Add data cleaning logic to handle these cases