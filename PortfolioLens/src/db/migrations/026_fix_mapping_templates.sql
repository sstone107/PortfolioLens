-- Migration: Fix Mapping Templates
-- Description: Enables RLS on mapping_templates and adds compatibility columns
-- to make it work with both the legacy code and the new import system

-- Step 1: Enable RLS on mapping_templates table
ALTER TABLE IF EXISTS public.mapping_templates ENABLE ROW LEVEL SECURITY;

-- Step 2: Add backward compatible policies
-- For SELECT: Everyone can view templates
CREATE POLICY IF NOT EXISTS "mapping_templates_select_policy" 
ON public.mapping_templates
FOR SELECT 
USING (true);

-- For INSERT: Authenticated users can create templates
CREATE POLICY IF NOT EXISTS "mapping_templates_insert_policy" 
ON public.mapping_templates
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- For UPDATE: Users can only update their own templates or admin users can update any
CREATE POLICY IF NOT EXISTS "mapping_templates_update_policy" 
ON public.mapping_templates
FOR UPDATE 
USING (
  (owner_id = auth.uid() OR created_by = auth.uid()::text) OR
  EXISTS (
    SELECT 1 FROM users u 
    JOIN roles r ON u.role_id = r.id 
    WHERE u.id = auth.uid() AND r.name = 'admin'
  )
);

-- For DELETE: Users can only delete their own templates or admin users can delete any
CREATE POLICY IF NOT EXISTS "mapping_templates_delete_policy" 
ON public.mapping_templates
FOR DELETE 
USING (
  (owner_id = auth.uid() OR created_by = auth.uid()::text) OR
  EXISTS (
    SELECT 1 FROM users u 
    JOIN roles r ON u.role_id = r.id 
    WHERE u.id = auth.uid() AND r.name = 'admin'
  )
);

-- Step 3: Update the batch import component to use both field naming conventions
-- by adding a view that maps both naming styles

CREATE OR REPLACE VIEW mapping_templates_view AS
SELECT 
  COALESCE(id, "templateId") AS id,
  "templateId",
  COALESCE(name, "templateName") AS name,
  "templateName",
  description,
  COALESCE(servicer_id, "subservicerId"::uuid) AS servicer_id,
  "subservicerId",
  "createdAt",
  "updatedAt",
  version,
  COALESCE(sheet_mappings, "sheetMappings") AS sheet_mappings,
  "sheetMappings",
  COALESCE(file_pattern, "originalFileNamePattern") AS file_pattern,
  "originalFileNamePattern",
  owner_id,
  created_by
FROM public.mapping_templates;

-- Grant access to the view
GRANT SELECT ON mapping_templates_view TO authenticated;

-- Refresh schema cache to make changes visible
SELECT refresh_schema_cache();