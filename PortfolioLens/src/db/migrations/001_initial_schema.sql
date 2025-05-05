-- PortfolioLens Initial Database Schema
-- Created: 2025-05-01
-- Based on analysis of Excel loan portfolio data

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CORE ENTITIES

-- Table: users
CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "email" VARCHAR(255) NOT NULL UNIQUE,
    "encrypted_password" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255),
    "avatar_url" TEXT,
    "phone_number" VARCHAR(20),
    "role_id" UUID NOT NULL,
    "last_sign_in_at" TIMESTAMP,
    "is_active" BOOLEAN DEFAULT TRUE,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: roles
CREATE TABLE IF NOT EXISTS "roles" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(50) NOT NULL UNIQUE,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key from users to roles
ALTER TABLE "users" 
ADD CONSTRAINT "fk_users_roles" 
FOREIGN KEY ("role_id") REFERENCES "roles" ("id");

-- Table: servicers
CREATE TABLE IF NOT EXISTS "servicers" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "seller_servicer_id" VARCHAR(50),
    "mers_org_id" VARCHAR(50),
    "address_line1" VARCHAR(100),
    "address_line2" VARCHAR(100),
    "city" VARCHAR(50),
    "state" VARCHAR(2),
    "zip_code" VARCHAR(10),
    "primary_contact_name" VARCHAR(100),
    "primary_contact_email" VARCHAR(100),
    "primary_contact_phone" VARCHAR(20),
    "is_active" BOOLEAN DEFAULT TRUE,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: investors 
CREATE TABLE IF NOT EXISTS "investors" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "investor_id" VARCHAR(50),
    "investor_type" VARCHAR(50),
    "address_line1" VARCHAR(100),
    "address_line2" VARCHAR(100),
    "city" VARCHAR(50),
    "state" VARCHAR(2),
    "zip_code" VARCHAR(10),
    "primary_contact_name" VARCHAR(100),
    "primary_contact_email" VARCHAR(100),
    "primary_contact_phone" VARCHAR(20),
    "is_active" BOOLEAN DEFAULT TRUE,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table: portfolios
CREATE TABLE IF NOT EXISTS "portfolios" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "portfolio_id" VARCHAR(50),
    "investor_id" UUID,
    "portfolio_type" VARCHAR(50),
    "acquisition_date" DATE,
    "total_loans" INTEGER,
    "total_upb" DECIMAL(18,2),
    "description" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("investor_id") REFERENCES "investors" ("id")
);

-- LOAN DATA TABLES

-- Table: loans (primary loan information)
CREATE TABLE IF NOT EXISTS "loans" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "valon_loan_id" VARCHAR(50),
    "investor_loan_id" VARCHAR(50),
    "servicer_id" UUID NOT NULL,
    "investor_id" UUID NOT NULL,
    "portfolio_id" UUID,
    "mers_id" VARCHAR(50),
    "mers_min_status" VARCHAR(50),
    "origination_date" DATE,
    "effective_transfer_date" DATE,
    "original_loan_amount" DECIMAL(18,2),
    "original_interest_rate" DECIMAL(8,6),
    "current_upb" DECIMAL(18,2),
    "current_interest_rate" DECIMAL(8,6),
    "deferred_principal" DECIMAL(18,2),
    "last_paid_date" DATE,
    "next_due_date" DATE,
    "days_past_due" INTEGER,
    "lien_position" INTEGER,
    "loan_term" INTEGER,
    "maturity_date" DATE,
    "product_type" VARCHAR(50),
    "loan_purpose" VARCHAR(50),
    "loan_status" VARCHAR(50),
    "amortization_type" VARCHAR(50),
    "payment_frequency" VARCHAR(20),
    "bankruptcy_status" VARCHAR(50),
    "foreclosure_status" VARCHAR(50),
    "escrow_indicator" BOOLEAN,
    "is_active" BOOLEAN DEFAULT TRUE,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("servicer_id") REFERENCES "servicers" ("id"),
    FOREIGN KEY ("investor_id") REFERENCES "investors" ("id"),
    FOREIGN KEY ("portfolio_id") REFERENCES "portfolios" ("id")
);

-- Table: properties
CREATE TABLE IF NOT EXISTS "properties" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "loan_id" UUID NOT NULL,
    "address_line1" VARCHAR(100),
    "address_line2" VARCHAR(100),
    "city" VARCHAR(50),
    "state" VARCHAR(2),
    "zip_code" VARCHAR(10),
    "property_type" VARCHAR(50),
    "occupancy_type" VARCHAR(50),
    "number_of_units" INTEGER,
    "original_appraisal_value" DECIMAL(18,2),
    "original_appraisal_date" DATE,
    "last_appraisal_value" DECIMAL(18,2),
    "last_appraisal_date" DATE,
    "property_acquired_date" DATE,
    "property_sale_price" DECIMAL(18,2),
    "legal_description" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
);

-- Table: borrowers
CREATE TABLE IF NOT EXISTS "borrowers" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "loan_id" UUID NOT NULL,
    "first_name" VARCHAR(50),
    "middle_name" VARCHAR(50),
    "last_name" VARCHAR(50),
    "email" VARCHAR(100),
    "phone_number" VARCHAR(20),
    "ssn_last_four" VARCHAR(4),
    "is_primary" BOOLEAN,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
);

-- Table: payments
CREATE TABLE IF NOT EXISTS "payments" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "loan_id" UUID NOT NULL,
    "transaction_date" DATE NOT NULL,
    "effective_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "principal_amount" DECIMAL(18,2),
    "interest_amount" DECIMAL(18,2),
    "escrow_amount" DECIMAL(18,2),
    "late_charges_amount" DECIMAL(18,2),
    "other_fees_amount" DECIMAL(18,2),
    "payment_type" VARCHAR(50),
    "payment_source" VARCHAR(50),
    "transaction_id" VARCHAR(50),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
);

-- Table: delinquency_records
CREATE TABLE IF NOT EXISTS "delinquency_records" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "loan_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "days_delinquent" INTEGER,
    "amount_due" DECIMAL(18,2),
    "next_payment_due_date" DATE,
    "status" VARCHAR(50),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
);

-- Table: insurance_records
CREATE TABLE IF NOT EXISTS "insurance_records" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "loan_id" UUID NOT NULL,
    "insurance_type" VARCHAR(50) NOT NULL,
    "carrier_name" VARCHAR(100),
    "policy_number" VARCHAR(50),
    "coverage_amount" DECIMAL(18,2),
    "premium_amount" DECIMAL(18,2),
    "effective_date" DATE,
    "expiration_date" DATE,
    "is_force_placed" BOOLEAN DEFAULT FALSE,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
);

-- Table: loan_servicing_expenses
CREATE TABLE IF NOT EXISTS "loan_servicing_expenses" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "loan_id" UUID NOT NULL,
    "expense_date" DATE NOT NULL,
    "expense_type" VARCHAR(50),
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "recoverable" BOOLEAN,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
);

-- Table: bankruptcy_records
CREATE TABLE IF NOT EXISTS "bankruptcy_records" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "loan_id" UUID NOT NULL,
    "filing_date" DATE,
    "bankruptcy_case_number" VARCHAR(50),
    "bankruptcy_chapter" VARCHAR(10),
    "bankruptcy_status" VARCHAR(50),
    "date_dismissed" DATE,
    "date_discharged" DATE,
    "post_petition_due_date" DATE,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
);

-- Table: foreclosure_records
CREATE TABLE IF NOT EXISTS "foreclosure_records" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "loan_id" UUID NOT NULL,
    "first_legal_date" DATE,
    "foreclosure_start_date" DATE,
    "scheduled_sale_date" DATE,
    "actual_sale_date" DATE,
    "foreclosure_status" VARCHAR(50),
    "estimated_reo_date" DATE,
    "actual_reo_date" DATE,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
);

-- BILLING & ACCOUNTING TABLES

-- Table: billing_records
CREATE TABLE IF NOT EXISTS "billing_records" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "report_date" DATE NOT NULL,
    "servicer_id" UUID NOT NULL,
    "investor_id" UUID,
    "loan_count" INTEGER,
    "total_upb" DECIMAL(18,2),
    "service_fee_rate" DECIMAL(8,6),
    "service_fee_amount" DECIMAL(18,2),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("servicer_id") REFERENCES "servicers" ("id"),
    FOREIGN KEY ("investor_id") REFERENCES "investors" ("id")
);

-- Table: billing_line_items
CREATE TABLE IF NOT EXISTS "billing_line_items" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "billing_record_id" UUID NOT NULL,
    "loan_id" UUID,
    "line_item_type" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("billing_record_id") REFERENCES "billing_records" ("id"),
    FOREIGN KEY ("loan_id") REFERENCES "loans" ("id")
);

-- AUDIT LOGGING

-- Table: audit_logs
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "table_name" VARCHAR(50) NOT NULL,
    "record_id" UUID,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" VARCHAR(50),
    "user_agent" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
);

-- Create tables and relationships first, then we'll add indexes later

-- TRIGGERS FOR AUTOMATIC UPDATED_AT

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at column
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('CREATE TRIGGER set_updated_at
                        BEFORE UPDATE ON %I
                        FOR EACH ROW
                        EXECUTE FUNCTION update_modified_column()', t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Insert initial roles
INSERT INTO roles (name, description, permissions) 
VALUES 
('admin', 'Full system administrator with all privileges', '{"all": true}'),
('manager', 'Portfolio manager with extensive read/write access', '{"read": true, "write": true, "delete": false, "admin": false}'),
('analyst', 'Data analyst with read access and limited write', '{"read": true, "write": {"loans": false, "payments": true, "reports": true}, "delete": false, "admin": false}'),
('viewer', 'Read-only user', '{"read": true, "write": false, "delete": false, "admin": false}')
ON CONFLICT (name) DO NOTHING;

-- Now create indexes after all tables are defined

-- INDEXES

-- Loan lookups
CREATE INDEX IF NOT EXISTS idx_loans_valon_loan_id ON loans(valon_loan_id);
CREATE INDEX IF NOT EXISTS idx_loans_investor_loan_id ON loans(investor_loan_id);
CREATE INDEX IF NOT EXISTS idx_loans_servicer_id ON loans(servicer_id);
CREATE INDEX IF NOT EXISTS idx_loans_investor_id ON loans(investor_id);
CREATE INDEX IF NOT EXISTS idx_loans_portfolio_id ON loans(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_loans_loan_status ON loans(loan_status);
CREATE INDEX IF NOT EXISTS idx_loans_next_due_date ON loans(next_due_date);

-- Property lookups
CREATE INDEX IF NOT EXISTS idx_properties_loan_id ON properties(loan_id);
CREATE INDEX IF NOT EXISTS idx_properties_zip_code ON properties(zip_code);
CREATE INDEX IF NOT EXISTS idx_properties_state ON properties(state);

-- Borrower lookups
CREATE INDEX IF NOT EXISTS idx_borrowers_loan_id ON borrowers(loan_id);
CREATE INDEX IF NOT EXISTS idx_borrowers_last_name ON borrowers(last_name);

-- Payment lookups
CREATE INDEX IF NOT EXISTS idx_payments_loan_id ON payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_date ON payments(transaction_date);
CREATE INDEX IF NOT EXISTS idx_payments_effective_date ON payments(effective_date);

-- Delinquency lookups
CREATE INDEX IF NOT EXISTS idx_delinquency_records_loan_id ON delinquency_records(loan_id);
CREATE INDEX IF NOT EXISTS idx_delinquency_records_report_date ON delinquency_records(report_date);

-- Bankruptcy lookups
CREATE INDEX IF NOT EXISTS idx_bankruptcy_records_loan_id ON bankruptcy_records(loan_id);
CREATE INDEX IF NOT EXISTS idx_bankruptcy_records_bankruptcy_status ON bankruptcy_records(bankruptcy_status);

-- Foreclosure lookups
CREATE INDEX IF NOT EXISTS idx_foreclosure_records_loan_id ON foreclosure_records(loan_id);
CREATE INDEX IF NOT EXISTS idx_foreclosure_records_foreclosure_status ON foreclosure_records(foreclosure_status);

-- Billing lookups
CREATE INDEX IF NOT EXISTS idx_billing_records_report_date ON billing_records(report_date);
CREATE INDEX IF NOT EXISTS idx_billing_records_servicer_id ON billing_records(servicer_id);
CREATE INDEX IF NOT EXISTS idx_billing_line_items_billing_record_id ON billing_line_items(billing_record_id);
CREATE INDEX IF NOT EXISTS idx_billing_line_items_loan_id ON billing_line_items(loan_id);

-- Audit log lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- TRIGGERS FOR AUTOMATIC UPDATED_AT

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at column
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('CREATE TRIGGER set_updated_at
                        BEFORE UPDATE ON %I
                        FOR EACH ROW
                        EXECUTE FUNCTION update_modified_column()', t);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Insert initial roles
INSERT INTO roles (name, description, permissions) 
VALUES 
('admin', 'Full system administrator with all privileges', '{"all": true}'),
('manager', 'Portfolio manager with extensive read/write access', '{"read": true, "write": true, "delete": false, "admin": false}'),
('analyst', 'Data analyst with read access and limited write', '{"read": true, "write": {"loans": false, "payments": true, "reports": true}, "delete": false, "admin": false}'),
('viewer', 'Read-only user', '{"read": true, "write": false, "delete": false, "admin": false}')
ON CONFLICT (name) DO NOTHING;

-- Create row-level security policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE delinquency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_servicing_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankruptcy_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE foreclosure_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_line_items ENABLE ROW LEVEL SECURITY;
