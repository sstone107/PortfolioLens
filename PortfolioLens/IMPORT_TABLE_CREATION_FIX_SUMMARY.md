# Import Table Creation Fix Summary

## Issues Found

1. **False Positive Table Detection**
   - Edge Function incorrectly detects tables exist when they don't
   - The Supabase client `.from(tableName).select()` doesn't throw expected errors for non-existent tables
   - This causes table creation to be skipped, then inserts fail

2. **Empty Error Messages**
   - Insert errors show as empty objects: `Insert error for invoice_servicing_expenses: {}`
   - Makes debugging difficult

3. **Tables Not Being Created**
   - Invoice tables (invoice_servicing_expenses, invoice_passthrough_income, etc.) don't exist
   - But Edge Function thinks they do and skips creation

## Fixes Applied

### 1. Created `table_exists` Function (Migration 057)
```sql
CREATE OR REPLACE FUNCTION public.table_exists(p_table_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = p_table_name
  );
$$;
```

### 2. Updated Edge Function Table Check
- Replaced unreliable Supabase client check with RPC call to `table_exists`
- Now properly detects when tables don't exist and creates them

### 3. Enhanced Error Logging
- Better error message extraction
- Logs all column names in failed data
- Shows detailed error information

## Deployment Steps

1. Migration already applied ✓
2. Deploy the updated Edge Function:
```bash
supabase functions deploy process-import-sheet --no-verify-jwt
```

## Expected Behavior After Fix

1. Edge Function will properly detect that invoice tables don't exist
2. Will create the tables with proper structure
3. Inserts will succeed
4. If any errors occur, detailed error messages will be logged

## Testing

After deployment, retry the import that was failing. You should see logs like:
- "Creating table invoice_servicing_expenses"
- "Table invoice_servicing_expenses created successfully"
- Successful row insertions

Instead of:
- "Table invoice_servicing_expenses exists" (false positive)
- Empty error messages