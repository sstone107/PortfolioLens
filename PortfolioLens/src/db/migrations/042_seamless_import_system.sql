-- Seamless Background Import System Schema
-- This migration adds support for chunked imports, progress tracking, and real-time updates

-- Enhanced import_jobs table for better progress tracking
ALTER TABLE import_jobs 
ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
ADD COLUMN IF NOT EXISTS current_sheet TEXT,
ADD COLUMN IF NOT EXISTS sheets_completed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_sheets INTEGER,
ADD COLUMN IF NOT EXISTS estimated_completion TIMESTAMP,
ADD COLUMN IF NOT EXISTS parsed_locally BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS worker_id TEXT,
ADD COLUMN IF NOT EXISTS chunks_received INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_chunks INTEGER;

-- Create index for active jobs
CREATE INDEX IF NOT EXISTS idx_import_jobs_active 
ON import_jobs(status, created_at DESC) 
WHERE status IN ('uploading', 'parsing', 'processing');

-- Temporary chunks storage for progressive uploads
CREATE TABLE IF NOT EXISTS import_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES import_jobs(id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  data JSONB NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(job_id, sheet_name, chunk_index)
);

-- Create indexes for chunk queries
CREATE INDEX IF NOT EXISTS idx_import_chunks_job_sheet 
ON import_chunks(job_id, sheet_name, chunk_index);

-- Import logs for real-time status updates
CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES import_jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error', 'success')),
  message TEXT NOT NULL,
  details JSONB,
  sheet_name TEXT,
  row_number INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for log queries
CREATE INDEX IF NOT EXISTS idx_import_logs_job_created 
ON import_logs(job_id, created_at DESC);

-- Sheet processing status tracking
CREATE TABLE IF NOT EXISTS import_sheet_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES import_jobs(id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'receiving', 'processing', 'completed', 'failed')),
  total_rows INTEGER,
  processed_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  target_table TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  UNIQUE(job_id, sheet_name)
);

-- Enable real-time for status updates
ALTER PUBLICATION supabase_realtime ADD TABLE import_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE import_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE import_sheet_status;

-- Function to update job progress based on sheet status
CREATE OR REPLACE FUNCTION update_import_job_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_total_sheets INTEGER;
  v_completed_sheets INTEGER;
  v_total_rows INTEGER;
  v_processed_rows INTEGER;
  v_progress INTEGER;
BEGIN
  -- Get sheet statistics
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COALESCE(SUM(total_rows), 0),
    COALESCE(SUM(processed_rows), 0)
  INTO 
    v_total_sheets,
    v_completed_sheets,
    v_total_rows,
    v_processed_rows
  FROM import_sheet_status
  WHERE job_id = NEW.job_id;
  
  -- Calculate progress (0-100)
  IF v_total_rows > 0 THEN
    v_progress := LEAST(100, (v_processed_rows * 100) / v_total_rows);
  ELSE
    v_progress := 0;
  END IF;
  
  -- Update job
  UPDATE import_jobs
  SET 
    progress = v_progress,
    sheets_completed = v_completed_sheets,
    total_sheets = v_total_sheets,
    current_sheet = CASE 
      WHEN NEW.status = 'processing' THEN NEW.sheet_name
      ELSE current_sheet
    END,
    status = CASE
      WHEN v_completed_sheets = v_total_sheets AND v_total_sheets > 0 THEN 'completed'
      WHEN EXISTS (SELECT 1 FROM import_sheet_status WHERE job_id = NEW.job_id AND status = 'failed') THEN 'failed'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = NEW.job_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic progress updates
DROP TRIGGER IF EXISTS update_import_progress_trigger ON import_sheet_status;
CREATE TRIGGER update_import_progress_trigger
AFTER INSERT OR UPDATE ON import_sheet_status
FOR EACH ROW
EXECUTE FUNCTION update_import_job_progress();

-- Function to receive and store chunks
CREATE OR REPLACE FUNCTION receive_import_chunk(
  p_job_id UUID,
  p_sheet_name TEXT,
  p_chunk_index INTEGER,
  p_total_chunks INTEGER,
  p_data JSONB,
  p_row_count INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
  v_chunk_count INTEGER;
  v_sheet_exists BOOLEAN;
BEGIN
  -- Insert or update chunk
  INSERT INTO import_chunks (
    job_id, sheet_name, chunk_index, total_chunks, data, row_count
  ) VALUES (
    p_job_id, p_sheet_name, p_chunk_index, p_total_chunks, p_data, p_row_count
  )
  ON CONFLICT (job_id, sheet_name, chunk_index) 
  DO UPDATE SET 
    data = EXCLUDED.data,
    row_count = EXCLUDED.row_count;
  
  -- Check if sheet status exists
  SELECT EXISTS (
    SELECT 1 FROM import_sheet_status 
    WHERE job_id = p_job_id AND sheet_name = p_sheet_name
  ) INTO v_sheet_exists;
  
  -- Create sheet status if needed
  IF NOT v_sheet_exists THEN
    INSERT INTO import_sheet_status (
      job_id, sheet_name, original_name, status, total_rows
    ) VALUES (
      p_job_id, p_sheet_name, p_sheet_name, 'receiving', 0
    );
  END IF;
  
  -- Update chunks received count
  UPDATE import_jobs
  SET chunks_received = chunks_received + 1
  WHERE id = p_job_id;
  
  -- Get current chunk count for this sheet
  SELECT COUNT(*)
  INTO v_chunk_count
  FROM import_chunks
  WHERE job_id = p_job_id AND sheet_name = p_sheet_name;
  
  -- Log progress
  INSERT INTO import_logs (job_id, level, message, sheet_name, details)
  VALUES (
    p_job_id, 
    'info', 
    format('Received chunk %s/%s for sheet %s', p_chunk_index + 1, p_total_chunks, p_sheet_name),
    p_sheet_name,
    jsonb_build_object('chunk_index', p_chunk_index, 'row_count', p_row_count)
  );
  
  -- Return status
  RETURN jsonb_build_object(
    'success', true,
    'chunks_received', v_chunk_count,
    'total_chunks', p_total_chunks,
    'all_chunks_received', v_chunk_count = p_total_chunks
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active import jobs for a user
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

-- Grant necessary permissions
GRANT SELECT ON import_chunks TO authenticated;
GRANT SELECT ON import_logs TO authenticated;
GRANT SELECT ON import_sheet_status TO authenticated;
GRANT EXECUTE ON FUNCTION receive_import_chunk TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_import_jobs TO authenticated;

-- RLS policies
ALTER TABLE import_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_sheet_status ENABLE ROW LEVEL SECURITY;

-- Users can only see chunks for their own jobs
CREATE POLICY "Users can view own import chunks" ON import_chunks
  FOR SELECT USING (
    job_id IN (SELECT id FROM import_jobs WHERE user_id = auth.uid())
  );

-- Users can only see logs for their own jobs
CREATE POLICY "Users can view own import logs" ON import_logs
  FOR SELECT USING (
    job_id IN (SELECT id FROM import_jobs WHERE user_id = auth.uid())
  );

-- Users can only see sheet status for their own jobs
CREATE POLICY "Users can view own sheet status" ON import_sheet_status
  FOR SELECT USING (
    job_id IN (SELECT id FROM import_jobs WHERE user_id = auth.uid())
  );