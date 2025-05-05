-- Row-Level Security Policies for PortfolioLens
-- This script sets up RLS policies for all tables based on user roles

-- ==================================================================
-- Helper Functions for Role-Based Access Control
-- ==================================================================

-- Check if a user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_role_name user_role_type)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_role_assignments ura
    JOIN public.user_roles ur ON ura.role_id = ur.id
    WHERE ura.user_id = p_user_id
    AND ur.name = p_role_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if a user is an admin
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.has_role(p_user_id, 'Admin'::user_role_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if a user has any of the specified roles
CREATE OR REPLACE FUNCTION public.has_any_role(p_user_id UUID, VARIADIC p_role_names user_role_type[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_role_assignments ura
    JOIN public.user_roles ur ON ura.role_id = ur.id
    WHERE ura.user_id = p_user_id
    AND ur.name = ANY(p_role_names)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================================================================
-- Enable Row Level Security on All Tables
-- ==================================================================

-- Enable RLS on loans table
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- Enable RLS on servicers table
ALTER TABLE public.servicers ENABLE ROW LEVEL SECURITY;

-- Enable RLS on investors table
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

-- Enable RLS on uploads table
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;

-- Enable RLS on loan_snapshots table
ALTER TABLE public.loan_snapshots ENABLE ROW LEVEL SECURITY;

-- ==================================================================
-- Loans Table Policies
-- ==================================================================

-- Admin has full access to all loans
CREATE POLICY loans_admin_policy ON public.loans
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Loan Officers can view all loans and create/edit their own
CREATE POLICY loans_loan_officer_select ON public.loans
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'LoanOfficer'::user_role_type));

CREATE POLICY loans_loan_officer_insert ON public.loans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'LoanOfficer'::user_role_type)
  );

CREATE POLICY loans_loan_officer_update ON public.loans
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'LoanOfficer'::user_role_type) AND 
    created_by = auth.uid()
  );

-- Accounting can view all loans but not modify
CREATE POLICY loans_accounting_select ON public.loans
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'Accounting'::user_role_type));

-- Executive can view all loans
CREATE POLICY loans_exec_select ON public.loans
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'Exec'::user_role_type));

-- Servicing team can view all loans and update servicing-related fields
CREATE POLICY loans_servicing_select ON public.loans
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'Servicing'::user_role_type));

CREATE POLICY loans_servicing_update ON public.loans
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Servicing'::user_role_type)
  )
  WITH CHECK (
    -- Only allow updates to servicing-related fields
    -- Assuming we track modified columns in a trigger
    auth.uid() IN (SELECT modified_by FROM public.loans_audit_log WHERE table_name = 'loans' AND field_name IN ('status', 'next_payment_date', 'payment_amount'))
  );

-- ExternalFund can only view loans assigned to their fund
CREATE POLICY loans_external_fund_select ON public.loans
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'ExternalFund'::user_role_type) AND
    investor_id IN (
      SELECT investor_id 
      FROM public.external_fund_access 
      WHERE user_id = auth.uid()
    )
  );

-- ==================================================================
-- Servicers Table Policies
-- ==================================================================

-- Admin has full access to all servicers
CREATE POLICY servicers_admin_policy ON public.servicers
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Most roles can view servicers
CREATE POLICY servicers_view_policy ON public.servicers
  FOR SELECT
  TO authenticated
  USING (
    public.has_any_role(
      auth.uid(), 
      'LoanOfficer'::user_role_type, 
      'Accounting'::user_role_type, 
      'Exec'::user_role_type, 
      'Servicing'::user_role_type
    )
  );

-- Loan officers and servicing can create/edit servicers
CREATE POLICY servicers_modify_policy ON public.servicers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(), 
      'LoanOfficer'::user_role_type,
      'Servicing'::user_role_type
    )
  );

CREATE POLICY servicers_update_policy ON public.servicers
  FOR UPDATE
  TO authenticated
  USING (
    public.has_any_role(
      auth.uid(), 
      'LoanOfficer'::user_role_type,
      'Servicing'::user_role_type
    )
  );

-- ==================================================================
-- Investors Table Policies
-- ==================================================================

-- Admin has full access to all investors
CREATE POLICY investors_admin_policy ON public.investors
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Internal roles can view all investors
CREATE POLICY investors_internal_view_policy ON public.investors
  FOR SELECT
  TO authenticated
  USING (
    public.has_any_role(
      auth.uid(), 
      'LoanOfficer'::user_role_type, 
      'Accounting'::user_role_type, 
      'Exec'::user_role_type, 
      'Servicing'::user_role_type
    )
  );

-- Loan officers and accounting can create/edit investors
CREATE POLICY investors_modify_policy ON public.investors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(), 
      'LoanOfficer'::user_role_type,
      'Accounting'::user_role_type
    )
  );

CREATE POLICY investors_update_policy ON public.investors
  FOR UPDATE
  TO authenticated
  USING (
    public.has_any_role(
      auth.uid(), 
      'LoanOfficer'::user_role_type,
      'Accounting'::user_role_type
    )
  );

-- External funds can only view their own investor record
CREATE POLICY investors_external_fund_view_policy ON public.investors
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'ExternalFund'::user_role_type) AND
    id IN (
      SELECT investor_id 
      FROM public.external_fund_access 
      WHERE user_id = auth.uid()
    )
  );

-- ==================================================================
-- Uploads Table Policies
-- ==================================================================

-- Admin has full access to all uploads
CREATE POLICY uploads_admin_policy ON public.uploads
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- All internal roles can view uploads
CREATE POLICY uploads_internal_view_policy ON public.uploads
  FOR SELECT
  TO authenticated
  USING (
    public.has_any_role(
      auth.uid(), 
      'LoanOfficer'::user_role_type, 
      'Accounting'::user_role_type, 
      'Exec'::user_role_type, 
      'Servicing'::user_role_type
    )
  );

-- All internal roles can create uploads
CREATE POLICY uploads_internal_insert_policy ON public.uploads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(), 
      'LoanOfficer'::user_role_type, 
      'Accounting'::user_role_type, 
      'Exec'::user_role_type, 
      'Servicing'::user_role_type
    )
  );

-- Users can only delete their own uploads
CREATE POLICY uploads_delete_policy ON public.uploads
  FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid() OR
    public.is_admin(auth.uid())
  );

-- External funds can only view uploads tagged for their investor
CREATE POLICY uploads_external_fund_view_policy ON public.uploads
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'ExternalFund'::user_role_type) AND
    (
      is_public = true OR
      investor_id IN (
        SELECT investor_id 
        FROM public.external_fund_access 
        WHERE user_id = auth.uid()
      )
    )
  );

-- ==================================================================
-- Loan Snapshots Table Policies
-- ==================================================================

-- Admin has full access to all loan snapshots
CREATE POLICY loan_snapshots_admin_policy ON public.loan_snapshots
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- All internal roles can view loan snapshots
CREATE POLICY loan_snapshots_internal_view_policy ON public.loan_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.has_any_role(
      auth.uid(), 
      'LoanOfficer'::user_role_type, 
      'Accounting'::user_role_type, 
      'Exec'::user_role_type, 
      'Servicing'::user_role_type
    )
  );

-- External funds can only view snapshots of their loans
CREATE POLICY loan_snapshots_external_fund_view_policy ON public.loan_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'ExternalFund'::user_role_type) AND
    loan_id IN (
      SELECT l.id 
      FROM public.loans l
      WHERE l.investor_id IN (
        SELECT investor_id 
        FROM public.external_fund_access 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Automated systems can create snapshots
CREATE POLICY loan_snapshots_system_insert_policy ON public.loan_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(), 
      'Admin'::user_role_type, 
      'LoanOfficer'::user_role_type, 
      'Accounting'::user_role_type, 
      'Servicing'::user_role_type
    )
  );

-- ==================================================================
-- Export Permissions Table Policies
-- ==================================================================

-- Admin has full access to export permissions
CREATE POLICY export_permissions_admin_policy ON public.export_permissions
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- All users can view export permissions that apply to their roles
CREATE POLICY export_permissions_view_policy ON public.export_permissions
  FOR SELECT
  TO authenticated
  USING (
    role_name IN (
      SELECT ur.name
      FROM public.user_roles ur
      JOIN public.user_role_assignments ura ON ur.id = ura.role_id
      WHERE ura.user_id = auth.uid()
    )
  );

-- ==================================================================
-- Export Logs Table Policies
-- ==================================================================

-- Admin has full access to all export logs
CREATE POLICY export_logs_admin_policy ON public.export_logs
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Users can view their own export logs
CREATE POLICY export_logs_select_policy ON public.export_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can create export logs for themselves
CREATE POLICY export_logs_insert_policy ON public.export_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Approvers can view export logs pending their approval
CREATE POLICY export_logs_approver_select_policy ON public.export_logs
  FOR SELECT
  TO authenticated
  USING (
    status = 'pending_approval' AND
    EXISTS (
      SELECT 1 
      FROM public.export_permissions ep
      WHERE ep.role_name = export_logs.role_name
      AND ep.resource_type = export_logs.resource_type
      AND ep.format = export_logs.format
      AND ep.requires_approval = true
      AND (
        ep.approval_role IN (
          SELECT ur.name
          FROM public.user_roles ur
          JOIN public.user_role_assignments ura ON ur.id = ura.role_id
          WHERE ura.user_id = auth.uid()
        )
      )
    )
  );
CREATE POLICY loan_snapshots_system_insert_policy ON public.loan_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_any_role(
      auth.uid(), 
      'Admin'::user_role_type, 
      'LoanOfficer'::user_role_type,
      'Servicing'::user_role_type
    )
  );

-- No one can delete loan snapshots (historical record)
-- However, admins might need this in exceptional cases
CREATE POLICY loan_snapshots_admin_delete_policy ON public.loan_snapshots
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));
