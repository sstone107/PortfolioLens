-- Fix permissions for cancelling imports

-- Update RLS policy for import_jobs to allow users to update their own jobs
DROP POLICY IF EXISTS "Users can update their own import jobs" ON import_jobs;
CREATE POLICY "Users can update their own import jobs" 
ON import_jobs FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Ensure import_logs table exists with proper structure
CREATE TABLE IF NOT EXISTS import_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error', 'success')),
    message TEXT NOT NULL,
    details JSONB,
    sheet_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_import_logs_job_id ON import_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_created_at ON import_logs(created_at DESC);

-- RLS for import_logs
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view logs for their import jobs" ON import_logs;
DROP POLICY IF EXISTS "Users can insert logs for their import jobs" ON import_logs;
DROP POLICY IF EXISTS "Service role can manage all logs" ON import_logs;

-- Users can view logs for their own import jobs
CREATE POLICY "Users can view logs for their import jobs" 
ON import_logs FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM import_jobs 
        WHERE import_jobs.id = import_logs.job_id 
        AND import_jobs.user_id = auth.uid()
    )
);

-- Users can insert logs for their own import jobs
CREATE POLICY "Users can insert logs for their import jobs" 
ON import_logs FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM import_jobs 
        WHERE import_jobs.id = import_logs.job_id 
        AND import_jobs.user_id = auth.uid()
    )
);

-- Service role bypass
CREATE POLICY "Service role can manage all logs" 
ON import_logs FOR ALL 
USING (auth.jwt()->>'role' = 'service_role')
WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Grant necessary permissions
GRANT SELECT, INSERT ON import_logs TO authenticated;
GRANT ALL ON import_logs TO service_role;

-- Also ensure import_jobs has proper status values
-- Update any 'failed' status to 'error' for consistency
UPDATE import_jobs SET status = 'error' WHERE status = 'failed';

-- Add completed_at column if it doesn't exist
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;