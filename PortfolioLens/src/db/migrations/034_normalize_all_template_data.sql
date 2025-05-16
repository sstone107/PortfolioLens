-- Migration: Normalize All Template Data
-- Description: Runs a one-time fix to normalize data storage for all templates

-- Function to generate normalized template data
CREATE OR REPLACE FUNCTION normalize_template_data()
RETURNS jsonb AS $$
DECLARE
  v_template record;
  v_sheet_mappings jsonb;
  v_template_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_count int := 0;
  v_success_count int := 0;
  v_error_count int := 0;
BEGIN
  -- Process each template
  FOR v_template IN 
    SELECT id FROM mapping_templates
  LOOP
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
      WHERE mt.id = v_template.id;

      -- If we got a null result, set an empty array
      IF v_sheet_mappings IS NULL THEN
        v_sheet_mappings := '[]'::jsonb;
      END IF;

      -- Extract header row and table prefix for structured object
      SELECT 
        COALESCE(
          (mt.sheet_mappings->'headerRow')::int, 
          (mt."sheetMappings"->'headerRow')::int,
          0
        ) AS header_row,
        COALESCE(
          mt.sheet_mappings->>'tablePrefix', 
          mt."sheetMappings"->>'tablePrefix'
        ) AS table_prefix
      INTO 
        v_template.header_row,
        v_template.table_prefix
      FROM mapping_templates mt
      WHERE mt.id = v_template.id;

      -- Update the template with normalized data structure
      UPDATE mapping_templates
      SET 
        -- Standardized format in sheet_mappings with consistent structure
        sheet_mappings = jsonb_build_object(
          'headerRow', COALESCE(v_template.header_row, 0),
          'tablePrefix', v_template.table_prefix,
          'sheets', v_sheet_mappings
        ),
        -- Direct array in sheetMappings for backward compatibility
        "sheetMappings" = v_sheet_mappings,
        -- Increment version to mark the change
        version = version + 1,
        -- Update the updated_at timestamp
        "updatedAt" = now()
      WHERE id = v_template.id;

      -- Track success
      v_results := v_results || jsonb_build_object(
        'id', v_template.id,
        'status', 'success'
      );
      v_success_count := v_success_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Log any errors but continue processing
      v_results := v_results || jsonb_build_object(
        'id', v_template.id,
        'status', 'error',
        'error', SQLERRM
      );
      v_error_count := v_error_count + 1;
    END;
    
    v_count := v_count + 1;
  END LOOP;
  
  -- Return summary of fixes
  RETURN jsonb_build_object(
    'templates_processed', v_count,
    'success_count', v_success_count,
    'error_count', v_error_count,
    'details', v_results
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute the function to normalize all templates
DO $$ 
BEGIN
  PERFORM normalize_template_data();
END $$;

-- Create a view to help monitor template structure issues
CREATE OR REPLACE VIEW template_structure_monitor AS
SELECT
  id,
  name,
  jsonb_typeof(sheet_mappings) AS sheet_mappings_type,
  CASE 
    WHEN jsonb_typeof(sheet_mappings) = 'object' THEN 
      CASE WHEN sheet_mappings ? 'sheets' THEN true ELSE false END
    ELSE false
  END AS sheet_mappings_has_sheets_key,
  CASE 
    WHEN jsonb_typeof(sheet_mappings) = 'object' AND sheet_mappings ? 'sheets' THEN
      jsonb_array_length(sheet_mappings->'sheets')
    WHEN jsonb_typeof(sheet_mappings) = 'array' THEN
      jsonb_array_length(sheet_mappings)
    ELSE 0
  END AS sheet_mappings_array_size,
  jsonb_typeof("sheetMappings") AS sheetMappings_type,
  CASE 
    WHEN jsonb_typeof("sheetMappings") = 'array' THEN
      jsonb_array_length("sheetMappings")
    ELSE 0
  END AS sheetMappings_array_size,
  version,
  "createdAt",
  "updatedAt"
FROM mapping_templates
ORDER BY "updatedAt" DESC;

-- Drop the temporary function now that we've used it
DROP FUNCTION normalize_template_data();

-- Refresh the schema cache to make the updated functions and view available
SELECT refresh_schema_cache();