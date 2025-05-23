# Deployment Guide - Additional Loan Number Support

## Overview
We've added support for additional loan number fields:
- `valon_loan_id`
- `previous_servicer_loan_id`
- `mers_id`

The system now prioritizes loan numbers in this order:
1. investor_loan_number (highest priority)
2. valon_loan_id
3. seller_loan_number
4. current_servicer_loan_number
5. previous_servicer_loan_id
6. mers_id
7. generic loan_number (lowest priority)

## Step 1: Apply Database Migrations

Run these migrations in order in your Supabase SQL editor:

### Migration 047 - Remove problematic trigger
```sql
-- Location: /src/db/migrations/047_fix_loan_id_trigger.sql
-- This removes the trigger causing "record 'new' has no field 'loan_number'" errors
```

### Migration 048 - Fix loan_id references
```sql
-- Location: /src/db/migrations/048_fix_loan_id_references.sql
-- This updates get_or_create_loan_id to use ln_loan_information table
```

### Migration 049 - Add additional loan number fields
```sql
-- Location: /src/db/migrations/049_add_additional_loan_numbers.sql
-- This adds valon_loan_id, previous_servicer_loan_id, and mers_id fields
```

## Step 2: Deploy the Edge Function

1. Get your Supabase access token:
   ```bash
   npx supabase login
   ```
   Or get it from: https://app.supabase.com/account/tokens

2. Deploy the updated Edge Function:
   ```bash
   cd /mnt/c/Users/sston/CascadeProjects/PortfolioLens/PortfolioLens
   SUPABASE_ACCESS_TOKEN=your_token_here npx supabase functions deploy process-import-sheet --no-verify-jwt
   ```

## Step 3: Verify the Changes

1. Check that the Edge Function is deployed:
   - Go to your Supabase dashboard
   - Navigate to Edge Functions
   - Verify `process-import-sheet` shows as "Active"

2. Test with a sample import containing the new loan number fields

## What's Changed

### Edge Function Updates
- Extracts additional loan number fields: valon_loan_id, previous_servicer_loan_id, mers_id
- Enhanced logging to show all found loan numbers
- Passes all loan number types to the get_or_create_loan_id RPC function
- Added default values for required fields to prevent NOT NULL violations

### Database Updates
- ln_loan_information table now has columns for all loan number types
- get_or_create_loan_id function searches across all loan number fields
- Proper indexes added for performance

### Expected Behavior
- The system will find loans by ANY of the loan number fields
- When creating new loans, it uses the highest priority non-null loan number
- All loan numbers are stored to maintain data integrity
- Foreign key constraints will be satisfied using ln_loan_information.id

## Troubleshooting

If you still see errors:
1. Check Edge Function logs for which loan numbers are being found
2. Verify the migrations were applied successfully
3. Ensure the Edge Function was deployed with the latest changes
4. Check that your import data has at least one of the supported loan number fields