-- Fix the ln_loan_information table structure
-- The table exists but is missing the loan number columns

-- Add missing columns if they don't exist
ALTER TABLE public.ln_loan_information 
ADD COLUMN IF NOT EXISTS seller_loan_number TEXT,
ADD COLUMN IF NOT EXISTS current_servicer_loan_number TEXT,
ADD COLUMN IF NOT EXISTS investor_loan_number TEXT;

-- Also ensure we have the additional columns from migration 049
ALTER TABLE public.ln_loan_information 
ADD COLUMN IF NOT EXISTS valon_loan_id TEXT,
ADD COLUMN IF NOT EXISTS previous_servicer_loan_id TEXT,
ADD COLUMN IF NOT EXISTS mers_id TEXT;

-- Create indexes for all loan number fields
CREATE INDEX IF NOT EXISTS idx_ln_loan_information_investor_loan_number 
ON public.ln_loan_information(investor_loan_number) 
WHERE investor_loan_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ln_loan_information_seller_loan_number 
ON public.ln_loan_information(seller_loan_number) 
WHERE seller_loan_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ln_loan_information_current_servicer_loan_number 
ON public.ln_loan_information(current_servicer_loan_number) 
WHERE current_servicer_loan_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ln_loan_information_valon_loan_id 
ON public.ln_loan_information(valon_loan_id) 
WHERE valon_loan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ln_loan_information_previous_servicer_loan_id 
ON public.ln_loan_information(previous_servicer_loan_id) 
WHERE previous_servicer_loan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ln_loan_information_mers_id 
ON public.ln_loan_information(mers_id) 
WHERE mers_id IS NOT NULL;

-- Verify the structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'ln_loan_information'
ORDER BY ordinal_position;