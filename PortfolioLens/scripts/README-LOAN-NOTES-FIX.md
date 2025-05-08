# Loan Notes Foreign Key Constraint Fix

This directory contains several scripts to fix the foreign key constraint issue with the `loan_notes` table.

## Problem Description

There's a foreign key constraint issue in the `loan_notes` table where the `user_id` column references the `users` table, but sometimes the referenced user doesn't exist. This happens because users authenticate through Supabase Auth (`auth.users` table), but may not have a corresponding record in the application's `users` table.

## Solutions

We've prepared several approaches to fix this issue, from simplest to most comprehensive:

### 1. Direct SQL Fix (Recommended for Quick Resolution)

The simplest fix is to execute the SQL in `direct-sql-fix.sql` directly in the Supabase SQL Editor:

1. Log in to your Supabase dashboard
2. Navigate to the SQL Editor
3. Open and run the `direct-sql-fix.sql` file
4. This will:
   - Drop the problematic constraint
   - Sync missing users from `auth.users` to `users`
   - Add back a simplified constraint

### 2. Running the Minimal Fix Script

If you prefer running the fix through Node.js:

1. Make sure your `.env` file has the Supabase credentials:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

2. Run the script:
   ```bash
   node scripts/run-minimal-fix.js
   ```

### 3. Full Migration Solution

For a more comprehensive solution that includes triggers and functions for ongoing synchronization:

1. Run the full migration:
   ```bash
   node scripts/run-loan-notes-fix.js
   ```

2. Or apply the migration through your standard migration process:
   ```bash
   node scripts/run-migrations.js 019_fix_loan_notes_foreign_key.sql
   ```

## Verifying the Fix

After applying any of these fixes, you can verify it worked by:

1. Checking if the constraint exists with the correct configuration:
   ```sql
   SELECT constraint_name, constraint_type
   FROM information_schema.table_constraints
   WHERE table_name = 'loan_notes' AND constraint_name = 'loan_notes_user_id_fkey';
   ```

2. Testing the creation of a new loan note to ensure no foreign key errors occur.

## Additional Improvements

The fix also implements proper error handling in the `LoanNotes` component and `loanNotesService` to provide clearer error messages if similar issues occur in the future.