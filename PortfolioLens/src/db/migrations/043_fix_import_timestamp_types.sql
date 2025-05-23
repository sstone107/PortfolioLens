-- Fix timestamp type mismatch in import tables
-- Convert TIMESTAMP columns to TIMESTAMP WITH TIME ZONE for consistency

-- Update import_jobs table
ALTER TABLE import_jobs 
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN estimated_completion TYPE TIMESTAMP WITH TIME ZONE;

-- Update import_chunks table
ALTER TABLE import_chunks 
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE;

-- Update import_logs table
ALTER TABLE import_logs 
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE;

-- Update import_sheet_status table
ALTER TABLE import_sheet_status 
  ALTER COLUMN started_at TYPE TIMESTAMP WITH TIME ZONE,
  ALTER COLUMN completed_at TYPE TIMESTAMP WITH TIME ZONE;

-- Recreate the function to ensure it matches (no changes needed, just for clarity)
CREATE OR REPLACE FUNCTION get_active_import_jobs(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  filename TEXT,
  status TEXT,
  progress INTEGER,
  current_sheet TEXT,
  sheets_completed INTEGER,
  total_sheets INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  estimated_completion TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id,
    j.filename,
    j.status,
    j.progress,
    j.current_sheet,
    j.sheets_completed,
    j.total_sheets,
    j.created_at,
    j.estimated_completion
  FROM import_jobs j
  WHERE 
    j.status IN ('uploading', 'parsing', 'processing')
    AND (p_user_id IS NULL OR j.user_id = p_user_id)
  ORDER BY j.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;