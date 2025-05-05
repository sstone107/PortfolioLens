-- PortfolioLens Excel Import System
-- Migration script to create tables for dynamic Excel import functionality
-- Created: 2025-05-01

-- Import Jobs table to track data import processes
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

-- Import Mappings table to save column mapping templates
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

-- Add indexes
CREATE INDEX IF NOT EXISTS "idx_import_jobs_user_id" ON "import_jobs" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_import_jobs_status" ON "import_jobs" ("status");
CREATE INDEX IF NOT EXISTS "idx_import_mappings_user_id" ON "import_mappings" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_import_mappings_table_name" ON "import_mappings" ("table_name");

-- Create helper function to get user tables
CREATE OR REPLACE FUNCTION get_user_tables()
RETURNS TABLE (table_name text) AS $$
BEGIN
    RETURN QUERY 
    SELECT t.table_name::text
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name NOT IN ('import_jobs', 'import_mappings')
    ORDER BY t.table_name;
END;
$$ LANGUAGE plpgsql;

-- Create helper function to get table info
CREATE OR REPLACE FUNCTION get_table_info(table_name text)
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'tableName', table_name,
        'columns', (
            SELECT json_agg(
                json_build_object(
                    'columnName', c.column_name,
                    'dataType', c.data_type,
                    'isNullable', c.is_nullable = 'YES',
                    'columnDefault', c.column_default,
                    'isPrimaryKey', (
                        SELECT count(*) > 0
                        FROM information_schema.table_constraints tc
                        JOIN information_schema.constraint_column_usage ccu 
                        ON tc.constraint_name = ccu.constraint_name
                        WHERE tc.table_schema = c.table_schema
                        AND tc.table_name = c.table_name
                        AND tc.constraint_type = 'PRIMARY KEY'
                        AND ccu.column_name = c.column_name
                    ),
                    'description', col_description(
                        (c.table_schema || '.' || c.table_name)::regclass::oid, 
                        ordinal_position
                    )
                )
            )
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
            AND c.table_name = table_name
            ORDER BY c.ordinal_position
        )
    ) INTO result
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
    AND t.table_name = table_name
    LIMIT 1;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_mappings ENABLE ROW LEVEL SECURITY;

-- Create policies for import_jobs
CREATE POLICY import_jobs_user_isolation ON import_jobs
    USING (user_id = auth.uid());

-- Create policies for import_mappings
CREATE POLICY import_mappings_user_isolation ON import_mappings
    USING (user_id = auth.uid());
