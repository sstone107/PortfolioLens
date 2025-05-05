/**
 * PermissionGuard Component
 * 
 * This component conditionally renders children based on user permissions.
 * It uses the usePermission hook to check if the user has the required permission.
 */

import React, { ReactNode } from 'react';
import { ResourceType, OperationType } from '../../utils/permissionUtils';
import usePermission from '../../hooks/usePermission';
import { Box, CircularProgress, Typography } from '@mui/material';

interface PermissionGuardProps {
  resource: ResourceType;
  action: OperationType;
  resourceId?: string;
  children: ReactNode;
  fallback?: ReactNode;
  noFeedback?: boolean;
  loadingComponent?: ReactNode;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  resource,
  action,
  resourceId,
  children,
  fallback,
  noFeedback = false,
  loadingComponent,
}) => {
  const { isAllowed, isLoading, message } = usePermission({
    resource,
    action,
    resourceId,
  });

  // Show loading state
  if (isLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }
    
    return (
      <Box display="flex" alignItems="center" justifyContent="center" p={2}>
        <CircularProgress size={20} sx={{ mr: 1 }} />
        <Typography variant="body2">Checking permissions...</Typography>
      </Box>
    );
  }

  // If allowed, render children
  if (isAllowed) {
    return <>{children}</>;
  }

  // If not allowed and fallback is provided, render fallback
  if (fallback) {
    return <>{fallback}</>;
  }

  // If not allowed and no fallback, render nothing or feedback message
  return noFeedback ? null : (
    <Box p={2} sx={{ color: 'text.secondary' }}>
      <Typography variant="body2">{message || 'You do not have permission to access this resource.'}</Typography>
    </Box>
  );
};

export default PermissionGuard;
