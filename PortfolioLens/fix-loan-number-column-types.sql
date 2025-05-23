-- Check the current column types in ln_loan_information
SELECT column_name, data_type, udt_name
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'ln_loan_information'
ORDER BY ordinal_position;

-- Fix the column types - change numeric columns to text
-- First, drop any constraints that might prevent the change
ALTER TABLE public.ln_loan_information 
DROP CONSTRAINT IF EXISTS ln_loan_information_loan_number_key CASCADE;

-- Convert numeric columns to text
ALTER TABLE public.ln_loan_information 
ALTER COLUMN loan_number TYPE TEXT USING loan_number::TEXT,
ALTER COLUMN investor_loan_number TYPE TEXT USING investor_loan_number::TEXT,
ALTER COLUMN seller_loan_number TYPE TEXT USING seller_loan_number::TEXT,
ALTER COLUMN current_servicer_loan_number TYPE TEXT USING current_servicer_loan_number::TEXT,
ALTER COLUMN valon_loan_id TYPE TEXT USING valon_loan_id::TEXT,
ALTER COLUMN previous_servicer_loan_id TYPE TEXT USING previous_servicer_loan_id::TEXT,
ALTER COLUMN mers_id TYPE TEXT USING mers_id::TEXT;

-- Re-add the unique constraint on loan_number
ALTER TABLE public.ln_loan_information 
ADD CONSTRAINT ln_loan_information_loan_number_key UNIQUE (loan_number);

-- Verify the changes
SELECT column_name, data_type, udt_name
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'ln_loan_information'
ORDER BY ordinal_position;