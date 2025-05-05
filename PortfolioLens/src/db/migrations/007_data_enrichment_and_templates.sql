-- Migration: Data Enrichment and Mapping Templates System
-- Description: Adds tables for persistent mapping templates, global attributes, sub-servicer tags, and audit trail

-- Create mapping_templates table for versioned templates
CREATE TABLE IF NOT EXISTS mapping_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  table_name VARCHAR(255) NOT NULL,
  mapping_json JSONB NOT NULL,
  global_attributes JSONB,
  sub_servicer_tags JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL
);

-- Create index for faster template lookups
CREATE INDEX IF NOT EXISTS idx_mapping_templates_table_name ON mapping_templates(table_name);
CREATE INDEX IF NOT EXISTS idx_mapping_templates_name_version ON mapping_templates(name, version);
CREATE INDEX IF NOT EXISTS idx_mapping_templates_active ON mapping_templates(is_active);

-- Create global_attributes table for batch-level data characteristics
CREATE TABLE IF NOT EXISTS global_attributes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  attributes JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL
);

-- Create sub_servicer_tags table for applying metadata across import batches
CREATE TABLE IF NOT EXISTS sub_servicer_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  attributes JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create record_tags table to associate records with sub-servicer tags
CREATE TABLE IF NOT EXISTS record_tags (
  record_id UUID NOT NULL,
  tag_id UUID NOT NULL REFERENCES sub_servicer_tags(id) ON DELETE CASCADE,
  table_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (record_id, tag_id, table_name)
);

-- Create index for faster tag lookups
CREATE INDEX IF NOT EXISTS idx_record_tags_tag_id ON record_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_record_tags_table_name ON record_tags(table_name);

-- Create audit_trail table for data provenance
CREATE TABLE IF NOT EXISTS audit_trail (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_job_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  description TEXT,
  metadata JSONB,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id VARCHAR(255) NOT NULL
);

-- Create index for faster audit trail lookups
CREATE INDEX IF NOT EXISTS idx_audit_trail_import_job_id ON audit_trail(import_job_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON audit_trail(timestamp);

-- Add global_attributes column to all tables that might need it
DO $$
DECLARE
  table_rec RECORD;
BEGIN
  FOR table_rec IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    AND table_name NOT IN ('mapping_templates', 'global_attributes', 'sub_servicer_tags', 'record_tags', 'audit_trail')
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS global_attributes JSONB', table_rec.table_name);
  END LOOP;
END $$;

-- Function to apply global attributes to a table
CREATE OR REPLACE FUNCTION apply_global_attributes(
  p_table_name TEXT,
  p_attribute_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_attributes JSONB;
BEGIN
  -- Get the attributes
  SELECT attributes INTO v_attributes
  FROM global_attributes
  WHERE id = p_attribute_id;
  
  IF v_attributes IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Apply attributes to the table
  EXECUTE format('
    UPDATE %I
    SET global_attributes = %L,
        updated_at = CURRENT_TIMESTAMP
  ', p_table_name, v_attributes);
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error applying global attributes: %', SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to get records by tags
CREATE OR REPLACE FUNCTION get_records_by_tags(
  p_table_name TEXT,
  p_tag_ids UUID[]
) RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT record_id
  FROM record_tags
  WHERE table_name = p_table_name
  AND tag_id = ANY(p_tag_ids);
END;
$$ LANGUAGE plpgsql;

-- Refresh schema cache to make new tables available
SELECT refresh_schema_cache();