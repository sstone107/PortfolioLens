-- Hybrid History Tracking System
-- This migration implements a comprehensive history tracking system
-- for both payment transactions and loan attribute changes
-- This is the APPLIED version that was successfully run on the database

-- Create a table for payment transactions history
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  payment_id UUID,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  effective_date TIMESTAMP WITH TIME ZONE,
  due_date DATE,
  amount NUMERIC(12,2) NOT NULL,
  principal_amount NUMERIC(12,2),
  interest_amount NUMERIC(12,2),
  escrow_amount NUMERIC(12,2),
  late_charges_amount NUMERIC(12,2),
  other_fees_amount NUMERIC(12,2),
  transaction_type VARCHAR(50) NOT NULL,
  payment_method VARCHAR(50),
  payment_source VARCHAR(100),
  status VARCHAR(50),
  days_late INTEGER,
  transaction_id VARCHAR(100),
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indices for payment transactions
CREATE INDEX IF NOT EXISTS idx_payment_transactions_loan_id ON payment_transactions(loan_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment_id ON payment_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_transaction_date ON payment_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_due_date ON payment_transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);

-- Create a table for loan attribute change history
CREATE TABLE IF NOT EXISTS loan_change_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  change_type VARCHAR(50) NOT NULL, -- 'update', 'insert', 'delete'
  change_source VARCHAR(100), -- 'user', 'system', 'import', etc.
  changed_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indices for loan change history
CREATE INDEX IF NOT EXISTS idx_loan_change_history_loan_id ON loan_change_history(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_change_history_changed_at ON loan_change_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_loan_change_history_field_name ON loan_change_history(field_name);
CREATE INDEX IF NOT EXISTS idx_loan_change_history_change_type ON loan_change_history(change_type);

-- Enable RLS on these tables
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_change_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_transactions
CREATE POLICY "Users can view payment transactions for loans they have access to"
  ON payment_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM loan_portfolio_view lpv
      WHERE lpv.id = payment_transactions.loan_id
    )
  );

-- RLS policies for loan_change_history
CREATE POLICY "Users can view loan change history for loans they have access to"
  ON loan_change_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM loan_portfolio_view lpv
      WHERE lpv.id = loan_change_history.loan_id
    )
  );

-- Function to record payment transactions
CREATE OR REPLACE FUNCTION record_payment_transaction(
  p_loan_id UUID,
  p_payment_id UUID,
  p_transaction_date TIMESTAMP WITH TIME ZONE,
  p_effective_date TIMESTAMP WITH TIME ZONE,
  p_due_date DATE,
  p_amount NUMERIC(12,2),
  p_principal_amount NUMERIC(12,2),
  p_interest_amount NUMERIC(12,2),
  p_escrow_amount NUMERIC(12,2),
  p_late_charges_amount NUMERIC(12,2),
  p_other_fees_amount NUMERIC(12,2),
  p_transaction_type VARCHAR(50),
  p_payment_method VARCHAR(50),
  p_payment_source VARCHAR(100),
  p_status VARCHAR(50),
  p_days_late INTEGER,
  p_transaction_id VARCHAR(100),
  p_description TEXT,
  p_created_by UUID
) RETURNS UUID AS $$
DECLARE
  transaction_id UUID;
BEGIN
  -- Insert the payment transaction record
  INSERT INTO payment_transactions (
    loan_id,
    payment_id,
    transaction_date,
    effective_date,
    due_date,
    amount,
    principal_amount,
    interest_amount,
    escrow_amount,
    late_charges_amount,
    other_fees_amount,
    transaction_type,
    payment_method,
    payment_source,
    status,
    days_late,
    transaction_id,
    description,
    created_by
  ) VALUES (
    p_loan_id,
    p_payment_id,
    p_transaction_date,
    p_effective_date,
    p_due_date,
    p_amount,
    p_principal_amount,
    p_interest_amount,
    p_escrow_amount,
    p_late_charges_amount,
    p_other_fees_amount,
    p_transaction_type,
    p_payment_method,
    p_payment_source,
    p_status,
    p_days_late,
    p_transaction_id,
    p_description,
    p_created_by
  ) RETURNING id INTO transaction_id;
  
  RETURN transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record loan attribute changes
CREATE OR REPLACE FUNCTION record_loan_change(
  p_loan_id UUID,
  p_field_name VARCHAR(100),
  p_old_value TEXT,
  p_new_value TEXT,
  p_change_type VARCHAR(50),
  p_change_source VARCHAR(100),
  p_changed_by UUID,
  p_change_reason TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  change_id UUID;
BEGIN
  -- Insert the loan change record
  INSERT INTO loan_change_history (
    loan_id,
    changed_at,
    field_name,
    old_value,
    new_value,
    change_type,
    change_source,
    changed_by,
    change_reason
  ) VALUES (
    p_loan_id,
    NOW(),
    p_field_name,
    p_old_value,
    p_new_value,
    p_change_type,
    p_change_source,
    p_changed_by,
    p_change_reason
  ) RETURNING id INTO change_id;
  
  RETURN change_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get loan timeline (unified history view)
CREATE OR REPLACE FUNCTION get_loan_timeline(
  p_loan_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS TABLE (
  event_type TEXT,
  event_date TIMESTAMP WITH TIME ZONE,
  event_category TEXT,
  event_description TEXT,
  amount NUMERIC(12,2),
  details JSONB
) AS $$
BEGIN
  -- Return unified timeline of payments and changes
  RETURN QUERY
  
  -- Payment transactions
  SELECT
    'payment'::TEXT as event_type,
    pt.transaction_date as event_date,
    pt.transaction_type as event_category,
    COALESCE(pt.description, pt.transaction_type || ' transaction')::TEXT as event_description,
    pt.amount,
    jsonb_build_object(
      'payment_id', pt.payment_id,
      'transaction_id', pt.transaction_id,
      'payment_method', pt.payment_method,
      'payment_source', pt.payment_source,
      'status', pt.status,
      'principal_amount', pt.principal_amount,
      'interest_amount', pt.interest_amount,
      'escrow_amount', pt.escrow_amount,
      'late_charges_amount', pt.late_charges_amount,
      'other_fees_amount', pt.other_fees_amount,
      'days_late', pt.days_late,
      'created_by', pt.created_by
    ) as details
  FROM payment_transactions pt
  WHERE pt.loan_id = p_loan_id
    AND (p_start_date IS NULL OR pt.transaction_date >= p_start_date)
    AND (p_end_date IS NULL OR pt.transaction_date <= p_end_date)
  
  UNION ALL
  
  -- Loan attribute changes
  SELECT
    'change'::TEXT as event_type,
    lch.changed_at as event_date,
    lch.field_name as event_category,
    'Changed ' || lch.field_name || ' from "' || COALESCE(lch.old_value, 'null') || '" to "' || COALESCE(lch.new_value, 'null') || '"' as event_description,
    NULL::NUMERIC(12,2) as amount,
    jsonb_build_object(
      'field_name', lch.field_name,
      'old_value', lch.old_value,
      'new_value', lch.new_value,
      'change_type', lch.change_type,
      'change_source', lch.change_source,
      'changed_by', lch.changed_by,
      'change_reason', lch.change_reason
    ) as details
  FROM loan_change_history lch
  WHERE lch.loan_id = p_loan_id
    AND (p_start_date IS NULL OR lch.changed_at >= p_start_date)
    AND (p_end_date IS NULL OR lch.changed_at <= p_end_date)
  
  ORDER BY event_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE payment_transactions IS 'Records all payment transactions for loans';
COMMENT ON TABLE loan_change_history IS 'Records history of changes made to loan attributes';
COMMENT ON FUNCTION record_payment_transaction IS 'Records a payment transaction in the history';
COMMENT ON FUNCTION record_loan_change IS 'Records a change to a loan attribute';
COMMENT ON FUNCTION get_loan_timeline IS 'Retrieves a unified timeline of loan payments and changes';
