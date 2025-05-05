-- PortfolioLens Dynamic Column Creation Function
-- Created: 2025-05-01
-- Support for creating missing columns during import

-- Function to execute SQL dynamically
CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- Function to add a column to a table if it doesn't exist
CREATE OR REPLACE FUNCTION add_column_if_not_exists(
  p_table_name text,
  p_column_name text,
  p_column_type text
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  column_exists boolean;
BEGIN
  -- Check if column exists
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  ) INTO column_exists;

  -- If column doesn't exist, add it
  IF NOT column_exists THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', 
                   p_table_name, p_column_name, p_column_type);
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Grant execute permission to authenticated users
ALTER FUNCTION exec_sql(text) SECURITY DEFINER;
ALTER FUNCTION add_column_if_not_exists(text, text, text) SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION exec_sql TO authenticated;
GRANT EXECUTE ON FUNCTION add_column_if_not_exists TO authenticated;
