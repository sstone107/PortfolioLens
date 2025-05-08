-- Migration file for borrower details fields
-- This adds additional fields to the borrowers table to support full display in the BorrowerInfoTab UI component

-- Add additional borrower details fields
ALTER TABLE "borrowers" ADD COLUMN IF NOT EXISTS "mailing_address" VARCHAR(255);
ALTER TABLE "borrowers" ADD COLUMN IF NOT EXISTS "mailing_city" VARCHAR(100);
ALTER TABLE "borrowers" ADD COLUMN IF NOT EXISTS "mailing_state" VARCHAR(2);
ALTER TABLE "borrowers" ADD COLUMN IF NOT EXISTS "mailing_zip" VARCHAR(10);
ALTER TABLE "borrowers" ADD COLUMN IF NOT EXISTS "credit_score" INTEGER;
ALTER TABLE "borrowers" ADD COLUMN IF NOT EXISTS "annual_income" DECIMAL(18,2);
ALTER TABLE "borrowers" ADD COLUMN IF NOT EXISTS "employment_status" VARCHAR(50);
ALTER TABLE "borrowers" ADD COLUMN IF NOT EXISTS "employer" VARCHAR(100);
ALTER TABLE "borrowers" ADD COLUMN IF NOT EXISTS "borrower_type" VARCHAR(50);

-- Add indexes for better performance and searchability
CREATE INDEX IF NOT EXISTS "idx_borrowers_mailing_zip" ON "borrowers" ("mailing_zip");
CREATE INDEX IF NOT EXISTS "idx_borrowers_credit_score" ON "borrowers" ("credit_score");
CREATE INDEX IF NOT EXISTS "idx_borrowers_employer" ON "borrowers" ("employer");
CREATE INDEX IF NOT EXISTS "idx_borrowers_is_primary" ON "borrowers" ("is_primary");

-- Add comments to explain the new fields
COMMENT ON COLUMN "borrowers"."mailing_address" IS 'Primary mailing address line for the borrower';
COMMENT ON COLUMN "borrowers"."mailing_city" IS 'City of the borrower mailing address';
COMMENT ON COLUMN "borrowers"."mailing_state" IS 'State of the borrower mailing address (2-letter code)';
COMMENT ON COLUMN "borrowers"."mailing_zip" IS 'ZIP code of the borrower mailing address';
COMMENT ON COLUMN "borrowers"."credit_score" IS 'Current credit score of the borrower';
COMMENT ON COLUMN "borrowers"."annual_income" IS 'Annual income of the borrower in USD';
COMMENT ON COLUMN "borrowers"."employment_status" IS 'Current employment status (e.g., Employed, Unemployed, Retired, etc.)';
COMMENT ON COLUMN "borrowers"."employer" IS 'Name of the borrower\'s employer';
COMMENT ON COLUMN "borrowers"."borrower_type" IS 'Type of borrower (e.g., Primary, Co-Borrower, Guarantor)';

-- Update existing is_primary field to use named values
COMMENT ON COLUMN "borrowers"."is_primary" IS 'Flag indicating if this is the primary borrower for the loan';