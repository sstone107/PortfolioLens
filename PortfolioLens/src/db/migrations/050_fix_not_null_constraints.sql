-- Fix NOT NULL constraints that were preventing imports
-- These columns should be nullable since they might not always be available during import

ALTER TABLE public.ln_loan_information 
ALTER COLUMN upb DROP NOT NULL,
ALTER COLUMN note_rate DROP NOT NULL,
ALTER COLUMN loan_status DROP NOT NULL;

-- Note: loan_number remains NOT NULL since it's the key identifier
-- id remains NOT NULL and has a default value gen_random_uuid()

COMMENT ON COLUMN public.ln_loan_information.upb IS 'Unpaid Principal Balance - nullable as it may not be available during initial import';
COMMENT ON COLUMN public.ln_loan_information.note_rate IS 'Note Rate - nullable as it may not be available during initial import';
COMMENT ON COLUMN public.ln_loan_information.loan_status IS 'Loan Status - nullable as it may not be available during initial import';