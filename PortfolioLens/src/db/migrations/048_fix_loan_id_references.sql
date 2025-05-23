-- Fix loan_id references to work with the migrated table structure
-- The ln_* tables have foreign keys to ln_loan_information, not loans

-- First, check if ln_loan_information table exists and has the expected structure
DO $$
BEGIN
    -- If ln_loan_information doesn't exist, create it as the main loan identifier table
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ln_loan_information') THEN
        CREATE TABLE public.ln_loan_information (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            loan_number TEXT UNIQUE NOT NULL,
            investor_loan_number TEXT,
            seller_loan_number TEXT,
            current_servicer_loan_number TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Create indexes for performance
        CREATE INDEX idx_ln_loan_information_investor_loan_number ON public.ln_loan_information(investor_loan_number);
        CREATE INDEX idx_ln_loan_information_seller_loan_number ON public.ln_loan_information(seller_loan_number);
        CREATE INDEX idx_ln_loan_information_current_servicer_loan_number ON public.ln_loan_information(current_servicer_loan_number);
    END IF;
END $$;

-- Drop all existing versions of the function to avoid conflicts
DROP FUNCTION IF EXISTS public.get_or_create_loan_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_or_create_loan_id(text) CASCADE;
DROP FUNCTION IF EXISTS public.get_or_create_loan_id(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_or_create_loan_id(text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_or_create_loan_id(text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_or_create_loan_id(text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_or_create_loan_id(text, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_or_create_loan_id(text, text, text, text, text, text, text) CASCADE;

-- Update the get_or_create_loan_id function to work with ln_loan_information
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
    
    -- If no loan number provided, return NULL
    IF v_loan_number IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Try to find existing loan by any of the loan numbers in ln_loan_information
    SELECT id INTO v_loan_id
    FROM public.ln_loan_information
    WHERE loan_number = v_loan_number
       OR investor_loan_number = p_investor_loan_number
       OR seller_loan_number = p_seller_loan_number
       OR current_servicer_loan_number = p_current_servicer_loan_number
    LIMIT 1;
    
    -- If not found, create new loan record in ln_loan_information
    IF v_loan_id IS NULL THEN
        INSERT INTO public.ln_loan_information (
            loan_number,
            investor_loan_number,
            seller_loan_number,
            current_servicer_loan_number
        ) VALUES (
            v_loan_number,
            p_investor_loan_number,
            p_seller_loan_number,
            p_current_servicer_loan_number
        )
        ON CONFLICT (loan_number) DO UPDATE SET
            investor_loan_number = COALESCE(EXCLUDED.investor_loan_number, ln_loan_information.investor_loan_number),
            seller_loan_number = COALESCE(EXCLUDED.seller_loan_number, ln_loan_information.seller_loan_number),
            current_servicer_loan_number = COALESCE(EXCLUDED.current_servicer_loan_number, ln_loan_information.current_servicer_loan_number),
            updated_at = CURRENT_TIMESTAMP
        RETURNING id INTO v_loan_id;
    END IF;
    
    RETURN v_loan_id;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.get_or_create_loan_id TO service_role;
GRANT ALL ON TABLE public.ln_loan_information TO service_role;