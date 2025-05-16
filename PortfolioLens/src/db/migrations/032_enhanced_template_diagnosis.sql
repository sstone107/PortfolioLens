-- Migration: Enhanced Template Diagnosis
-- Description: Creates a more detailed diagnostic function for template data structures

-- Create enhanced diagnostic function to inspect the entire template structure
CREATE OR REPLACE FUNCTION diagnose_template_full(p_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_template jsonb;
  v_raw_record jsonb;
BEGIN
  -- Get the raw database record
  SELECT row_to_json(mt)::jsonb INTO v_raw_record
  FROM mapping_templates mt
  WHERE mt.id = p_id OR mt."templateId" = p_id;
  
  -- Now create a diagnostic object with both the raw record and processed fields
  SELECT jsonb_build_object(
    -- Basic template metadata
    'id', mt.id,
    'template_id', mt."templateId",
    'name', mt.name,
    'template_name', mt."templateName",
    'createdAt', mt."createdAt",
    'updatedAt', mt."updatedAt",
    'version', mt.version,
    
    -- Raw column values for debugging
    'raw_record', v_raw_record,
    
    -- sheet_mappings analysis
    'sheet_mappings_type', jsonb_typeof(mt.sheet_mappings),
    'sheet_mappings_keys', CASE 
                          WHEN jsonb_typeof(mt.sheet_mappings) = 'object' 
                          THEN (SELECT jsonb_agg(key) FROM jsonb_object_keys(mt.sheet_mappings) key)
                          ELSE NULL 
                        END,
    'sheet_mappings_has_sheets', CASE 
                               WHEN jsonb_typeof(mt.sheet_mappings) = 'object' 
                               THEN mt.sheet_mappings ? 'sheets' 
                               ELSE false 
                             END,
    'sheet_mappings_array_length', CASE 
                                 WHEN jsonb_typeof(mt.sheet_mappings) = 'array' 
                                 THEN jsonb_array_length(mt.sheet_mappings) 
                                 ELSE NULL 
                               END,
    'sheet_mappings_sheets_type', CASE 
                                WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND mt.sheet_mappings ? 'sheets'
                                THEN jsonb_typeof(mt.sheet_mappings->'sheets')
                                ELSE NULL 
                              END,
    'sheet_mappings_sheets_length', CASE 
                                  WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND 
                                       mt.sheet_mappings ? 'sheets' AND 
                                       jsonb_typeof(mt.sheet_mappings->'sheets') = 'array'
                                  THEN jsonb_array_length(mt.sheet_mappings->'sheets')
                                  ELSE NULL 
                                END,
    
    -- sheetMappings analysis
    'sheetMappings_type', jsonb_typeof(mt."sheetMappings"),
    'sheetMappings_keys', CASE 
                        WHEN jsonb_typeof(mt."sheetMappings") = 'object' 
                        THEN (SELECT jsonb_agg(key) FROM jsonb_object_keys(mt."sheetMappings") key)
                        ELSE NULL 
                      END,
    'sheetMappings_has_sheets', CASE 
                             WHEN jsonb_typeof(mt."sheetMappings") = 'object' 
                             THEN mt."sheetMappings" ? 'sheets' 
                             ELSE false 
                           END,
    'sheetMappings_array_length', CASE 
                               WHEN jsonb_typeof(mt."sheetMappings") = 'array' 
                               THEN jsonb_array_length(mt."sheetMappings") 
                               ELSE NULL 
                             END,
    'sheetMappings_sheets_type', CASE 
                              WHEN jsonb_typeof(mt."sheetMappings") = 'object' AND mt."sheetMappings" ? 'sheets'
                              THEN jsonb_typeof(mt."sheetMappings"->'sheets')
                              ELSE NULL 
                            END,
    'sheetMappings_sheets_length', CASE 
                                WHEN jsonb_typeof(mt."sheetMappings") = 'object' AND 
                                     mt."sheetMappings" ? 'sheets' AND 
                                     jsonb_typeof(mt."sheetMappings"->'sheets') = 'array'
                                THEN jsonb_array_length(mt."sheetMappings"->'sheets')
                                ELSE NULL 
                              END,
    
    -- Extraction test - What our function should return
    'extracted_sheet_mappings', CASE 
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
    END,
    
    -- Count the columns inside the first sheet if available
    'first_sheet_columns_count', CASE 
      WHEN jsonb_typeof(mt.sheet_mappings) = 'object' AND 
           mt.sheet_mappings ? 'sheets' AND 
           jsonb_typeof(mt.sheet_mappings->'sheets') = 'array' AND
           jsonb_array_length(mt.sheet_mappings->'sheets') > 0 AND
           jsonb_typeof((mt.sheet_mappings->'sheets')->0) = 'object' AND
           (mt.sheet_mappings->'sheets')->0 ? 'columns' AND
           jsonb_typeof(((mt.sheet_mappings->'sheets')->0)->>'columns') = 'array'
      THEN jsonb_array_length(((mt.sheet_mappings->'sheets')->0)->>'columns')
      
      WHEN jsonb_typeof(mt.sheet_mappings) = 'array' AND
           jsonb_array_length(mt.sheet_mappings) > 0 AND
           jsonb_typeof(mt.sheet_mappings->0) = 'object' AND
           mt.sheet_mappings->0 ? 'columns' AND
           jsonb_typeof((mt.sheet_mappings->0)->'columns') = 'array'
      THEN jsonb_array_length((mt.sheet_mappings->0)->'columns')
      
      WHEN jsonb_typeof(mt."sheetMappings") = 'array' AND
           jsonb_array_length(mt."sheetMappings") > 0 AND
           jsonb_typeof(mt."sheetMappings"->0) = 'object' AND
           mt."sheetMappings"->0 ? 'columns' AND
           jsonb_typeof((mt."sheetMappings"->0)->'columns') = 'array'
      THEN jsonb_array_length((mt."sheetMappings"->0)->'columns')
           
      WHEN jsonb_typeof(mt."sheetMappings") = 'object' AND 
           mt."sheetMappings" ? 'sheets' AND 
           jsonb_typeof(mt."sheetMappings"->'sheets') = 'array' AND
           jsonb_array_length(mt."sheetMappings"->'sheets') > 0 AND
           jsonb_typeof((mt."sheetMappings"->'sheets')->0) = 'object' AND
           (mt."sheetMappings"->'sheets')->0 ? 'columns'
      THEN jsonb_array_length(((mt."sheetMappings"->'sheets')->0)->'columns')
      
      ELSE NULL
    END
  ) INTO v_template
  FROM mapping_templates mt
  WHERE mt.id = p_id OR mt."templateId" = p_id;
  
  RETURN v_template;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION diagnose_template_full(uuid) TO authenticated;

-- Create a fix_template function to standardize template storage
CREATE OR REPLACE FUNCTION fix_template_storage(p_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_sheet_mappings jsonb;
  v_template_id uuid;
BEGIN
  -- First extract the sheets data using our standard extraction logic
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

  -- Get the other template data
  SELECT COALESCE(id, "templateId") INTO v_template_id
  FROM mapping_templates
  WHERE id = p_id OR "templateId" = p_id;
  
  -- Standardize the storage by updating both columns to a consistent format
  UPDATE mapping_templates
  SET 
    sheet_mappings = jsonb_build_object(
      'headerRow', COALESCE((sheet_mappings->'headerRow')::int, 0),
      'tablePrefix', sheet_mappings->'tablePrefix',
      'sheets', v_sheet_mappings
    ),
    "sheetMappings" = v_sheet_mappings,
    version = version + 1,
    "updatedAt" = now()
  WHERE id = p_id OR "templateId" = p_id;
  
  -- Return the diagnostic information after the fix
  RETURN diagnose_template_full(v_template_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION fix_template_storage(uuid) TO authenticated;

-- Function to fix all templates at once
CREATE OR REPLACE FUNCTION fix_all_template_storage()
RETURNS jsonb AS $$
DECLARE
  v_template record;
  v_results jsonb := '[]'::jsonb;
  v_count int := 0;
BEGIN
  -- Process each template
  FOR v_template IN 
    SELECT id FROM mapping_templates
  LOOP
    v_results := v_results || jsonb_build_object(
      'id', v_template.id,
      'result', fix_template_storage(v_template.id)
    );
    v_count := v_count + 1;
  END LOOP;
  
  -- Return summary of fixes
  RETURN jsonb_build_object(
    'templates_fixed', v_count,
    'details', v_results
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION fix_all_template_storage() TO authenticated;

-- Refresh the schema cache to make the updated functions available
SELECT refresh_schema_cache();