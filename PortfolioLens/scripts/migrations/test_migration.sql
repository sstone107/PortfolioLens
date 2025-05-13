-- Test migration for a few loan tables
-- This is a smaller test to validate the approach works

-- Migrate covid_19 table
BEGIN;
ALTER TABLE IF EXISTS public.covid_19 RENAME TO ln_covid_19;
CREATE OR REPLACE VIEW public.covid_19 AS SELECT * FROM public.ln_covid_19;
GRANT SELECT ON public.covid_19 TO authenticated;
GRANT SELECT ON public.covid_19 TO service_role;
COMMENT ON VIEW public.covid_19 IS 'Compatibility view for ln_covid_19';
COMMIT;

-- Migrate bankruptcy table
BEGIN;
ALTER TABLE IF EXISTS public.bankruptcy RENAME TO ln_bankruptcy;
CREATE OR REPLACE VIEW public.bankruptcy AS SELECT * FROM public.ln_bankruptcy;
GRANT SELECT ON public.bankruptcy TO authenticated;
GRANT SELECT ON public.bankruptcy TO service_role;
COMMENT ON VIEW public.bankruptcy IS 'Compatibility view for ln_bankruptcy';
COMMIT;