# Admin Features Documentation

This document provides an overview of the administrative features in PortfolioLens, including user impersonation, module visibility management, and the audit logging system.

## Table of Contents

- [Overview](#overview)
- [User Impersonation](#user-impersonation)
- [Module Visibility](#module-visibility)
- [Admin Dashboard](#admin-dashboard)
- [Audit Logging](#audit-logging)
- [Database Schema](#database-schema)
- [Integration with RBAC](#integration-with-rbac)

## Overview

The admin system in PortfolioLens provides administrators with tools to:

1. **Manage Users**: View all system users and their roles.
2. **Impersonate Users**: Assume the identity of any user for troubleshooting.
3. **Control Module Access**: Determine which modules are visible to different roles.
4. **Monitor Activity**: Track all administrative actions through comprehensive audit logs.

All admin features are secured through both frontend guards and backend RLS policies to ensure that only authorized users can access these capabilities.

## User Impersonation

User impersonation allows administrators to view the application from the perspective of another user without disrupting that user's session.

### How Impersonation Works

1. Administrator selects a user to impersonate and provides a reason (logged for auditing).
2. A new impersonation session is created in the database.
3. The administrator's UI changes to reflect the impersonated user's view.
4. All actions performed during impersonation are:
   - Logged with the admin's ID (for accountability)
   - Executed with the impersonated user's permissions (for accurate troubleshooting)

### Security Considerations

- Impersonation does not expose the impersonated user's password or authentication tokens.
- All impersonation sessions are prominently displayed in the UI with a warning banner.
- Impersonation sessions are recorded in detail for audit purposes.
- Administrators cannot impersonate other administrators.

### Implementation Details

- Impersonation state is stored in both the database and localStorage.
- The `ImpersonationIndicator` component provides a persistent UI element during impersonation.
- The `AdminContext` maintains impersonation state across the application.

## Module Visibility

Module visibility controls which parts of the application are accessible to different user roles.

### Key Concepts

- **Modules**: Distinct sections of the application (Loans, Investors, Reports, etc.)
- **Visibility Settings**: Per-role settings that determine if a module is accessible
- **Default Settings**: Every module is visible by default except Admin (only visible to Admin role)

### Implementation

Module visibility is enforced at two levels:

1. **Database Level**: RLS policies check the `module_visibility` table and user roles
2. **Frontend Level**: The `ModuleGuard` component prevents UI access to unauthorized modules

### Module Visibility Rules

- Admin role always has access to all modules
- Non-admin roles can only see modules explicitly made visible to them
- Module visibility changes take effect immediately without requiring user logout

## Admin Dashboard

The admin dashboard provides a central interface for all administrative functions.

### Dashboard Sections

- **Overview**: Key statistics about system usage and active users
- **Users**: User management features including impersonation
- **Access Control**: Module visibility and permission settings
- **Logs**: Comprehensive audit log viewer

### Statistics and Metrics

The dashboard displays:
- Total users and active users
- Total loans, investors, and uploads
- Active impersonation sessions
- Recent administrative actions

## Audit Logging

The audit logging system records all administrative actions for accountability and compliance.

### Logged Actions

- Role assignments and removals
- Impersonation sessions (start and end)
- Module visibility changes
- User creation or deletion
- System setting modifications

### Log Data Includes

- Admin ID and email
- Action type
- Target entity (user, role, module, etc.)
- Timestamp
- IP address and user agent (for security purposes)
- Detailed action parameters

## Database Schema

The admin features are supported by several database tables:

### impersonation_sessions

Tracks active and historical impersonation sessions:

```sql
CREATE TABLE impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  impersonated_user_id UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  active BOOLEAN DEFAULT true,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT
);
```

### module_visibility

Controls which modules are visible to which roles:

```sql
CREATE TABLE module_visibility (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module TEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES user_roles(id),
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
```

### admin_audit_log

Records all administrative actions:

```sql
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  target_id TEXT,
  target_type TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

## Integration with RBAC

The admin features build upon the RBAC (Role-Based Access Control) system:

- Only users with the Admin role can access admin features
- RLS policies secure all admin tables at the database level
- Admin capabilities interact with the existing permission system

See [RBAC.md](./RBAC.md) for more details on the RBAC implementation.

## Helper Functions

Several database functions support the admin features:

### is_module_visible

Checks if a module is visible to a specific user:

```sql
CREATE OR REPLACE FUNCTION is_module_visible(p_user_id UUID, p_module TEXT) 
RETURNS BOOLEAN AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  -- Admin always has access to all modules
  IF has_role(p_user_id, 'admin') THEN
    RETURN TRUE;
  END IF;
  
  -- Check module visibility for user's roles
  SELECT EXISTS (
    SELECT 1
    FROM module_visibility mv
    JOIN user_role_assignments ura ON mv.role_id = ura.role_id
    WHERE ura.user_id = p_user_id
    AND mv.module = p_module
    AND mv.visible = TRUE
  ) INTO v_result;
  
  RETURN COALESCE(v_result, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
