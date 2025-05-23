-- Google Drive Sync Configuration
-- Stores configuration for automated Google Drive imports

-- Configuration table for Google Drive sync
CREATE TABLE IF NOT EXISTS google_drive_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id TEXT NOT NULL,
  folder_name TEXT,
  template_id UUID REFERENCES mapping_templates("templateId") ON DELETE CASCADE,
  file_pattern TEXT,
  enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(folder_id, template_id)
);

-- Sync history to track processed files
CREATE TABLE IF NOT EXISTS google_drive_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES google_drive_sync_config(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_modified_time TIMESTAMPTZ,
  import_job_id UUID REFERENCES import_jobs(id),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(config_id, file_id)
);

-- RLS policies
ALTER TABLE google_drive_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_drive_sync_history ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view configs
CREATE POLICY "Users can view sync configs"
  ON google_drive_sync_config
  FOR SELECT
  TO authenticated
  USING (true);

-- Simplified admin policy - all authenticated users can manage for now
CREATE POLICY "Users can manage sync configs"
  ON google_drive_sync_config
  FOR ALL
  TO authenticated
  USING (true);

-- History is viewable by authenticated users
CREATE POLICY "Users can view sync history"
  ON google_drive_sync_history
  FOR SELECT
  TO authenticated
  USING (true);

-- RPC function to get active sync configurations
CREATE OR REPLACE FUNCTION get_active_sync_configs()
RETURNS TABLE (
  id UUID,
  folder_id TEXT,
  folder_name TEXT,
  template_id UUID,
  template_name TEXT,
  file_pattern TEXT,
  last_sync_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.id,
    sc.folder_id,
    sc.folder_name,
    sc.template_id,
    mt."templateName" as template_name,
    sc.file_pattern,
    sc.last_sync_at
  FROM google_drive_sync_config sc
  LEFT JOIN mapping_templates mt ON mt."templateId" = sc.template_id
  WHERE sc.enabled = true;
END;
$$;