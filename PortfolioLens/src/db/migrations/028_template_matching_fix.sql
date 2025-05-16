-- Migration: Fix Template Matching
-- Description: Adds function for simplified template matching

-- Create get_templates function to read from the mapping_templates table
CREATE OR REPLACE FUNCTION get_templates()
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  description TEXT,
  file_pattern VARCHAR,
  template_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE("templateId", id) as id,
    COALESCE("templateName", name) as name,
    description,
    COALESCE("originalFileNamePattern", file_pattern) as file_pattern,
    jsonb_build_object(
      'id', COALESCE("templateId", id),
      'name', COALESCE("templateName", name),
      'description', description,
      'filePattern', COALESCE("originalFileNamePattern", file_pattern),
      'sheetMappings', COALESCE(sheet_mappings, "sheetMappings")
    ) as template_data
  FROM 
    mapping_templates
  ORDER BY
    "createdAt" DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to match a template based on file name
CREATE OR REPLACE FUNCTION match_template_by_name(file_name TEXT) 
RETURNS JSONB AS $$
DECLARE
  matching_template JSONB := null;
  template_record RECORD;
  base_name TEXT;
BEGIN
  -- Extract base name without extension
  base_name := split_part(file_name, '.', 1);
  
  -- First try exact pattern match
  SELECT template_data INTO matching_template
  FROM get_templates()
  WHERE file_name ~ ('^' || file_pattern || '$')
  LIMIT 1;
  
  -- If no match, try partial pattern match
  IF matching_template IS NULL THEN
    SELECT template_data INTO matching_template
    FROM get_templates()
    WHERE file_name ~ file_pattern
    LIMIT 1;
  END IF;
  
  -- If still no match, try matching against template name
  IF matching_template IS NULL THEN
    FOR template_record IN
      SELECT * FROM get_templates()
    LOOP
      IF base_name ILIKE '%' || lower(template_record.name) || '%' THEN
        matching_template := template_record.template_data;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  
  RETURN matching_template;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION match_template_by_name(TEXT) TO authenticated;

-- Refresh schema cache
SELECT refresh_schema_cache();