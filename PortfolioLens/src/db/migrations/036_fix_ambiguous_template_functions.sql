-- Migration: Fix Ambiguous Template Functions
-- Description: Resolves function ambiguity and COALESCE type issues

-- First, drop all versions of the functions to eliminate ambiguity
DROP FUNCTION IF EXISTS create_mapping_template(text, text, uuid, text, int, text, jsonb, text);
DROP FUNCTION IF EXISTS create_mapping_template(text, text, uuid, text, int, text, jsonb);
DROP FUNCTION IF EXISTS save_mapping_template(text, text, uuid, text, int, text, jsonb, uuid, uuid, text);
DROP FUNCTION IF EXISTS save_mapping_template(text, text, uuid, text, int, text, jsonb, uuid, uuid);

-- Create a completely renamed function to avoid any ambiguity
CREATE OR REPLACE FUNCTION create_new_mapping_template(
  p_template_name text,
  p_template_description text DEFAULT '',
  p_template_servicer_id uuid DEFAULT NULL,
  p_template_file_pattern text DEFAULT NULL,
  p_template_header_row int DEFAULT 0,
  p_template_table_prefix text DEFAULT NULL,
  p_template_sheet_mappings jsonb DEFAULT NULL,
  p_template_source_file_type text DEFAULT 'xlsx'
)
RETURNS json AS $$
DECLARE
  v_new_id uuid := gen_random_uuid();
  v_current_user uuid := auth.uid();
  v_template_id uuid;
  v_result json;
BEGIN
  -- Validate required parameters
  IF p_template_name IS NULL THEN
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
    v_new_id,                           -- id
    v_new_id,                           -- templateId
    p_template_name,                    -- name
    p_template_name,                    -- templateName
    COALESCE(p_template_description, ''), -- description
    p_template_servicer_id,             -- servicer_id
    CASE WHEN p_template_servicer_id IS NULL THEN NULL 
         ELSE p_template_servicer_id::text END, -- subservicerId (handle NULL case)
    p_template_file_pattern,            -- file_pattern
    p_template_file_pattern,            -- originalFileNamePattern
    jsonb_build_object(                 -- sheet_mappings - standardized object format
      'headerRow', COALESCE(p_template_header_row, 0),
      'tablePrefix', p_template_table_prefix,
      'sheets', COALESCE(p_template_sheet_mappings, '[]'::jsonb)
    ),
    COALESCE(p_template_sheet_mappings, '[]'::jsonb), -- sheetMappings - direct array
    now(),                              -- createdAt
    now(),                              -- updatedAt
    1,                                  -- version
    v_current_user,                     -- owner_id
    v_current_user::text,               -- created_by
    COALESCE(p_template_source_file_type, 'xlsx') -- sourceFileType (with fallback)
  )
  RETURNING id INTO v_template_id;
  
  -- Return the newly created template
  SELECT json_build_object(
    'id', mt.id,
    'name', mt.name,
    'description', mt.description,
    'servicerId', mt.servicer_id,
    'filePattern', mt.file_pattern,
    'sourceFileType', mt."sourceFileType",
    'headerRow', COALESCE((mt.sheet_mappings->>'headerRow')::int, 0),
    'tablePrefix', mt.sheet_mappings->>'tablePrefix',
    'sheetMappings', COALESCE(mt."sheetMappings", '[]'::jsonb),
    'createdAt', mt."createdAt",
    'updatedAt', mt."updatedAt",
    'version', mt.version
  ) INTO v_result
  FROM mapping_templates mt
  WHERE mt.id = v_template_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a renamed save_mapping_template function
CREATE OR REPLACE FUNCTION update_existing_mapping_template(
  p_template_id uuid,
  p_template_name text DEFAULT NULL,
  p_template_description text DEFAULT NULL,
  p_template_servicer_id uuid DEFAULT NULL,
  p_template_file_pattern text DEFAULT NULL,
  p_template_header_row int DEFAULT NULL,
  p_template_table_prefix text DEFAULT NULL,
  p_template_sheet_mappings jsonb DEFAULT NULL,
  p_template_source_file_type text DEFAULT NULL
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
    WHERE (id = p_template_id OR "templateId" = p_template_id)
    AND (owner_id = v_current_user OR created_by = v_current_user::text)
  ) INTO v_is_owner;
  
  -- Only owner or admin can update
  IF NOT (v_is_owner OR v_is_admin) THEN
    RAISE EXCEPTION 'Not authorized to update this template';
  END IF;
  
  -- Get the existing template ID
  SELECT id INTO v_template_id
  FROM mapping_templates
  WHERE id = p_template_id OR "templateId" = p_template_id;
  
  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  
  -- Update the template
  UPDATE mapping_templates
  SET
    name = COALESCE(p_template_name, name),
    "templateName" = COALESCE(p_template_name, "templateName"),
    description = COALESCE(p_template_description, description),
    servicer_id = COALESCE(p_template_servicer_id, servicer_id),
    "subservicerId" = CASE 
                        WHEN p_template_servicer_id IS NOT NULL THEN p_template_servicer_id::text 
                        ELSE "subservicerId" 
                      END,
    file_pattern = COALESCE(p_template_file_pattern, file_pattern),
    "originalFileNamePattern" = COALESCE(p_template_file_pattern, "originalFileNamePattern"),
    "sourceFileType" = COALESCE(p_template_source_file_type, "sourceFileType"),
    "updatedAt" = now(),
    version = version + 1
  WHERE id = v_template_id;
  
  -- Update sheet mappings separately to handle JSON properly
  IF p_template_sheet_mappings IS NOT NULL THEN
    UPDATE mapping_templates
    SET
      sheet_mappings = jsonb_build_object(
        'headerRow', COALESCE(p_template_header_row, (sheet_mappings->>'headerRow')::int, 0),
        'tablePrefix', COALESCE(p_template_table_prefix, sheet_mappings->>'tablePrefix'),
        'sheets', p_template_sheet_mappings
      ),
      "sheetMappings" = p_template_sheet_mappings
    WHERE id = v_template_id;
  END IF;
  
  -- Return the updated template
  SELECT json_build_object(
    'id', mt.id,
    'name', mt.name,
    'description', mt.description,
    'servicerId', mt.servicer_id,
    'filePattern', mt.file_pattern,
    'sourceFileType', mt."sourceFileType",
    'headerRow', COALESCE((mt.sheet_mappings->>'headerRow')::int, 0),
    'tablePrefix', mt.sheet_mappings->>'tablePrefix',
    'sheetMappings', COALESCE(mt."sheetMappings", '[]'::jsonb),
    'createdAt', mt."createdAt",
    'updatedAt', mt."updatedAt",
    'version', mt.version
  ) INTO v_result
  FROM mapping_templates mt
  WHERE mt.id = v_template_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to handle both create and update
CREATE OR REPLACE FUNCTION save_template_v2(
  p_template_name text,
  p_template_description text DEFAULT '',
  p_template_servicer_id uuid DEFAULT NULL,
  p_template_file_pattern text DEFAULT NULL,
  p_template_header_row int DEFAULT 0,
  p_template_table_prefix text DEFAULT NULL,
  p_template_sheet_mappings jsonb DEFAULT NULL,
  p_template_id uuid DEFAULT NULL,
  p_template_source_file_type text DEFAULT 'xlsx'
)
RETURNS json AS $$
DECLARE
  v_result json;
BEGIN
  -- Either update existing or create new
  IF p_template_id IS NOT NULL THEN
    -- Update
    SELECT update_existing_mapping_template(
      p_template_id,
      p_template_name,
      p_template_description,
      p_template_servicer_id,
      p_template_file_pattern,
      p_template_header_row,
      p_template_table_prefix,
      p_template_sheet_mappings,
      p_template_source_file_type
    ) INTO v_result;
  ELSE
    -- Create new
    SELECT create_new_mapping_template(
      p_template_name,
      p_template_description,
      p_template_servicer_id,
      p_template_file_pattern,
      p_template_header_row,
      p_template_table_prefix,
      p_template_sheet_mappings,
      p_template_source_file_type
    ) INTO v_result;
  END IF;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_new_mapping_template(text, text, uuid, text, int, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION update_existing_mapping_template(uuid, text, text, uuid, text, int, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION save_template_v2(text, text, uuid, text, int, text, jsonb, uuid, text) TO authenticated;

-- Refresh the schema cache to make the updated functions available
SELECT refresh_schema_cache();