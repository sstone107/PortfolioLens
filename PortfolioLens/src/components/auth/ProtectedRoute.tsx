/**
 * Protected Route Component for PortfolioLens
 * 
 * This component wraps routes that require specific user roles for access.
 * It works with the UserRoleContext to enforce role-based access control.
 */

import React, { ReactNode, useEffect } from "react";
import { useNavigation, useGetIdentity } from "@refinedev/core";
import { useUserRoles } from "../../contexts/userRoleContext";
import { UserRoleType } from "../../types/userRoles";
import { CircularProgress, Box, Typography } from "@mui/material";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles: UserRoleType[];
  redirectTo?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRoles, 
  redirectTo = "/login" 
}) => {
  const { userWithRoles, loading, checkAccess } = useUserRoles();
  const { data: user } = useGetIdentity<{ id: string, email: string }>();
  const { push } = useNavigation();
  
  useEffect(() => {
    // If loading has completed and we have auth status
    if (!loading) {
      // If no user logged in, redirect to login
      if (!user || !userWithRoles) {
        push(redirectTo);
        return;
      }
      
      // Check if user has the required roles
      const hasAccess = checkAccess(requiredRoles);
      
      // If user doesn't have required roles, redirect to unauthorized page
      if (!hasAccess) {
        push("/unauthorized");
      }
    }
  }, [loading, userWithRoles, user, requiredRoles, push, redirectTo]);
  
  // Show loading indicator while checking roles
  if (loading || !userWithRoles || !checkAccess(requiredRoles)) {
    return (
      <Box 
        display="flex" 
        flexDirection="column"
        justifyContent="center" 
        alignItems="center" 
        height="100vh"
      >
        <CircularProgress size={40} />
        <Typography variant="body1" sx={{ mt: 2 }}>
          Checking permissions...
        </Typography>
      </Box>
    );
  }
  
  // User has access, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute;
