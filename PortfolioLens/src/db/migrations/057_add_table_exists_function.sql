-- Add function to properly check if a table exists
-- This fixes the Edge Function's incorrect table detection

CREATE OR REPLACE FUNCTION public.table_exists(p_table_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = p_table_name
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.table_exists TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.table_exists IS 'Checks if a table exists in the public schema. Used by Edge Functions to properly detect table existence.';