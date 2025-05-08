-- Direct SQL fix for loan_notes foreign key issue
-- Can be executed directly in Supabase SQL editor

-- Step 1: Drop the constraint causing the issues
ALTER TABLE IF EXISTS loan_notes 
DROP CONSTRAINT IF EXISTS loan_notes_user_id_fkey;

-- Step 2: Copy missing users from auth.users to users table 
INSERT INTO users (id, email, full_name, created_at, updated_at)
SELECT 
  au.id, 
  au.email, 
  COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', au.email),
  au.created_at,
  au.updated_at
FROM 
  auth.users au
WHERE 
  NOT EXISTS (SELECT 1 FROM users u WHERE u.id = au.id)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Add back the foreign key constraint 
ALTER TABLE loan_notes
ADD CONSTRAINT loan_notes_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id);