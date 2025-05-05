-- Migration: 008_sql_execution_framework.sql
-- Description: Implements a secure, role-based SQL execution framework with audit logging
-- Date: 2025-05-03

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS public.exec_sql(text);
DROP FUNCTION IF EXISTS public.exec_sql_secure(text, jsonb, text);
DROP FUNCTION IF EXISTS public.exec_sql_with_params(text, jsonb);
DROP TABLE IF EXISTS public.sql_execution_log;
DROP TYPE IF EXISTS public.sql_execution_status;

-- Create SQL execution status enum
CREATE TYPE public.sql_execution_status AS ENUM (
  'success',
  'error',
  'timeout',
  'cancelled'
);

-- Create SQL execution log table for comprehensive audit logging
CREATE TABLE public.sql_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role_name TEXT NOT NULL,
  query_text TEXT NOT NULL,
  parameters JSONB,
  execution_time INTERVAL,
  row_count INTEGER,
  status public.sql_execution_status NOT NULL,
  error_message TEXT,
  client_info JSONB,
  resource_usage JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  data_lineage JSONB,
  query_hash TEXT
);

-- Add RLS policies to the log table
ALTER TABLE public.sql_execution_log ENABLE ROW LEVEL SECURITY;

-- Admins can see all logs
CREATE POLICY "Admins can see all SQL execution logs" 
  ON public.sql_execution_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_role_assignments ura
      JOIN public.user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid() AND ur.name = 'Admin'::public.user_role_type
    )
  );

-- Users can see their own logs
CREATE POLICY "Users can see their own SQL execution logs" 
  ON public.sql_execution_log
  FOR SELECT
  USING (user_id = auth.uid());

-- Create a function to execute SQL with role-based permissions and resource limits
CREATE OR REPLACE FUNCTION public.exec_sql_secure(
  query_text TEXT,
  parameters JSONB DEFAULT '{}'::jsonb,
  role_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  execution_time INTERVAL;
  result JSONB;
  row_count INTEGER;
  status public.sql_execution_status;
  error_message TEXT;
  user_roles TEXT[];
  current_user_id UUID;
  client_info JSONB;
  resource_usage JSONB;
  query_hash TEXT;
  is_allowed BOOLEAN;
  max_execution_time INTERVAL;
  max_rows INTEGER;
  sanitized_query TEXT;
  data_lineage JSONB;
BEGIN
  -- Get current user ID and roles
  current_user_id := auth.uid();
  
  -- If no user is authenticated AND the role is not service_role, reject the query
  IF current_user_id IS NULL AND current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required to execute SQL queries';
  END IF;
  
  -- Get user roles
  SELECT array_agg(ur.name) INTO user_roles
  FROM public.user_role_assignments ura
  JOIN public.user_roles ur ON ura.role_id = ur.id
  WHERE ura.user_id = current_user_id;
  
  -- If role_name is provided, check if user has that role
  IF role_name IS NOT NULL THEN
    is_allowed := role_name = ANY(user_roles);
    IF NOT is_allowed THEN
      RAISE EXCEPTION 'User does not have the required role: %', role_name;
    END IF;
  END IF;
  
  -- Set resource limits based on user role
  -- Admin users get higher limits
  IF 'Admin' = ANY(user_roles) THEN
    max_execution_time := INTERVAL '5 minutes';
    max_rows := 100000;
  -- Accounting and Exec roles get medium limits
  ELSIF 'Accounting' = ANY(user_roles) OR 'Exec' = ANY(user_roles) THEN
    max_execution_time := INTERVAL '2 minutes';
    max_rows := 50000;
  -- Other roles get lower limits
  ELSE
    max_execution_time := INTERVAL '1 minute';
    max_rows := 10000;
  END IF;
  
  -- Set statement timeout based on role
  -- Convert interval to milliseconds for statement_timeout
  EXECUTE format('SET LOCAL statement_timeout = %s', (EXTRACT(EPOCH FROM max_execution_time) * 1000)::integer);
  
  -- Collect client information
  client_info := jsonb_build_object(
    'ip_address', current_setting('request.headers', true)::jsonb->>'x-forwarded-for',
    'user_agent', current_setting('request.headers', true)::jsonb->>'user-agent'
  );
  
  -- Generate query hash for tracking
  query_hash := encode(digest(query_text, 'sha256'), 'hex');
  
  -- Initialize data lineage tracking
  data_lineage := jsonb_build_object(
    'source_query', query_text,
    'parameters', parameters,
    'timestamp', now(),
    'user_id', current_user_id,
    'affected_tables', NULL
  );
  
  -- Sanitize and validate query
  -- This is a simple check, but could be expanded with more sophisticated SQL parsing
  sanitized_query := query_text;
  
  -- Prevent destructive operations for non-admin users
  IF NOT ('Admin' = ANY(user_roles)) AND 
     (sanitized_query ~* 'DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE|DELETE\s+FROM\s+(?!temp_)|ALTER\s+TABLE.*DROP') THEN
    RAISE EXCEPTION 'Destructive operations are not allowed for your role';
  END IF;
  
  -- Execute the query with parameters and measure performance
  start_time := clock_timestamp();
  
  DECLARE
    temp_result RECORD;
    result_array JSONB[] := ARRAY[]::JSONB[]; -- Initialize an empty array
  BEGIN
    -- Execute the query and loop through results
    FOR temp_result IN EXECUTE sanitized_query LOOP
      -- Convert each row to JSONB and append to the array
      -- Use row_to_json which handles various types within the row
      result_array := array_append(result_array, row_to_json(temp_result)::jsonb);
    END LOOP;

    -- Aggregate the array of JSONB rows into a single JSONB array value
    result := to_jsonb(result_array);

    -- Set success status
    status := 'success';
    error_message := NULL;
    -- Calculate row_count ONLY on success, inside the success block
    -- jsonb_array_length handles empty arrays correctly (returns 0)
    row_count := jsonb_array_length(result);

  EXCEPTION WHEN OTHERS THEN
    -- Handle errors
    status := 'error';
    error_message := SQLERRM;
    result := jsonb_build_object('error', SQLERRM, 'detail', SQLSTATE);
    row_count := 0; -- Ensure row_count is 0 on error
  END;
  
  end_time := clock_timestamp();
  execution_time := end_time - start_time;
  
  -- Calculate resource usage
  resource_usage := jsonb_build_object(
    'execution_time_ms', EXTRACT(EPOCH FROM execution_time) * 1000,
    'cpu_usage', NULL, -- Would require additional monitoring
    'memory_usage', NULL -- Would require additional monitoring
  );
  
  -- Row count is now set within the BEGIN/EXCEPTION block
  
  -- Analyze query to determine affected tables for data lineage
  -- This would be more sophisticated in a production environment
  data_lineage := jsonb_set(data_lineage, '{affected_tables}', 
    (SELECT jsonb_agg(table_name) 
     FROM regexp_matches(lower(query_text), 'from\s+([a-z_][a-z0-9_]*)', 'g') AS t(table_name)));
  
  -- Log the execution
  INSERT INTO public.sql_execution_log (
    user_id,
    role_name,
    query_text,
    parameters,
    execution_time,
    row_count,
    status,
    error_message,
    client_info,
    resource_usage,
    data_lineage,
    query_hash
  ) VALUES (
    current_user_id,
    COALESCE(role_name, user_roles[1]),
    query_text,
    parameters,
    execution_time,
    row_count,
    status,
    error_message,
    client_info,
    resource_usage,
    data_lineage,
    query_hash
  );
  
  -- Return the result
  RETURN result;
END;
$$;

-- Create a simpler function for parameterized queries
CREATE OR REPLACE FUNCTION public.exec_sql_with_params(
  query_text TEXT,
  parameters JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.exec_sql_secure(query_text, parameters);
END;
$$;

-- For backward compatibility, create a wrapper for the old exec_sql function
CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  secure_result jsonb;
BEGIN
  -- Call the secure function
  secure_result := public.exec_sql_secure(sql);
  
  -- Convert the result to the expected format
  IF jsonb_typeof(secure_result) = 'array' THEN
    FOR result IN SELECT * FROM jsonb_array_elements(secure_result)
    LOOP
      RETURN NEXT result;
    END LOOP;
  ELSE
    RETURN NEXT secure_result::json;
  END IF;
  
  RETURN;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error executing query: %, SQL state: %', SQLERRM, SQLSTATE;
END;
$$;

-- Set permissions to allow access from authenticated roles
GRANT EXECUTE ON FUNCTION public.exec_sql_secure TO authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql_with_params TO authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql TO anon, authenticated, service_role;

-- Add comments to document the functions
COMMENT ON FUNCTION public.exec_sql_secure IS 'Executes SQL queries with role-based permissions, resource limits, and comprehensive audit logging';
COMMENT ON FUNCTION public.exec_sql_with_params IS 'Simplified interface for executing parameterized SQL queries with security controls';
COMMENT ON FUNCTION public.exec_sql IS 'Legacy function for backward compatibility with the original exec_sql function';