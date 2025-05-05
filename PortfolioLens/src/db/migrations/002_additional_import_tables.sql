-- PortfolioLens Additional Import Tables
-- Created: 2025-05-01
-- Supporting tables for Excel import functionality

-- Table: trailing_payments
CREATE TABLE IF NOT EXISTS "trailing_payments" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "loan_id" UUID NOT NULL,
    "transaction_date" DATE,
    "effective_date" DATE,
    "amount" DECIMAL(18,2),
    "principal_amount" DECIMAL(18,2),
    "interest_amount" DECIMAL(18,2),
    "escrow_amount" DECIMAL(18,2),
    "other_amount" DECIMAL(18,2),
    "payment_status" VARCHAR(50),
    "payment_source" VARCHAR(50),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
);

-- Table: loss_mitigation_records
CREATE TABLE IF NOT EXISTS "loss_mitigation_records" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "loan_id" UUID NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "mitigation_type" VARCHAR(50),
    "status" VARCHAR(50),
    "monthly_payment_amount" DECIMAL(18,2),
    "term_months" INTEGER,
    "interest_rate" DECIMAL(8,6),
    "principal_forgiveness" DECIMAL(18,2),
    "principal_forbearance" DECIMAL(18,2),
    "escrow_advance" DECIMAL(18,2),
    "capitalized_amount" DECIMAL(18,2),
    "investor_approval_date" DATE,
    "borrower_approval_date" DATE,
    "payment_processing_method" VARCHAR(50),
    "modified_maturity_date" DATE,
    "modified_upb" DECIMAL(18,2),
    "rejection_reason" VARCHAR(100),
    "notes" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
);

-- Table: covid19_forbearance_records
CREATE TABLE IF NOT EXISTS "covid19_forbearance_records" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "loan_id" UUID NOT NULL,
    "request_date" DATE,
    "start_date" DATE,
    "end_date" DATE,
    "extension_date" DATE,
    "status" VARCHAR(50),
    "hardship_reason" VARCHAR(100),
    "initial_term" INTEGER,
    "extended_term" INTEGER,
    "total_term" INTEGER,
    "post_forbearance_plan" VARCHAR(50),
    "deferred_amount" DECIMAL(18,2),
    "missed_payments" INTEGER,
    "payment_deferral_date" DATE,
    "post_covid_status" VARCHAR(50),
    "investor_approval_date" DATE,
    "borrower_exit_option" VARCHAR(100),
    "notes" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
);

-- Add indexes for the new tables
CREATE INDEX IF NOT EXISTS idx_trailing_payments_loan_id ON trailing_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_trailing_payments_transaction_date ON trailing_payments(transaction_date);

CREATE INDEX IF NOT EXISTS idx_loss_mitigation_records_loan_id ON loss_mitigation_records(loan_id);
CREATE INDEX IF NOT EXISTS idx_loss_mitigation_records_status ON loss_mitigation_records(status);
CREATE INDEX IF NOT EXISTS idx_loss_mitigation_records_mitigation_type ON loss_mitigation_records(mitigation_type);

CREATE INDEX IF NOT EXISTS idx_covid19_forbearance_records_loan_id ON covid19_forbearance_records(loan_id);
CREATE INDEX IF NOT EXISTS idx_covid19_forbearance_records_status ON covid19_forbearance_records(status);

-- Apply trigger to all new tables with updated_at column
DO $$
DECLARE
    tables text[] := array['trailing_payments', 'loss_mitigation_records', 'covid19_forbearance_records'];
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
