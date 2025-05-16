-- Migration: Fix Template Type Conversion
-- Description: Fixes COALESCE type conversion issues in template functions

-- Update the create_mapping_template function with proper type handling
CREATE OR REPLACE FUNCTION create_mapping_template(
  p_name text,
  p_description text,
  p_servicer_id uuid,
  p_file_pattern text,
  p_header_row int,
  p_table_prefix text,
  p_sheet_mappings jsonb,
  p_source_file_type text DEFAULT 'xlsx'
)
RETURNS json AS $$
DECLARE
  v_new_id uuid := gen_random_uuid();
  v_current_user uuid := auth.uid();
  v_template_id uuid;
  v_result json;
BEGIN
  -- Validate required parameters
  IF p_name IS NULL THEN
    RAISE EXCEPTION 'Template name is required';
  END IF;
  
  -- Ensure source_file_type is not null
  IF p_source_file_type IS NULL THEN
    RAISE EXCEPTION 'Source file type cannot be null';
  END IF;
  
  -- Insert the new template with standardized format
  INSERT INTO mapping_templates (
    id,
    "templateId",
    name,
    "templateName",
    description,
    servicer_id,
    "subservicerId",
    file_pattern,
    "originalFileNamePattern",
    sheet_mappings,
    "sheetMappings",
    "createdAt",
    "updatedAt",
    version,
    owner_id,
    created_by,
    "sourceFileType"
  ) VALUES (
    v_new_id,                  -- id
    v_new_id,                  -- templateId
    p_name,                    -- name
    p_name,                    -- templateName
    p_description,             -- description
    p_servicer_id,             -- servicer_id
    p_servicer_id::text,       -- subservicerId (ensure it's text)
    p_file_pattern,            -- file_pattern
    p_file_pattern,            -- originalFileNamePattern
    jsonb_build_object(        -- sheet_mappings - standardized object format
      'headerRow', p_header_row,
      'tablePrefix', p_table_prefix,
      'sheets', p_sheet_mappings
    ),
    p_sheet_mappings,          -- sheetMappings - direct array for backward compatibility
    now(),                     -- createdAt
    now(),                     -- updatedAt
    1,                         -- version
    v_current_user,            -- owner_id
    v_current_user::text,      -- created_by (ensure it's text)
    p_source_file_type         -- sourceFileType
  )
  RETURNING id INTO v_template_id;
  
  -- Return the newly created template
  RETURN get_mapping_template_by_id(v_template_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also update save_mapping_template function to fix similar issues
CREATE OR REPLACE FUNCTION save_mapping_template(
  template_name text,
  template_description text DEFAULT '',
  servicer_id uuid DEFAULT NULL,
  file_pattern text DEFAULT NULL,
  header_row int DEFAULT 0,
  table_prefix text DEFAULT NULL,
  sheet_mappings jsonb DEFAULT NULL,
  user_id uuid DEFAULT NULL,
  template_id uuid DEFAULT NULL,
  source_file_type text DEFAULT 'xlsx'
)
RETURNS json AS $$
DECLARE
  v_user_id uuid;
  v_new_id uuid;
  v_result json;
BEGIN
  -- Set user ID (use provided or current auth user)
  v_user_id := COALESCE(user_id, auth.uid());
  
  -- Check if template_id exists
  IF template_id IS NOT NULL THEN
    -- Update existing template
    UPDATE mapping_templates
    SET 
      name = template_name,
      "templateName" = template_name,
      description = COALESCE(template_description, description),
      file_pattern = COALESCE(file_pattern, file_pattern),
      "originalFileNamePattern" = COALESCE(file_pattern, "originalFileNamePattern"),
      servicer_id = COALESCE(servicer_id, servicer_id),
      "subservicerId" = COALESCE(servicer_id::text, "subservicerId"),
      sheet_mappings = CASE 
        WHEN sheet_mappings IS NOT NULL THEN
          jsonb_build_object(
            'headerRow', COALESCE(header_row, 0),
            'tablePrefix', COALESCE(table_prefix, (sheet_mappings->'tablePrefix')::text),
            'sheets', sheet_mappings
          )
        ELSE sheet_mappings
      END,
      "sheetMappings" = COALESCE(sheet_mappings, "sheetMappings"),
      "sourceFileType" = COALESCE(source_file_type, "sourceFileType", 'xlsx'),
      "updatedAt" = now(),
      version = version + 1
    WHERE 
      id = template_id OR "templateId" = template_id
    RETURNING id INTO v_new_id;
  ELSE
    -- Create new template
    INSERT INTO mapping_templates (
      id, 
      "templateId", 
      name, 
      "templateName", 
      description,
      file_pattern,
      "originalFileNamePattern",
      servicer_id,
      "subservicerId",
      owner_id,
      created_by,
      "createdAt",
      "updatedAt",
      version,
      sheet_mappings,
      "sheetMappings",
      "sourceFileType"
    )
    VALUES (
      gen_random_uuid(),
      gen_random_uuid(),
      template_name,
      template_name,
      template_description,
      file_pattern,
      file_pattern,
      servicer_id,
      servicer_id::text,
      v_user_id,
      v_user_id::text,
      now(),
      now(),
      1,
      CASE 
        WHEN sheet_mappings IS NOT NULL THEN
          jsonb_build_object(
            'headerRow', COALESCE(header_row, 0),
            'tablePrefix', table_prefix,
            'sheets', sheet_mappings
          )
        ELSE NULL
      END,
      sheet_mappings,
      COALESCE(source_file_type, 'xlsx')
    )
    RETURNING id INTO v_new_id;
  END IF;
  
  -- Return the created/updated template
  RETURN get_mapping_template_by_id(v_new_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_mapping_template(text, text, uuid, text, int, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION save_mapping_template(text, text, uuid, text, int, text, jsonb, uuid, uuid, text) TO authenticated;

-- Refresh the schema cache to make the updated functions available
SELECT refresh_schema_cache();