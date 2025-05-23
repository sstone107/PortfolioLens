-- Fix missing columns in google_drive_sync_config table
ALTER TABLE google_drive_sync_config 
ADD COLUMN IF NOT EXISTS sync_from_date DATE,
ADD COLUMN IF NOT EXISTS sync_only_recent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS max_depth INTEGER DEFAULT 5;

-- Recreate the function with all required fields
DROP FUNCTION IF EXISTS get_active_sync_configs();

CREATE FUNCTION get_active_sync_configs()
RETURNS TABLE (
  id UUID,
  folder_id TEXT,
  folder_name TEXT,
  template_id UUID,
  template_name TEXT,
  file_pattern TEXT,
  enabled BOOLEAN,
  include_subfolders BOOLEAN,
  last_sync_at TIMESTAMPTZ,
  sync_from_date DATE,
  sync_only_recent BOOLEAN,
  max_depth INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.folder_id,
    c.folder_name,
    c.template_id,
    t.name as template_name,
    COALESCE(c.file_pattern, t.file_pattern) as file_pattern,
    c.enabled,
    c.include_subfolders,
    c.last_sync_at,
    c.sync_from_date,
    c.sync_only_recent,
    c.max_depth
  FROM google_drive_sync_config c
  JOIN mapping_templates t ON t."templateId" = c.template_id
  WHERE c.enabled = true
  ORDER BY c.created_at DESC;
END;
$$;