-- Table generated from Excel sheet: Summary
CREATE TABLE IF NOT EXISTS "summary" (
    "id" SERIAL PRIMARY KEY,
    "col_187935" INTEGER,
    "col_214093" DECIMAL(18,6),
    "col_283670015" DECIMAL(18,6),
    "asset" INTEGER,
    "adjustment" INTEGER,
    "total" DECIMAL(18,6),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add an example comment to the table
COMMENT ON TABLE "summary" IS 'Generated from Excel sheet: Summary';


-- Table generated from Excel sheet: Loan Activity
CREATE TABLE IF NOT EXISTS "loan_activity" (
    "id" SERIAL PRIMARY KEY,
    "as_of_date" VARCHAR(20),
    "loan_id" INTEGER,
    "previous_servicer" VARCHAR(70),
    "investor_loan_id" INTEGER,
    "investor" VARCHAR(14),
    "ssid" INTEGER,
    "remittance_type" VARCHAR(32),
    "pool_id" TEXT,
    "loan_purpose" VARCHAR(30),
    "loan_status" VARCHAR(18),
    "lpi_date" VARCHAR(20),
    "prior_interest_bearing_upb" DECIMAL(18,6),
    "current_interest_bearing_upb" DECIMAL(18,6),
    "deferred_upb" INTEGER,
    "principal_collected" DECIMAL(18,6),
    "principal_remitted" INTEGER,
    "interest_collected" DECIMAL(18,6),
    "interest_remitted" INTEGER,
    "gross_master_servicing_fee" DECIMAL(18,6),
    "client_principal_surplus" INTEGER,
    "client_interest_surplus" INTEGER,
    "client_principal_shortfall" INTEGER,
    "client_interest_shortfall" INTEGER,
    "valon_t_i_advance_liability" INTEGER,
    "valon_servicing_advance_liability" INTEGER,
    "client_t_i_advance_reimbursement" INTEGER,
    "client_servicing_advance_reimbursement" INTEGER,
    "repurchase_refund" INTEGER,
    "late_fees" INTEGER,
    "nsf_fees" INTEGER,
    "other_fees" INTEGER,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add an example comment to the table
COMMENT ON TABLE "loan_activity" IS 'Generated from Excel sheet: Loan Activity';


-- Table generated from Excel sheet: Subservicing Fees
CREATE TABLE IF NOT EXISTS "subservicing_fees" (
    "id" SERIAL PRIMARY KEY,
    "as_of_date" VARCHAR(20),
    "loan_id" INTEGER,
    "previous_servicer" VARCHAR(70),
    "investor_loan_id" INTEGER,
    "investor" VARCHAR(14),
    "ssid" INTEGER,
    "remittance_type" VARCHAR(32),
    "subservicing_fee_sid" VARCHAR(68),
    "subservicing_fee_amount" DECIMAL(18,6),
    "subservicing_fee_type" VARCHAR(66),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add an example comment to the table
COMMENT ON TABLE "subservicing_fees" IS 'Generated from Excel sheet: Subservicing Fees';


-- Table generated from Excel sheet: Servicing Expenses
CREATE TABLE IF NOT EXISTS "servicing_expenses" (
    "id" SERIAL PRIMARY KEY,
    "as_of_date" VARCHAR(20),
    "loan_id" INTEGER,
    "previous_servicer" VARCHAR(66),
    "investor_loan_id" INTEGER,
    "investor" VARCHAR(14),
    "ssid" INTEGER,
    "remittance_type" VARCHAR(32),
    "servicing_expense_sid" VARCHAR(68),
    "servicing_expense_amount" DECIMAL(18,6),
    "servicing_expense_recoverability" VARCHAR(40),
    "servicing_expense_type" VARCHAR(62),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add an example comment to the table
COMMENT ON TABLE "servicing_expenses" IS 'Generated from Excel sheet: Servicing Expenses';


-- Table generated from Excel sheet: Passthrough Expenses
CREATE TABLE IF NOT EXISTS "passthrough_expenses" (
    "id" SERIAL PRIMARY KEY,
    "as_of_date" VARCHAR(20),
    "loan_id" INTEGER,
    "previous_servicer" VARCHAR(66),
    "investor_loan_id" INTEGER,
    "investor" VARCHAR(12),
    "ssid" INTEGER,
    "remittance_type" VARCHAR(38),
    "passthrough_fee_sid" VARCHAR(68),
    "passthrough_fee_amount" DECIMAL(18,6),
    "passthrough_fee_type" VARCHAR(86),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add an example comment to the table
COMMENT ON TABLE "passthrough_expenses" IS 'Generated from Excel sheet: Passthrough Expenses';


-- Table generated from Excel sheet: Passthrough Income
CREATE TABLE IF NOT EXISTS "passthrough_income" (
    "id" SERIAL PRIMARY KEY,
    "as_of_date" VARCHAR(20),
    "loan_id" INTEGER,
    "previous_servicer" VARCHAR(70),
    "investor_loan_id" INTEGER,
    "investor" VARCHAR(12),
    "ssid" INTEGER,
    "remittance_type" VARCHAR(26),
    "passthrough_income_sid" VARCHAR(68),
    "passthrough_income_amount" DECIMAL(18,6),
    "passthrough_income_type" VARCHAR(78),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add an example comment to the table
COMMENT ON TABLE "passthrough_income" IS 'Generated from Excel sheet: Passthrough Income';


-- Table generated from Excel sheet: Other
CREATE TABLE IF NOT EXISTS "other" (
    "id" SERIAL PRIMARY KEY,
    "as_of_date" TEXT,
    "loan_id" TEXT,
    "previous_servicer" TEXT,
    "investor_loan_id" TEXT,
    "investor" TEXT,
    "ssid" TEXT,
    "remittance_type" TEXT,
    "sid" TEXT,
    "amount" TEXT,
    "category" TEXT,
    "type" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add an example comment to the table
COMMENT ON TABLE "other" IS 'Generated from Excel sheet: Other';
