-- Migration 022: Drop Import System Tables
-- This migration removes all tables, functions, and references related to the import system
-- Created: 2025-05-10

-- Drop policies for import_jobs
DROP POLICY IF EXISTS import_jobs_user_isolation ON import_jobs;

-- Drop policies for import_mappings
DROP POLICY IF EXISTS import_mappings_user_isolation ON import_mappings;

-- Drop indexes
DROP INDEX IF EXISTS idx_import_jobs_user_id;
DROP INDEX IF EXISTS idx_import_jobs_status;
DROP INDEX IF EXISTS idx_import_mappings_user_id;
DROP INDEX IF EXISTS idx_import_mappings_table_name;

-- Drop tables
DROP TABLE IF EXISTS import_jobs;
DROP TABLE IF EXISTS import_mappings;

-- Drop functions
DROP FUNCTION IF EXISTS get_table_info(text);

-- Note: We're keeping get_user_tables function as it might be used by other parts of the system
-- We're keeping module_visibility table as it's part of the user permission system
-- We're keeping is_module_visible function as it's part of the user permission system