-- Admin Features Schema for PortfolioLens
-- This script creates the necessary tables for admin-specific features
-- including user impersonation and module visibility control

-- ==================================================================
-- Impersonation Sessions
-- ==================================================================

-- Table to track admin impersonation sessions
CREATE TABLE public.impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  impersonated_user_id UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  
  -- Constraints
  CHECK (admin_id != impersonated_user_id), -- Cannot impersonate yourself
  CHECK (ended_at IS NULL OR ended_at > started_at) -- End time must be after start time
);

-- Add RLS policy for impersonation sessions
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Only admins can view impersonation sessions
CREATE POLICY impersonation_sessions_admin_select ON public.impersonation_sessions
  FOR SELECT 
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Only admins can create impersonation sessions
CREATE POLICY impersonation_sessions_admin_insert ON public.impersonation_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Only admins can update impersonation sessions
CREATE POLICY impersonation_sessions_admin_update ON public.impersonation_sessions
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ==================================================================
-- Module Visibility Settings
-- ==================================================================

-- Create module types for the application
CREATE TYPE public.module_type AS ENUM (
  'loans',
  'servicers',
  'investors',
  'uploads',
  'reports',
  'admin',
  'settings',
  'analytics'
);

-- Table for module visibility settings
CREATE TABLE public.module_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module module_type NOT NULL,
  role_id UUID NOT NULL REFERENCES public.user_roles(id),
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL REFERENCES auth.users(id),
  
  -- Constraints
  UNIQUE(module, role_id)
);

-- Add RLS policy for module visibility
ALTER TABLE public.module_visibility ENABLE ROW LEVEL SECURITY;

-- Only admins can manage module visibility
CREATE POLICY module_visibility_admin_all ON public.module_visibility
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- All authenticated users can view module visibility
CREATE POLICY module_visibility_all_select ON public.module_visibility
  FOR SELECT
  TO authenticated
  USING (true);

-- ==================================================================
-- Admin Audit Log
-- ==================================================================

-- Create action types for logging
CREATE TYPE public.admin_action_type AS ENUM (
  'impersonation_start',
  'impersonation_end',
  'module_visibility_change',
  'role_assignment',
  'role_removal',
  'user_creation',
  'user_deletion',
  'settings_change'
);

-- Table for admin audit log
CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  action_type admin_action_type NOT NULL,
  target_id UUID, -- Optional target (user, role, etc.)
  target_type TEXT, -- Type of target (user, role, module, etc.)
  details JSONB, -- Flexible structure for action-specific details
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add RLS policy for admin audit log
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view the audit log
CREATE POLICY admin_audit_log_admin_select ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- System can insert into audit log (for triggers)
CREATE POLICY admin_audit_log_insert ON public.admin_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- No one can update or delete audit logs
CREATE POLICY admin_audit_log_no_update ON public.admin_audit_log
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY admin_audit_log_no_delete ON public.admin_audit_log
  FOR DELETE
  TO authenticated
  USING (false);

-- ==================================================================
-- Helper Functions and Triggers
-- ==================================================================

-- Function to log admin actions
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_admin_id UUID,
  p_action_type admin_action_type,
  p_target_id UUID,
  p_target_type TEXT,
  p_details JSONB
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.admin_audit_log (
    admin_id, 
    action_type, 
    target_id, 
    target_type, 
    details, 
    ip_address,
    user_agent
  ) VALUES (
    p_admin_id, 
    p_action_type, 
    p_target_id, 
    p_target_type, 
    p_details,
    current_setting('request.headers', true)::json->>'x-forwarded-for',
    current_setting('request.headers', true)::json->>'user-agent'
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to log impersonation sessions
CREATE OR REPLACE FUNCTION public.log_impersonation_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_admin_action(
      NEW.admin_id,
      'impersonation_start',
      NEW.impersonated_user_id,
      'user',
      jsonb_build_object(
        'session_id', NEW.id,
        'reason', NEW.reason
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.active = TRUE AND NEW.active = FALSE THEN
    PERFORM public.log_admin_action(
      NEW.admin_id,
      'impersonation_end',
      NEW.impersonated_user_id,
      'user',
      jsonb_build_object(
        'session_id', NEW.id,
        'duration_minutes', 
        EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60
      )
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER impersonation_audit_trigger
AFTER INSERT OR UPDATE ON public.impersonation_sessions
FOR EACH ROW EXECUTE FUNCTION public.log_impersonation_trigger();

-- Trigger to log module visibility changes
CREATE OR REPLACE FUNCTION public.log_module_visibility_trigger() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_admin_action(
      NEW.created_by,
      'module_visibility_change',
      NEW.role_id,
      'role',
      jsonb_build_object(
        'module', NEW.module,
        'visible', NEW.visible,
        'action', 'create'
      )
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.visible != NEW.visible THEN
    PERFORM public.log_admin_action(
      NEW.updated_by,
      'module_visibility_change',
      NEW.role_id,
      'role',
      jsonb_build_object(
        'module', NEW.module,
        'visible', NEW.visible,
        'previous', OLD.visible,
        'action', 'update'
      )
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER module_visibility_audit_trigger
AFTER INSERT OR UPDATE ON public.module_visibility
FOR EACH ROW EXECUTE FUNCTION public.log_module_visibility_trigger();

-- Function to check if a module is visible to a user
CREATE OR REPLACE FUNCTION public.is_module_visible(p_user_id UUID, p_module module_type)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_visible BOOLEAN;
BEGIN
  -- Admin can see everything
  IF public.is_admin(p_user_id) THEN
    RETURN TRUE;
  END IF;
  
  -- Check module visibility settings for user roles
  SELECT EXISTS (
    SELECT 1 
    FROM public.module_visibility mv
    JOIN public.user_role_assignments ura ON mv.role_id = ura.role_id
    WHERE ura.user_id = p_user_id
    AND mv.module = p_module
    AND mv.visible = TRUE
  ) INTO v_is_visible;
  
  RETURN COALESCE(v_is_visible, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
