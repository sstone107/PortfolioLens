-- Migration 003: Add database functions for Excel import system
-- This migration adds stored procedures required for the Excel import functionality

-- Function to get tables available to the user
CREATE OR REPLACE FUNCTION public.get_user_tables() RETURNS TABLE(table_name text, schema_name text, columns jsonb) AS $func$
BEGIN
  RETURN QUERY
  SELECT 
    tables.table_name::text,
    tables.table_schema::text,
    jsonb_agg(
      jsonb_build_object(
        'name', columns.column_name,
        'type', columns.data_type,
        'nullable', CASE WHEN columns.is_nullable = 'YES' THEN true ELSE false END,
        'default', columns.column_default
      )
    ) AS columns
  FROM 
    information_schema.tables
  JOIN
    information_schema.columns ON tables.table_name = columns.table_name 
                               AND tables.table_schema = columns.table_schema
  WHERE 
    tables.table_schema = 'public'
    AND tables.table_type = 'BASE TABLE'
    AND tables.table_name NOT IN (
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
    AND tables.table_name NOT LIKE 'pg_%'
    AND tables.table_name NOT LIKE '_pg_%'
  GROUP BY 
    tables.table_name, 
    tables.table_schema
  ORDER BY 
    tables.table_name;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if a module is visible to a user
CREATE OR REPLACE FUNCTION public.is_module_visible(p_user_id uuid, p_module text) RETURNS boolean AS $func$
DECLARE
  v_user_has_role boolean;
  v_module_visible boolean;
  v_role_id uuid;
BEGIN
  -- Get the user's role ID
  SELECT role_id INTO v_role_id
  FROM users
  WHERE id = p_user_id;
  
  -- If user has no role, deny access
  IF v_role_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check module visibility settings
  -- If no entry exists for the module and user's role, default to visible
  SELECT 
    COALESCE(visible, true)
  INTO 
    v_module_visible
  FROM 
    module_visibility
  WHERE 
    role_id = v_role_id 
    AND module = p_module;
  
  -- If no visibility setting exists, default to true
  IF v_module_visible IS NULL THEN
    v_module_visible := true;
  END IF;
  
  RETURN v_module_visible;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the functions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_module_visible(uuid, text) TO authenticated;

-- Make sure the module_visibility table exists (if not already created in previous migrations)
CREATE TABLE IF NOT EXISTS public.module_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE(module, role_id)
);

-- Row Level Security for module_visibility table
ALTER TABLE public.module_visibility ENABLE ROW LEVEL SECURITY;

-- Policies for module_visibility table
CREATE POLICY "Admins can manage module visibility" ON public.module_visibility
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

CREATE POLICY "Users can view module visibility" ON public.module_visibility
  FOR SELECT USING (true);
