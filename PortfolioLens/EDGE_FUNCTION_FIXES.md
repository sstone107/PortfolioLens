# Edge Function Fixes for Import Issues

## Issues Fixed

### 1. Schema Cache Error: "Could not find the 'loan_id' column"
**Problem**: The Edge Function was trying to insert a `loan_id` column into `ln_loan_information` table, but this table doesn't have a loan_id column - it IS the loan table.

**Fix**: Modified the loan_id resolution logic to skip `ln_loan_information`:
```javascript
// Skip ln_loan_information as it doesn't have a loan_id column
if (targetTable.startsWith('ln_') && targetTable !== 'ln_loan_information' && !insertRow.loan_id) {
```

### 2. Invalid Column Names Starting with Numbers
**Problem**: PostgreSQL doesn't allow column names to start with numbers unless quoted. Columns like:
- 30_dpd_count
- 60_dpd_count
- 90_dpd_count
- 24_month_pay_history

**Fix**: Updated the `safeColumnName` function to prefix columns starting with numbers with 'n_':
```javascript
// If the name starts with a number, prefix it with 'n_'
if (/^\d/.test(safeName)) {
  safeName = 'n_' + safeName
}
```

This will transform:
- 30_dpd_count → n_30_dpd_count
- 60_dpd_count → n_60_dpd_count
- 90_dpd_count → n_90_dpd_count
- 24_month_pay_history → n_24_month_pay_history

## Files Modified
- `/supabase/functions/process-import-sheet/index.ts`

## Deployment Required
The Edge Function needs to be redeployed for these fixes to take effect:
```bash
supabase functions deploy process-import-sheet --no-verify-jwt
```

## Expected Results
After deployment:
1. The Loan Information sheet should import successfully without schema cache errors
2. Columns with numeric prefixes will be automatically renamed to valid PostgreSQL column names
3. All ln_* tables except ln_loan_information will have their loan_ids properly resolved