-- Function to save a mapping template directly
CREATE OR REPLACE FUNCTION save_mapping_template(
  p_name TEXT,
  p_description TEXT,
  p_servicer_id UUID,
  p_file_pattern TEXT,
  p_header_row INTEGER,
  p_table_prefix TEXT,
  p_sheet_mappings JSONB,
  p_version INTEGER DEFAULT 1,
  p_review_only BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_user_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Generate new ID
  v_id := gen_random_uuid();
  
  -- Insert template
  INSERT INTO mapping_templates (
    id,
    name,
    description,
    servicer_id,
    file_pattern,
    header_row,
    table_prefix,
    sheet_mappings,
    created_by,
    created_at,
    updated_at,
    version,
    review_only
  ) VALUES (
    v_id,
    p_name,
    p_description,
    p_servicer_id,
    p_file_pattern,
    p_header_row,
    p_table_prefix,
    p_sheet_mappings,
    v_user_id::TEXT,
    NOW(),
    NOW(),
    p_version,
    p_review_only
  );
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION save_mapping_template(TEXT, TEXT, UUID, TEXT, INTEGER, TEXT, JSONB, INTEGER, BOOLEAN) TO authenticated;

-- Refresh schema cache to make the function available
SELECT pg_notify('schema_cache_refresh', 'mapping_templates');