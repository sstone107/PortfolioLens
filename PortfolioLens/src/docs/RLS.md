# Row-Level Security (RLS) in PortfolioLens

This document outlines the Row-Level Security implementation in PortfolioLens, explaining how different user roles are restricted to accessing only the data they're permitted to view and modify.

## Overview

Row-Level Security (RLS) is a security feature that restricts database row access based on the user executing a query. In PortfolioLens, we've implemented RLS to ensure:

1. Users can only access data appropriate to their roles
2. Data isolation between different external funds
3. Protection of sensitive information
4. Role-appropriate modification rights

## Implementation

Our RLS implementation consists of three layers:

### 1. Database-level RLS Policies

PostgreSQL RLS policies are defined in `src/db/rls_policies.sql`. These policies enforce access control at the database level, ensuring that even if the application has bugs, unauthorized data access is prevented.

Key RLS implementations:

- **Role-checking functions**:
  - `has_role(user_id, role_name)`: Checks if a user has a specific role
  - `is_admin(user_id)`: Checks if a user is an administrator
  - `has_any_role(user_id, role_names)`: Checks if a user has any of the specified roles

- **Table-specific policies**:
  - Each table has custom policies defining who can SELECT, INSERT, UPDATE, or DELETE records
  - Admin users have full access across all tables
  - Role-specific access controls (e.g., LoanOfficers can edit their own loans, Servicing can update servicing-related fields)
  - External users can only see data related to their assigned investor

### 2. Frontend Permission Utilities

The `src/utils/permissionUtils.ts` file provides JavaScript utilities that mirror the database RLS policies, enabling:

- Consistent permission checks in the UI
- Hiding UI elements when users lack permissions
- Appropriate error messages
- Permission-aware API calls

### 3. React Components for Access Control

We've created React components and hooks that make it easy to implement permission checks:

- `usePermission` hook: Returns permission state for a given resource and action
- `PermissionGuard` component: Conditionally renders UI elements based on permissions

## Role-based Access Examples

### Admin Role

- Full access to all data and operations
- Can perform user impersonation and access control management
- Not restricted by RLS policies

### Loan Officer Role

- Can view all loans
- Can only edit loans they created
- Can create new loans, servicers, and investors
- Cannot delete records (admin-only)

### Accounting Role

- Read-only access to all loans and financial data
- Can create and edit investors
- Can export financial data
- Cannot modify loan details

### Executive Role

- Read-only access to all data
- Dashboard and reporting access
- Cannot modify any records

### Servicing Role

- Can view all loans
- Can only modify servicing-related fields on loans
- Can create and manage servicers

### External Fund Role

- Can only view loans assigned to their investor
- Cannot see other investors' loans
- Limited dashboard and report access

## Using Permissions in Components

### Conditional Rendering

```tsx
import { PermissionGuard } from 'src/components/common/PermissionGuard';
import { ResourceType, OperationType } from 'src/utils/permissionUtils';

const LoanDetails = ({ loanId }) => {
  return (
    <div>
      <h1>Loan Details</h1>
      
      {/* Only loan officers can edit loans */}
      <PermissionGuard 
        resource={ResourceType.LOAN} 
        action={OperationType.EDIT}
        resourceId={loanId}
      >
        <Button>Edit Loan</Button>
      </PermissionGuard>
      
      {/* Only accounting or executives can export loan data */}
      <PermissionGuard 
        resource={ResourceType.LOAN} 
        action={OperationType.EXPORT}
        resourceId={loanId}
        fallback={<Tooltip title="You don't have permission to export">
          <span><Button disabled>Export</Button></span>
        </Tooltip>}
      >
        <Button>Export Data</Button>
      </PermissionGuard>
    </div>
  );
};
```

### Custom Hook Usage

```tsx
import { usePermission } from 'src/hooks/usePermission';
import { ResourceType, OperationType } from 'src/utils/permissionUtils';

const LoanActions = ({ loanId }) => {
  const { 
    isAllowed: canEdit,
    isLoading,
    message 
  } = usePermission({
    resource: ResourceType.LOAN,
    action: OperationType.EDIT,
    resourceId: loanId
  });

  if (isLoading) {
    return <CircularProgress size={20} />;
  }

  return (
    <div>
      <Button disabled={!canEdit}>
        {canEdit ? 'Edit Loan' : 'View Only'}
      </Button>
      {!canEdit && <Tooltip title={message}>
        <InfoIcon fontSize="small" />
      </Tooltip>}
    </div>
  );
};
```

## Testing RLS Policies

To verify RLS is working correctly:

1. Log in with different user roles
2. Attempt to access resources at various permission levels
3. Verify SQL queries in Supabase return appropriate results
4. Check logs for unauthorized access attempts

## Maintenance and Updates

When adding new tables or modifying existing ones:

1. Always enable RLS on new tables with `ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;`
2. Create appropriate policies for SELECT, INSERT, UPDATE, and DELETE operations
3. Update the `permissionUtils.ts` file with corresponding frontend checks
4. Test thoroughly with different user roles

## Security Considerations

- RLS policies are the last line of defense - always validate permissions in the application code as well
- Admin users bypass RLS - be cautious with admin role assignments
- Regularly audit RLS policies to ensure they match business requirements
- Test with different user roles after making changes to verify integrity
