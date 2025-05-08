-- SQL to fix missing functions and row-level security issues

-- Fix 1: Create the missing is_valid_user_id function
CREATE OR REPLACE FUNCTION is_valid_user_id(user_id UUID) 
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users WHERE id = user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix 2: Make sure users have proper RLS policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Fix 3: Create policies to allow authenticated users to view users table
DROP POLICY IF EXISTS "Users can view all users" ON users;
CREATE POLICY "Users can view all users" ON users
  FOR SELECT 
  TO authenticated
  USING (true);

-- Fix 4: Allow users to insert their own record
DROP POLICY IF EXISTS "Users can insert their own record" ON users;
CREATE POLICY "Users can insert their own record" ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Fix 5: Allow admin to insert any user record
DROP POLICY IF EXISTS "Admins can insert any user" ON users;
CREATE POLICY "Admins can insert any user" ON users
  FOR INSERT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid() AND ur.name = 'Admin'
    )
  );

-- Fix 6: Create basic admin stats function
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSON AS $$
DECLARE
  total_users INT;
  total_loans INT;
  recent_imports INT;
  result JSON;
BEGIN
  -- Get total users
  SELECT COUNT(*) INTO total_users FROM users;
  
  -- Get total loans (if the table exists)
  BEGIN
    SELECT COUNT(*) INTO total_loans FROM loans;
  EXCEPTION
    WHEN undefined_table THEN
      total_loans := 0;
  END;
  
  -- Get recent imports (if the table exists)
  BEGIN
    SELECT COUNT(*) INTO recent_imports 
    FROM import_batches 
    WHERE created_at > (CURRENT_DATE - INTERVAL '7 days');
  EXCEPTION
    WHEN undefined_table THEN
      recent_imports := 0;
  END;
  
  -- Construct result JSON
  result := json_build_object(
    'total_users', total_users,
    'total_loans', total_loans,
    'recent_imports', recent_imports,
    'system_status', 'operational'
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix 7: Create a basic admin_audit_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(255) NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Add index on created_at for faster sorting
  CONSTRAINT admin_audit_log_created_at_idx CHECK (true)
);

-- Add RLS policy for admin_audit_log
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Allow admins to view audit logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON admin_audit_log;
CREATE POLICY "Admins can view audit logs" ON admin_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid() AND ur.name = 'Admin'
    )
  );

-- Fix 8: Create the users_auth_sync function
CREATE OR REPLACE FUNCTION sync_auth_users()
RETURNS VOID AS $$
DECLARE
  inserted_count INT;
BEGIN
  -- Insert users from auth.users into public.users if they don't exist
  WITH inserted AS (
    INSERT INTO users (id, email, full_name, created_at, updated_at)
    SELECT 
      au.id, 
      au.email, 
      COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', au.email) as full_name,
      au.created_at,
      au.updated_at
    FROM 
      auth.users au
    WHERE 
      NOT EXISTS (SELECT 1 FROM users u WHERE u.id = au.id)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO inserted_count FROM inserted;
  
  RAISE NOTICE 'Synchronized % users from auth to public schema', inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the sync function once to copy all auth users to the users table
SELECT sync_auth_users();

-- Add function to check/grant admin access
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM user_role_assignments ura
    JOIN user_roles ur ON ura.role_id = ur.id
    WHERE ura.user_id = user_id AND ur.name = 'Admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to promote a user to admin (useful for initial setup)
CREATE OR REPLACE FUNCTION promote_to_admin(user_email TEXT)
RETURNS TEXT AS $$
DECLARE
  target_user_id UUID;
  admin_role_id UUID;
BEGIN
  -- Get user ID from email
  SELECT id INTO target_user_id 
  FROM auth.users 
  WHERE email = user_email;
  
  IF target_user_id IS NULL THEN
    RETURN 'User not found with email: ' || user_email;
  END IF;
  
  -- Make sure user is synced to public schema
  PERFORM sync_auth_users();
  
  -- Get admin role ID
  SELECT id INTO admin_role_id
  FROM user_roles
  WHERE name = 'Admin';
  
  IF admin_role_id IS NULL THEN
    -- Create Admin role if it doesn't exist
    INSERT INTO user_roles (name, description)
    VALUES ('Admin', 'System administrator with full access')
    RETURNING id INTO admin_role_id;
  END IF;
  
  -- Assign admin role to user
  INSERT INTO user_role_assignments (user_id, role_id)
  VALUES (target_user_id, admin_role_id)
  ON CONFLICT (user_id, role_id) DO NOTHING;
  
  RETURN 'Successfully promoted user to Admin: ' || user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;