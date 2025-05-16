-- Migration: Enhance Template RPC Functions
-- Description: Makes template RPC functions more robust in handling different data formats

-- Update the get_mapping_template_by_id function
CREATE OR REPLACE FUNCTION get_mapping_template_by_id(p_id uuid)
RETURNS json AS $$
DECLARE
  v_result json;
  v_sheet_mappings jsonb;
  v_header_row int;
  v_table_prefix text;
BEGIN
  -- Extract all the template data with enhanced robustness
  SELECT 
    mt.id,
    COALESCE(mt.name, mt."templateName") AS name,
    mt.description,
    COALESCE(mt.servicer_id, mt."subservicerId"::uuid) AS servicer_id,
    COALESCE(mt.file_pattern, mt."originalFileNamePattern") AS file_pattern,
    COALESCE(mt."sourceFileType", 'xlsx') AS source_file_type,
    
    -- Extract header row with fallbacks
    COALESCE(
      (mt.sheet_mappings->'headerRow')::int, 
      (mt."sheetMappings"->'headerRow')::int,
      0
    ) AS header_row,
    
    -- Extract table prefix with fallbacks
    COALESCE(
      mt.sheet_mappings->>'tablePrefix', 
      mt."sheetMappings"->>'tablePrefix'
    ) AS table_prefix,
    
    -- Extract sheet mappings with enhanced robustness
    CASE 
      -- Case 1: sheet_mappings has 'sheets' property (preferred format)
      WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'sheets' THEN
        mt.sheet_mappings->'sheets'
      
      -- Case 2: sheetMappings has 'sheets' property
      WHEN jsonb_typeof(mt."sheetMappings") = 'object' AND mt."sheetMappings" ? 'sheets' THEN
        mt."sheetMappings"->'sheets'
      
      -- Case 3: sheet_mappings is a direct array
      WHEN jsonb_typeof(mt.sheet_mappings) = 'array' THEN
        mt.sheet_mappings
      
      -- Case 4: sheetMappings is a direct array
      WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN
        mt."sheetMappings"
        
      -- Default: Empty array
      ELSE '[]'::jsonb
    END AS sheet_mappings,
    
    mt."createdAt",
    mt."updatedAt",
    mt.version,
    mt.owner_id,
    mt.created_by
  INTO 
    v_result.id,
    v_result.name,
    v_result.description,
    v_result.servicer_id,
    v_result.file_pattern,
    v_result.source_file_type,
    v_header_row,
    v_table_prefix,
    v_sheet_mappings,
    v_result."createdAt",
    v_result."updatedAt",
    v_result.version,
    v_result.owner_id,
    v_result.created_by
  FROM mapping_templates mt
  WHERE mt.id = p_id OR mt."templateId" = p_id;
  
  -- Build the final JSON object
  SELECT json_build_object(
    'id', v_result.id,
    'name', v_result.name,
    'description', v_result.description,
    'servicerId', v_result.servicer_id,
    'filePattern', v_result.file_pattern,
    'sourceFileType', v_result.source_file_type,
    'headerRow', v_header_row,
    'tablePrefix', v_table_prefix,
    'sheetMappings', v_sheet_mappings,
    'createdAt', v_result."createdAt",
    'updatedAt', v_result."updatedAt",
    'version', v_result.version,
    'owner', v_result.owner_id,
    'created_by', v_result.created_by
  ) INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_mapping_templates to use the same robust extraction
CREATE OR REPLACE FUNCTION get_mapping_templates()
RETURNS SETOF json AS $$
BEGIN
  RETURN QUERY
  SELECT json_build_object(
    'id', COALESCE(mt.id, mt."templateId"),
    'name', COALESCE(mt.name, mt."templateName"),
    'description', mt.description,
    'servicerId', COALESCE(mt.servicer_id, mt."subservicerId"::uuid),
    'filePattern', COALESCE(mt.file_pattern, mt."originalFileNamePattern"),
    'sourceFileType', COALESCE(mt."sourceFileType", 'xlsx'),
    'headerRow', COALESCE(
      (mt.sheet_mappings->'headerRow')::int, 
      (mt."sheetMappings"->'headerRow')::int,
      0
    ),
    'tablePrefix', COALESCE(
      mt.sheet_mappings->>'tablePrefix', 
      mt."sheetMappings"->>'tablePrefix'
    ),
    'sheetMappings', CASE 
      -- Case 1: sheet_mappings has 'sheets' property (preferred format)
      WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'sheets' THEN
        mt.sheet_mappings->'sheets'
      
      -- Case 2: sheetMappings has 'sheets' property
      WHEN jsonb_typeof(mt."sheetMappings") = 'object' AND mt."sheetMappings" ? 'sheets' THEN
        mt."sheetMappings"->'sheets'
      
      -- Case 3: sheet_mappings is a direct array
      WHEN jsonb_typeof(mt.sheet_mappings) = 'array' THEN
        mt.sheet_mappings
      
      -- Case 4: sheetMappings is a direct array
      WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN
        mt."sheetMappings"
        
      -- Default: Empty array
      ELSE '[]'::jsonb
    END,
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

-- Also update the update_mapping_template function
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
  
  -- Get the existing template ID
  SELECT id INTO v_template_id
  FROM mapping_templates
  WHERE id = p_id OR "templateId" = p_id;
  
  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  
  -- Update the template with standardized format
  UPDATE mapping_templates
  SET
    name = COALESCE(p_name, name),
    "templateName" = COALESCE(p_name, "templateName"),
    description = COALESCE(p_description, description),
    servicer_id = COALESCE(p_servicer_id, servicer_id),
    "subservicerId" = COALESCE(p_servicer_id::text, "subservicerId"),
    file_pattern = COALESCE(p_file_pattern, file_pattern),
    "originalFileNamePattern" = COALESCE(p_file_pattern, "originalFileNamePattern"),
    "sourceFileType" = COALESCE(p_source_file_type, "sourceFileType"),
    "updatedAt" = now(),
    version = version + 1
  WHERE id = v_template_id;
  
  -- Now update sheet mappings separately with proper formatting
  -- This helps ensure consistent format
  IF p_sheet_mappings IS NOT NULL THEN
    UPDATE mapping_templates
    SET
      -- Standard format in sheet_mappings column
      sheet_mappings = jsonb_build_object(
        'headerRow', COALESCE(p_header_row, (sheet_mappings->'headerRow')::int, 0),
        'tablePrefix', COALESCE(p_table_prefix, sheet_mappings->'tablePrefix'),
        'sheets', p_sheet_mappings
      ),
      -- Direct array in sheetMappings column for backward compatibility
      "sheetMappings" = p_sheet_mappings
    WHERE id = v_template_id;
  END IF;
  
  -- Return the updated template
  RETURN get_mapping_template_by_id(v_template_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the create_mapping_template function
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
    p_servicer_id::text,       -- subservicerId
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
    v_current_user::text,      -- created_by
    p_source_file_type         -- sourceFileType
  )
  RETURNING id INTO v_template_id;
  
  -- Return the newly created template
  RETURN get_mapping_template_by_id(v_template_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_mapping_template_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_mapping_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION update_mapping_template(uuid, text, text, uuid, text, int, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_mapping_template(text, text, uuid, text, int, text, jsonb, text) TO authenticated;

-- Refresh the schema cache to make the updated functions available
SELECT refresh_schema_cache();