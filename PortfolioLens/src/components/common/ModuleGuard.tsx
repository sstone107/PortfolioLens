/**
 * Module Guard Component for PortfolioLens
 * 
 * This component controls access to application modules based on:
 * 1. User roles
 * 2. Module visibility settings
 * 
 * It prevents unauthorized access to modules by redirecting users 
 * or displaying access denied messages.
 */

import React, { useState, useEffect, ReactNode } from 'react';
import { Navigate } from 'react-router';
import { 
  Box, 
  Typography, 
  CircularProgress, 
  Paper, 
  Button,
  Alert
} from '@mui/material';
import { LockOutlined, HomeOutlined } from '@mui/icons-material';
import { ModuleType } from '../../types/adminTypes';
import { useModuleVisibility } from '../../hooks/useModuleVisibility';
import { useAdmin } from '../../contexts/adminContext';

interface ModuleGuardProps {
  children: ReactNode;
  module: ModuleType;
  redirectTo?: string;
  fallback?: ReactNode;
}

export const ModuleGuard: React.FC<ModuleGuardProps> = ({
  children,
  module,
  redirectTo = '/',
  fallback,
}) => {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const { checkModuleVisibility, loading, error } = useModuleVisibility();
  const { isImpersonating } = useAdmin();
  
  // Check module visibility when component mounts
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const visible = await checkModuleVisibility(module);
        setHasAccess(visible);
      } catch (err) {
        console.error(`Error checking access to module ${module}:`, err);
        setHasAccess(false);
      }
    };
    
    if (hasAccess === null) {
      checkAccess();
    }
  }, [module, checkModuleVisibility, hasAccess]);
  
  // While checking access, show loading indicator
  if (hasAccess === null || loading) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="200px"
      >
        <CircularProgress />
      </Box>
    );
  }
  
  // If user has access or we're using a custom fallback, render accordingly
  if (hasAccess) {
    return <>{children}</>;
  } else if (fallback) {
    return <>{fallback}</>;
  }
  
  // If no custom fallback and no access, either redirect or show access denied
  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }
  
  // Default access denied screen
  return (
    <Box 
      display="flex" 
      flexDirection="column" 
      justifyContent="center" 
      alignItems="center" 
      minHeight="60vh"
      padding={3}
    >
      <Paper 
        elevation={3} 
        sx={{ 
          p: 4, 
          textAlign: 'center', 
          maxWidth: 500,
          borderRadius: 2
        }}
      >
        <LockOutlined sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        
        <Typography variant="h5" component="h1" gutterBottom>
          Access Denied
        </Typography>
        
        <Typography variant="body1" color="text.secondary" paragraph>
          You do not have permission to access this module. 
          Please contact your administrator if you believe this is an error.
        </Typography>
        
        {isImpersonating && (
          <Alert severity="info" sx={{ mb: 3, mt: 1 }}>
            You are currently in impersonation mode, which may affect your access rights.
          </Alert>
        )}
        
        <Button
          variant="contained"
          startIcon={<HomeOutlined />}
          href="/"
          sx={{ mt: 2 }}
        >
          Return to Dashboard
        </Button>
      </Paper>
    </Box>
  );
};

export default ModuleGuard;
