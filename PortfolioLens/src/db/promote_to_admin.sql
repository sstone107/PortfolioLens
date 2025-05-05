-- Script to promote sstone16@gmail.com to Admin role

-- Get the UUID of the user
DO $$
DECLARE
  user_id UUID;
  admin_id UUID;
BEGIN
  -- Find the user's UUID
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = 'sstone16@gmail.com';

  -- Find an admin to be the assignor (optional)
  SELECT u.id INTO admin_id
  FROM auth.users u
  JOIN public.user_role_assignments ura ON u.id = ura.user_id
  JOIN public.user_roles r ON ura.role_id = r.id
  WHERE r.name = 'Admin'
  LIMIT 1;
  
  -- Display information for verification
  RAISE NOTICE 'User ID: %', user_id;
  RAISE NOTICE 'Admin ID (assignor): %', admin_id;
  
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'User with email sstone16@gmail.com not found';
  END IF;
  
  -- Assign the Admin role to the user
  PERFORM public.assign_role_to_user(
    user_id,
    'Admin'::user_role_type,
    admin_id -- This is optional, can be NULL
  );
  
  RAISE NOTICE 'Successfully promoted sstone16@gmail.com to Admin role';
END $$;

-- Verify the role was assigned
SELECT 
  u.email,
  r.name AS role_name,
  ura.created_at AS assigned_at
FROM auth.users u
JOIN public.user_role_assignments ura ON u.id = ura.user_id
JOIN public.user_roles r ON ura.role_id = r.id
WHERE u.email = 'sstone16@gmail.com';
