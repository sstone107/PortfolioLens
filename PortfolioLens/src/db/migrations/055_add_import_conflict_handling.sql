-- Add import conflict handling for duplicate loan numbers
-- This allows imports to update existing loans rather than fail

-- Create a function to handle import conflicts for ln_loan_information
CREATE OR REPLACE FUNCTION handle_loan_import_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If there's a conflict on loan_number, update the existing record
    IF EXISTS (SELECT 1 FROM public.ln_loan_information WHERE loan_number = NEW.loan_number AND id != NEW.id) THEN
        -- Update the existing record with new data
        UPDATE public.ln_loan_information
        SET 
            -- Update all fields except id and loan_number
            investor_loan_number = COALESCE(NEW.investor_loan_number, investor_loan_number),
            seller_loan_number = COALESCE(NEW.seller_loan_number, seller_loan_number),
            current_servicer_loan_number = COALESCE(NEW.current_servicer_loan_number, current_servicer_loan_number),
            valon_loan_id = COALESCE(NEW.valon_loan_id, valon_loan_id),
            previous_servicer_loan_id = COALESCE(NEW.previous_servicer_loan_id, previous_servicer_loan_id),
            mers_id = COALESCE(NEW.mers_id, mers_id),
            servicer_id = COALESCE(NEW.servicer_id, servicer_id),
            investor_id = COALESCE(NEW.investor_id, investor_id),
            upb = COALESCE(NEW.upb, upb),
            note_rate = COALESCE(NEW.note_rate, note_rate),
            loan_status = COALESCE(NEW.loan_status, loan_status),
            delinquency_status = COALESCE(NEW.delinquency_status, delinquency_status),
            last_payment_date = COALESCE(NEW.last_payment_date, last_payment_date),
            maturity_date = COALESCE(NEW.maturity_date, maturity_date),
            updated_at = CURRENT_TIMESTAMP,
            import_job_id = NEW.import_job_id,
            import_row_number = NEW.import_row_number
        WHERE loan_number = NEW.loan_number;
        
        -- Return NULL to prevent the insert
        RETURN NULL;
    END IF;
    
    -- Otherwise, allow the insert
    RETURN NEW;
END;
$$;

-- Create an import mode flag table
CREATE TABLE IF NOT EXISTS public.import_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default import mode
INSERT INTO public.import_settings (key, value)
VALUES ('duplicate_handling', '{"mode": "update", "log_updates": true}')
ON CONFLICT (key) DO NOTHING;

-- Function to get import duplicate handling mode
CREATE OR REPLACE FUNCTION get_import_duplicate_mode()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (SELECT value->>'mode' FROM public.import_settings WHERE key = 'duplicate_handling'),
        'update'
    );
$$;

-- Add a column to track when records were last imported/updated
ALTER TABLE public.ln_loan_information 
ADD COLUMN IF NOT EXISTS last_import_update TIMESTAMP WITH TIME ZONE;

-- Create an index on loan_number for faster conflict detection
CREATE INDEX IF NOT EXISTS idx_ln_loan_information_loan_number 
ON public.ln_loan_information(loan_number);

-- Add RLS policies for import_settings
ALTER TABLE public.import_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage import settings" ON public.import_settings
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Authenticated users can read import settings" ON public.import_settings
    FOR SELECT USING (auth.role() = 'authenticated');

COMMENT ON TABLE public.import_settings IS 'Settings for import behavior including duplicate handling';
COMMENT ON FUNCTION get_import_duplicate_mode() IS 'Gets the current duplicate handling mode for imports (update, skip, or fail)';