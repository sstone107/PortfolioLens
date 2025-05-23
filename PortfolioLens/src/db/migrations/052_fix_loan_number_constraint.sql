-- Make loan_number nullable in ln_loan_information to allow flexible imports
-- The Edge Function will try to populate this field from various sources,
-- but if none are found, the row should still be imported

ALTER TABLE public.ln_loan_information 
ALTER COLUMN loan_number DROP NOT NULL;

COMMENT ON COLUMN public.ln_loan_information.loan_number IS 'Primary loan identifier - nullable to allow flexible imports. The system will attempt to populate from investor_loan_number, valon_loan_id, or other loan number fields.';

-- Note: After import, you may want to:
-- 1. Update any NULL loan_numbers with a generated identifier
-- 2. Add the NOT NULL constraint back if needed
-- Example:
-- UPDATE ln_loan_information 
-- SET loan_number = 'IMPORTED_' || id::text 
-- WHERE loan_number IS NULL;