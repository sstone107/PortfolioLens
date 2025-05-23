-- Check the current structure of ln_loan_information
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'ln_loan_information'
ORDER BY ordinal_position;

-- The upb column is NOT NULL but we're not providing a value
-- Let's make it nullable since it's not always available during import
ALTER TABLE public.ln_loan_information 
ALTER COLUMN upb DROP NOT NULL;

-- Also check for other columns that might be NOT NULL
-- and make them nullable if they're not critical identifiers
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'ln_loan_information'
AND is_nullable = 'NO'
ORDER BY ordinal_position;