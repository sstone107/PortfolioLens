-- Migration: Deprecate Legacy Mapping Tables
-- Description: Marks legacy import_mappings table as deprecated in favor of mapping_templates

-- Add deprecation comments to legacy tables
COMMENT ON TABLE import_mappings IS 'DEPRECATED: This table is superseded by mapping_templates with enhanced servicer support and sheet mappings. Scheduled for removal in next major version.';

-- Create migration function to move data from import_mappings to mapping_templates
-- Can be called manually after confirming migration is desired
CREATE OR REPLACE FUNCTION migrate_legacy_mappings()
RETURNS INTEGER AS $$
DECLARE
    migrated_count INTEGER := 0;
BEGIN
    -- Step 1: Identify needed data from import_mappings and migrate
    INSERT INTO mapping_templates (
        name,
        description, 
        table_name,
        mapping_json,
        created_by,
        created_at,
        updated_at,
        sheet_mappings  -- New field
    )
    SELECT 
        im.name,
        'Migrated from import_mappings: ' || im.name,
        im.table_name,
        im.mapping,
        COALESCE((SELECT email FROM users WHERE id = im.user_id), 'system'),
        im.created_at,
        im.updated_at,
        jsonb_build_object(
            'sheets', jsonb_build_array(
                jsonb_build_object(
                    'sheetName', im.table_name,
                    'action', 'map',
                    'targetTable', im.table_name,
                    'columns', '[]'::jsonb
                )
            )
        )
    FROM import_mappings im
    WHERE NOT EXISTS (
        -- Skip if already migrated (by name and table)
        SELECT 1 FROM mapping_templates mt 
        WHERE mt.name = im.name AND mt.table_name = im.table_name
    );
    
    -- Get the number of migrated records
    GET DIAGNOSTICS migrated_count = ROW_COUNT;
    
    -- Return the number of migrated records
    RETURN migrated_count;
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining the migration function
COMMENT ON FUNCTION migrate_legacy_mappings() IS 'Function to migrate data from legacy import_mappings table to enhanced mapping_templates table. Returns count of migrated records.';

-- Note: The function can be called manually using:
-- SELECT migrate_legacy_mappings();
-- after confirming that migration is desired.

-- Refresh schema cache to make changes available
SELECT refresh_schema_cache();