-- Migration: Fix Template Sheet Mappings Structure
-- Description: Improves the extraction of sheet mappings from different template formats

-- Update get_mapping_template_by_id to better handle sheet mappings extraction
CREATE OR REPLACE FUNCTION get_mapping_template_by_id(p_id uuid)
RETURNS json AS $$
DECLARE
  v_result json;
  v_sheet_mappings jsonb;
BEGIN
  SELECT 
    -- Extract the sheet mappings using a multi-step approach
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

  -- Now build the complete template object with the extracted sheet mappings
  SELECT json_build_object(
    'id', COALESCE(mt.id, mt."templateId"),
    'name', COALESCE(mt.name, mt."templateName"),
    'description', mt.description,
    'servicerId', mt."subservicerId",
    'filePattern', COALESCE(mt.file_pattern, mt."originalFileNamePattern"),
    'sourceFileType', COALESCE(mt."sourceFileType", 'xlsx'),
    'headerRow', COALESCE(
      (mt.sheet_mappings->'headerRow')::int, 
      CASE WHEN mt."sheetMappings" ? 'headerRow' THEN (mt."sheetMappings"->>'headerRow')::int ELSE 0 END,
      0
    ),
    'tablePrefix', COALESCE(
      mt.sheet_mappings->'tablePrefix', 
      CASE WHEN mt."sheetMappings" ? 'tablePrefix' THEN mt."sheetMappings"->>'tablePrefix' ELSE NULL END
    ),
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

-- Update get_mapping_templates to better handle sheet mappings extraction
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
      END as extracted_sheet_mappings
    FROM mapping_templates mt
  )
  SELECT json_build_object(
    'id', COALESCE(mt.id, mt."templateId"),
    'name', COALESCE(mt.name, mt."templateName"),
    'description', mt.description,
    'servicerId', mt."subservicerId",
    'filePattern', COALESCE(mt.file_pattern, mt."originalFileNamePattern"),
    'sourceFileType', COALESCE(mt."sourceFileType", 'xlsx'),
    'headerRow', COALESCE(
      (mt.sheet_mappings->'headerRow')::int, 
      CASE WHEN mt."sheetMappings" ? 'headerRow' THEN (mt."sheetMappings"->>'headerRow')::int ELSE 0 END,
      0
    ),
    'tablePrefix', COALESCE(
      mt.sheet_mappings->'tablePrefix', 
      CASE WHEN mt."sheetMappings" ? 'tablePrefix' THEN mt."sheetMappings"->>'tablePrefix' ELSE NULL END
    ),
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

-- Create diagnostic function to examine template structure
CREATE OR REPLACE FUNCTION diagnose_template(p_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_template jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', mt.id,
    'template_id', mt."templateId",
    'name', mt.name,
    'template_name', mt."templateName",
    'sheet_mappings_type', jsonb_typeof(mt.sheet_mappings),
    'sheet_mappings', mt.sheet_mappings,
    'sheet_mappings_keys', CASE WHEN jsonb_typeof(mt.sheet_mappings) = 'object' 
                            THEN jsonb_object_keys(mt.sheet_mappings) 
                            ELSE NULL END,
    'sheet_mappings_has_sheets', CASE WHEN jsonb_typeof(mt.sheet_mappings) = 'object' 
                                  THEN mt.sheet_mappings ? 'sheets' 
                                  ELSE false END,
    'sheet_mappings_array_length', CASE WHEN jsonb_typeof(mt.sheet_mappings) = 'array' 
                                   THEN jsonb_array_length(mt.sheet_mappings) 
                                   ELSE NULL END,
    'sheet_mappings_sheets', CASE WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'sheets'
                              THEN mt.sheet_mappings->'sheets'
                              ELSE NULL END,
    'sheet_mappings_headerRow', CASE WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'headerRow'
                                THEN mt.sheet_mappings->'headerRow'
                                ELSE NULL END,
    'sheetMappings_type', jsonb_typeof(mt."sheetMappings"),
    'sheetMappings', mt."sheetMappings",
    'sheetMappings_keys', CASE WHEN jsonb_typeof(mt."sheetMappings") = 'object' 
                          THEN jsonb_object_keys(mt."sheetMappings") 
                          ELSE NULL END,
    'sheetMappings_has_sheets', CASE WHEN jsonb_typeof(mt."sheetMappings") = 'object' 
                                THEN mt."sheetMappings" ? 'sheets' 
                                ELSE false END,
    'sheetMappings_array_length', CASE WHEN jsonb_typeof(mt."sheetMappings") = 'array' 
                                 THEN jsonb_array_length(mt."sheetMappings") 
                                 ELSE NULL END
  ) INTO v_template
  FROM mapping_templates mt
  WHERE mt.id = p_id OR mt."templateId" = p_id;
  
  RETURN v_template;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_mapping_template_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_mapping_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION diagnose_template(uuid) TO authenticated;

-- Refresh the schema cache to make the updated functions available
SELECT refresh_schema_cache();