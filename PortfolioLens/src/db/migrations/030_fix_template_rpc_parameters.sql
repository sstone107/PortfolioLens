-- Migration: Fix Template RPC Parameters
-- Description: Update create_mapping_template function to include source_file_type parameter

-- Create/update the create_mapping_template function with the source_file_type parameter
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
  
  -- Insert the new template
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
    p_servicer_id::text,       -- subservicerId
    p_file_pattern,            -- file_pattern
    p_file_pattern,            -- originalFileNamePattern
    jsonb_build_object(        -- sheet_mappings
      'headerRow', p_header_row,
      'tablePrefix', p_table_prefix,
      'sheets', p_sheet_mappings
    ),
    p_sheet_mappings,          -- sheetMappings
    now(),                     -- createdAt
    now(),                     -- updatedAt
    1,                         -- version
    v_current_user,            -- owner_id
    v_current_user::text,      -- created_by
    p_source_file_type         -- sourceFileType
  )
  RETURNING id INTO v_template_id;
  
  -- Return the newly created template
  RETURN get_mapping_template_by_id(v_template_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create/update the update_mapping_template function with the source_file_type parameter
CREATE OR REPLACE FUNCTION update_mapping_template(
  p_id uuid,
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
  v_current_user uuid := auth.uid();
  v_is_admin boolean;
  v_is_owner boolean;
  v_template_id uuid;
  v_result json;
BEGIN
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM users u 
    JOIN roles r ON u.role_id = r.id 
    WHERE u.id = v_current_user AND r.name = 'admin'
  ) INTO v_is_admin;
  
  -- Check if user is owner
  SELECT EXISTS (
    SELECT 1 FROM mapping_templates
    WHERE (id = p_id OR "templateId" = p_id)
    AND (owner_id = v_current_user OR created_by = v_current_user::text)
  ) INTO v_is_owner;
  
  -- Only owner or admin can update
  IF NOT (v_is_owner OR v_is_admin) THEN
    RAISE EXCEPTION 'Not authorized to update this template';
  END IF;
  
  -- Update the template
  UPDATE mapping_templates
  SET
    name = COALESCE(p_name, name),
    "templateName" = COALESCE(p_name, "templateName"),
    description = COALESCE(p_description, description),
    servicer_id = COALESCE(p_servicer_id, servicer_id),
    "subservicerId" = COALESCE(p_servicer_id::text, "subservicerId"),
    file_pattern = COALESCE(p_file_pattern, file_pattern),
    "originalFileNamePattern" = COALESCE(p_file_pattern, "originalFileNamePattern"),
    sheet_mappings = CASE
      WHEN p_sheet_mappings IS NOT NULL THEN
        jsonb_build_object(
          'headerRow', COALESCE(p_header_row, (sheet_mappings->'headerRow')::int, 0),
          'tablePrefix', COALESCE(p_table_prefix, sheet_mappings->'tablePrefix'),
          'sheets', p_sheet_mappings
        )
      ELSE sheet_mappings
    END,
    "sheetMappings" = COALESCE(p_sheet_mappings, "sheetMappings"),
    "updatedAt" = now(),
    version = version + 1,
    "sourceFileType" = COALESCE(p_source_file_type, "sourceFileType")
  WHERE id = p_id OR "templateId" = p_id
  RETURNING id INTO v_template_id;
  
  -- Return the updated template
  RETURN get_mapping_template_by_id(v_template_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_mapping_templates to include sourceFileType
CREATE OR REPLACE FUNCTION get_mapping_templates()
RETURNS SETOF json AS $$
BEGIN
  RETURN QUERY
  SELECT json_build_object(
    'id', COALESCE(mt.id, mt."templateId"),
    'name', COALESCE(mt.name, mt."templateName"),
    'description', mt.description,
    'servicerId', mt."subservicerId",
    'filePattern', COALESCE(mt.file_pattern, mt."originalFileNamePattern"),
    'sourceFileType', COALESCE(mt."sourceFileType", 'xlsx'),
    'headerRow', COALESCE(
      (mt.sheet_mappings->'headerRow')::int, 
      CASE WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN 0 ELSE (mt."sheetMappings"->'headerRow')::int END,
      0
    ),
    'tablePrefix', COALESCE(
      mt.sheet_mappings->'tablePrefix', 
      CASE WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN NULL ELSE mt."sheetMappings"->'tablePrefix' END
    ),
    'sheetMappings', COALESCE(
      mt.sheet_mappings, 
      CASE WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN mt."sheetMappings" ELSE '[]'::jsonb END
    ),
    'createdAt', mt."createdAt",
    'updatedAt', mt."updatedAt",
    'version', mt.version,
    'owner', mt.owner_id,
    'created_by', mt.created_by
  )
  FROM mapping_templates mt
  ORDER BY mt."createdAt" DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also update get_mapping_template_by_id to include sourceFileType
CREATE OR REPLACE FUNCTION get_mapping_template_by_id(p_id uuid)
RETURNS json AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'id', COALESCE(mt.id, mt."templateId"),
    'name', COALESCE(mt.name, mt."templateName"),
    'description', mt.description,
    'servicerId', mt."subservicerId",
    'filePattern', COALESCE(mt.file_pattern, mt."originalFileNamePattern"),
    'sourceFileType', COALESCE(mt."sourceFileType", 'xlsx'),
    'headerRow', COALESCE(
      (mt.sheet_mappings->'headerRow')::int, 
      CASE WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN 0 ELSE (mt."sheetMappings"->'headerRow')::int END,
      0
    ),
    'tablePrefix', COALESCE(
      mt.sheet_mappings->'tablePrefix', 
      CASE WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN NULL ELSE mt."sheetMappings"->'tablePrefix' END
    ),
    'sheetMappings', COALESCE(
      mt.sheet_mappings, 
      CASE WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN mt."sheetMappings" ELSE '[]'::jsonb END
    ),
    'createdAt', mt."createdAt",
    'updatedAt', mt."updatedAt",
    'version', mt.version,
    'owner', mt.owner_id,
    'created_by', mt.created_by
  ) INTO v_result
  FROM mapping_templates mt
  WHERE mt.id = p_id OR mt."templateId" = p_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_mapping_template(text, text, uuid, text, int, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_mapping_template(uuid, text, text, uuid, text, int, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_mapping_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION get_mapping_template_by_id(uuid) TO authenticated;

-- Refresh the schema cache to make the updated functions available
SELECT refresh_schema_cache();