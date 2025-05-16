-- Migration: Fix Nested Sheets Extraction
-- Description: Fixes the extraction of nested sheets arrays in template data

-- Update the get_mapping_template_by_id function to correctly handle nested sheets
CREATE OR REPLACE FUNCTION get_mapping_template_by_id(p_id uuid)
RETURNS json AS $$
DECLARE
  v_template json;
  v_sheet_mappings jsonb := '[]'::jsonb;
  v_header_row int := 0;
  v_table_prefix text;
BEGIN
  -- First get the basic template data
  SELECT json_build_object(
    'id', mt.id,
    'name', COALESCE(mt.name, mt."templateName"),
    'description', mt.description,
    'servicerId', COALESCE(mt.servicer_id, mt."subservicerId"::uuid),
    'filePattern', COALESCE(mt.file_pattern, mt."originalFileNamePattern"),
    'sourceFileType', COALESCE(mt."sourceFileType", 'xlsx'),
    'createdAt', mt."createdAt",
    'updatedAt', mt."updatedAt",
    'version', mt.version,
    'owner', mt.owner_id,
    'ownerId', mt.owner_id,
    'created_by', mt.created_by,
    'createdBy', mt.created_by
  ) INTO v_template
  FROM mapping_templates mt
  WHERE mt.id = p_id OR mt."templateId" = p_id;
  
  -- Get the header row separately, with fallbacks
  SELECT COALESCE(
    (mt.sheet_mappings->'headerRow')::int, 
    (mt."sheetMappings"->'headerRow')::int,
    0
  ) INTO v_header_row
  FROM mapping_templates mt
  WHERE mt.id = p_id OR mt."templateId" = p_id;
  
  -- Get the table prefix separately, with fallbacks
  SELECT COALESCE(
    mt.sheet_mappings->>'tablePrefix', 
    mt."sheetMappings"->>'tablePrefix'
  ) INTO v_table_prefix
  FROM mapping_templates mt
  WHERE mt.id = p_id OR mt."templateId" = p_id;
  
  -- Now extract the sheets array with enhanced extraction
  SELECT CASE 
    -- Case 1: sheet_mappings has 'sheets' property
    WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'sheets' THEN
      CASE
        WHEN jsonb_typeof(mt.sheet_mappings->'sheets') = 'array' THEN
          mt.sheet_mappings->'sheets'
        ELSE '[]'::jsonb
      END
    
    -- Case 2: sheetMappings has 'sheets' property
    WHEN jsonb_typeof(mt."sheetMappings") = 'object' AND mt."sheetMappings" ? 'sheets' THEN
      CASE
        WHEN jsonb_typeof(mt."sheetMappings"->'sheets') = 'array' THEN
          mt."sheetMappings"->'sheets'
        ELSE '[]'::jsonb
      END
    
    -- Case 3: sheet_mappings is a direct array
    WHEN jsonb_typeof(mt.sheet_mappings) = 'array' THEN
      mt.sheet_mappings
    
    -- Case 4: sheetMappings is a direct array
    WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN
      mt."sheetMappings"
      
    -- Default: Empty array
    ELSE '[]'::jsonb
  END INTO v_sheet_mappings
  FROM mapping_templates mt
  WHERE mt.id = p_id OR mt."templateId" = p_id;

  -- CRITICAL: Return both the nested original format AND the extracted sheets
  -- This provides maximum compatibility with the frontend
  SELECT v_template || 
    json_build_object(
      'headerRow', v_header_row,
      'tablePrefix', v_table_prefix,
      'sheetMappings', v_sheet_mappings,
      'sheet_mappings', json_build_object(
        'headerRow', v_header_row, 
        'tablePrefix', v_table_prefix,
        'sheets', v_sheet_mappings
      )
    )
  INTO v_template;
  
  RETURN v_template;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_mapping_templates to use the same enhanced extraction
CREATE OR REPLACE FUNCTION get_mapping_templates()
RETURNS SETOF json AS $$
BEGIN
  RETURN QUERY
  WITH extracted_mappings AS (
    SELECT
      mt.id,
      -- Extract sheet mappings using same enhanced logic
      CASE 
        -- Case 1: sheet_mappings has 'sheets' property
        WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'sheets' THEN
          CASE
            WHEN jsonb_typeof(mt.sheet_mappings->'sheets') = 'array' THEN
              mt.sheet_mappings->'sheets'
            ELSE '[]'::jsonb
          END
        
        -- Case 2: sheetMappings has 'sheets' property
        WHEN jsonb_typeof(mt."sheetMappings") = 'object' AND mt."sheetMappings" ? 'sheets' THEN
          CASE
            WHEN jsonb_typeof(mt."sheetMappings"->'sheets') = 'array' THEN
              mt."sheetMappings"->'sheets'
            ELSE '[]'::jsonb
          END
        
        -- Case 3: sheet_mappings is a direct array
        WHEN jsonb_typeof(mt.sheet_mappings) = 'array' THEN
          mt.sheet_mappings
        
        -- Case 4: sheetMappings is a direct array
        WHEN jsonb_typeof(mt."sheetMappings") = 'array' THEN
          mt."sheetMappings"
          
        -- Default: Empty array
        ELSE '[]'::jsonb
      END as sheet_mappings,
      
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
    'id', COALESCE(mt.id, mt."templateId"),
    'name', COALESCE(mt.name, mt."templateName"),
    'description', mt.description,
    'servicerId', COALESCE(mt.servicer_id, mt."subservicerId"::uuid),
    'filePattern', COALESCE(mt.file_pattern, mt."originalFileNamePattern"),
    'sourceFileType', COALESCE(mt."sourceFileType", 'xlsx'),
    'headerRow', em.header_row,
    'tablePrefix', em.table_prefix,
    'sheetMappings', em.sheet_mappings,
    'sheet_mappings', jsonb_build_object(
      'headerRow', em.header_row, 
      'tablePrefix', em.table_prefix,
      'sheets', em.sheet_mappings
    ),
    'createdAt', mt."createdAt",
    'updatedAt', mt."updatedAt",
    'version', mt.version,
    'owner', mt.owner_id,
    'ownerId', mt.owner_id,
    'created_by', mt.created_by,
    'createdBy', mt.created_by
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