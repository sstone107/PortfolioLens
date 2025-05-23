-- Fix loan number column types by handling the dependent view

-- 1. Save the view definition
CREATE OR REPLACE FUNCTION save_view_definition() RETURNS TEXT AS $$
DECLARE
    view_def TEXT;
BEGIN
    SELECT pg_get_viewdef('loan_information', true) INTO view_def;
    RETURN view_def;
END;
$$ LANGUAGE plpgsql;

-- Store the view definition
DO $$
DECLARE
    saved_view TEXT;
BEGIN
    saved_view := save_view_definition();
    RAISE NOTICE 'View definition saved: %', saved_view;
END $$;

-- 2. Drop the view
DROP VIEW IF EXISTS public.loan_information CASCADE;

-- 3. Fix the column types in ln_loan_information
ALTER TABLE public.ln_loan_information 
ALTER COLUMN loan_number TYPE TEXT USING loan_number::TEXT,
ALTER COLUMN investor_loan_number TYPE TEXT USING investor_loan_number::TEXT,
ALTER COLUMN seller_loan_number TYPE TEXT USING seller_loan_number::TEXT,
ALTER COLUMN current_servicer_loan_number TYPE TEXT USING current_servicer_loan_number::TEXT,
ALTER COLUMN valon_loan_id TYPE TEXT USING valon_loan_id::TEXT,
ALTER COLUMN previous_servicer_loan_id TYPE TEXT USING previous_servicer_loan_id::TEXT,
ALTER COLUMN mers_id TYPE TEXT USING mers_id::TEXT;

-- 4. Recreate the view (it's likely a simple view over ln_loan_information)
CREATE OR REPLACE VIEW public.loan_information AS 
SELECT * FROM public.ln_loan_information;

-- 5. Grant permissions on the view
GRANT SELECT ON public.loan_information TO authenticated;
GRANT SELECT ON public.loan_information TO service_role;

-- 6. Clean up
DROP FUNCTION IF EXISTS save_view_definition();

-- 7. Verify the changes
SELECT 
    c.column_name, 
    c.data_type,
    CASE 
        WHEN c.table_name = 'ln_loan_information' THEN 'Table'
        ELSE 'View'
    END as object_type
FROM information_schema.columns c
WHERE c.table_schema = 'public' 
AND c.table_name IN ('ln_loan_information', 'loan_information')
AND c.column_name LIKE '%loan%'
ORDER BY c.table_name, c.ordinal_position;