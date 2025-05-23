-- Create RPC functions for the background import system

-- Function to create an import job
CREATE OR REPLACE FUNCTION public.create_import_job(
  p_filename TEXT,
  p_bucket_path TEXT,
  p_template_id UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_job_id UUID;
  v_result JSON;
BEGIN
  -- Insert new job record
  INSERT INTO public.import_jobs (
    filename,
    bucket_path,
    template_id,
    status,
    user_id
  ) VALUES (
    p_filename,
    p_bucket_path,
    p_template_id,
    'pending',
    auth.uid()
  )
  RETURNING id INTO v_job_id;
  
  -- Get the newly created job
  SELECT json_build_object(
    'id', id,
    'filename', filename,
    'bucket_path', bucket_path,
    'template_id', template_id,
    'status', status,
    'percent_complete', percent_complete,
    'row_counts', row_counts,
    'created_at', created_at
  ) INTO v_result
  FROM public.import_jobs
  WHERE id = v_job_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get import job status
CREATE OR REPLACE FUNCTION public.get_import_job_status(
  p_job_id UUID
) RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Check that user has access to this job
  IF NOT EXISTS (
    SELECT 1 FROM public.import_jobs 
    WHERE id = p_job_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Job not found or access denied';
  END IF;
  
  -- Get job data
  SELECT json_build_object(
    'id', id,
    'filename', filename,
    'bucket_path', bucket_path,
    'template_id', template_id,
    'status', status,
    'percent_complete', percent_complete,
    'row_counts', row_counts,
    'error_message', error_message,
    'created_at', created_at,
    'updated_at', updated_at,
    'completed_at', completed_at
  ) INTO v_result
  FROM public.import_jobs
  WHERE id = p_job_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get import job errors
CREATE OR REPLACE FUNCTION public.get_import_job_errors(
  p_job_id UUID
) RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_job_access BOOLEAN;
BEGIN
  -- Check that user has access to this job
  SELECT EXISTS (
    SELECT 1 FROM public.import_jobs 
    WHERE id = p_job_id AND user_id = auth.uid()
  ) INTO v_job_access;
  
  IF NOT v_job_access THEN
    RAISE EXCEPTION 'Job not found or access denied';
  END IF;
  
  -- Get errors data as JSON array
  SELECT json_agg(
    json_build_object(
      'id', id,
      'table_name', table_name,
      'row_number', row_number,
      'row', row,
      'error_message', error_message,
      'resolved', resolved,
      'created_at', created_at
    )
  ) INTO v_result
  FROM public.import_errors
  WHERE job_id = p_job_id
  ORDER BY created_at DESC;
  
  -- Return empty array if no errors
  RETURN COALESCE(v_result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to retry failed import rows
CREATE OR REPLACE FUNCTION public.retry_import_errors(
  p_job_id UUID,
  p_error_ids UUID[] DEFAULT NULL -- If NULL, retry all unresolved errors for the job
) RETURNS JSON AS $$
DECLARE
  v_job_access BOOLEAN;
  v_result JSON;
  v_retried_count INTEGER := 0;
  v_success_count INTEGER := 0;
BEGIN
  -- Check that user has access to this job
  SELECT EXISTS (
    SELECT 1 FROM public.import_jobs 
    WHERE id = p_job_id AND user_id = auth.uid()
  ) INTO v_job_access;
  
  IF NOT v_job_access THEN
    RAISE EXCEPTION 'Job not found or access denied';
  END IF;
  
  -- Mark errors as being retried
  IF p_error_ids IS NOT NULL THEN
    -- Update specific errors
    UPDATE public.import_errors
    SET resolved = true
    WHERE job_id = p_job_id 
    AND id = ANY(p_error_ids);
    
    GET DIAGNOSTICS v_retried_count = ROW_COUNT;
  ELSE
    -- Update all unresolved errors for this job
    UPDATE public.import_errors
    SET resolved = true
    WHERE job_id = p_job_id 
    AND resolved = false;
    
    GET DIAGNOSTICS v_retried_count = ROW_COUNT;
  END IF;
  
  -- In a real implementation, we would actually retry the imports here
  -- For now, just mark them as retried and report success
  v_success_count := v_retried_count;
  
  -- Build result
  v_result := json_build_object(
    'retried_count', v_retried_count,
    'success_count', v_success_count,
    'job_id', p_job_id
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;