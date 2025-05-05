-- Fix for add_columns_batch function to resolve ambiguous column reference
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
  col_name text;
  col_type text;
BEGIN
  -- Process each column
  FOR column_rec IN SELECT * FROM jsonb_array_elements(p_columns)
  LOOP
    col_name := column_rec.value->>'name';
    col_type := column_rec.value->>'type';
    
    -- Check if column already exists - FIXED: use different variable name to avoid ambiguity
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = p_table_name
        AND column_name = col_name -- FIXED: use col_name instead of column_name
    ) THEN
      -- Build ALTER TABLE statement for this column
      alter_statements := alter_statements || format('ADD COLUMN IF NOT EXISTS %I %s, ', 
                                                   col_name, col_type);
      any_columns_added := true;
      
      -- Add to result
      result := result || jsonb_build_object(
        'name', col_name,
        'type', col_type,
        'added', true
      );
    ELSE
      -- Column already exists, add to result
      result := result || jsonb_build_object(
        'name', col_name,
        'type', col_type,
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION add_columns_batch(text, jsonb) TO authenticated;