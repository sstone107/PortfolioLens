-- Background Import System Tables
-- This migration adds tables needed for the background import system

-- Create import jobs table
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  filename text not null,
  bucket_path text not null,
  template_id uuid,
  status text not null check (status in ('pending', 'processing', 'completed', 'error')),
  percent_complete integer default 0,
  row_counts jsonb default '{}'::jsonb,
  error_message text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  completed_at timestamp with time zone
);

-- Add RLS policy for import_jobs
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view only their own jobs
CREATE POLICY import_jobs_select_policy ON public.import_jobs 
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own jobs
CREATE POLICY import_jobs_insert_policy ON public.import_jobs 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create import errors table
CREATE TABLE IF NOT EXISTS public.import_errors (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.import_jobs not null,
  table_name text not null,
  row_number integer,
  row jsonb not null,
  error_message text not null,
  resolved boolean default false,
  created_at timestamp with time zone default now()
);

-- Add RLS policy for import_errors
ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view only errors related to their own jobs
CREATE POLICY import_errors_select_policy ON public.import_errors 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.import_jobs 
      WHERE import_jobs.id = import_errors.job_id 
      AND import_jobs.user_id = auth.uid()
    )
  );

-- Create a storage bucket for import files if it doesn't exist
DO $$
BEGIN
  -- Check if the bucket exists
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE name = 'imports'
  ) THEN
    -- Create the bucket
    INSERT INTO storage.buckets (id, name)
    VALUES ('imports', 'imports');
    
    -- Add RLS policies for the bucket
    CREATE POLICY "Allow users to read their own files" ON storage.objects
      FOR SELECT USING (
        bucket_id = 'imports' AND 
        auth.uid()::text = (storage.foldername(name))[1]
      );
      
    CREATE POLICY "Allow users to upload their own files" ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'imports' AND 
        auth.uid()::text = (storage.foldername(name))[1]
      );
      
    CREATE POLICY "Allow users to update their own files" ON storage.objects
      FOR UPDATE USING (
        bucket_id = 'imports' AND 
        auth.uid()::text = (storage.foldername(name))[1]
      );
      
    CREATE POLICY "Allow users to delete their own files" ON storage.objects
      FOR DELETE USING (
        bucket_id = 'imports' AND 
        auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

-- Update or create function to manage import job status
CREATE OR REPLACE FUNCTION public.update_import_job_status(
  p_job_id uuid,
  p_status text,
  p_percent_complete integer DEFAULT NULL,
  p_row_counts jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  -- Update the job with the provided parameters
  UPDATE public.import_jobs
  SET 
    status = p_status,
    percent_complete = COALESCE(p_percent_complete, percent_complete),
    row_counts = COALESCE(p_row_counts, row_counts),
    error_message = COALESCE(p_error_message, error_message),
    updated_at = now(),
    completed_at = CASE WHEN p_status = 'completed' OR p_status = 'error' THEN now() ELSE completed_at END
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create import_templates table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.import_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    table_name text not null,
    fields jsonb not null,
    user_id uuid references auth.users not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Add RLS policy for import_templates
ALTER TABLE public.import_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view only their own templates or shared templates
CREATE POLICY import_templates_select_policy ON public.import_templates 
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own templates
CREATE POLICY import_templates_insert_policy ON public.import_templates 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own templates
CREATE POLICY import_templates_update_policy ON public.import_templates 
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own templates
CREATE POLICY import_templates_delete_policy ON public.import_templates 
  FOR DELETE USING (auth.uid() = user_id);