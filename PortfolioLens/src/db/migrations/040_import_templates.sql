-- Create import templates table
CREATE TABLE IF NOT EXISTS public.import_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    table_name TEXT NOT NULL,
    fields JSONB NOT NULL,
    user_id UUID REFERENCES auth.users NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index on user_id for better performance
CREATE INDEX IF NOT EXISTS import_templates_user_id_idx ON public.import_templates (user_id);

-- Enable RLS
ALTER TABLE public.import_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view import templates"
ON public.import_templates FOR SELECT
TO authenticated
USING (true);  -- Allow all authenticated users to view templates

CREATE POLICY "Users can create their own templates"
ON public.import_templates FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
ON public.import_templates FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
ON public.import_templates FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create trigger to update the updated_at timestamp
CREATE TRIGGER set_import_templates_updated_at
BEFORE UPDATE ON public.import_templates
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Insert sample templates
INSERT INTO public.import_templates (name, description, table_name, fields, user_id)
VALUES
    ('Loan Data Import', 
     'Template for importing loan data', 
     'in_loan_data', 
     '[
        {"column": "loan_id", "type": "text"},
        {"column": "loan_amount", "type": "numeric"},
        {"column": "interest_rate", "type": "numeric"},
        {"column": "term_months", "type": "numeric"},
        {"column": "origination_date", "type": "date"},
        {"column": "first_payment_date", "type": "date"},
        {"column": "loan_status", "type": "text"},
        {"column": "borrower_id", "type": "text"}
     ]'::jsonb,
     (SELECT id FROM auth.users LIMIT 1)
    ),
    ('Payment Data Import', 
     'Template for importing payment data', 
     'in_payment_data', 
     '[
        {"column": "payment_id", "type": "text"},
        {"column": "loan_id", "type": "text"},
        {"column": "payment_date", "type": "date"},
        {"column": "payment_amount", "type": "numeric"},
        {"column": "principal", "type": "numeric"},
        {"column": "interest", "type": "numeric"},
        {"column": "late_fee", "type": "numeric"},
        {"column": "payment_status", "type": "text"}
     ]'::jsonb,
     (SELECT id FROM auth.users LIMIT 1)
    ),
    ('Borrower Data Import', 
     'Template for importing borrower data', 
     'in_borrower_data', 
     '[
        {"column": "borrower_id", "type": "text"},
        {"column": "first_name", "type": "text"},
        {"column": "last_name", "type": "text"},
        {"column": "email", "type": "text"},
        {"column": "phone", "type": "text"},
        {"column": "address", "type": "text"},
        {"column": "city", "type": "text"},
        {"column": "state", "type": "text"},
        {"column": "zip", "type": "text"},
        {"column": "dob", "type": "date"},
        {"column": "ssn_last4", "type": "text"}
     ]'::jsonb,
     (SELECT id FROM auth.users LIMIT 1)
    )
ON CONFLICT DO NOTHING;