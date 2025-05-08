# Fixing the User Account and Admin Access Issues

This directory contains scripts to fix several issues with the user system and admin access:

## Main Issues Fixed

1. **Encrypted Password Constraint**: The `users` table has a `NOT NULL` constraint on the `encrypted_password` column, but we're using Supabase Auth for authentication, so we don't have real encrypted passwords.

2. **Missing Admin Pages**: Several admin pages were missing proper implementation, such as user management.

3. **Functions Not Existing**: Several database functions mentioned in the code did not exist in the database, including:
   - `is_valid_user_id`
   - `get_admin_stats`
   - `sync_auth_users`

4. **Missing Tables**: The `admin_audit_log` table was missing but referenced in the code.

## Solutions

1. **Database Fixes (via Supabase MCP)**:
   - Created all missing functions
   - Made the `encrypted_password` column nullable
   - Created the missing `admin_audit_log` table
   - Added proper Row Level Security (RLS) policies

2. **Added Admin Pages**:
   - Added a user management page at `/admin/users`
   - Updated routes in App.tsx to include the new pages

3. **Direct Fix Script**:
   The `prepare-encrypt-password.js` script directly fixes the most critical issue:
   - Makes the `encrypted_password` column nullable
   - Syncs users from `auth.users` to `users` table with proper data
   - Assigns admin role to all users

## How to Run the Fix

1. Set your Supabase credentials in `.env`:
   ```
   SUPABASE_URL=https://kukfbbaevndujnodafnk.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

2. Run the direct fix script:
   ```bash
   cd PortfolioLens
   node scripts/prepare-encrypt-password.js
   ```

3. Restart your application and sign in again to refresh your session.

## Testing the Fixes

After running the fixes:

1. Try accessing the admin dashboard at `/admin`
2. Navigate to the user management page at `/admin/users`
3. Try creating loan notes on a loan detail page

All of these features should now work properly without the previous errors.

## Note on Admin Access

All users are now assigned the Admin role by default. In a production environment, you would want to be more selective about who gets admin access.