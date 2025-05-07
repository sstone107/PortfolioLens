-- Loan Portfolio Mappings Migration
-- Creates a table to associate loans with portfolios in a flexible way

-- Create table for loan-portfolio mappings
CREATE TABLE IF NOT EXISTS "loan_portfolio_mappings" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "investor_loan_number" VARCHAR(50) NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "linked_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linked_by" VARCHAR(255) NOT NULL,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("portfolio_id") REFERENCES "portfolios" ("id") ON DELETE CASCADE
);

-- Create unique constraint to ensure one-to-one mapping
-- This can be adjusted later if business needs change
CREATE UNIQUE INDEX idx_loan_mapping_unique ON loan_portfolio_mappings (investor_loan_number);

-- Create index for portfolio lookups
CREATE INDEX idx_loan_mappings_portfolio_id ON loan_portfolio_mappings (portfolio_id);

-- Create index for investor loan number lookups
CREATE INDEX idx_loan_mappings_investor_loan_number ON loan_portfolio_mappings (investor_loan_number);

-- Add triggers for updated_at
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'set_updated_at' 
        AND tgrelid = 'loan_portfolio_mappings'::regclass
    ) THEN
        EXECUTE format('CREATE TRIGGER set_updated_at
                        BEFORE UPDATE ON %I
                        FOR EACH ROW
                        EXECUTE FUNCTION update_modified_column()', 'loan_portfolio_mappings');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create view for unmapped loans
CREATE OR REPLACE VIEW unmapped_loans AS
SELECT 
    l.id AS loan_id,
    l.investor_loan_id,
    l.investor_id,
    i.name AS investor_name
FROM 
    loans l
LEFT JOIN 
    loan_portfolio_mappings lpm ON l.investor_loan_id = lpm.investor_loan_number
LEFT JOIN
    investors i ON l.investor_id = i.id
WHERE 
    lpm.id IS NULL
    AND l.investor_loan_id IS NOT NULL;

-- Create view for inconsistent mappings
CREATE OR REPLACE VIEW inconsistent_loan_mappings AS
SELECT 
    lpm.investor_loan_number,
    lpm.portfolio_id,
    p.name AS portfolio_name,
    l.id AS loan_id,
    l.investor_id,
    i.name AS investor_name
FROM 
    loan_portfolio_mappings lpm
LEFT JOIN 
    loans l ON lpm.investor_loan_number = l.investor_loan_id
LEFT JOIN
    portfolios p ON lpm.portfolio_id = p.id
LEFT JOIN
    investors i ON l.investor_id = i.id
WHERE 
    l.id IS NULL OR p.id IS NULL;