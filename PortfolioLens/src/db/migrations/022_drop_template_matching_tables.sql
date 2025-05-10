-- Migration: Drop Template Matching Tables
-- Description: Removes all tables and functions related to template matching, since this feature is deprecated

-- Drop dependent tables first (those with foreign keys)
DROP TABLE IF EXISTS record_tags CASCADE;

-- Drop main tables
DROP TABLE IF EXISTS mapping_templates CASCADE;
DROP TABLE IF EXISTS global_attributes CASCADE;
DROP TABLE IF EXISTS sub_servicer_tags CASCADE;
DROP TABLE IF EXISTS audit_trail CASCADE;

-- Drop related functions
DROP FUNCTION IF EXISTS apply_global_attributes(TEXT, UUID);
DROP FUNCTION IF EXISTS get_records_by_tags(TEXT, UUID[]);
DROP FUNCTION IF EXISTS migrate_legacy_mappings();

-- Comment with note about the tables being removed permanently
COMMENT ON SCHEMA public IS 'Template matching tables (mapping_templates, global_attributes, sub_servicer_tags, record_tags, audit_trail) have been permanently removed. A new approach will be implemented from scratch.';

-- Refresh schema cache to make the changes visible
SELECT refresh_schema_cache();