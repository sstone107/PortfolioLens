-- Migration 023: Enhanced Import System
-- Description: Adds tables and functions to support the enhanced import system with mapping templates
-- Created: 2025-05-10

-- Create mapping_templates table if it doesn't exist (upgraded from import_mappings)
CREATE TABLE IF NOT EXISTS public.mapping_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  servicer_id UUID REFERENCES servicers(id) ON DELETE SET NULL,
  file_pattern VARCHAR(255),
  header_row INTEGER NOT NULL DEFAULT 0,
  table_prefix VARCHAR(50),
  sheet_mappings JSONB NOT NULL,
  mapping_json JSONB, -- For backward compatibility
  created_by VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  review_only BOOLEAN NOT NULL DEFAULT FALSE
);

-- Create import_activities table for tracking import operations
CREATE TABLE IF NOT EXISTS public.import_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  template_id UUID REFERENCES mapping_templates(id) ON DELETE SET NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  tables_created TEXT[] NOT NULL DEFAULT '{}',
  rows_affected INTEGER NOT NULL DEFAULT 0,
  error_details JSONB
);

-- Create audit_logs table for tracking all import-related actions
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  entity_name VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details JSONB
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_mapping_templates_created_by ON mapping_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_import_activities_user_id ON import_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_import_activities_template_id ON import_activities(template_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);

-- Add Row Level Security
ALTER TABLE mapping_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY mapping_templates_select ON mapping_templates
  FOR SELECT USING (true);

CREATE POLICY mapping_templates_insert ON mapping_templates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY mapping_templates_update ON mapping_templates
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND
    (created_by = auth.uid()::text OR 
     EXISTS (SELECT 1 FROM users u JOIN roles r ON u.role_id = r.id 
             WHERE u.id = auth.uid() AND r.name = 'admin'))
  );

CREATE POLICY mapping_templates_delete ON mapping_templates
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND
    (created_by = auth.uid()::text OR 
     EXISTS (SELECT 1 FROM users u JOIN roles r ON u.role_id = r.id 
             WHERE u.id = auth.uid() AND r.name = 'admin'))
  );

-- Import activities policies
CREATE POLICY import_activities_select ON import_activities
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    (user_id = auth.uid() OR 
     EXISTS (SELECT 1 FROM users u JOIN roles r ON u.role_id = r.id 
             WHERE u.id = auth.uid() AND r.name = 'admin'))
  );

CREATE POLICY import_activities_insert ON import_activities
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    user_id = auth.uid()
  );

-- Audit logs policies
CREATE POLICY audit_logs_select ON audit_logs
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    (user_id = auth.uid() OR 
     EXISTS (SELECT 1 FROM users u JOIN roles r ON u.role_id = r.id 
             WHERE u.id = auth.uid() AND r.name = 'admin'))
  );

CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Function to find templates matching a file name pattern
CREATE OR REPLACE FUNCTION find_matching_template(file_name TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  match_strength INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mt.id,
    mt.name,
    CASE
      WHEN file_name = mt.file_pattern THEN 100  -- Exact match
      WHEN file_name LIKE mt.file_pattern THEN 80  -- Pattern match
      ELSE 0
    END AS match_strength
  FROM 
    mapping_templates mt
  WHERE 
    mt.file_pattern IS NOT NULL
    AND (
      file_name = mt.file_pattern
      OR file_name LIKE mt.file_pattern
    )
  ORDER BY
    match_strength DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log import activity
CREATE OR REPLACE FUNCTION log_import_activity(
  p_user_id UUID,
  p_file_name TEXT,
  p_template_id UUID,
  p_status TEXT,
  p_tables_created TEXT[],
  p_rows_affected INTEGER,
  p_error_details JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO import_activities (
    id,
    user_id,
    file_name,
    template_id,
    status,
    tables_created,
    rows_affected,
    error_details
  ) VALUES (
    gen_random_uuid(),
    p_user_id,
    p_file_name,
    p_template_id,
    p_status,
    p_tables_created,
    p_rows_affected,
    p_error_details
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create an audit log entry
CREATE OR REPLACE FUNCTION create_audit_log(
  p_user_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_entity_name TEXT,
  p_details JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO audit_logs (
    id,
    user_id,
    action,
    entity_type,
    entity_id,
    entity_name,
    details
  ) VALUES (
    gen_random_uuid(),
    p_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_entity_name,
    p_details
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION find_matching_template(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION log_import_activity(UUID, TEXT, UUID, TEXT, TEXT[], INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION create_audit_log(UUID, TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

-- Refresh schema cache to make changes available
SELECT refresh_schema_cache();