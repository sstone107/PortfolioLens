-- Remove the problematic auto_populate_loan_id trigger that's causing errors
-- The trigger fails because it tries to access NEW.loan_number on tables that don't have that column

-- Drop all the triggers
DO $$
DECLARE
    v_table_name text;
BEGIN
    FOR v_table_name IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE 'ln_%'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS auto_populate_loan_id_trigger ON %I', v_table_name);
    END LOOP;
END;
$$;

-- Drop the trigger function
DROP FUNCTION IF EXISTS public.auto_populate_loan_id();

-- Update the get_or_create_loan_id function to prioritize investor_loan_number
CREATE OR REPLACE FUNCTION public.get_or_create_loan_id(
    p_investor_loan_number text DEFAULT NULL,
    p_seller_loan_number text DEFAULT NULL,
    p_current_servicer_loan_number text DEFAULT NULL,
    p_loan_number text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_loan_id uuid;
    v_loan_number text;
BEGIN
    -- Determine which loan number to use (prioritize investor_loan_number)
    v_loan_number := COALESCE(
        NULLIF(TRIM(p_investor_loan_number), ''),
        NULLIF(TRIM(p_seller_loan_number), ''),
        NULLIF(TRIM(p_current_servicer_loan_number), ''),
        NULLIF(TRIM(p_loan_number), '')
    );
    
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_loan_id(text, text, text, text) TO authenticated;