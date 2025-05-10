# Template Mapping Tables Migration Plan

## Current Situation

The application currently has several tables related to mapping templates:

1. **mapping_templates** (from 007_data_enrichment_and_templates.sql)
   ```sql
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
   ```

2. **import_mappings** (legacy, from 002_import_system.sql)
   ```sql
   CREATE TABLE IF NOT EXISTS "import_mappings" (
     "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     "name" VARCHAR(100) NOT NULL,
     "user_id" UUID NOT NULL,
     "table_name" VARCHAR(100) NOT NULL,
     "mapping" JSONB NOT NULL,
     "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     FOREIGN KEY ("user_id") REFERENCES "users" ("id")
   );
   ```

3. **import_jobs** (tracks import processes, from 002_import_system.sql)
   ```sql
   CREATE TABLE IF NOT EXISTS "import_jobs" (
     "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     "user_id" UUID NOT NULL,
     "file_name" VARCHAR(255) NOT NULL,
     "table_name" VARCHAR(100) NOT NULL,
     "sheet_name" VARCHAR(100) NOT NULL,
     "mapping" JSONB NOT NULL,
     "status" VARCHAR(20) NOT NULL,
     "total_rows" INTEGER NOT NULL,
     "processed_rows" INTEGER NOT NULL DEFAULT 0,
     "error_message" TEXT,
     "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     FOREIGN KEY ("user_id") REFERENCES "users" ("id")
   );
   ```

## Recent Changes

We have enhanced the `mapping_templates` table with the following new columns:

```sql
ALTER TABLE mapping_templates
  ADD COLUMN IF NOT EXISTS servicer_id UUID REFERENCES servicers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_pattern TEXT,
  ADD COLUMN IF NOT EXISTS sheet_mappings JSONB;
```

These improvements allow for:
1. Associating templates with specific servicers
2. Capturing file name patterns for template matching
3. Storing detailed sheet mappings including skipped sheets

## Migration Plan

### 1. Data Analysis

First, analyze existing data in the legacy tables:

```sql
SELECT COUNT(*) FROM import_mappings;
SELECT COUNT(*) FROM mapping_templates;
```

### 2. Data Migration

Migrate relevant data from `import_mappings` to `mapping_templates`:

```sql
-- Step 1: Identify needed data from import_mappings
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
  u.email,  -- Use email as created_by
  im.created_at,
  im.updated_at,
  json_build_object(
    'sheets', json_build_array(
      json_build_object(
        'sheetName', im.table_name,
        'action', 'map',
        'targetTable', im.table_name,
        'columns', '[]'::jsonb
      )
    )
  )
FROM import_mappings im
JOIN users u ON im.user_id = u.id
WHERE NOT EXISTS (
  -- Skip if already migrated (by name and table)
  SELECT 1 FROM mapping_templates mt 
  WHERE mt.name = im.name AND mt.table_name = im.table_name
);
```

### 3. Validation

Verify that migration was successful:

```sql
-- Count records in each table
SELECT 'import_mappings' as table_name, COUNT(*) FROM import_mappings
UNION ALL
SELECT 'mapping_templates' as table_name, COUNT(*) FROM mapping_templates;

-- Verify a sample of records were correctly migrated
WITH sample_import AS (
  SELECT id, name, table_name FROM import_mappings LIMIT 5
)
SELECT 
  si.id as import_mapping_id, 
  si.name, 
  si.table_name,
  mt.id as mapping_template_id,
  mt.name as migrated_name,
  mt.table_name as migrated_table_name
FROM sample_import si
LEFT JOIN mapping_templates mt ON si.name = mt.name AND si.table_name = mt.table_name;
```

### 4. Application Updates

1. Update all references to `import_mappings` in the codebase
2. Update UI components to use the new `mapping_templates` schema
3. Remove deprecated code paths

### 5. Deprecation Plan

Once the migration is confirmed successful:

1. Mark the legacy tables as deprecated (add comment to tables)
2. Update documentation to reflect the change
3. Plan for eventual removal in a future version

```sql
-- Add deprecation notice to legacy tables
COMMENT ON TABLE import_mappings IS 'DEPRECATED: This table is superseded by mapping_templates. Scheduled for removal in version X.Y.';
```

### 6. Rollback Plan

If issues are encountered:

1. Keep both systems running in parallel initially
2. Have a script ready to roll back changes if needed
3. Monitor system for issues after migration

## Final State

After migration, we will have a single source of truth for mapping templates:

1. **mapping_templates**: The sole table for storing mapping templates, with enhanced functionality:
   - Support for servicer-specific templates
   - File pattern matching
   - Comprehensive sheet mappings (including skipped sheets)
   - Versioning and active status tracking

2. Legacy tables (**import_mappings**) will be documented as deprecated and eventually removed in a future version.