/**
 * Role Refresh Component for PortfolioLens
 * 
 * This component provides a button to refresh user roles from the database
 * and display current role information.
 */

import React, { useState } from 'react';
import { Button, Paper, Typography, Box, Chip, Alert, CircularProgress } from '@mui/material';
import { Refresh } from '@mui/icons-material';
import { useUserRoles } from '../contexts/userRoleContext';
import { UserRoleType } from '../types/userRoles';

export const RefreshRoles: React.FC = () => {
  const { userWithRoles, refreshRoles, loading } = useUserRoles();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshRoles();
      setRefreshed(true);
      // Reset the refreshed state after 3 seconds
      setTimeout(() => {
        setRefreshed(false);
      }, 3000);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 3, maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h6" gutterBottom>
        User Role Information
      </Typography>
      
      {loading ? (
        <Box display="flex" justifyContent="center" my={2}>
          <CircularProgress size={24} />
        </Box>
      ) : userWithRoles ? (
        <>
          <Box mb={2}>
            <Typography variant="body1">
              <strong>Email:</strong> {userWithRoles.email}
            </Typography>
            <Typography variant="body1" mt={1}>
              <strong>Roles:</strong>
            </Typography>
            <Box mt={1} display="flex" flexWrap="wrap" gap={1}>
              {userWithRoles.roles.map((role) => (
                <Chip 
                  key={role} 
                  label={role} 
                  color={role === UserRoleType.Admin ? "primary" : "default"}
                  variant={role === UserRoleType.Admin ? "filled" : "outlined"}
                />
              ))}
            </Box>
            <Typography variant="body1" mt={1}>
              <strong>Admin Access:</strong> {userWithRoles.isAdmin ? "Yes" : "No"}
            </Typography>
          </Box>
          
          {refreshed && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Roles refreshed successfully!
            </Alert>
          )}
          
          <Button
            variant="contained"
            startIcon={<Refresh />}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh Roles"}
          </Button>
        </>
      ) : (
        <Typography variant="body1" color="error">
          Not logged in or unable to load user information
        </Typography>
      )}
    </Paper>
  );
};

export default RefreshRoles;
