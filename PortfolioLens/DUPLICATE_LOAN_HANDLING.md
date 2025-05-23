# Duplicate Loan Number Handling

## Problem
The import was failing with "duplicate key value violates unique constraint 'loans_loan_number_key'" when trying to import loans that already exist in the database.

## Solution

### 1. Edge Function - Upsert Logic
Updated the Edge Function to use upsert (insert with conflict handling) for the ln_loan_information table:

```javascript
// For ln_loan_information, use upsert to handle duplicates
if (targetTable === 'ln_loan_information') {
  const { error: insertError } = await supabaseAdmin
    .from(targetTable)
    .upsert(insertData, {
      onConflict: 'loan_number',
      ignoreDuplicates: false // Update existing records
    })
}
```

### 2. Fallback Update Logic
If upsert fails, the function falls back to updating records one by one:
- Detects duplicate key errors (code 23505)
- Updates existing loans with new data
- Reports how many records were updated vs inserted

### 3. Database Support
Created migration to add:
- Import settings table for configurable duplicate handling
- Index on loan_number for faster lookups
- last_import_update timestamp to track when records were updated

## How It Works

1. **First Import**: Loan 4012855700 is inserted as a new record
2. **Subsequent Import**: Same loan number encountered
3. **Conflict Detection**: Unique constraint prevents duplicate insert
4. **Update Instead**: Existing record is updated with new data
5. **Tracking**: last_import_update timestamp shows when it was updated

## Import Modes (Future Enhancement)

The system supports different duplicate handling modes:
- **update** (default): Update existing records with new data
- **skip**: Skip duplicate records without updating
- **fail**: Fail the import if duplicates are found

## Benefits

1. **No More Failures**: Imports continue even when duplicates exist
2. **Data Updates**: Existing loans get updated with latest information
3. **Audit Trail**: Track when records were last updated via import
4. **Flexible**: Can change behavior without code changes

## Files Modified

1. `/supabase/functions/process-import-sheet/index.ts` - Added upsert logic
2. `/src/db/migrations/055_add_import_conflict_handling.sql` - Database support

## Result

- Duplicate loan numbers no longer cause import failures
- Existing loans are automatically updated with new data
- Import process is more robust and user-friendly