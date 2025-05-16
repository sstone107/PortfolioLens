-- Migration: Fix Template Mapping Data Format
-- Description: Standardizes template data storage format and adds RPC function for saving templates

-- Create a consistent save_mapping_template function
CREATE OR REPLACE FUNCTION save_mapping_template(
  template_name TEXT,
  template_description TEXT,
  servicer_id UUID,
  file_pattern TEXT,
  header_row INT,
  table_prefix TEXT,
  sheet_mappings JSONB,
  user_id UUID,
  template_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_template_id UUID;
  v_result JSONB;
BEGIN
  -- Validate required parameters
  IF template_name IS NULL OR template_name = '' THEN
    RAISE EXCEPTION 'Template name is required';
  END IF;
  
  IF sheet_mappings IS NULL OR jsonb_array_length(sheet_mappings) = 0 THEN
    RAISE EXCEPTION 'Sheet mappings are required';
  END IF;

  -- Generate new UUID if not provided
  IF template_id IS NULL THEN
    template_id := gen_random_uuid();
  END IF;
  
  -- Check if template exists
  SELECT id INTO v_template_id 
  FROM mapping_templates 
  WHERE id = template_id OR "templateId" = template_id;
  
  -- Construct a standardized sheet_mappings object
  v_result := jsonb_build_object(
    'sheets', sheet_mappings,
    'headerRow', header_row,
    'tablePrefix', table_prefix
  );
  
  IF v_template_id IS NULL THEN
    -- Insert new template
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
      created_by
    ) VALUES (
      template_id,                  -- id
      template_id,                  -- templateId
      template_name,                -- name
      template_name,                -- templateName
      template_description,         -- description
      servicer_id,                  -- servicer_id
      servicer_id::text,            -- subservicerId
      file_pattern,                 -- file_pattern
      file_pattern,                 -- originalFileNamePattern
      v_result,                     -- sheet_mappings (standardized format)
      sheet_mappings,               -- sheetMappings (original data)
      now(),                        -- createdAt
      now(),                        -- updatedAt
      1,                            -- version
      user_id,                      -- owner_id
      user_id::text                 -- created_by
    )
    RETURNING id INTO v_template_id;
  ELSE
    -- Update existing template
    UPDATE mapping_templates
    SET
      name = template_name,
      "templateName" = template_name,
      description = template_description,
      servicer_id = COALESCE(servicer_id, servicer_id),
      "subservicerId" = COALESCE(servicer_id::text, "subservicerId"),
      file_pattern = COALESCE(file_pattern, file_pattern),
      "originalFileNamePattern" = COALESCE(file_pattern, "originalFileNamePattern"),
      sheet_mappings = v_result,
      "sheetMappings" = sheet_mappings,
      "updatedAt" = now(),
      version = version + 1
    WHERE id = v_template_id OR "templateId" = v_template_id
    RETURNING id INTO v_template_id;
  END IF;
  
  -- Return the template data in a consistent format
  RETURN jsonb_build_object(
    'id', template_id,
    'name', template_name,
    'description', template_description,
    'servicerId', servicer_id,
    'filePattern', file_pattern,
    'headerRow', header_row,
    'tablePrefix', table_prefix,
    'sheetMappings', sheet_mappings,
    'version', 1,
    'success', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a consistent view for template data
CREATE OR REPLACE VIEW mapping_templates_view AS
SELECT
  COALESCE(mt.id, mt."templateId") as id,
  COALESCE(mt.name, mt."templateName") as name,
  mt.description,
  COALESCE(mt.servicer_id, mt."subservicerId"::uuid) as servicer_id,
  COALESCE(mt.file_pattern, mt."originalFileNamePattern") as file_pattern,
  CASE
    WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'headerRow' 
    THEN (mt.sheet_mappings->>'headerRow')::int
    ELSE 0
  END as header_row,
  CASE
    WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'tablePrefix' 
    THEN mt.sheet_mappings->>'tablePrefix'
    ELSE NULL
  END as table_prefix,
  CASE
    WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'sheets' 
    THEN mt.sheet_mappings->'sheets'
    WHEN jsonb_typeof(mt."sheetMappings") = 'array' 
    THEN mt."sheetMappings"
    ELSE '[]'::jsonb
  END as sheet_mappings,
  mt."createdAt",
  mt."updatedAt",
  mt.version,
  mt.owner_id,
  mt.created_by
FROM 
  mapping_templates mt;

-- Grant access to function and view
GRANT EXECUTE ON FUNCTION save_mapping_template(TEXT, TEXT, UUID, TEXT, INT, TEXT, JSONB, UUID, UUID) TO authenticated;
GRANT SELECT ON mapping_templates_view TO authenticated;

-- Create function to get standardized template data by id
CREATE OR REPLACE FUNCTION get_template_by_id(p_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'name', name,
    'description', description,
    'servicerId', servicer_id,
    'filePattern', file_pattern,
    'headerRow', header_row,
    'tablePrefix', table_prefix,
    'sheetMappings', sheet_mappings,
    'createdAt', "createdAt",
    'updatedAt', "updatedAt",
    'version', version
  ) INTO v_result
  FROM mapping_templates_view
  WHERE id = p_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to function
GRANT EXECUTE ON FUNCTION get_template_by_id(UUID) TO authenticated;

-- Refresh schema cache to make functions available
SELECT refresh_schema_cache();