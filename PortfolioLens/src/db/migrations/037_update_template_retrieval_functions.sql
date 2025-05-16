-- Migration: Update Template Retrieval Functions
-- Description: Updates the template retrieval functions to match new structure

-- Update get_mapping_template_by_id to match our new functions
CREATE OR REPLACE FUNCTION get_mapping_template_by_id(p_id uuid)
RETURNS json AS $$
DECLARE
  v_result json;
  v_sheet_mappings jsonb;
  v_header_row int;
  v_table_prefix text;
BEGIN
  -- Extract the sheet mappings using standard extraction logic
  SELECT 
    CASE 
      -- Case 1: If sheet_mappings has a 'sheets' key, use that
      WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'sheets' THEN
        mt.sheet_mappings->'sheets'
      
      -- Case 2: If sheet_mappings is an array, use it directly
      WHEN jsonb_typeof(mt.sheet_mappings) = 'array' THEN
        mt.sheet_mappings
      
      -- Case 3: If sheetMappings is an array, use it 
      WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN
        mt."sheetMappings"
      
      -- Case 4: If sheetMappings has a 'sheets' key, use that
      WHEN jsonb_typeof(mt."sheetMappings") = 'object' AND mt."sheetMappings" ? 'sheets' THEN
        mt."sheetMappings"->'sheets'
        
      -- Default: Empty array
      ELSE '[]'::jsonb
    END INTO v_sheet_mappings
  FROM mapping_templates mt
  WHERE mt.id = p_id OR mt."templateId" = p_id;

  -- Extract header row with fallbacks
  SELECT COALESCE(
    (mt.sheet_mappings->'headerRow')::int, 
    (mt."sheetMappings"->'headerRow')::int,
    0
  ) INTO v_header_row
  FROM mapping_templates mt
  WHERE mt.id = p_id OR mt."templateId" = p_id;

  -- Extract table prefix with fallbacks
  SELECT COALESCE(
    mt.sheet_mappings->>'tablePrefix', 
    mt."sheetMappings"->>'tablePrefix'
  ) INTO v_table_prefix
  FROM mapping_templates mt
  WHERE mt.id = p_id OR mt."templateId" = p_id;
  
  -- Build the final JSON object
  SELECT json_build_object(
    'id', mt.id,
    'name', COALESCE(mt.name, mt."templateName"),
    'description', mt.description,
    'servicerId', mt.servicer_id,
    'filePattern', COALESCE(mt.file_pattern, mt."originalFileNamePattern"),
    'sourceFileType', COALESCE(mt."sourceFileType", 'xlsx'),
    'headerRow', v_header_row,
    'tablePrefix', v_table_prefix,
    'sheetMappings', v_sheet_mappings,
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

-- Update get_mapping_templates to match our new functions
CREATE OR REPLACE FUNCTION get_mapping_templates()
RETURNS SETOF json AS $$
BEGIN
  RETURN QUERY
  WITH extracted_mappings AS (
    SELECT
      mt.id,
      -- Extract sheet mappings using the same logic as get_mapping_template_by_id
      CASE 
        WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'sheets' THEN
          mt.sheet_mappings->'sheets'
        WHEN jsonb_typeof(mt.sheet_mappings) = 'array' THEN
          mt.sheet_mappings
        WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN
          mt."sheetMappings"
        WHEN jsonb_typeof(mt."sheetMappings") = 'object' AND mt."sheetMappings" ? 'sheets' THEN
          mt."sheetMappings"->'sheets'
        ELSE '[]'::jsonb
      END as extracted_sheet_mappings,
      -- Extract header row
      COALESCE(
        (mt.sheet_mappings->'headerRow')::int, 
        (mt."sheetMappings"->'headerRow')::int,
        0
      ) as header_row,
      -- Extract table prefix
      COALESCE(
        mt.sheet_mappings->>'tablePrefix', 
        mt."sheetMappings"->>'tablePrefix'
      ) as table_prefix
    FROM mapping_templates mt
  )
  SELECT json_build_object(
    'id', mt.id,
    'name', COALESCE(mt.name, mt."templateName"),
    'description', mt.description,
    'servicerId', mt.servicer_id,
    'filePattern', COALESCE(mt.file_pattern, mt."originalFileNamePattern"),
    'sourceFileType', COALESCE(mt."sourceFileType", 'xlsx'),
    'headerRow', em.header_row,
    'tablePrefix', em.table_prefix,
    'sheetMappings', em.extracted_sheet_mappings,
    'createdAt', mt."createdAt",
    'updatedAt', mt."updatedAt",
    'version', mt.version,
    'owner', mt.owner_id,
    'created_by', mt.created_by
  )
  FROM mapping_templates mt
  JOIN extracted_mappings em ON mt.id = em.id
  ORDER BY mt."createdAt" DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_mapping_template_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_mapping_templates() TO authenticated;

-- Refresh the schema cache to make the updated functions available
SELECT refresh_schema_cache();