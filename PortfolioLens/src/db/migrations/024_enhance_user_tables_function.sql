-- Migration 024: Enhance get_user_tables function
-- This migration improves the get_user_tables function for better compatibility with BatchImporter
-- Created: 2025-05-10

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS public.get_user_tables();

-- Create an enhanced version of the function
CREATE OR REPLACE FUNCTION public.get_user_tables() 
RETURNS TABLE(
  name text,          -- Table name
  schema text,        -- Schema name
  columns jsonb,      -- Column information
  description text    -- Table description
) 
SECURITY DEFINER
AS $func$
BEGIN
  -- Return user-accessible tables with their columns
  RETURN QUERY
  SELECT 
    t.table_name::text AS name,
    t.table_schema::text AS schema,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', c.column_name,
          'type', c.data_type,
          'nullable', CASE WHEN c.is_nullable = 'YES' THEN true ELSE false END,
          'default', c.column_default,
          'isPrimaryKey', (
            SELECT count(*) > 0
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu 
            ON tc.constraint_name = ccu.constraint_name
            WHERE tc.table_schema = c.table_schema
            AND tc.table_name = c.table_name
            AND tc.constraint_type = 'PRIMARY KEY'
            AND ccu.column_name = c.column_name
          ),
          'description', col_description(
            (c.table_schema || '.' || c.table_name)::regclass::oid, 
            c.ordinal_position
          )
        ) ORDER BY c.ordinal_position
      )
      FROM information_schema.columns c
      WHERE c.table_schema = t.table_schema
      AND c.table_name = t.table_name
    ) AS columns,
    obj_description((t.table_schema || '.' || t.table_name)::regclass::oid) AS description
  FROM 
    information_schema.tables t
  WHERE 
    -- Only include tables in the public schema
    t.table_schema = 'public'
    -- Only include actual tables (not views)
    AND t.table_type = 'BASE TABLE'
    -- Exclude system tables and other standard exclusions
    AND t.table_name NOT IN (
      'pg_stat_statements',
      'schema_migrations',
      'spatial_ref_sys',
      'audit',
      'buckets',
      'objects',
      'migrations',
      'extensions',
      'auth'
    )
    -- Exclude Postgres system tables
    AND t.table_name NOT LIKE 'pg_%'
    AND t.table_name NOT LIKE '_pg_%'
    -- Exclude internal mapping tables that were deprecated
    AND t.table_name NOT LIKE '%_deprecated'
    -- Exclude admin tables
    AND t.table_name NOT LIKE 'admin_%'
    -- Exclude system and log tables
    AND t.table_name NOT LIKE 'system_%'
    AND t.table_name NOT LIKE 'log_%'
    AND t.table_name NOT LIKE '%_log'
    AND t.table_name NOT LIKE '%_logs'
  ORDER BY 
    t.table_name;
    
  -- Handle errors gracefully
  EXCEPTION WHEN OTHERS THEN
    -- Log the error
    RAISE WARNING 'Error in get_user_tables: %', SQLERRM;
    -- Return empty result rather than failing completely
    RETURN;
END;
$func$ LANGUAGE plpgsql;

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_tables() TO authenticated;

-- Add comment to the function
COMMENT ON FUNCTION public.get_user_tables() IS 'Returns a list of user-accessible tables with their columns and metadata';