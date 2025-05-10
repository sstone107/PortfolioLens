-- Migration: Extend Mapping Templates
-- Description: Adds servicer_id, file_pattern, and sheet_mappings columns to the mapping_templates table
-- to enhance template matching capabilities and support servicer-specific configuration

-- Add the new columns to the mapping_templates table
ALTER TABLE mapping_templates
  ADD COLUMN IF NOT EXISTS servicer_id UUID REFERENCES servicers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_pattern TEXT,
  ADD COLUMN IF NOT EXISTS sheet_mappings JSONB;

-- Create index for faster servicer-based template lookups
CREATE INDEX IF NOT EXISTS idx_mapping_templates_servicer_id ON mapping_templates(servicer_id);

-- Comment on new columns to provide documentation
COMMENT ON COLUMN mapping_templates.servicer_id IS 'Optional reference to a servicer to make template servicer-specific';
COMMENT ON COLUMN mapping_templates.file_pattern IS 'Optional regex pattern to match against filenames for automatic template selection';
COMMENT ON COLUMN mapping_templates.sheet_mappings IS 'JSON configuration for Excel sheet mappings, including sheet names and table relations';

-- Down migration (for rollback if needed)
-- Can be executed using:
-- ALTER TABLE mapping_templates
--   DROP COLUMN IF EXISTS servicer_id,
--   DROP COLUMN IF EXISTS file_pattern,
--   DROP COLUMN IF EXISTS sheet_mappings;
-- DROP INDEX IF EXISTS idx_mapping_templates_servicer_id;

-- Refresh schema cache to make column changes available
SELECT refresh_schema_cache();