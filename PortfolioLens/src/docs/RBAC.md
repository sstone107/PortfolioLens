# Role-Based Access Control in PortfolioLens

This document outlines the role-based access control (RBAC) system implemented in the PortfolioLens application, detailing user roles, permissions, and implementation specifics.

## User Roles Overview

The following user roles are defined in the system:

- **Admin**: Full system access, including user management and configuration
- **LoanOfficer**: Access to loan creation, modification, and reporting
- **Accounting**: Access to financial data and reporting
- **Exec**: Executive-level access to high-level reports and dashboards
- **Servicing**: Access to loan servicing and maintenance operations
- **ExternalFund**: Limited access to specific loan portfolios and reports

## Technical Implementation

### Core Components

1. **Database Schema** (`src/db/user_roles_schema.sql`)
   - Tables for roles, user role assignments, and permissions
   - Row-Level Security (RLS) policies for enforcing access control at the database level

2. **TypeScript Types** (`src/types/userRoles.ts`)
   - Type definitions for roles, permissions, and user role assignments
   - Interfaces for role-related operations

3. **User Role Service** (`src/services/userRoleService.ts`)
   - Functions for assigning, revoking, and checking user roles
   - Permission validation logic

4. **Role Context** (`src/contexts/userRoleContext.tsx`)
   - React Context for providing role information throughout the application
   - Handling role loading, caching, and access control checks

5. **Protected Route Component** (`src/components/auth/ProtectedRoute.tsx`)
   - Higher-order component that restricts access to routes based on user roles
   - Redirects unauthorized users to the Unauthorized page

6. **User Role Management UI** (`src/pages/users/UserRoleManagement.tsx`)
   - Admin interface for managing user roles
   - Supports viewing, assigning, and removing roles from users

### Core Functionality

1. **Role Assignment**
   - Users can have multiple roles
   - Administrators can assign and remove roles through the UI
   - Role assignments are stored in the `user_role_assignments` table

2. **Permission Checking**
   - The `checkAccess` function in the UserRoleContext verifies if a user has the required roles
   - Admin users automatically have access to all routes and features

3. **Protected Routes**
   - Routes can be protected by wrapping them with the `ProtectedRoute` component
   - Required roles are specified as an array: `<ProtectedRoute requiredRoles={[UserRoleType.Admin]}>`

## Usage Examples

### Protecting a Route

```tsx
<Route
  path="/admin/settings"
  element={
    <ProtectedRoute requiredRoles={[UserRoleType.Admin]}>
      <SettingsPage />
    </ProtectedRoute>
  }
/>
```

### Checking Permissions in Components

```tsx
import { useUserRoles } from "../contexts/userRoleContext";

const MyComponent = () => {
  const { userWithRoles, checkAccess } = useUserRoles();
  
  // Check if user can access a specific feature
  const canEditLoans = checkAccess([UserRoleType.Admin, UserRoleType.LoanOfficer]);
  
  return (
    <div>
      {canEditLoans && <Button>Edit Loan</Button>}
    </div>
  );
};
```

### Assigning Roles via API

```tsx
import { assignRoleToUser } from "../services/userRoleService";

// Assign the LoanOfficer role to a user
await assignRoleToUser({
  userId: "user-uuid",
  roleName: UserRoleType.LoanOfficer,
  assignedBy: currentUserId
});
```

## Security Considerations

1. **Row-Level Security**
   - Database access is restricted based on user roles
   - Each role has specific RLS policies that determine what data can be accessed

2. **Frontend Security**
   - UI elements are conditionally rendered based on user roles
   - API requests include user tokens that are validated server-side

3. **Role Assignment Audit**
   - All role assignments and removals are logged with timestamps and the ID of the user who made the change
   - Audit logs can be reviewed for security compliance

## Adding New Roles

To add a new role to the system:

1. Add the role name to the `UserRoleType` enum in `src/types/userRoles.ts`
2. Add the role to the `roles` table in the database using SQL
3. Create appropriate RLS policies for the new role
4. Update frontend components to include the new role in selection menus

## Best Practices

1. **Principle of Least Privilege**
   - Assign users the minimum roles needed to perform their job
   - Regularly audit and review role assignments

2. **Role Composition**
   - For complex access patterns, combine multiple roles rather than creating new ones
   - This maintains a clean role hierarchy and reduces permission sprawl

3. **Testing**
   - Always test access controls after making changes
   - Verify that users can only access what they are permitted to
