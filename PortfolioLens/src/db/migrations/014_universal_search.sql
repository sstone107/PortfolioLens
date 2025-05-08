-- Add universal loan search function
-- This supports the universal search box for quick loan lookups

-- Function for universal loan search
CREATE OR REPLACE FUNCTION search_loans(search_term TEXT, results_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  id UUID,
  loan_number TEXT,
  investor_loan_number TEXT,
  servicer_loan_number TEXT,
  borrower_first_name TEXT,
  borrower_last_name TEXT,
  co_borrower_first_name TEXT,
  co_borrower_last_name TEXT,
  borrower_email TEXT,
  borrower_phone TEXT,
  co_borrower_email TEXT,
  co_borrower_phone TEXT,
  property_address TEXT,
  property_city TEXT,
  property_state TEXT,
  property_zipcode TEXT,
  current_upb NUMERIC,
  loan_status TEXT,
  mers_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.loan_number,
    l.investor_loan_number,
    l.servicer_loan_number,
    l.borrower_first_name,
    l.borrower_last_name,
    l.co_borrower_first_name,
    l.co_borrower_last_name,
    l.borrower_email_address AS borrower_email,
    l.borrower_phone,
    l.co_borrower_email_address AS co_borrower_email,
    l.co_borrower_phone,
    l.property_address,
    l.property_city,
    l.property_state,
    l.property_zipcode,
    l.current_upb,
    l.loan_status,
    l.mers_id
  FROM 
    loan_portfolio_view l
  WHERE 
    l.loan_number ILIKE '%' || search_term || '%'
    OR l.investor_loan_number ILIKE '%' || search_term || '%'
    OR l.servicer_loan_number ILIKE '%' || search_term || '%'
    OR l.borrower_first_name ILIKE '%' || search_term || '%'
    OR l.borrower_last_name ILIKE '%' || search_term || '%'
    OR l.co_borrower_first_name ILIKE '%' || search_term || '%'
    OR l.co_borrower_last_name ILIKE '%' || search_term || '%'
    OR COALESCE(l.borrower_first_name, '') || ' ' || COALESCE(l.borrower_last_name, '') ILIKE '%' || search_term || '%'
    OR COALESCE(l.co_borrower_first_name, '') || ' ' || COALESCE(l.co_borrower_last_name, '') ILIKE '%' || search_term || '%'
    OR l.borrower_email_address ILIKE '%' || search_term || '%'
    OR l.co_borrower_email_address ILIKE '%' || search_term || '%'
    OR l.borrower_phone ILIKE '%' || search_term || '%'
    OR l.co_borrower_phone ILIKE '%' || search_term || '%'
    OR l.property_address ILIKE '%' || search_term || '%'
    OR l.property_zipcode ILIKE '%' || search_term || '%'
    OR l.mers_id ILIKE '%' || search_term || '%'
  ORDER BY 
    -- Prioritize exact loan number matches
    CASE WHEN l.loan_number ILIKE search_term THEN 0
         WHEN l.loan_number ILIKE search_term || '%' THEN 1
         ELSE 2
    END,
    -- Then by most recently updated
    l.updated_at DESC
  LIMIT results_limit;
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining the function
COMMENT ON FUNCTION search_loans IS 'Performs a universal search across multiple loan fields for quick lookups';

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION search_loans TO authenticated;