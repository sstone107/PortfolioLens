-- Fix NOT NULL constraints across all ln_* tables that were preventing imports
-- These columns should be nullable since they might not always be available during import

-- Fix ln_loan_information constraints (from previous migration)
ALTER TABLE public.ln_loan_information 
ALTER COLUMN upb DROP NOT NULL,
ALTER COLUMN note_rate DROP NOT NULL,
ALTER COLUMN loan_status DROP NOT NULL;

-- Fix ln_insurance constraints
ALTER TABLE public.ln_insurance 
ALTER COLUMN insurance_type DROP NOT NULL;

-- Fix ln_expenses constraints
ALTER TABLE public.ln_expenses 
ALTER COLUMN expense_date DROP NOT NULL,
ALTER COLUMN amount DROP NOT NULL;

-- Fix ln_payments constraints
ALTER TABLE public.ln_payments 
ALTER COLUMN transaction_date DROP NOT NULL,
ALTER COLUMN effective_date DROP NOT NULL,
ALTER COLUMN amount DROP NOT NULL;

-- Fix ln_delinquency constraints
ALTER TABLE public.ln_delinquency 
ALTER COLUMN report_date DROP NOT NULL;

-- Add comments to document why these are nullable
COMMENT ON COLUMN public.ln_loan_information.upb IS 'Unpaid Principal Balance - nullable as it may not be available during initial import';
COMMENT ON COLUMN public.ln_loan_information.note_rate IS 'Note Rate - nullable as it may not be available during initial import';
COMMENT ON COLUMN public.ln_loan_information.loan_status IS 'Loan Status - nullable as it may not be available during initial import';
COMMENT ON COLUMN public.ln_insurance.insurance_type IS 'Insurance type - nullable as it may not be available during initial import';
COMMENT ON COLUMN public.ln_expenses.expense_date IS 'Expense date - nullable as it may not be available during initial import';
COMMENT ON COLUMN public.ln_expenses.amount IS 'Expense amount - nullable as it may not be available during initial import';
COMMENT ON COLUMN public.ln_payments.transaction_date IS 'Transaction date - nullable as it may not be available during initial import';
COMMENT ON COLUMN public.ln_payments.effective_date IS 'Effective date - nullable as it may not be available during initial import';
COMMENT ON COLUMN public.ln_payments.amount IS 'Payment amount - nullable as it may not be available during initial import';
COMMENT ON COLUMN public.ln_delinquency.report_date IS 'Report date - nullable as it may not be available during initial import';

-- Note: The following columns remain NOT NULL as they are critical:
-- - All 'id' columns (have default gen_random_uuid())
-- - All 'loan_id' columns (foreign key reference)
-- - All 'created_at' and 'updated_at' columns (have default CURRENT_TIMESTAMP)
-- - ln_loan_information.loan_number (key identifier)
-- - ln_loans.loan_number (key identifier)
-- - ln_loan_documents columns (document management requires these fields)
-- - ln_loan_notes columns (notes require user and content)