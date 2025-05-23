# Loan ID Fixes Summary

## Issues Fixed

1. **Trigger Error**: "record 'new' has no field 'loan_number'"
   - Removed the problematic `auto_populate_loan_id` trigger that was trying to access non-existent columns
   - The trigger was attempting to access NEW.loan_number on tables that don't have that column

2. **Foreign Key Constraint Violations**
   - The ln_* tables have foreign keys pointing to `ln_loan_information.id`, not `loans.id`
   - Updated `get_or_create_loan_id` function to work with `ln_loan_information` table
   - The function now creates/finds loan records in the correct table

3. **NOT NULL Constraint Violations**
   - Added default values in the Edge Function for required fields:
     - `ln_insurance_advances.insurance_type` → 'Unknown'
     - `ln_loan_expenses.expense_date` → current date
     - `ln_remittance_report.report_date` → current date
     - `ln_transactions.transaction_date` → current date

4. **Loan Number Extraction**
   - Fixed Edge Function to extract loan numbers from original column names (before mapping)
   - Prioritizes investor_loan_number as requested
   - Correctly passes all loan number types to the RPC function

## Files Modified

1. `/src/db/migrations/047_fix_loan_id_trigger.sql`
   - Removes problematic trigger
   - Updates get_or_create_loan_id function

2. `/src/db/migrations/048_fix_loan_id_references.sql`
   - Creates ln_loan_information table if missing
   - Updates get_or_create_loan_id to use ln_loan_information
   - Adds proper indexes and permissions

3. `/supabase/functions/process-import-sheet/index.ts`
   - Fixed loan number extraction logic
   - Added default values for required fields
   - Improved error logging

## Next Steps

1. **Deploy the Edge Function**:
   ```bash
   SUPABASE_ACCESS_TOKEN=your_token npx supabase functions deploy process-import-sheet --no-verify-jwt
   ```

2. **Apply the database migrations** (run in Supabase SQL editor):
   - First run migration 047 to remove the trigger
   - Then run migration 048 to fix the loan_id references

3. **Test the import** with a file containing investor_loan_number

## Expected Results

After these fixes:
- The Edge Function will correctly extract investor loan numbers
- Loan IDs will be created in the ln_loan_information table
- Foreign key constraints will be satisfied
- Required fields will have default values to prevent NOT NULL violations
- Import should complete successfully