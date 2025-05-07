-- Create View for Loans with Portfolio Information
-- This creates a convenient view joining loans with their portfolio information via the mapping table

CREATE OR REPLACE VIEW loan_portfolio_view AS
SELECT 
    l.*,
    lpm.portfolio_id,
    p.name AS portfolio_name,
    p.portfolio_id AS portfolio_external_id,
    p.portfolio_type,
    i.name AS investor_name,
    s.name AS servicer_name,
    lpm.linked_at,
    lpm.linked_by
FROM 
    loans l
LEFT JOIN 
    loan_portfolio_mappings lpm ON l.investor_loan_number = lpm.investor_loan_number
LEFT JOIN 
    portfolios p ON lpm.portfolio_id = p.id
LEFT JOIN
    investors i ON l.investor_id = i.id
LEFT JOIN
    servicers s ON l.servicer_id = s.id;

COMMENT ON VIEW loan_portfolio_view IS 'Convenient view of loans with their portfolio information via the loan_portfolio_mappings table';