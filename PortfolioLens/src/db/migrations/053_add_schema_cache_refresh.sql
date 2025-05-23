-- Create a function to refresh the PostgREST schema cache
-- This is needed after dynamically adding columns to ensure the API can see them
CREATE OR REPLACE FUNCTION public.refresh_schema_cache()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  NOTIFY pgrst, 'reload schema';
$$;

COMMENT ON FUNCTION public.refresh_schema_cache() IS 'Refreshes the PostgREST schema cache. Call this after dynamically adding columns to tables.';

-- Grant execute permission to the service role
GRANT EXECUTE ON FUNCTION public.refresh_schema_cache() TO service_role;