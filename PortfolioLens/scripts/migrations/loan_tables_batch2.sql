-- Loan Tables Migration - Batch 2
-- Second batch of loan tables to migrate

-- Migrate expenses table
BEGIN;
ALTER TABLE IF EXISTS public.expenses RENAME TO ln_expenses;
CREATE OR REPLACE VIEW public.expenses AS SELECT * FROM public.ln_expenses;
GRANT SELECT ON public.expenses TO authenticated;
GRANT SELECT ON public.expenses TO service_role;
COMMENT ON VIEW public.expenses IS 'Compatibility view for ln_expenses';
COMMIT;

-- Migrate insurance table
BEGIN;
ALTER TABLE IF EXISTS public.insurance RENAME TO ln_insurance;
CREATE OR REPLACE VIEW public.insurance AS SELECT * FROM public.ln_insurance;
GRANT SELECT ON public.insurance TO authenticated;
GRANT SELECT ON public.insurance TO service_role;
COMMENT ON VIEW public.insurance IS 'Compatibility view for ln_insurance';
COMMIT;

-- Migrate loss_mitigation table
BEGIN;
ALTER TABLE IF EXISTS public.loss_mitigation RENAME TO ln_loss_mitigation;
CREATE OR REPLACE VIEW public.loss_mitigation AS SELECT * FROM public.ln_loss_mitigation;
GRANT SELECT ON public.loss_mitigation TO authenticated;
GRANT SELECT ON public.loss_mitigation TO service_role;
COMMENT ON VIEW public.loss_mitigation IS 'Compatibility view for ln_loss_mitigation';
COMMIT;

-- Migrate foreclosure table
BEGIN;
ALTER TABLE IF EXISTS public.foreclosure RENAME TO ln_foreclosure;
CREATE OR REPLACE VIEW public.foreclosure AS SELECT * FROM public.ln_foreclosure;
GRANT SELECT ON public.foreclosure TO authenticated;
GRANT SELECT ON public.foreclosure TO service_role;
COMMENT ON VIEW public.foreclosure IS 'Compatibility view for ln_foreclosure';
COMMIT;