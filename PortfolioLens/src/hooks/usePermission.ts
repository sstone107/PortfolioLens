/**
 * usePermission Hook
 * 
 * This hook provides a convenient way to check user permissions in React components.
 * It wraps the permissionUtils functions and handles state management for permission checks.
 */

import { useState, useEffect } from 'react';
import { ResourceType, OperationType, checkPermission } from '../utils/permissionUtils';
import { useGetIdentity } from '@refinedev/core';

interface UsePermissionProps {
  resource: ResourceType;
  action: OperationType;
  resourceId?: string;
}

interface UsePermissionReturn {
  isAllowed: boolean;
  isLoading: boolean;
  message: string | undefined;
  checkPermission: () => Promise<void>;
}

/**
 * Hook to check if the current user has permission to perform an action on a resource
 * 
 * @param resource The resource type to check permissions for
 * @param action The operation type to check permissions for
 * @param resourceId Optional resource ID for item-specific permissions
 * @returns Object containing permission state and a function to refresh permissions
 */
export const usePermission = ({
  resource,
  action,
  resourceId,
}: UsePermissionProps): UsePermissionReturn => {
  const [isAllowed, setIsAllowed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | undefined>(undefined);
  
  // Get the current user
  const { data: identity, isLoading: identityLoading } = useGetIdentity();

  // Function to check permission
  const checkUserPermission = async () => {
    setIsLoading(true);
    
    try {
      const { allowed, message } = await checkPermission(resource, action, resourceId);
      setIsAllowed(allowed);
      setMessage(message);
    } catch (error) {
      console.error('Error checking permission:', error);
      setIsAllowed(false);
      setMessage('An error occurred while checking permissions');
    } finally {
      setIsLoading(false);
    }
  };

  // Check permission when dependencies change
  useEffect(() => {
    if (!identityLoading && identity) {
      checkUserPermission();
    }
  }, [resource, action, resourceId, identity, identityLoading]);

  return {
    isAllowed,
    isLoading: isLoading || identityLoading,
    message,
    checkPermission: checkUserPermission,
  };
};

export default usePermission;
