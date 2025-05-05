-- User Roles Schema for PortfolioLens
-- This script creates the necessary tables and functions for user role management

-- Create enum type for role names
CREATE TYPE public.user_role_type AS ENUM (
  'Admin',
  'LoanOfficer', 
  'Accounting', 
  'Exec', 
  'Servicing', 
  'ExternalFund'
);

-- Create roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name user_role_type NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name)
);

-- Create user_role_assignments table to link users with roles (many-to-many)
CREATE TABLE public.user_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES public.user_roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role_id)
);

-- Create index for faster lookups
CREATE INDEX idx_user_role_assignments_user_id ON public.user_role_assignments(user_id);
CREATE INDEX idx_user_role_assignments_role_id ON public.user_role_assignments(role_id);

-- Enable RLS on roles tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies for user_roles table
-- Admin can manage roles
CREATE POLICY "Admins can manage roles" 
ON public.user_roles 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.user_roles ur ON ura.role_id = ur.id
    WHERE ura.user_id = auth.uid() AND ur.name = 'Admin'
  )
);

-- All authenticated users can read roles
CREATE POLICY "Users can view roles" 
ON public.user_roles 
FOR SELECT 
TO authenticated 
USING (true);

-- Create policies for user_role_assignments table
-- Admin can manage role assignments
CREATE POLICY "Admins can manage role assignments" 
ON public.user_role_assignments 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.user_roles ur ON ura.role_id = ur.id
    WHERE ura.user_id = auth.uid() AND ur.name = 'Admin'
  )
);

-- Users can see their own role assignments
CREATE POLICY "Users can view their own role assignments" 
ON public.user_role_assignments 
FOR SELECT 
TO authenticated 
USING (user_id = auth.uid());

-- Create function to get user roles
CREATE OR REPLACE FUNCTION public.get_user_roles(user_uuid UUID)
RETURNS TABLE (role_name user_role_type) AS $$
BEGIN
  RETURN QUERY
  SELECT ur.name
  FROM public.user_roles ur
  JOIN public.user_role_assignments ura ON ur.id = ura.role_id
  WHERE ura.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(user_uuid UUID, role_name user_role_type)
RETURNS BOOLEAN AS $$
DECLARE
  role_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.user_role_assignments ura ON ur.id = ura.role_id
    WHERE ura.user_id = user_uuid AND ur.name = role_name
  ) INTO role_exists;
  
  RETURN role_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_role_assignments_updated_at
BEFORE UPDATE ON public.user_role_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default roles
INSERT INTO public.user_roles (name, description) VALUES
('Admin', 'System administrator with full access to all features'),
('LoanOfficer', 'Can manage loans and interact with borrowers'),
('Accounting', 'Manages financial records and transactions'),
('Exec', 'Executive with access to high-level reports and analytics'),
('Servicing', 'Handles loan servicing and maintenance tasks'),
('ExternalFund', 'External investor with limited access to their portfolio');

-- Create function to assign a role to a user
CREATE OR REPLACE FUNCTION public.assign_role_to_user(
  p_user_id UUID,
  p_role_name user_role_type,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_role_id UUID;
  v_assignment_id UUID;
BEGIN
  -- Get the role ID
  SELECT id INTO v_role_id FROM public.user_roles WHERE name = p_role_name;
  
  -- If role doesn't exist, raise exception
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role % does not exist', p_role_name;
  END IF;
  
  -- Check if assignment already exists
  SELECT id INTO v_assignment_id 
  FROM public.user_role_assignments
  WHERE user_id = p_user_id AND role_id = v_role_id;
  
  -- If assignment doesn't exist, create it
  IF v_assignment_id IS NULL THEN
    INSERT INTO public.user_role_assignments (user_id, role_id, assigned_by)
    VALUES (p_user_id, v_role_id, p_assigned_by)
    RETURNING id INTO v_assignment_id;
  END IF;
  
  RETURN v_assignment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to remove a role from a user
CREATE OR REPLACE FUNCTION public.remove_role_from_user(
  p_user_id UUID,
  p_role_name user_role_type
)
RETURNS BOOLEAN AS $$
DECLARE
  v_role_id UUID;
  v_rows_affected INTEGER;
BEGIN
  -- Get the role ID
  SELECT id INTO v_role_id FROM public.user_roles WHERE name = p_role_name;
  
  -- If role doesn't exist, raise exception
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role % does not exist', p_role_name;
  END IF;
  
  -- Remove the assignment
  DELETE FROM public.user_role_assignments
  WHERE user_id = p_user_id AND role_id = v_role_id;
  
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  
  RETURN v_rows_affected > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
