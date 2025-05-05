/**
 * Impersonation Indicator for PortfolioLens
 * 
 * This component displays a prominent banner when an admin
 * is impersonating another user. It appears at the top of the
 * application to ensure admins are always aware they're in
 * impersonation mode.
 */

import React from 'react';
import { Box, Alert, Button, Typography } from '@mui/material';
import { ExitToApp, PersonOutlined } from '@mui/icons-material';
import { useNavigation } from '@refinedev/core';
import { useAdmin } from '../../contexts/adminContext';

interface ImpersonationIndicatorProps {
  position?: 'top' | 'bottom';
}

export const ImpersonationIndicator: React.FC<ImpersonationIndicatorProps> = ({
  position = 'top'
}) => {
  const { impersonationStatus, endCurrentImpersonation } = useAdmin();
  const { push } = useNavigation();
  
  // Don't render anything if not impersonating
  if (!impersonationStatus?.isImpersonating) {
    return null;
  }
  
  const handleEndImpersonation = async () => {
    await endCurrentImpersonation();
    window.location.href = '/'; // Full refresh to ensure clean state
  };
  
  const handleAdminDashboard = () => {
    push('/admin');
  };
  
  return (
    <Box 
      sx={{
        position: 'sticky',
        [position]: 0,
        width: '100%',
        zIndex: 1100,
      }}
    >
      <Alert
        severity="warning"
        icon={<PersonOutlined />}
        action={
          <Box>
            <Button 
              color="inherit" 
              size="small" 
              onClick={handleAdminDashboard}
              sx={{ mr: 1 }}
            >
              Admin Dashboard
            </Button>
            <Button 
              color="inherit" 
              size="small" 
              onClick={handleEndImpersonation}
              endIcon={<ExitToApp />}
              variant="outlined"
            >
              End Impersonation
            </Button>
          </Box>
        }
        sx={{
          borderRadius: 0,
          px: 2,
          py: 0.5,
        }}
      >
        <Typography variant="body2">
          <strong>Impersonation Mode:</strong> You are viewing the application as {impersonationStatus.impersonatedUser?.email}.
          Your actions are being tracked under your admin account ({impersonationStatus.adminEmail}).
        </Typography>
      </Alert>
    </Box>
  );
};

export default ImpersonationIndicator;
