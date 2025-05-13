# Loan Tables Migration

This document explains how to migrate your loan-related tables to use the new `ln_` prefix.

## Overview

We've created a simplified migration approach that:

1. Focuses only on loan-related tables
2. Uses a short `ln_` prefix for better readability
3. Creates compatibility views to maintain backward compatibility
4. Preserves all permissions and RLS policies

## Tables Being Migrated

The following tables will be renamed with the `ln_` prefix:

| Current Name        | New Name             |
|---------------------|----------------------|
| information         | ln_information       |
| payments            | ln_payments          |
| delinquency         | ln_delinquency       |
| expenses            | ln_expenses          |
| trailing_payments   | ln_trailing_payments |
| insurance           | ln_insurance         |
| loss_mitigation     | ln_loss_mitigation   |
| covid_19            | ln_covid_19          |
| bankruptcy          | ln_bankruptcy        |
| foreclosure         | ln_foreclosure       |
| borrowers           | ln_borrowers         |
| loan_details        | ln_loan_details      |
| loan_documents      | ln_loan_documents    |
| loan_notes          | ln_loan_notes        |
| loans               | ln_loans             |
| properties          | ln_properties        |

## Running the Migration

### Step 1: Generate Migration SQL

```bash
node scripts/migrate-loan-tables.js generate
```

This creates a timestamped SQL file in the `scripts/migrations` directory.

### Step 2: Review the Generated SQL

Before proceeding, review the SQL file to ensure it's correct.

### Step 3: Execute the Migration

```bash
node scripts/migrate-loan-tables.js execute
```

This will apply the migration to your database.

## Backward Compatibility

For each renamed table, a view with the original name is created. This ensures that:

1. Existing queries continue to work without modification
2. Applications referencing the old table names won't break
3. All permissions are preserved

## Verifying the Migration

After running the migration, you can verify it was successful by:

1. Checking that the new tables exist with the `ln_` prefix
2. Confirming that views exist with the original table names
3. Testing that queries using the original table names still work
4. Verifying that RLS policies are correctly applied to the new tables

## Rollback Plan

If issues occur, you can roll back the migration by:

1. Dropping the views with the original names
2. Renaming the prefixed tables back to their original names

For example:

```sql
BEGIN;
DROP VIEW IF EXISTS public.payments;
ALTER TABLE public.ln_payments RENAME TO payments;
COMMIT;
```

## Future Considerations

Over time, you should update your application to reference the new table names directly. This will simplify your codebase and reduce reliance on the compatibility views.