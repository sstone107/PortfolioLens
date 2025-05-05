/**
 * User Impersonation Page for PortfolioLens
 * 
 * This component allows admins to:
 * - View a list of users they can impersonate
 * - Start an impersonation session
 * - End active impersonation sessions
 * - View history of past impersonation sessions
 */

import React, { useState, useEffect } from 'react';
import { useGetIdentity } from '@refinedev/core';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Alert,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack,
  PersonOutline,
  History,
  ExitToApp,
  Info,
} from '@mui/icons-material';
import { useNavigate } from 'react-router';

import {
  getAdminUserList,
  startImpersonation,
  endImpersonation,
  getActiveImpersonations,
  getImpersonationStatus,
} from '../../services/adminService';
import { ImpersonationSession, ImpersonationRequest, ImpersonationStatus } from '../../types/adminTypes';
import { UserRoleType } from '../../types/userRoles';
import { useUserRoles } from '../../contexts/userRoleContext';

export const UserImpersonation: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [activeImpersonations, setActiveImpersonations] = useState<ImpersonationSession[]>([]);
  const [impersonationStatus, setImpersonationStatus] = useState<ImpersonationStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog state
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [impersonationReason, setImpersonationReason] = useState<string>('');
  
  const { data: user } = useGetIdentity<{ id: string, email: string }>();
  const { userWithRoles } = useUserRoles();
  const navigate = useNavigate();
  
  // Check if user is admin
  const isAdmin = userWithRoles?.isAdmin || userWithRoles?.roles.includes(UserRoleType.Admin);
  
  // Load impersonation data
  useEffect(() => {
    const loadImpersonationData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const [usersList, activeSessionsList, currentStatus] = await Promise.all([
          getAdminUserList(),
          getActiveImpersonations(),
          getImpersonationStatus(),
        ]);
        
        setUsers(usersList);
        setActiveImpersonations(activeSessionsList);
        setImpersonationStatus(currentStatus);
      } catch (err) {
        console.error('Error loading impersonation data:', err);
        setError('Failed to load impersonation data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    if (isAdmin) {
      loadImpersonationData();
    } else {
      setError('You do not have permission to access this page');
      setLoading(false);
    }
  }, [isAdmin]);
  
  // Handle dialog open/close
  const handleOpenDialog = (userId: string) => {
    setSelectedUser(userId);
    setOpenDialog(true);
  };
  
  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedUser('');
    setImpersonationReason('');
  };
  
  // Handle impersonation start
  const handleStartImpersonation = async () => {
    if (!selectedUser) {
      return;
    }
    
    setLoading(true);
    
    try {
      const session = await startImpersonation({
        userId: selectedUser,
        reason: impersonationReason,
      });
      
      // Store impersonation data in localStorage
      const selectedUserData = users.find(u => u.id === selectedUser);
      
      localStorage.setItem('impersonation', JSON.stringify({
        sessionId: session.id,
        adminId: user?.id,
        adminEmail: user?.email,
        impersonatedUserId: selectedUser,
        impersonatedEmail: selectedUserData?.email,
      }));
      
      // Refresh active sessions
      const activeSessionsList = await getActiveImpersonations();
      setActiveImpersonations(activeSessionsList);
      
      // Alert the user and redirect to home page
      alert(`Now impersonating user: ${selectedUserData?.email}`);
      navigate('/');
    } catch (err) {
      console.error('Error starting impersonation:', err);
      setError('Failed to start impersonation. Please try again.');
    } finally {
      setLoading(false);
      handleCloseDialog();
    }
  };
  
  // Handle impersonation end
  const handleEndImpersonation = async (sessionId: string) => {
    setLoading(true);
    
    try {
      await endImpersonation(sessionId);
      localStorage.removeItem('impersonation');
      
      // Refresh active sessions
      const activeSessionsList = await getActiveImpersonations();
      setActiveImpersonations(activeSessionsList);
      
      // Refresh impersonation status
      const currentStatus = await getImpersonationStatus();
      setImpersonationStatus(currentStatus);
      
      alert('Impersonation session ended');
    } catch (err) {
      console.error('Error ending impersonation:', err);
      setError('Failed to end impersonation. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle navigation back to admin dashboard
  const handleBackToAdmin = () => {
    navigate('/admin');
  };
  
  // Render loading state
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <Box m={3}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }
  
  // Render the impersonation banner
  const renderImpersonationBanner = () => {
    if (!impersonationStatus?.isImpersonating) {
      return null;
    }
    
    return (
      <Alert
        severity="warning"
        sx={{ mb: 3 }}
        action={
          <Button 
            color="inherit" 
            size="small"
            onClick={() => handleEndImpersonation(impersonationStatus.sessionId || '')}
          >
            End Impersonation
          </Button>
        }
      >
        You are currently impersonating {impersonationStatus.impersonatedUser?.email}. 
        Admin actions are still tracked under your admin account.
      </Alert>
    );
  };
  
  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3}>
        <IconButton 
          onClick={handleBackToAdmin}
          sx={{ mr: 2 }}
        >
          <ArrowBack />
        </IconButton>
        <Typography variant="h4">
          User Impersonation
        </Typography>
      </Box>
      
      {renderImpersonationBanner()}
      
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body1">
          <strong>Important:</strong> When impersonating another user, all actions will be logged with your admin ID.
          The impersonated user's session won't be affected, and they won't be logged out.
        </Typography>
      </Alert>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Active Impersonation Sessions
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              {activeImpersonations.length === 0 ? (
                <Typography color="textSecondary" align="center">
                  No active impersonation sessions
                </Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>User</TableCell>
                        <TableCell>Started</TableCell>
                        <TableCell>Reason</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activeImpersonations.map((session) => {
                        const impersonatedUser = users.find(u => u.id === session.impersonatedUserId);
                        
                        return (
                          <TableRow key={session.id}>
                            <TableCell>
                              {impersonatedUser?.email || session.impersonatedUserId}
                            </TableCell>
                            <TableCell>
                              {new Date(session.startedAt).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {session.reason || 'N/A'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outlined"
                                size="small"
                                color="primary"
                                endIcon={<ExitToApp />}
                                onClick={() => handleEndImpersonation(session.id)}
                              >
                                End
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Available Users
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Box maxHeight={400} overflow="auto">
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Email</TableCell>
                        <TableCell>Roles</TableCell>
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {users
                        .filter(userItem => userItem.id !== user?.id) // Don't show current user
                        .map((userItem) => (
                          <TableRow key={userItem.id}>
                            <TableCell>{userItem.email}</TableCell>
                            <TableCell>
                              {userItem.roles.map((role: string) => (
                                <Chip 
                                  key={role} 
                                  label={role} 
                                  size="small" 
                                  sx={{ mr: 0.5, mb: 0.5 }} 
                                />
                              ))}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="contained"
                                size="small"
                                onClick={() => handleOpenDialog(userItem.id)}
                                startIcon={<PersonOutline />}
                              >
                                Impersonate
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Impersonation Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>Confirm Impersonation</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You are about to impersonate the user: {users.find(u => u.id === selectedUser)?.email}.
            Please provide a reason for this impersonation. This will be logged for audit purposes.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="reason"
            label="Reason for impersonation"
            type="text"
            fullWidth
            variant="outlined"
            value={impersonationReason}
            onChange={(e) => setImpersonationReason(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button 
            onClick={handleStartImpersonation} 
            variant="contained"
            disabled={!impersonationReason.trim()}
          >
            Start Impersonation
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserImpersonation;
