-- Loan Tables Migration
-- 
-- This migration renames loan-related tables to use the ln_ prefix
-- and creates compatibility views for backward compatibility

-- Migrate payments
BEGIN;
ALTER TABLE IF EXISTS public.payments RENAME TO ln_payments;
CREATE OR REPLACE VIEW public.payments AS SELECT * FROM public.ln_payments;
GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT ON public.payments TO service_role;
COMMENT ON VIEW public.payments IS 'Compatibility view for ln_payments';
COMMIT;

-- Migrate trailing_payments
BEGIN;
ALTER TABLE IF EXISTS public.trailing_payments RENAME TO ln_trailing_payments;
CREATE OR REPLACE VIEW public.trailing_payments AS SELECT * FROM public.ln_trailing_payments;
GRANT SELECT ON public.trailing_payments TO authenticated;
GRANT SELECT ON public.trailing_payments TO service_role;
COMMENT ON VIEW public.trailing_payments IS 'Compatibility view for ln_trailing_payments';
COMMIT;

-- Migrate borrowers
BEGIN;
ALTER TABLE IF EXISTS public.borrowers RENAME TO ln_borrowers;
CREATE OR REPLACE VIEW public.borrowers AS SELECT * FROM public.ln_borrowers;
GRANT SELECT ON public.borrowers TO authenticated;
GRANT SELECT ON public.borrowers TO service_role;
COMMENT ON VIEW public.borrowers IS 'Compatibility view for ln_borrowers';
COMMIT;

-- Migrate loan_information (or information depending on your actual table name)
BEGIN;
ALTER TABLE IF EXISTS public.loan_information RENAME TO ln_loan_information;
CREATE OR REPLACE VIEW public.loan_information AS SELECT * FROM public.ln_loan_information;
GRANT SELECT ON public.loan_information TO authenticated;
GRANT SELECT ON public.loan_information TO service_role;
COMMENT ON VIEW public.loan_information IS 'Compatibility view for ln_loan_information';
COMMIT;

-- Migrate delinquency
BEGIN;
ALTER TABLE IF EXISTS public.delinquency RENAME TO ln_delinquency;
CREATE OR REPLACE VIEW public.delinquency AS SELECT * FROM public.ln_delinquency;
GRANT SELECT ON public.delinquency TO authenticated;
GRANT SELECT ON public.delinquency TO service_role;
COMMENT ON VIEW public.delinquency IS 'Compatibility view for ln_delinquency';
COMMIT;

-- Migrate expenses
BEGIN;
ALTER TABLE IF EXISTS public.expenses RENAME TO ln_expenses;
CREATE OR REPLACE VIEW public.expenses AS SELECT * FROM public.ln_expenses;
GRANT SELECT ON public.expenses TO authenticated;
GRANT SELECT ON public.expenses TO service_role;
COMMENT ON VIEW public.expenses IS 'Compatibility view for ln_expenses';
COMMIT;

-- Migrate insurance
BEGIN;
ALTER TABLE IF EXISTS public.insurance RENAME TO ln_insurance;
CREATE OR REPLACE VIEW public.insurance AS SELECT * FROM public.ln_insurance;
GRANT SELECT ON public.insurance TO authenticated;
GRANT SELECT ON public.insurance TO service_role;
COMMENT ON VIEW public.insurance IS 'Compatibility view for ln_insurance';
COMMIT;

-- Migrate loss_mitigation
BEGIN;
ALTER TABLE IF EXISTS public.loss_mitigation RENAME TO ln_loss_mitigation;
CREATE OR REPLACE VIEW public.loss_mitigation AS SELECT * FROM public.ln_loss_mitigation;
GRANT SELECT ON public.loss_mitigation TO authenticated;
GRANT SELECT ON public.loss_mitigation TO service_role;
COMMENT ON VIEW public.loss_mitigation IS 'Compatibility view for ln_loss_mitigation';
COMMIT;

-- Migrate covid_19
BEGIN;
ALTER TABLE IF EXISTS public.covid_19 RENAME TO ln_covid_19;
CREATE OR REPLACE VIEW public.covid_19 AS SELECT * FROM public.ln_covid_19;
GRANT SELECT ON public.covid_19 TO authenticated;
GRANT SELECT ON public.covid_19 TO service_role;
COMMENT ON VIEW public.covid_19 IS 'Compatibility view for ln_covid_19';
COMMIT;

-- Migrate bankruptcy
BEGIN;
ALTER TABLE IF EXISTS public.bankruptcy RENAME TO ln_bankruptcy;
CREATE OR REPLACE VIEW public.bankruptcy AS SELECT * FROM public.ln_bankruptcy;
GRANT SELECT ON public.bankruptcy TO authenticated;
GRANT SELECT ON public.bankruptcy TO service_role;
COMMENT ON VIEW public.bankruptcy IS 'Compatibility view for ln_bankruptcy';
COMMIT;

-- Migrate foreclosure
BEGIN;
ALTER TABLE IF EXISTS public.foreclosure RENAME TO ln_foreclosure;
CREATE OR REPLACE VIEW public.foreclosure AS SELECT * FROM public.ln_foreclosure;
GRANT SELECT ON public.foreclosure TO authenticated;
GRANT SELECT ON public.foreclosure TO service_role;
COMMENT ON VIEW public.foreclosure IS 'Compatibility view for ln_foreclosure';
COMMIT;

-- Migrate loans
BEGIN;
ALTER TABLE IF EXISTS public.loans RENAME TO ln_loans;
CREATE OR REPLACE VIEW public.loans AS SELECT * FROM public.ln_loans;
GRANT SELECT ON public.loans TO authenticated;
GRANT SELECT ON public.loans TO service_role;
COMMENT ON VIEW public.loans IS 'Compatibility view for ln_loans';
COMMIT;

-- Migrate properties
BEGIN;
ALTER TABLE IF EXISTS public.properties RENAME TO ln_properties;
CREATE OR REPLACE VIEW public.properties AS SELECT * FROM public.ln_properties;
GRANT SELECT ON public.properties TO authenticated;
GRANT SELECT ON public.properties TO service_role;
COMMENT ON VIEW public.properties IS 'Compatibility view for ln_properties';
COMMIT;

-- Migrate loan_details
BEGIN;
ALTER TABLE IF EXISTS public.loan_details RENAME TO ln_loan_details;
CREATE OR REPLACE VIEW public.loan_details AS SELECT * FROM public.ln_loan_details;
GRANT SELECT ON public.loan_details TO authenticated;
GRANT SELECT ON public.loan_details TO service_role;
COMMENT ON VIEW public.loan_details IS 'Compatibility view for ln_loan_details';
COMMIT;

-- Migrate loan_documents
BEGIN;
ALTER TABLE IF EXISTS public.loan_documents RENAME TO ln_loan_documents;
CREATE OR REPLACE VIEW public.loan_documents AS SELECT * FROM public.ln_loan_documents;
GRANT SELECT ON public.loan_documents TO authenticated;
GRANT SELECT ON public.loan_documents TO service_role;
COMMENT ON VIEW public.loan_documents IS 'Compatibility view for ln_loan_documents';
COMMIT;

-- Migrate loan_notes
BEGIN;
ALTER TABLE IF EXISTS public.loan_notes RENAME TO ln_loan_notes;
CREATE OR REPLACE VIEW public.loan_notes AS SELECT * FROM public.ln_loan_notes;
GRANT SELECT ON public.loan_notes TO authenticated;
GRANT SELECT ON public.loan_notes TO service_role;
COMMENT ON VIEW public.loan_notes IS 'Compatibility view for ln_loan_notes';
COMMIT;