-- Fix loan_id mapping for imports
-- This migration adds a function to derive loan_id from loan number columns

-- Create function to get or create loan_id from loan number
CREATE OR REPLACE FUNCTION public.get_or_create_loan_id(
    p_loan_number text,
    p_seller_loan_number text DEFAULT NULL,
    p_current_servicer_loan_number text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_loan_id uuid;
    v_loan_number text;
BEGIN
    -- Determine which loan number to use
    v_loan_number := COALESCE(p_loan_number, p_seller_loan_number, p_current_servicer_loan_number);
    
    IF v_loan_number IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Try to find existing loan by loan_number
    SELECT id INTO v_loan_id
    FROM loans
    WHERE loan_number = v_loan_number
    LIMIT 1;
    
    -- If not found, create a new loan record
    IF v_loan_id IS NULL THEN
        INSERT INTO loans (loan_number, created_at, updated_at)
        VALUES (v_loan_number, NOW(), NOW())
        RETURNING id INTO v_loan_id;
    END IF;
    
    RETURN v_loan_id;
END;
$$;

-- Update the add_import_columns_batch function to handle loan_id specially
CREATE OR REPLACE FUNCTION public.add_import_columns_batch(
    p_table_name text,
    p_columns jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_column jsonb;
    v_column_name text;
    v_data_type text;
    v_query text;
    v_results jsonb := '[]'::jsonb;
    v_result jsonb;
    v_table_exists boolean;
    v_column_exists boolean;
    v_has_loan_id boolean := false;
    v_loan_number_columns text[] := ARRAY[]::text[];
BEGIN
    -- Validate table name
    IF NOT p_table_name ~ '^[a-z_][a-z0-9_]*$' OR p_table_name ~ '__' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid table name'
        );
    END IF;
    
    -- Check if table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = p_table_name
    ) INTO v_table_exists;
    
    IF NOT v_table_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Table does not exist'
        );
    END IF;
    
    -- Check if table already has loan_id column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = p_table_name
        AND column_name = 'loan_id'
    ) INTO v_has_loan_id;
    
    -- Process each column
    FOR v_column IN SELECT * FROM jsonb_array_elements(p_columns)
    LOOP
        v_column_name := v_column->>'name';
        v_data_type := COALESCE(v_column->>'type', 'text');
        
        -- Skip if column name is invalid
        IF NOT v_column_name ~ '^[a-z_][a-z0-9_]*$' OR v_column_name ~ '__' THEN
            v_result := jsonb_build_object(
                'column', v_column_name,
                'success', false,
                'error', 'Invalid column name'
            );
            v_results := v_results || jsonb_build_array(v_result);
            CONTINUE;
        END IF;
        
        -- Track potential loan number columns
        IF v_column_name IN ('loan_number', 'seller_loan_number', 'current_servicer_loan_number') THEN
            v_loan_number_columns := array_append(v_loan_number_columns, v_column_name);
        END IF;
        
        -- Skip if column already exists
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = p_table_name
            AND column_name = v_column_name
        ) INTO v_column_exists;
        
        IF v_column_exists THEN
            v_result := jsonb_build_object(
                'column', v_column_name,
                'success', true,
                'message', 'Column already exists'
            );
            v_results := v_results || jsonb_build_array(v_result);
            CONTINUE;
        END IF;
        
        -- Validate data type
        IF v_data_type NOT IN ('text', 'numeric', 'integer', 'boolean', 'timestamp', 'date', 'json', 'jsonb', 'uuid') THEN
            v_data_type := 'text';
        END IF;
        
        -- Add the column
        BEGIN
            v_query := format('ALTER TABLE %I ADD COLUMN %I %s', p_table_name, v_column_name, v_data_type);
            EXECUTE v_query;
            
            v_result := jsonb_build_object(
                'column', v_column_name,
                'success', true
            );
        EXCEPTION WHEN OTHERS THEN
            v_result := jsonb_build_object(
                'column', v_column_name,
                'success', false,
                'error', SQLERRM
            );
        END;
        
        v_results := v_results || jsonb_build_array(v_result);
    END LOOP;
    
    -- If table needs loan_id and has loan number columns, add computed column
    IF v_has_loan_id AND array_length(v_loan_number_columns, 1) > 0 AND p_table_name LIKE 'ln_%' THEN
        -- Add a generated column for loan_id based on available loan numbers
        BEGIN
            -- First ensure the loan number columns exist
            v_query := format(
                'ALTER TABLE %I ADD COLUMN IF NOT EXISTS computed_loan_id uuid GENERATED ALWAYS AS (
                    get_or_create_loan_id(%s)
                ) STORED',
                p_table_name,
                array_to_string(
                    ARRAY(SELECT format('COALESCE(%I, NULL)', col) FROM unnest(v_loan_number_columns) AS col),
                    ', '
                )
            );
            -- Note: PostgreSQL doesn't support calling functions in generated columns
            -- So we'll need a different approach
        EXCEPTION WHEN OTHERS THEN
            -- Ignore if this fails
        END;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'results', v_results
    );
END;
$$;

-- Create trigger function to auto-populate loan_id
CREATE OR REPLACE FUNCTION public.auto_populate_loan_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_loan_number text;
BEGIN
    -- Only process if loan_id is null
    IF NEW.loan_id IS NOT NULL THEN
        RETURN NEW;
    END IF;
    
    -- Try to get loan number from various possible columns
    v_loan_number := COALESCE(
        CASE WHEN TG_TABLE_NAME = 'ln_loan_information' THEN NEW.loan_number ELSE NULL END,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = TG_TABLE_NAME AND column_name = 'seller_loan_number') 
             THEN row_to_json(NEW)->>'seller_loan_number' ELSE NULL END,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = TG_TABLE_NAME AND column_name = 'current_servicer_loan_number') 
             THEN row_to_json(NEW)->>'current_servicer_loan_number' ELSE NULL END,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = TG_TABLE_NAME AND column_name = 'loan_number') 
             THEN row_to_json(NEW)->>'loan_number' ELSE NULL END
    );
    
    IF v_loan_number IS NOT NULL THEN
        NEW.loan_id := get_or_create_loan_id(v_loan_number);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Add triggers to all ln_* tables to auto-populate loan_id
DO $$
DECLARE
    v_table_name text;
BEGIN
    FOR v_table_name IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE 'ln_%'
        AND EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = tables.table_name 
            AND column_name = 'loan_id'
        )
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS auto_populate_loan_id_trigger ON %I;
            CREATE TRIGGER auto_populate_loan_id_trigger
            BEFORE INSERT ON %I
            FOR EACH ROW
            EXECUTE FUNCTION auto_populate_loan_id();
        ', v_table_name, v_table_name);
    END LOOP;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_loan_id(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_populate_loan_id() TO authenticated;