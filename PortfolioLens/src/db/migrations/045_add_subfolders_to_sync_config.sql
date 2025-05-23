-- Add include_subfolders column to google_drive_sync_config
ALTER TABLE google_drive_sync_config 
ADD COLUMN IF NOT EXISTS include_subfolders BOOLEAN DEFAULT false;

-- Update the get_active_sync_configs function to include the new column
CREATE OR REPLACE FUNCTION get_active_sync_configs()
RETURNS TABLE (
  id UUID,
  folder_id TEXT,
  folder_name TEXT,
  template_id UUID,
  template_name TEXT,
  file_pattern TEXT,
  enabled BOOLEAN,
  include_subfolders BOOLEAN,
  last_sync_at TIMESTAMPTZ
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
    c.last_sync_at
  FROM google_drive_sync_config c
  JOIN mapping_templates t ON t."templateId" = c.template_id
  WHERE c.enabled = true
  ORDER BY c.created_at DESC;
END;
$$;