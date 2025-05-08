# PortfolioLens Admin and User Permissions Fix

This directory contains scripts to fix the missing database functions and permissions issues that are causing errors with loan notes creation and admin dashboard access.

## Problem Description

Two main issues have been identified:

1. **Loan Notes Error**: The `loan_notes` feature is failing with "Your user account is not properly set up in the system" error. This is because:
   - The `is_valid_user_id` function referenced in code doesn't exist in the database
   - Users table has restrictive row-level security (RLS) policies blocking user operations
   - The foreign key constraint between loan_notes and users is causing issues

2. **Admin Dashboard Error**: The admin panel fails to load with "Failed to load admin dashboard data" error. This is because:
   - The `get_admin_stats` function referenced in code doesn't exist
   - The `admin_audit_log` table doesn't exist

## Solution

We've created several scripts to fix these issues:

### 1. Fix Database Functions and Permissions

The `fix-missing-functions.sql` file contains SQL to:
- Create the missing `is_valid_user_id` function
- Create proper RLS policies for the users table
- Create the missing `get_admin_stats` function
- Create the missing `admin_audit_log` table
- Create a `sync_auth_users` function to sync users from auth.users to the public.users table
- Create functions for managing admin permissions

Run this script using:

```bash
node scripts/run-function-fixes.js
```

### 2. Grant Admin Privileges

You'll need admin access to use the admin dashboard. The `setup-admin.js` script will:
- Show a list of existing users
- Let you choose which user to promote to admin
- Grant admin privileges to that user

Run this script using:

```bash
node scripts/setup-admin.js
```

Then follow the prompts to select a user to make admin.

## Prerequisites

Before running these scripts, make sure your `.env` file is set up with:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

You'll need your Supabase service role key which has admin permissions.

## After Running the Fix

After applying these fixes:

1. Refresh your application
2. Sign out and sign in again to refresh your session
3. Try accessing the admin dashboard
4. Try creating loan notes

Both features should now work properly. The admin dashboard will show basic system statistics, and loan notes can be created without foreign key errors.