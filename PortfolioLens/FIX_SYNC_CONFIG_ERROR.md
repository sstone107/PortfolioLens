# Fix Google Drive Sync Configuration Error

## Issue
The Edge Function is failing with error: "column c.sync_from_date does not exist"

## Solution

### Option 1: Run Migration via Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Create a new query and paste this SQL:

```sql
-- Fix missing columns in google_drive_sync_config table
ALTER TABLE google_drive_sync_config 
ADD COLUMN IF NOT EXISTS sync_from_date DATE,
ADD COLUMN IF NOT EXISTS sync_only_recent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS max_depth INTEGER DEFAULT 5;

-- Recreate the function with all required fields
DROP FUNCTION IF EXISTS get_active_sync_configs();

CREATE FUNCTION get_active_sync_configs()
RETURNS TABLE (
  id UUID,
  folder_id TEXT,
  folder_name TEXT,
  template_id UUID,
  template_name TEXT,
  file_pattern TEXT,
  enabled BOOLEAN,
  include_subfolders BOOLEAN,
  last_sync_at TIMESTAMPTZ,
  sync_from_date DATE,
  sync_only_recent BOOLEAN,
  max_depth INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.folder_id,
    c.folder_name,
    c.template_id,
    t.name as template_name,
    COALESCE(c.file_pattern, t.file_pattern) as file_pattern,
    c.enabled,
    c.include_subfolders,
    c.last_sync_at,
    c.sync_from_date,
    c.sync_only_recent,
    c.max_depth
  FROM google_drive_sync_config c
  JOIN mapping_templates t ON t."templateId" = c.template_id
  WHERE c.enabled = true
  ORDER BY c.created_at DESC;
END;
$$;
```

4. Click "Run" to execute the migration

### Option 2: Add Service Role Key to .env and Run Script

1. Add your Supabase service role key to `.env`:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

2. Run the migration script:
   ```bash
   cd PortfolioLens
   node scripts/fix-sync-columns.js
   ```

### Option 3: Manual Fix Using exec_sql

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Run this command:
   ```sql
   SELECT exec_sql($SQL$
   -- Fix missing columns in google_drive_sync_config table
   ALTER TABLE google_drive_sync_config 
   ADD COLUMN IF NOT EXISTS sync_from_date DATE,
   ADD COLUMN IF NOT EXISTS sync_only_recent BOOLEAN DEFAULT false,
   ADD COLUMN IF NOT EXISTS max_depth INTEGER DEFAULT 5;
   $SQL$);
   ```

4. Then run:
   ```sql
   SELECT exec_sql($SQL$
   -- Recreate the function
   DROP FUNCTION IF EXISTS get_active_sync_configs();
   
   CREATE FUNCTION get_active_sync_configs()
   RETURNS TABLE (
     id UUID,
     folder_id TEXT,
     folder_name TEXT,
     template_id UUID,
     template_name TEXT,
     file_pattern TEXT,
     enabled BOOLEAN,
     include_subfolders BOOLEAN,
     last_sync_at TIMESTAMPTZ,
     sync_from_date DATE,
     sync_only_recent BOOLEAN,
     max_depth INTEGER
   )
   LANGUAGE plpgsql
   SECURITY DEFINER
   AS $$
   BEGIN
     RETURN QUERY
     SELECT 
       c.id,
       c.folder_id,
       c.folder_name,
       c.template_id,
       t.name as template_name,
       COALESCE(c.file_pattern, t.file_pattern) as file_pattern,
       c.enabled,
       c.include_subfolders,
       c.last_sync_at,
       c.sync_from_date,
       c.sync_only_recent,
       c.max_depth
     FROM google_drive_sync_config c
     JOIN mapping_templates t ON t."templateId" = c.template_id
     WHERE c.enabled = true
     ORDER BY c.created_at DESC;
   END;
   $$;
   $SQL$);
   ```

## After Running the Migration

1. Test the pattern search again - it should now work
2. The search will be limited by the max_depth setting (1-5 levels)
3. Setting max_depth to 1 will only search immediate subfolders