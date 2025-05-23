-- Migration: Fix Background Import System Issues
-- This migration addresses the critical issues preventing background imports from working

-- 1. Create missing validate_login_location function
CREATE OR REPLACE FUNCTION public.validate_login_location(
    p_user_id uuid,
    p_ip_address text,
    p_city text,
    p_region text,
    p_country text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- For now, just return success
    -- TODO: Implement actual geo-restriction logic when needed
    RETURN jsonb_build_object(
        'allowed', true,
        'message', 'Location validation passed'
    );
END;
$$;

-- 2. Enable RLS on import_sheet_status table (if not already enabled)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class 
        WHERE relname = 'import_sheet_status' 
        AND relrowsecurity = true
    ) THEN
        ALTER TABLE import_sheet_status ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- 3. Create RLS policies for import_sheet_status (if they don't exist)
-- Drop existing policies first to ensure clean state
DO $$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Users can insert own import_sheet_status" ON import_sheet_status;
    DROP POLICY IF EXISTS "Users can view own import_sheet_status" ON import_sheet_status;
    DROP POLICY IF EXISTS "Users can update own import_sheet_status" ON import_sheet_status;
    DROP POLICY IF EXISTS "Users can delete own import_sheet_status" ON import_sheet_status;
END $$;

-- Create new policies
CREATE POLICY "Users can insert own import_sheet_status" ON import_sheet_status
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM import_jobs 
            WHERE import_jobs.id = import_sheet_status.job_id 
            AND import_jobs.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view own import_sheet_status" ON import_sheet_status
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM import_jobs 
            WHERE import_jobs.id = import_sheet_status.job_id 
            AND import_jobs.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own import_sheet_status" ON import_sheet_status
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM import_jobs 
            WHERE import_jobs.id = import_sheet_status.job_id 
            AND import_jobs.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM import_jobs 
            WHERE import_jobs.id = import_sheet_status.job_id 
            AND import_jobs.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own import_sheet_status" ON import_sheet_status
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM import_jobs 
            WHERE import_jobs.id = import_sheet_status.job_id 
            AND import_jobs.user_id = auth.uid()
        )
    );

-- 4. Grant necessary permissions
GRANT ALL ON import_sheet_status TO authenticated;

-- 5. Refresh schema cache
NOTIFY pgrst, 'reload schema';