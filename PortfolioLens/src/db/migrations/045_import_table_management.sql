-- Migration: Add table and column management functions for imports
-- This provides safe, controlled table/column creation without exec_sql

-- Function to create a table for imports
CREATE OR REPLACE FUNCTION public.create_import_table(
    p_table_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Validate table name (alphanumeric and underscores only)
    IF p_table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid table name. Use only letters, numbers, and underscores.'
        );
    END IF;
    
    -- Check if table already exists
    IF EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = p_table_name
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Table already exists',
            'table', p_table_name
        );
    END IF;
    
    -- Create the table
    EXECUTE format('
        CREATE TABLE public.%I (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            import_job_id UUID REFERENCES import_jobs(id),
            import_row_number INTEGER
        )', p_table_name);
    
    -- Enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table_name);
    
    -- Create RLS policy for viewing
    EXECUTE format('
        CREATE POLICY "Users can view their imported data" ON public.%I
        FOR SELECT USING (
            import_job_id IN (
                SELECT id FROM import_jobs WHERE user_id = auth.uid()
            )
        )', p_table_name);
    
    -- Grant permissions to authenticated users
    EXECUTE format('GRANT ALL ON public.%I TO authenticated', p_table_name);
    
    RETURN jsonb_build_object(
        'success', true,
        'table', p_table_name,
        'message', 'Table created successfully'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Function to add a column to a table
CREATE OR REPLACE FUNCTION public.add_import_column(
    p_table_name text,
    p_column_name text,
    p_data_type text DEFAULT 'text'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_safe_type text;
BEGIN
    -- Validate table name
    IF p_table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid table name'
        );
    END IF;
    
    -- Validate column name
    IF p_column_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid column name'
        );
    END IF;
    
    -- Check if table exists
    IF NOT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = p_table_name
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Table does not exist'
        );
    END IF;
    
    -- Check if column already exists
    IF EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = p_table_name
        AND column_name = p_column_name
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Column already exists',
            'column', p_column_name
        );
    END IF;
    
    -- Map data type to safe PostgreSQL type
    v_safe_type := CASE lower(p_data_type)
        WHEN 'text' THEN 'TEXT'
        WHEN 'varchar' THEN 'TEXT'
        WHEN 'string' THEN 'TEXT'
        WHEN 'numeric' THEN 'NUMERIC'
        WHEN 'decimal' THEN 'NUMERIC'
        WHEN 'integer' THEN 'INTEGER'
        WHEN 'int' THEN 'INTEGER'
        WHEN 'bigint' THEN 'BIGINT'
        WHEN 'boolean' THEN 'BOOLEAN'
        WHEN 'bool' THEN 'BOOLEAN'
        WHEN 'date' THEN 'DATE'
        WHEN 'timestamp' THEN 'TIMESTAMP WITH TIME ZONE'
        WHEN 'timestamptz' THEN 'TIMESTAMP WITH TIME ZONE'
        WHEN 'json' THEN 'JSONB'
        WHEN 'jsonb' THEN 'JSONB'
        ELSE 'TEXT'
    END;
    
    -- Add the column
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s', 
        p_table_name, p_column_name, v_safe_type);
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Column added successfully',
        'table', p_table_name,
        'column', p_column_name,
        'type', v_safe_type
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Function to add multiple columns at once (batch operation)
CREATE OR REPLACE FUNCTION public.add_import_columns_batch(
    p_table_name text,
    p_columns jsonb -- Array of {name: string, type: string}
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_column jsonb;
    v_results jsonb := '[]'::jsonb;
    v_result jsonb;
BEGIN
    -- Validate table exists
    IF NOT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = p_table_name
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Table does not exist'
        );
    END IF;
    
    -- Add each column
    FOR v_column IN SELECT * FROM jsonb_array_elements(p_columns)
    LOOP
        v_result := add_import_column(
            p_table_name,
            v_column->>'name',
            COALESCE(v_column->>'type', 'text')
        );
        v_results := v_results || v_result;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'results', v_results
    );
END;
$$;

-- Function to ensure import tracking columns exist
CREATE OR REPLACE FUNCTION public.ensure_import_tracking_columns(
    p_table_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_results jsonb := '[]'::jsonb;
BEGIN
    -- Add import_job_id if missing
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = p_table_name
        AND column_name = 'import_job_id'
    ) THEN
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN import_job_id UUID REFERENCES import_jobs(id)', p_table_name);
        v_results := v_results || jsonb_build_object('column', 'import_job_id', 'added', true);
    END IF;
    
    -- Add import_row_number if missing
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = p_table_name
        AND column_name = 'import_row_number'
    ) THEN
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN import_row_number INTEGER', p_table_name);
        v_results := v_results || jsonb_build_object('column', 'import_row_number', 'added', true);
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'changes', v_results
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Grant execute permissions to service_role (for Edge Functions)
GRANT EXECUTE ON FUNCTION public.create_import_table TO service_role;
GRANT EXECUTE ON FUNCTION public.add_import_column TO service_role;
GRANT EXECUTE ON FUNCTION public.add_import_columns_batch TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_import_tracking_columns TO service_role;

-- Also grant to authenticated for testing/admin use
GRANT EXECUTE ON FUNCTION public.create_import_table TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_import_column TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_import_columns_batch TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_import_tracking_columns TO authenticated;