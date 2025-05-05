-- PortfolioLens Schema Cache Refresh Function
-- Created: 2025-05-02
-- Provides functions to refresh schema cache and add columns with cache invalidation

-- Ensure we have a table to store column information
CREATE TABLE IF NOT EXISTS columns_list (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  data_type TEXT NOT NULL,
  is_nullable BOOLEAN DEFAULT true,
  column_default TEXT,
  is_primary_key BOOLEAN DEFAULT false,
  ordinal_position INTEGER NOT NULL,
  UNIQUE(table_name, column_name)
);

-- Function to refresh the database schema cache
CREATE OR REPLACE FUNCTION refresh_schema_cache() 
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Force a schema refresh by explicitly rebuilding system catalog tables
  -- This affects the information_schema views that Supabase uses for its schema cache
  -- Notify PostgREST to reload the schema cache
  PERFORM pg_notify('pgrst', 'reload schema');

  -- Update our local tables_list table for client-side access
  EXECUTE 'TRUNCATE TABLE tables_list';
  EXECUTE 'INSERT INTO tables_list (table_name) 
           SELECT table_name 
           FROM information_schema.tables 
           WHERE table_schema = ''public'' 
             AND table_type = ''BASE TABLE''
             AND table_name NOT LIKE ''pg_%''
             AND table_name NOT LIKE ''_pg_%''
           ORDER BY table_name';
           
  -- Also update our columns_list cache for fast column metadata access
  EXECUTE 'TRUNCATE TABLE columns_list';
  EXECUTE 'INSERT INTO columns_list 
           (table_name, column_name, data_type, is_nullable, column_default, is_primary_key, ordinal_position) 
           SELECT 
             c.table_name, 
             c.column_name, 
             c.data_type,
             c.is_nullable::text = ''YES'' as is_nullable,
             c.column_default,
             CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
             c.ordinal_position
           FROM information_schema.columns c
           LEFT JOIN (
             SELECT kcu.column_name, kcu.table_name
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu 
               ON kcu.constraint_name = tc.constraint_name 
               AND kcu.constraint_schema = tc.constraint_schema
             WHERE tc.constraint_type = ''PRIMARY KEY'' 
               AND tc.table_schema = ''public''
           ) pk ON pk.column_name = c.column_name AND pk.table_name = c.table_name
           WHERE c.table_schema = ''public''
             AND c.table_name IN (SELECT table_name FROM tables_list)
           ORDER BY c.table_name, c.ordinal_position';
  
  RETURN true;
END;
$$;

-- Function to add a column to a table and refresh schema cache
CREATE OR REPLACE FUNCTION add_column_with_cache_refresh(
  p_table_name text,
  p_column_name text,
  p_column_type text
) 
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  column_exists boolean;
  columns_added boolean := false;
BEGIN
  -- Check if column exists
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  ) INTO column_exists;

  -- If column doesn't exist, add it
  IF NOT column_exists THEN
    BEGIN
      EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', 
                     p_table_name, p_column_name, p_column_type);
      columns_added := true;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error adding column %: %', p_column_name, SQLERRM;
      RETURN false;
    END;
  END IF;

  -- Refresh the schema cache if we added columns
  IF columns_added THEN
    PERFORM refresh_schema_cache();
  END IF;

  RETURN true;
END;
$$;

-- Function to create multiple columns in a table at once with a single cache refresh
CREATE OR REPLACE FUNCTION add_columns_batch(
  p_table_name text,
  p_columns jsonb
) 
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  column_rec record;
  result jsonb := '[]'::jsonb;
  alter_statements text := '';
  any_columns_added boolean := false;
  column_name text;
  column_type text;
BEGIN
  -- Process each column
  FOR column_rec IN SELECT * FROM jsonb_array_elements(p_columns)
  LOOP
    column_name := column_rec.value->>'name';
    column_type := column_rec.value->>'type';
    
    -- Check if column already exists
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = p_table_name
        AND column_name = column_name
    ) THEN
      -- Build ALTER TABLE statement for this column
      alter_statements := alter_statements || format('ADD COLUMN IF NOT EXISTS %I %s, ', 
                                                    column_name, column_type);
      any_columns_added := true;
      
      -- Add to result
      result := result || jsonb_build_object(
        'name', column_name,
        'type', column_type,
        'added', true
      );
    ELSE
      -- Column already exists, add to result
      result := result || jsonb_build_object(
        'name', column_name,
        'type', column_type,
        'added', false
      );
    END IF;
  END LOOP;
  
  -- Execute the ALTER TABLE if we have statements to run
  IF length(alter_statements) > 0 THEN
    -- Remove trailing comma and space
    alter_statements := substring(alter_statements, 1, length(alter_statements) - 2);
    
    -- Execute the combined ALTER TABLE
    BEGIN
      EXECUTE format('ALTER TABLE %I %s', p_table_name, alter_statements);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error adding columns: %', SQLERRM;
      -- Return error in the result
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'columns', result
      );
    END;
  END IF;
  
  -- Refresh schema cache if any columns were added
  IF any_columns_added THEN
    PERFORM refresh_schema_cache();
  END IF;
  
  -- Return success result
  RETURN jsonb_build_object(
    'success', true,
    'columns', result
  );
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION refresh_schema_cache() TO authenticated;
GRANT EXECUTE ON FUNCTION add_column_with_cache_refresh(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION add_columns_batch(text, jsonb) TO authenticated;

-- Make sure tables_list exists for caching table names
CREATE TABLE IF NOT EXISTS tables_list (
  table_name text PRIMARY KEY,
  updated_at timestamp DEFAULT now()
);
