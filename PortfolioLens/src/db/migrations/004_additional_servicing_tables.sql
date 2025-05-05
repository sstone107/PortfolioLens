-- PortfolioLens Additional Servicing Tables Migration
-- Created: 2025-05-01
-- Adds remaining tables needed for Excel servicing data import

-- Note: Only adding tables that don't already exist

-- Table: loan_details 
-- (More comprehensive loan fields to complement the core loans table)
CREATE TABLE IF NOT EXISTS "loan_details" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "loan_id" UUID NOT NULL UNIQUE,
    "origination_date" DATE,
    "maturity_date" DATE,
    "original_balance" DECIMAL(18,2),
    "current_balance" DECIMAL(18,2),
    "interest_rate" DECIMAL(8,4),
    "loan_type" VARCHAR(50),
    "loan_purpose" VARCHAR(50),
    "property_type" VARCHAR(50),
    "occupancy_type" VARCHAR(50),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id") ON DELETE CASCADE
);

-- Create index for the new table
CREATE INDEX IF NOT EXISTS idx_loan_details_loan_id ON loan_details(loan_id);

-- Apply update trigger to all new tables
DO $$
DECLARE
    tables text[] := ARRAY['trailing_payment_records', 'covid19_relief_records', 
                           'loss_mitigation_records', 'loan_details'];
    t text;
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        EXECUTE format('CREATE TRIGGER set_updated_at
                        BEFORE UPDATE ON %I
                        FOR EACH ROW
                        EXECUTE FUNCTION update_modified_column()', t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
