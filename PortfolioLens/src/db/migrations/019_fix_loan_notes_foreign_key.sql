-- Migration to fix the loan_notes foreign key constraint issue
-- Simplifies the approach to ensure it works correctly

-- Drop the existing foreign key constraint if it exists
ALTER TABLE IF EXISTS loan_notes 
DROP CONSTRAINT IF EXISTS loan_notes_user_id_fkey;

-- Create the sync_auth_users function to copy records from auth.users to users table
CREATE OR REPLACE FUNCTION sync_auth_users()
RETURNS VOID AS $$
BEGIN
  -- Insert auth users into the users table if they don't already exist
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
  ON CONFLICT (id) DO NOTHING;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a simple function to check if a user ID exists
CREATE OR REPLACE FUNCTION is_valid_user_id(user_id UUID) 
RETURNS BOOLEAN AS $$
BEGIN
  -- First try to sync users if needed
  PERFORM sync_auth_users();
  
  -- Then check if the user exists
  RETURN EXISTS (
    SELECT 1 FROM users WHERE id = user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a simpler trigger function to ensure users exist
CREATE OR REPLACE FUNCTION sync_user_before_note()
RETURNS TRIGGER AS $$
BEGIN
  -- Run the sync function first
  PERFORM sync_auth_users();
  
  -- Check if the user now exists in users table
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id) THEN
    RAISE EXCEPTION 'User ID % not found in users table after sync attempt', NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS ensure_user_exists_before_note ON loan_notes;

-- Add trigger to sync users before note insertion or update
CREATE TRIGGER ensure_user_exists_before_note
BEFORE INSERT OR UPDATE ON loan_notes
FOR EACH ROW
EXECUTE FUNCTION sync_user_before_note();

-- Run the sync function once to copy existing auth users
SELECT sync_auth_users();

-- Add the foreign key constraint as deferrable
-- This allows the trigger to run and create the user before the constraint is checked
ALTER TABLE loan_notes
ADD CONSTRAINT loan_notes_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id)
DEFERRABLE INITIALLY IMMEDIATE;

-- Add a comment to explain the function purpose
COMMENT ON FUNCTION sync_user_before_note() IS 'Ensures users exist in the users table before allowing note creation';
COMMENT ON FUNCTION is_valid_user_id(UUID) IS 'Checks if a user ID exists in the users table';
COMMENT ON FUNCTION sync_auth_users() IS 'Syncs all users from auth.users to the users table';