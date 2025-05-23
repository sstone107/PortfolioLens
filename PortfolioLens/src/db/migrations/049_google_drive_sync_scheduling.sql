-- Add scheduling fields to Google Drive sync configuration
ALTER TABLE google_drive_sync_config 
ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS schedule_frequency TEXT CHECK (schedule_frequency IN ('hourly', 'daily', 'weekly', 'custom')),
ADD COLUMN IF NOT EXISTS schedule_cron TEXT,
ADD COLUMN IF NOT EXISTS schedule_timezone TEXT DEFAULT 'America/New_York',
ADD COLUMN IF NOT EXISTS cron_job_id BIGINT;

-- Create table to store Supabase vault secrets
CREATE TABLE IF NOT EXISTS sync_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to create or update a cron job for Google Drive sync
CREATE OR REPLACE FUNCTION manage_google_drive_sync_cron(
  p_config_id UUID,
  p_enabled BOOLEAN,
  p_frequency TEXT,
  p_cron_expression TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_name TEXT;
  v_cron_schedule TEXT;
  v_existing_job_id BIGINT;
  v_new_job_id BIGINT;
  v_project_url TEXT;
  v_anon_key TEXT;
BEGIN
  -- Generate job name
  v_job_name := 'google_drive_sync_' || p_config_id;
  
  -- Get existing job ID if any
  SELECT cron_job_id INTO v_existing_job_id
  FROM google_drive_sync_config
  WHERE id = p_config_id;
  
  -- Delete existing job if present
  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;
  
  -- If not enabled, just return
  IF NOT p_enabled THEN
    UPDATE google_drive_sync_config
    SET cron_job_id = NULL
    WHERE id = p_config_id;
    RETURN NULL;
  END IF;
  
  -- Determine cron schedule based on frequency
  CASE p_frequency
    WHEN 'hourly' THEN v_cron_schedule := '0 * * * *';  -- Every hour at minute 0
    WHEN 'daily' THEN v_cron_schedule := '0 8 * * *';   -- Daily at 8 AM
    WHEN 'weekly' THEN v_cron_schedule := '0 8 * * 1';  -- Weekly on Monday at 8 AM
    WHEN 'custom' THEN v_cron_schedule := p_cron_expression;
    ELSE RAISE EXCEPTION 'Invalid frequency: %', p_frequency;
  END CASE;
  
  -- Schedule the new job
  SELECT cron.schedule(
    v_job_name,
    v_cron_schedule,
    $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/sync-google-drive',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
      ),
      body := jsonb_build_object(
        'configId', '$$ || quote_literal(p_config_id::TEXT) || $$'
      )
    ) AS request_id;
    $$
  ) INTO v_new_job_id;
  
  -- Update config with job ID
  UPDATE google_drive_sync_config
  SET cron_job_id = v_new_job_id,
      schedule_enabled = p_enabled,
      schedule_frequency = p_frequency,
      schedule_cron = v_cron_schedule
  WHERE id = p_config_id;
  
  RETURN v_new_job_id;
END;
$$;

-- Function to set up vault secrets (to be run once by admin)
CREATE OR REPLACE FUNCTION setup_sync_vault_secrets(
  p_project_url TEXT,
  p_anon_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create or update project URL secret
  PERFORM vault.create_secret(p_project_url, 'project_url');
  
  -- Create or update anon key secret
  PERFORM vault.create_secret(p_anon_key, 'anon_key');
  
  -- Record in sync_secrets table
  INSERT INTO sync_secrets (secret_name, description)
  VALUES 
    ('project_url', 'Supabase project URL for cron jobs'),
    ('anon_key', 'Supabase anon key for cron jobs')
  ON CONFLICT (secret_name) DO NOTHING;
END;
$$;

-- Update get_active_sync_configs to include scheduling info
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
  max_depth INTEGER,
  schedule_enabled BOOLEAN,
  schedule_frequency TEXT,
  schedule_cron TEXT,
  schedule_timezone TEXT,
  cron_job_id BIGINT
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
    c.max_depth,
    c.schedule_enabled,
    c.schedule_frequency,
    c.schedule_cron,
    c.schedule_timezone,
    c.cron_job_id
  FROM google_drive_sync_config c
  JOIN mapping_templates t ON t."templateId" = c.template_id
  WHERE c.enabled = true
  ORDER BY c.created_at DESC;
END;
$$;

-- Enable pg_cron and pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA cron TO postgres;