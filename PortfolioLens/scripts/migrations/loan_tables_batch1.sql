-- Loan Tables Migration - Batch 1
-- First batch of loan tables to migrate

-- Migrate payments table
BEGIN;
ALTER TABLE IF EXISTS public.payments RENAME TO ln_payments;
CREATE OR REPLACE VIEW public.payments AS SELECT * FROM public.ln_payments;
GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT ON public.payments TO service_role;
COMMENT ON VIEW public.payments IS 'Compatibility view for ln_payments';
COMMIT;

-- Migrate trailing_payments table
BEGIN;
ALTER TABLE IF EXISTS public.trailing_payments RENAME TO ln_trailing_payments;
CREATE OR REPLACE VIEW public.trailing_payments AS SELECT * FROM public.ln_trailing_payments;
GRANT SELECT ON public.trailing_payments TO authenticated;
GRANT SELECT ON public.trailing_payments TO service_role;
COMMENT ON VIEW public.trailing_payments IS 'Compatibility view for ln_trailing_payments';
COMMIT;

-- Migrate borrowers table
BEGIN;
ALTER TABLE IF EXISTS public.borrowers RENAME TO ln_borrowers;
CREATE OR REPLACE VIEW public.borrowers AS SELECT * FROM public.ln_borrowers;
GRANT SELECT ON public.borrowers TO authenticated;
GRANT SELECT ON public.borrowers TO service_role;
COMMENT ON VIEW public.borrowers IS 'Compatibility view for ln_borrowers';
COMMIT;

-- Migrate delinquency table
BEGIN;
ALTER TABLE IF EXISTS public.delinquency RENAME TO ln_delinquency;
CREATE OR REPLACE VIEW public.delinquency AS SELECT * FROM public.ln_delinquency;
GRANT SELECT ON public.delinquency TO authenticated;
GRANT SELECT ON public.delinquency TO service_role;
COMMENT ON VIEW public.delinquency IS 'Compatibility view for ln_delinquency';
COMMIT;