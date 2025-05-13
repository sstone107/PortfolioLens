-- Loan Tables Migration - Batch 3
-- Third batch of loan tables to migrate

-- Migrate loans table
BEGIN;
ALTER TABLE IF EXISTS public.loans RENAME TO ln_loans;
CREATE OR REPLACE VIEW public.loans AS SELECT * FROM public.ln_loans;
GRANT SELECT ON public.loans TO authenticated;
GRANT SELECT ON public.loans TO service_role;
COMMENT ON VIEW public.loans IS 'Compatibility view for ln_loans';
COMMIT;

-- Migrate properties table
BEGIN;
ALTER TABLE IF EXISTS public.properties RENAME TO ln_properties;
CREATE OR REPLACE VIEW public.properties AS SELECT * FROM public.ln_properties;
GRANT SELECT ON public.properties TO authenticated;
GRANT SELECT ON public.properties TO service_role;
COMMENT ON VIEW public.properties IS 'Compatibility view for ln_properties';
COMMIT;

-- Migrate loan_details table
BEGIN;
ALTER TABLE IF EXISTS public.loan_details RENAME TO ln_loan_details;
CREATE OR REPLACE VIEW public.loan_details AS SELECT * FROM public.ln_loan_details;
GRANT SELECT ON public.loan_details TO authenticated;
GRANT SELECT ON public.loan_details TO service_role;
COMMENT ON VIEW public.loan_details IS 'Compatibility view for ln_loan_details';
COMMIT;

-- Check if loan_information table exists and migrate it
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'loan_information') THEN
    ALTER TABLE public.loan_information RENAME TO ln_loan_information;
    EXECUTE 'CREATE OR REPLACE VIEW public.loan_information AS SELECT * FROM public.ln_loan_information';
    EXECUTE 'GRANT SELECT ON public.loan_information TO authenticated';
    EXECUTE 'GRANT SELECT ON public.loan_information TO service_role';
    EXECUTE 'COMMENT ON VIEW public.loan_information IS ''Compatibility view for ln_loan_information''';
  END IF;
END
$$;