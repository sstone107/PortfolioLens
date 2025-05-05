-- Export Permissions Schema for PortfolioLens
-- This script creates the necessary tables and functions for export/download permission management

-- Create enum type for export resource types
CREATE TYPE public.export_resource_type AS ENUM (
  'loans',
  'loan_snapshots',
  'investors',
  'servicers',
  'reports',
  'analytics'
);

-- Create export formats enum
CREATE TYPE public.export_format_type AS ENUM (
  'csv',
  'pdf',
  'excel',
  'json',
  'api'
);

-- Create export_permissions table to define what roles can export what resources
CREATE TABLE public.export_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name user_role_type NOT NULL,
  resource_type export_resource_type NOT NULL,
  format export_format_type NOT NULL,
  allowed BOOLEAN DEFAULT true,
  max_records INTEGER, -- NULL means unlimited
  requires_approval BOOLEAN DEFAULT false,
  approval_role user_role_type, -- Role that can approve this export if required
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_name, resource_type, format)
);

-- Create export_logs table to track all exports
CREATE TABLE public.export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role_name user_role_type NOT NULL,
  resource_type export_resource_type NOT NULL,
  format export_format_type NOT NULL,
  record_count INTEGER,
  filters JSONB, -- Store the filters used for the export
  ip_address TEXT,
  user_agent TEXT,
  status TEXT, -- 'success', 'failed', 'pending_approval'
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX idx_export_permissions_role ON public.export_permissions(role_name);
CREATE INDEX idx_export_logs_user_id ON public.export_logs(user_id);
CREATE INDEX idx_export_logs_created_at ON public.export_logs(created_at);

-- Enable RLS on export tables
ALTER TABLE public.export_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- Create trigger to update the updated_at timestamp
CREATE TRIGGER update_export_permissions_updated_at
BEFORE UPDATE ON public.export_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to check if a user can export a specific resource
CREATE OR REPLACE FUNCTION public.can_export_resource(
  p_user_id UUID,
  p_resource_type export_resource_type,
  p_format export_format_type,
  p_record_count INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_can_export BOOLEAN := false;
  v_role record;
  v_permission record;
BEGIN
  -- Admins can export everything
  IF public.is_admin(p_user_id) THEN
    RETURN true;
  END IF;
  
  -- Check each role the user has
  FOR v_role IN (
    SELECT ur.name
    FROM public.user_roles ur
    JOIN public.user_role_assignments ura ON ur.id = ura.role_id
    WHERE ura.user_id = p_user_id
  ) LOOP
    -- Check if this role has export permission for the resource and format
    SELECT * INTO v_permission
    FROM public.export_permissions
    WHERE role_name = v_role.name
    AND resource_type = p_resource_type
    AND format = p_format
    AND allowed = true;
    
    -- If permission exists and record count is within limits, grant export
    IF v_permission.id IS NOT NULL THEN
      -- If max_records is NULL, there's no limit
      IF v_permission.max_records IS NULL OR 
         (p_record_count IS NOT NULL AND p_record_count <= v_permission.max_records) THEN
        v_can_export := true;
        EXIT; -- Found a valid permission, no need to check other roles
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_can_export;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log an export attempt
CREATE OR REPLACE FUNCTION public.log_export(
  p_user_id UUID,
  p_resource_type export_resource_type,
  p_format export_format_type,
  p_record_count INTEGER,
  p_filters JSONB,
  p_ip_address TEXT,
  p_user_agent TEXT
)
RETURNS UUID AS $$
DECLARE
  v_role_name user_role_type;
  v_permission record;
  v_status TEXT := 'success';
  v_log_id UUID;
BEGIN
  -- Get the highest priority role of the user
  SELECT ur.name INTO v_role_name
  FROM public.user_roles ur
  JOIN public.user_role_assignments ura ON ur.id = ura.role_id
  WHERE ura.user_id = p_user_id
  ORDER BY CASE ur.name 
    WHEN 'Admin' THEN 1
    WHEN 'Exec' THEN 2
    WHEN 'Accounting' THEN 3
    WHEN 'LoanOfficer' THEN 4
    WHEN 'Servicing' THEN 5
    WHEN 'ExternalFund' THEN 6
    ELSE 99
  END
  LIMIT 1;
  
  -- Check if approval is required
  SELECT * INTO v_permission
  FROM public.export_permissions
  WHERE role_name = v_role_name
  AND resource_type = p_resource_type
  AND format = p_format;
  
  IF v_permission.requires_approval THEN
    v_status := 'pending_approval';
  END IF;
  
  -- Log the export
  INSERT INTO public.export_logs (
    user_id, 
    role_name, 
    resource_type, 
    format, 
    record_count, 
    filters, 
    ip_address, 
    user_agent, 
    status
  ) VALUES (
    p_user_id, 
    v_role_name, 
    p_resource_type, 
    p_format, 
    p_record_count, 
    p_filters, 
    p_ip_address, 
    p_user_agent, 
    v_status
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve an export
CREATE OR REPLACE FUNCTION public.approve_export(
  p_approver_id UUID,
  p_export_log_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_log record;
  v_permission record;
  v_can_approve BOOLEAN := false;
BEGIN
  -- Get the export log
  SELECT * INTO v_log
  FROM public.export_logs
  WHERE id = p_export_log_id;
  
  IF v_log.id IS NULL THEN
    RAISE EXCEPTION 'Export log not found';
  END IF;
  
  IF v_log.status != 'pending_approval' THEN
    RAISE EXCEPTION 'Export is not pending approval';
  END IF;
  
  -- Get the permission to check which role can approve
  SELECT * INTO v_permission
  FROM public.export_permissions
  WHERE role_name = v_log.role_name
  AND resource_type = v_log.resource_type
  AND format = v_log.format;
  
  -- Check if approver has the required role
  v_can_approve := public.is_admin(p_approver_id) OR 
                  (v_permission.approval_role IS NOT NULL AND 
                   public.has_role(p_approver_id, v_permission.approval_role));
  
  IF NOT v_can_approve THEN
    RAISE EXCEPTION 'User does not have permission to approve this export';
  END IF;
  
  -- Update the log with approval info
  UPDATE public.export_logs SET
    status = 'success',
    approved_by = p_approver_id,
    approved_at = NOW()
  WHERE id = p_export_log_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default export permissions for all roles
INSERT INTO public.export_permissions (role_name, resource_type, format, allowed, max_records, requires_approval) VALUES
-- Admin can export everything without restrictions
('Admin', 'loans', 'csv', true, NULL, false),
('Admin', 'loans', 'pdf', true, NULL, false),
('Admin', 'loans', 'excel', true, NULL, false),
('Admin', 'loans', 'json', true, NULL, false),
('Admin', 'loans', 'api', true, NULL, false),
('Admin', 'loan_snapshots', 'csv', true, NULL, false),
('Admin', 'loan_snapshots', 'pdf', true, NULL, false),
('Admin', 'loan_snapshots', 'excel', true, NULL, false),
('Admin', 'loan_snapshots', 'json', true, NULL, false),
('Admin', 'loan_snapshots', 'api', true, NULL, false),
('Admin', 'investors', 'csv', true, NULL, false),
('Admin', 'investors', 'pdf', true, NULL, false),
('Admin', 'investors', 'excel', true, NULL, false),
('Admin', 'investors', 'json', true, NULL, false),
('Admin', 'investors', 'api', true, NULL, false),
('Admin', 'servicers', 'csv', true, NULL, false),
('Admin', 'servicers', 'pdf', true, NULL, false),
('Admin', 'servicers', 'excel', true, NULL, false),
('Admin', 'servicers', 'json', true, NULL, false),
('Admin', 'servicers', 'api', true, NULL, false),
('Admin', 'reports', 'csv', true, NULL, false),
('Admin', 'reports', 'pdf', true, NULL, false),
('Admin', 'reports', 'excel', true, NULL, false),
('Admin', 'reports', 'json', true, NULL, false),
('Admin', 'reports', 'api', true, NULL, false),
('Admin', 'analytics', 'csv', true, NULL, false),
('Admin', 'analytics', 'pdf', true, NULL, false),
('Admin', 'analytics', 'excel', true, NULL, false),
('Admin', 'analytics', 'json', true, NULL, false),
('Admin', 'analytics', 'api', true, NULL, false),

-- Executives can export everything with some limits
('Exec', 'loans', 'csv', true, 10000, false),
('Exec', 'loans', 'pdf', true, 1000, false),
('Exec', 'loans', 'excel', true, 10000, false),
('Exec', 'loans', 'json', true, 10000, false),
('Exec', 'loans', 'api', true, 1000, false),
('Exec', 'loan_snapshots', 'csv', true, 10000, false),
('Exec', 'loan_snapshots', 'pdf', true, 1000, false),
('Exec', 'loan_snapshots', 'excel', true, 10000, false),
('Exec', 'loan_snapshots', 'json', true, 10000, false),
('Exec', 'loan_snapshots', 'api', true, 1000, false),
('Exec', 'investors', 'csv', true, NULL, false),
('Exec', 'investors', 'pdf', true, NULL, false),
('Exec', 'investors', 'excel', true, NULL, false),
('Exec', 'investors', 'json', true, NULL, false),
('Exec', 'investors', 'api', true, NULL, false),
('Exec', 'servicers', 'csv', true, NULL, false),
('Exec', 'servicers', 'pdf', true, NULL, false),
('Exec', 'servicers', 'excel', true, NULL, false),
('Exec', 'servicers', 'json', true, NULL, false),
('Exec', 'servicers', 'api', true, NULL, false),
('Exec', 'reports', 'csv', true, NULL, false),
('Exec', 'reports', 'pdf', true, NULL, false),
('Exec', 'reports', 'excel', true, NULL, false),
('Exec', 'reports', 'json', true, NULL, false),
('Exec', 'reports', 'api', true, NULL, false),
('Exec', 'analytics', 'csv', true, NULL, false),
('Exec', 'analytics', 'pdf', true, NULL, false),
('Exec', 'analytics', 'excel', true, NULL, false),
('Exec', 'analytics', 'json', true, NULL, false),
('Exec', 'analytics', 'api', true, NULL, false),

-- Accounting has full access to financial data
('Accounting', 'loans', 'csv', true, 5000, false),
('Accounting', 'loans', 'pdf', true, 500, false),
('Accounting', 'loans', 'excel', true, 5000, false),
('Accounting', 'loans', 'json', true, 5000, false),
('Accounting', 'loans', 'api', true, 500, false),
('Accounting', 'loan_snapshots', 'csv', true, 5000, false),
('Accounting', 'loan_snapshots', 'pdf', true, 500, false),
('Accounting', 'loan_snapshots', 'excel', true, 5000, false),
('Accounting', 'loan_snapshots', 'json', true, 5000, false),
('Accounting', 'loan_snapshots', 'api', true, 500, false),
('Accounting', 'investors', 'csv', true, NULL, false),
('Accounting', 'investors', 'pdf', true, NULL, false),
('Accounting', 'investors', 'excel', true, NULL, false),
('Accounting', 'investors', 'json', true, NULL, false),
('Accounting', 'investors', 'api', false, NULL, true),
('Accounting', 'reports', 'csv', true, NULL, false),
('Accounting', 'reports', 'pdf', true, NULL, false),
('Accounting', 'reports', 'excel', true, NULL, false),
('Accounting', 'reports', 'json', true, NULL, false),
('Accounting', 'analytics', 'csv', true, NULL, false),
('Accounting', 'analytics', 'pdf', true, NULL, false),
('Accounting', 'analytics', 'excel', true, NULL, false),
('Accounting', 'analytics', 'json', true, NULL, false),

-- Loan Officers have moderate export limits
('LoanOfficer', 'loans', 'csv', true, 1000, false),
('LoanOfficer', 'loans', 'pdf', true, 100, false),
('LoanOfficer', 'loans', 'excel', true, 1000, false),
('LoanOfficer', 'loans', 'json', true, 1000, false),
('LoanOfficer', 'loans', 'api', false, NULL, true),
('LoanOfficer', 'loan_snapshots', 'csv', true, 1000, false),
('LoanOfficer', 'loan_snapshots', 'pdf', true, 100, false),
('LoanOfficer', 'loan_snapshots', 'excel', true, 1000, false),
('LoanOfficer', 'loan_snapshots', 'json', true, 1000, false),
('LoanOfficer', 'loan_snapshots', 'api', false, NULL, true),
('LoanOfficer', 'investors', 'csv', true, NULL, false),
('LoanOfficer', 'investors', 'pdf', true, NULL, false),
('LoanOfficer', 'investors', 'excel', true, NULL, false),
('LoanOfficer', 'investors', 'json', true, NULL, false),
('LoanOfficer', 'servicers', 'csv', true, NULL, false),
('LoanOfficer', 'servicers', 'pdf', true, NULL, false),
('LoanOfficer', 'servicers', 'excel', true, NULL, false),
('LoanOfficer', 'servicers', 'json', true, NULL, false),
('LoanOfficer', 'reports', 'csv', true, NULL, false),
('LoanOfficer', 'reports', 'pdf', true, NULL, false),
('LoanOfficer', 'reports', 'excel', true, NULL, false),
('LoanOfficer', 'analytics', 'csv', true, NULL, false),
('LoanOfficer', 'analytics', 'pdf', true, NULL, false),
('LoanOfficer', 'analytics', 'excel', true, NULL, false),

-- Servicing team has moderate export limits
('Servicing', 'loans', 'csv', true, 1000, false),
('Servicing', 'loans', 'pdf', true, 100, false),
('Servicing', 'loans', 'excel', true, 1000, false),
('Servicing', 'loans', 'json', true, 1000, false),
('Servicing', 'loans', 'api', false, NULL, true),
('Servicing', 'loan_snapshots', 'csv', true, 1000, false),
('Servicing', 'loan_snapshots', 'pdf', true, 100, false),
('Servicing', 'loan_snapshots', 'excel', true, 1000, false),
('Servicing', 'loan_snapshots', 'json', true, 1000, false),
('Servicing', 'loan_snapshots', 'api', false, NULL, true),
('Servicing', 'servicers', 'csv', true, NULL, false),
('Servicing', 'servicers', 'pdf', true, NULL, false),
('Servicing', 'servicers', 'excel', true, NULL, false),
('Servicing', 'servicers', 'json', true, NULL, false),
('Servicing', 'reports', 'csv', true, NULL, false),
('Servicing', 'reports', 'pdf', true, NULL, false),
('Servicing', 'reports', 'excel', true, NULL, false),
('Servicing', 'analytics', 'csv', true, NULL, false),
('Servicing', 'analytics', 'pdf', true, NULL, false),
('Servicing', 'analytics', 'excel', true, NULL, false),

-- External funds have very limited export capabilities
('ExternalFund', 'loans', 'csv', true, 100, false),
('ExternalFund', 'loans', 'pdf', true, 100, false),
('ExternalFund', 'loans', 'excel', true, 100, false),
('ExternalFund', 'loan_snapshots', 'csv', true, 100, false),
('ExternalFund', 'loan_snapshots', 'pdf', true, 100, false),
('ExternalFund', 'loan_snapshots', 'excel', true, 100, false),
('ExternalFund', 'reports', 'pdf', true, 10, false);
