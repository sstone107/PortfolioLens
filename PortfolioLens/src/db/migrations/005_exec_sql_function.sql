-- Migration: 005_exec_sql_function.sql
-- Description: Adds a PostgreSQL function to execute arbitrary SQL from application code
-- Date: 2025-05-02

-- Drop the existing function first to handle the return type change
DROP FUNCTION IF EXISTS public.exec_sql(text);

-- Create a function that allows executing arbitrary SQL through RPC
CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Execute the query directly
  FOR result IN EXECUTE sql LOOP
    RETURN NEXT result;
  END LOOP;
  
  RETURN;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error executing query: %, SQL state: %', SQLERRM, SQLSTATE;
END;
$$;

-- Set permissions to allow access from anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.exec_sql TO anon, authenticated, service_role;

-- Add comment to document the function
COMMENT ON FUNCTION public.exec_sql IS 'Executes arbitrary SQL queries with parameter substitution. Use with caution as this allows any SQL to be executed.';
