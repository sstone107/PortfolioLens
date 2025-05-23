-- Add additional loan number fields to ln_loan_information table
ALTER TABLE public.ln_loan_information 
ADD COLUMN IF NOT EXISTS valon_loan_id TEXT,
ADD COLUMN IF NOT EXISTS previous_servicer_loan_id TEXT,
ADD COLUMN IF NOT EXISTS mers_id TEXT;

-- Create indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_ln_loan_information_valon_loan_id 
ON public.ln_loan_information(valon_loan_id) 
WHERE valon_loan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ln_loan_information_previous_servicer_loan_id 
ON public.ln_loan_information(previous_servicer_loan_id) 
WHERE previous_servicer_loan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ln_loan_information_mers_id 
ON public.ln_loan_information(mers_id) 
WHERE mers_id IS NOT NULL;

-- Drop the existing 4-parameter version before creating the 7-parameter version
DROP FUNCTION IF EXISTS public.get_or_create_loan_id(text, text, text, text) CASCADE;

-- Update the get_or_create_loan_id function to handle additional loan numbers
CREATE OR REPLACE FUNCTION public.get_or_create_loan_id(
    p_investor_loan_number text DEFAULT NULL,
    p_seller_loan_number text DEFAULT NULL,
    p_current_servicer_loan_number text DEFAULT NULL,
    p_loan_number text DEFAULT NULL,
    p_valon_loan_id text DEFAULT NULL,
    p_previous_servicer_loan_id text DEFAULT NULL,
    p_mers_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_loan_id uuid;
    v_loan_number text;
BEGIN
    -- Determine which loan number to use (prioritize investor_loan_number, then valon)
    v_loan_number := COALESCE(
        NULLIF(TRIM(p_investor_loan_number), ''),
        NULLIF(TRIM(p_valon_loan_id), ''),
        NULLIF(TRIM(p_seller_loan_number), ''),
        NULLIF(TRIM(p_current_servicer_loan_number), ''),
        NULLIF(TRIM(p_previous_servicer_loan_id), ''),
        NULLIF(TRIM(p_mers_id), ''),
        NULLIF(TRIM(p_loan_number), '')
    );
    
    -- If no loan number provided, return NULL
    IF v_loan_number IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Try to find existing loan by any of the loan numbers
    SELECT id INTO v_loan_id
    FROM public.ln_loan_information
    WHERE loan_number = v_loan_number
       OR (p_investor_loan_number IS NOT NULL AND investor_loan_number = p_investor_loan_number)
       OR (p_seller_loan_number IS NOT NULL AND seller_loan_number = p_seller_loan_number)
       OR (p_current_servicer_loan_number IS NOT NULL AND current_servicer_loan_number = p_current_servicer_loan_number)
       OR (p_valon_loan_id IS NOT NULL AND valon_loan_id = p_valon_loan_id)
       OR (p_previous_servicer_loan_id IS NOT NULL AND previous_servicer_loan_id = p_previous_servicer_loan_id)
       OR (p_mers_id IS NOT NULL AND mers_id = p_mers_id)
    LIMIT 1;
    
    -- If not found, create new loan record
    IF v_loan_id IS NULL THEN
        INSERT INTO public.ln_loan_information (
            loan_number,
            investor_loan_number,
            seller_loan_number,
            current_servicer_loan_number,
            valon_loan_id,
            previous_servicer_loan_id,
            mers_id
        ) VALUES (
            v_loan_number,
            p_investor_loan_number,
            p_seller_loan_number,
            p_current_servicer_loan_number,
            p_valon_loan_id,
            p_previous_servicer_loan_id,
            p_mers_id
        )
        ON CONFLICT (loan_number) DO UPDATE SET
            investor_loan_number = COALESCE(EXCLUDED.investor_loan_number, ln_loan_information.investor_loan_number),
            seller_loan_number = COALESCE(EXCLUDED.seller_loan_number, ln_loan_information.seller_loan_number),
            current_servicer_loan_number = COALESCE(EXCLUDED.current_servicer_loan_number, ln_loan_information.current_servicer_loan_number),
            valon_loan_id = COALESCE(EXCLUDED.valon_loan_id, ln_loan_information.valon_loan_id),
            previous_servicer_loan_id = COALESCE(EXCLUDED.previous_servicer_loan_id, ln_loan_information.previous_servicer_loan_id),
            mers_id = COALESCE(EXCLUDED.mers_id, ln_loan_information.mers_id),
            updated_at = CURRENT_TIMESTAMP
        RETURNING id INTO v_loan_id;
    END IF;
    
    RETURN v_loan_id;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_loan_id TO service_role;