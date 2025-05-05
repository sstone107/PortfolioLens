/**
 * User Role Context for PortfolioLens
 * 
 * This context provides role-based access control (RBAC) functionality
 * throughout the application, making it easy to:
 * - Check if the current user has specific roles
 * - Control UI elements based on role permissions
 * - Access role information consistently
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useGetIdentity } from "@refinedev/core";
import { UserRoleType, UserWithRoles } from "../types/userRoles";
import { getUserRoles, hasRole, isAdmin } from "../services/userRoleService";

// Interface for the context values
interface UserRoleContextType {
  userWithRoles: UserWithRoles | null;
  loading: boolean;
  error: Error | null;
  refreshRoles: () => Promise<void>;
  checkAccess: (requiredRoles: UserRoleType[]) => boolean;
}

// Default context values
const defaultContextValue: UserRoleContextType = {
  userWithRoles: null,
  loading: true,
  error: null,
  refreshRoles: async () => {},
  checkAccess: () => false,
};

// Create the context
const UserRoleContext = createContext<UserRoleContextType>(defaultContextValue);

// Provider component props
interface UserRoleProviderProps {
  children: ReactNode;
}

// Provider component that wraps the app and provides role information
export const UserRoleProvider: React.FC<UserRoleProviderProps> = ({ children }) => {
  const { data: user, isLoading: identityLoading } = useGetIdentity<{ id: string, email: string }>();
  const [userWithRoles, setUserWithRoles] = useState<UserWithRoles | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Function to load user roles
  const loadUserRoles = async () => {
    if (!user?.id) {
      setUserWithRoles(null);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Fetch user roles
      const roles = await getUserRoles(user.id);
      const adminStatus = await isAdmin(user.id);
      
      // Create user with roles object
      const userWithRoles: UserWithRoles = {
        id: user.id,
        email: user.email || "",
        roles,
        hasRole: (role: UserRoleType) => roles.includes(role),
        isAdmin: adminStatus
      };
      
      setUserWithRoles(userWithRoles);
    } catch (err) {
      console.error("Error loading user roles:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };
  
  // Load roles when user identity changes
  useEffect(() => {
    if (!identityLoading) {
      loadUserRoles();
    }
  }, [identityLoading, user?.id]);
  
  // Function to check if user has access based on required roles
  const checkAccess = (requiredRoles: UserRoleType[]): boolean => {
    // Admin always has access
    if (userWithRoles?.isAdmin) return true;
    
    // If no user or no roles, deny access
    if (!userWithRoles || !userWithRoles.roles.length) return false;
    
    // Check if user has any of the required roles
    return requiredRoles.some(role => userWithRoles.roles.includes(role));
  };
  
  // Context value
  const value: UserRoleContextType = {
    userWithRoles,
    loading,
    error,
    refreshRoles: loadUserRoles,
    checkAccess,
  };
  
  return (
    <UserRoleContext.Provider value={value}>
      {children}
    </UserRoleContext.Provider>
  );
};

// Custom hook for using the user role context
export const useUserRoles = () => useContext(UserRoleContext);
