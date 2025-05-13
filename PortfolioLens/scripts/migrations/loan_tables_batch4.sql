-- Loan Tables Migration - Batch 4
-- Fourth batch of loan tables to migrate

-- Migrate loan_documents table
BEGIN;
ALTER TABLE IF EXISTS public.loan_documents RENAME TO ln_loan_documents;
CREATE OR REPLACE VIEW public.loan_documents AS SELECT * FROM public.ln_loan_documents;
GRANT SELECT ON public.loan_documents TO authenticated;
GRANT SELECT ON public.loan_documents TO service_role;
COMMENT ON VIEW public.loan_documents IS 'Compatibility view for ln_loan_documents';
COMMIT;

-- Migrate loan_notes table
BEGIN;
ALTER TABLE IF EXISTS public.loan_notes RENAME TO ln_loan_notes;
CREATE OR REPLACE VIEW public.loan_notes AS SELECT * FROM public.ln_loan_notes;
GRANT SELECT ON public.loan_notes TO authenticated;
GRANT SELECT ON public.loan_notes TO service_role;
COMMENT ON VIEW public.loan_notes IS 'Compatibility view for ln_loan_notes';
COMMIT;

-- Migrate information table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'information') THEN
    ALTER TABLE public.information RENAME TO ln_information;
    EXECUTE 'CREATE OR REPLACE VIEW public.information AS SELECT * FROM public.ln_information';
    EXECUTE 'GRANT SELECT ON public.information TO authenticated';
    EXECUTE 'GRANT SELECT ON public.information TO service_role';
    EXECUTE 'COMMENT ON VIEW public.information IS ''Compatibility view for ln_information''';
  END IF;
END
$$;