-- Add detailed error tracking for import failures
-- This helps diagnose data type conversion issues

-- Create table to store detailed import errors
CREATE TABLE IF NOT EXISTS public.import_error_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    column_name TEXT,
    original_value TEXT,
    target_type TEXT,
    error_type TEXT CHECK (error_type IN ('type_conversion', 'validation', 'constraint', 'unknown')),
    error_message TEXT,
    error_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Index for querying errors by job and sheet
    CONSTRAINT unique_error_per_row_column UNIQUE (job_id, sheet_name, row_number, column_name)
);

-- Create indexes for efficient querying
CREATE INDEX idx_import_error_details_job_sheet ON public.import_error_details(job_id, sheet_name);
CREATE INDEX idx_import_error_details_error_type ON public.import_error_details(error_type);
CREATE INDEX idx_import_error_details_created_at ON public.import_error_details(created_at DESC);

-- Add function to log import errors
CREATE OR REPLACE FUNCTION public.log_import_error(
    p_job_id UUID,
    p_sheet_name TEXT,
    p_row_number INTEGER,
    p_column_name TEXT,
    p_original_value TEXT,
    p_target_type TEXT,
    p_error_type TEXT,
    p_error_message TEXT,
    p_error_details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_error_id UUID;
BEGIN
    INSERT INTO import_error_details (
        job_id,
        sheet_name,
        row_number,
        column_name,
        original_value,
        target_type,
        error_type,
        error_message,
        error_details
    ) VALUES (
        p_job_id,
        p_sheet_name,
        p_row_number,
        p_column_name,
        p_original_value,
        p_target_type,
        p_error_type,
        p_error_message,
        p_error_details
    )
    ON CONFLICT (job_id, sheet_name, row_number, column_name) 
    DO UPDATE SET
        original_value = EXCLUDED.original_value,
        target_type = EXCLUDED.target_type,
        error_type = EXCLUDED.error_type,
        error_message = EXCLUDED.error_message,
        error_details = EXCLUDED.error_details,
        created_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_error_id;
    
    RETURN v_error_id;
END;
$$;

-- Add summary view for import errors
CREATE OR REPLACE VIEW public.import_error_summary AS
WITH error_counts AS (
    SELECT 
        job_id,
        sheet_name,
        error_type,
        COUNT(*) as error_count
    FROM import_error_details
    WHERE error_type IS NOT NULL
    GROUP BY job_id, sheet_name, error_type
)
SELECT 
    d.job_id,
    d.sheet_name,
    COUNT(DISTINCT d.row_number) as affected_rows,
    COUNT(*) as total_errors,
    COUNT(DISTINCT d.column_name) as affected_columns,
    (
        SELECT jsonb_object_agg(error_type, error_count)
        FROM error_counts e
        WHERE e.job_id = d.job_id AND e.sheet_name = d.sheet_name
    ) as errors_by_type,
    jsonb_agg(DISTINCT d.column_name ORDER BY d.column_name) 
        FILTER (WHERE d.column_name IS NOT NULL) as affected_column_list,
    MIN(d.created_at) as first_error_at,
    MAX(d.created_at) as last_error_at
FROM import_error_details d
GROUP BY d.job_id, d.sheet_name;

-- Grant permissions
GRANT ALL ON public.import_error_details TO authenticated;
GRANT ALL ON public.import_error_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_import_error TO authenticated;

-- Add RLS policies
ALTER TABLE public.import_error_details ENABLE ROW LEVEL SECURITY;

-- Since import_jobs doesn't have created_by, we'll use a simpler policy
-- Allow authenticated users to view and insert error details for any job
CREATE POLICY "Authenticated users can view import errors" ON public.import_error_details
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert import errors" ON public.import_error_details
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Add column to import_jobs to track if detailed logging is enabled
ALTER TABLE public.import_jobs
ADD COLUMN IF NOT EXISTS enable_detailed_logging BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON TABLE public.import_error_details IS 'Stores detailed error information for failed import rows to help diagnose data type and format issues';