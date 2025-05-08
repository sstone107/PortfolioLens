-- Enhanced Universal Search Migration (Final)
-- This supports the universal search box with improved indexing and ranking
-- This is the APPLIED version that was successfully run on the database

-- Create GIN extension for text search if not exists
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enhanced universal search function with ranking and pagination
CREATE OR REPLACE FUNCTION universal_search(
  search_term TEXT,
  filters JSONB DEFAULT NULL,
  page_number INTEGER DEFAULT 1,
  page_size INTEGER DEFAULT 10
) 
RETURNS TABLE (
  id UUID,
  loan_number TEXT,
  investor_loan_number TEXT,
  portfolio_name TEXT,
  loan_status TEXT,
  servicer_name TEXT,
  investor_name TEXT,
  upb NUMERIC,
  relevance_score FLOAT,
  total_count BIGINT
) AS $$
DECLARE
  normalized_term TEXT;
  total_records BIGINT;
  offset_val INTEGER;
BEGIN
  -- Normalize search term
  normalized_term := LOWER(TRIM(search_term));
  
  -- Calculate pagination
  offset_val := (page_number - 1) * page_size;
  
  -- Get total count for pagination
  SELECT COUNT(*) INTO total_records
  FROM loan_portfolio_view l
  WHERE 
    -- Main search logic adapted for your schema
    (
      l.loan_number ILIKE '%' || normalized_term || '%' OR
      l.investor_loan_number ILIKE '%' || normalized_term || '%' OR
      l.portfolio_name ILIKE '%' || normalized_term || '%' OR
      l.servicer_name ILIKE '%' || normalized_term || '%' OR
      l.investor_name ILIKE '%' || normalized_term || '%'
    )
    -- Add filter logic if filters are provided
    AND (filters IS NULL OR filters = '{}'::jsonb OR check_loan_filters(l.id, filters));
  
  -- Return search results with pagination and ranking
  RETURN QUERY
  SELECT 
    l.id,
    l.loan_number,
    l.investor_loan_number,
    l.portfolio_name,
    l.loan_status,
    l.servicer_name,
    l.investor_name,
    l.upb,
    -- Calculate relevance score based on match type
    CASE
      -- Exact matches get highest score
      WHEN l.loan_number = normalized_term THEN 100
      WHEN l.investor_loan_number = normalized_term THEN 95
      -- Prefix matches get high score
      WHEN l.loan_number ILIKE normalized_term || '%' THEN 85
      WHEN l.investor_loan_number ILIKE normalized_term || '%' THEN 80
      -- Contains matches get medium score
      WHEN l.loan_number ILIKE '%' || normalized_term || '%' THEN 70
      WHEN l.investor_loan_number ILIKE '%' || normalized_term || '%' THEN 65
      -- Other matches get lower scores
      ELSE 30
    END AS relevance_score,
    total_records AS total_count
  FROM 
    loan_portfolio_view l
  WHERE 
    -- Main search logic (same as count query)
    (
      l.loan_number ILIKE '%' || normalized_term || '%' OR
      l.investor_loan_number ILIKE '%' || normalized_term || '%' OR
      l.portfolio_name ILIKE '%' || normalized_term || '%' OR
      l.servicer_name ILIKE '%' || normalized_term || '%' OR
      l.investor_name ILIKE '%' || normalized_term || '%'
    )
    -- Add filter logic if filters are provided
    AND (filters IS NULL OR filters = '{}'::jsonb OR check_loan_filters(l.id, filters))
  ORDER BY
    relevance_score DESC,
    l.updated_at DESC
  LIMIT page_size
  OFFSET offset_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check loan filters
CREATE OR REPLACE FUNCTION check_loan_filters(loan_id UUID, filters JSONB)
RETURNS BOOLEAN AS $$
DECLARE
  result BOOLEAN := TRUE;
BEGIN
  -- Example filter handling logic
  -- Status filter
  IF filters ? 'status' AND filters->>'status' IS NOT NULL THEN
    result := result AND EXISTS (
      SELECT 1 FROM loan_portfolio_view
      WHERE id = loan_id AND loan_status = filters->>'status'
    );
  END IF;
  
  -- Portfolio filter
  IF filters ? 'portfolio_id' AND filters->>'portfolio_id' IS NOT NULL THEN
    result := result AND EXISTS (
      SELECT 1 FROM loan_portfolio_view
      WHERE id = loan_id AND portfolio_id = (filters->>'portfolio_id')::UUID
    );
  END IF;
  
  -- UPB range filter
  IF filters ? 'upb_min' AND filters->>'upb_min' IS NOT NULL THEN
    result := result AND EXISTS (
      SELECT 1 FROM loan_portfolio_view
      WHERE id = loan_id AND upb >= (filters->>'upb_min')::NUMERIC
    );
  END IF;
  
  IF filters ? 'upb_max' AND filters->>'upb_max' IS NOT NULL THEN
    result := result AND EXISTS (
      SELECT 1 FROM loan_portfolio_view
      WHERE id = loan_id AND upb <= (filters->>'upb_max')::NUMERIC
    );
  END IF;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
