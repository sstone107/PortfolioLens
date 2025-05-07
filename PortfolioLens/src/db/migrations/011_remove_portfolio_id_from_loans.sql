-- Remove Direct Portfolio Reference Migration
-- This migration removes the direct portfolio_id column from the loans table
-- as we're now using the loan_portfolio_mappings table for this relationship

-- First, drop the foreign key constraint
ALTER TABLE "loans" DROP CONSTRAINT IF EXISTS "loans_portfolio_id_fkey";

-- Then, drop the index on portfolio_id
DROP INDEX IF EXISTS "idx_loans_portfolio_id";

-- Finally, drop the column
ALTER TABLE "loans" DROP COLUMN IF EXISTS "portfolio_id";

-- Add a comment to explain the change
COMMENT ON TABLE "loans" IS 'Primary loan table. Portfolio associations are managed through the loan_portfolio_mappings table rather than a direct foreign key.';