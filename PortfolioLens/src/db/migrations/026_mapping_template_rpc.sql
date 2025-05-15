-- Migration: Mapping template RPC function
-- Description: Adds RPC function for saving mapping templates directly
-- Created: 2025-05-14

-- Create function to save mapping templates without dependency on schema cache
CREATE OR REPLACE FUNCTION save_mapping_template(
  template_name TEXT,
  template_description TEXT,
  servicer_id UUID,
  file_pattern TEXT,
  header_row INTEGER,
  table_prefix TEXT,
  sheet_mappings JSONB,
  user_id UUID,
  template_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_template_id UUID;
  source_type TEXT := 'xlsx'; -- Valid value according to the check constraint
BEGIN
  -- Generate a new UUID if one wasn't provided
  IF template_id IS NULL THEN
    template_id := gen_random_uuid();
  END IF;
  
  -- If the file pattern ends with .csv, use 'csv' as the source type
  IF file_pattern LIKE '%.csv' THEN
    source_type := 'csv';
  END IF;
  
  -- Insert new template with explicit column names matching the exact schema
  INSERT INTO public.mapping_templates (
    "templateId", 
    "templateName", 
    description, 
    "sourceFileType",
    file_pattern, 
    "sheetMappings", 
    owner_id,
    servicer_id,
    version
  ) VALUES (
    template_id,
    template_name,
    template_description,
    source_type, -- Use the correct value that satisfies the constraint
    file_pattern,
    sheet_mappings,
    user_id,
    servicer_id,
    1  -- Explicit version
  );

  -- Return the template ID
  RETURN template_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION save_mapping_template(TEXT, TEXT, UUID, TEXT, INTEGER, TEXT, JSONB, UUID, UUID) TO authenticated;

-- Refresh schema cache to make function available
SELECT refresh_schema_cache();