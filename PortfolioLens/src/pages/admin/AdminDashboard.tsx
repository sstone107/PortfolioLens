/**
 * Admin Dashboard for PortfolioLens
 * 
 * Central admin dashboard that provides:
 * - System statistics
 * - Quick access to admin features
 * - Recent audit logs
 */

import React, { useState, useEffect } from 'react';
import { useGetIdentity } from '@refinedev/core';
import { 
  Box, 
  Card, 
  CardContent, 
  CardHeader, 
  Grid, 
  Typography, 
  Button,
  Divider,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Tabs,
  Tab,
} from '@mui/material';
import { 
  BarChart, 
  PieChart, 
  PersonOutline, 
  Engineering, 
  Security,
  VpnKey,
  Visibility,
  Tune,
  History,
  Language,
  Public,
} from '@mui/icons-material';
import { useNavigation } from '@refinedev/core';

import { getAdminStats, getAdminAuditLogs, getImpersonationStatus } from '../../services/adminService';
import { AdminStats, AdminAuditLog, ImpersonationStatus } from '../../types/adminTypes';
import { UserRoleType } from '../../types/userRoles';
import { useUserRoles } from '../../contexts/userRoleContext';
import RefreshRoles from '../../components/RefreshRoles';

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [impersonationStatus, setImpersonationStatus] = useState<ImpersonationStatus | null>(null);
  
  const { data: user } = useGetIdentity<{ id: string, email: string }>();
  const { userWithRoles } = useUserRoles();
  const { push } = useNavigation();
  
  // Check if user is admin
  const isAdmin = userWithRoles?.isAdmin || userWithRoles?.roles.includes(UserRoleType.Admin);
  
  // For non-admins, we'll show just the role refresh component to help users with new roles
  
  // Load admin dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const [statsData, logsData, impersonationData] = await Promise.all([
          getAdminStats(),
          getAdminAuditLogs(10),
          getImpersonationStatus(),
        ]);
        
        setStats(statsData);
        setRecentLogs(logsData);
        setImpersonationStatus(impersonationData);
      } catch (err) {
        console.error('Error loading admin dashboard:', err);
        setError('Failed to load admin dashboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    if (isAdmin) {
      loadDashboardData();
    } else {
      setError('You do not have permission to access this page');
      setLoading(false);
    }
  }, [isAdmin]);
  
  // Handle tab change
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };
  
  // Navigate to admin pages
  const navigateToPage = (page: string) => {
    push(`/admin/${page}`);
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
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
        
        <Typography variant="h6" sx={{ mt: 4, mb: 2 }}>
          Role Refresh
        </Typography>
        <Typography variant="body1" sx={{ mb: 3 }}>
          If you were recently granted admin privileges, click the button below to refresh your role information.
        </Typography>
        
        <RefreshRoles />
      </Box>
    );
  }
  
  // Render impersonation banner if active
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
            onClick={() => push('/admin/impersonation')}
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
      <Typography variant="h4" gutterBottom>
        Admin Dashboard
      </Typography>
      
      {renderImpersonationBanner()}
      
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label="Overview" icon={<BarChart />} iconPosition="start" />
          <Tab label="Users" icon={<PersonOutline />} iconPosition="start" />
          <Tab label="Access Control" icon={<VpnKey />} iconPosition="start" />
          <Tab label="Logs" icon={<History />} iconPosition="start" />
        </Tabs>
      </Paper>
      
      {/* Overview Tab */}
      {activeTab === 0 && (
        <>
          <Grid container spacing={3}>
            {/* Statistics Cards */}
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Total Users
                  </Typography>
                  <Typography variant="h4">
                    {stats?.totalUsers || 0}
                  </Typography>
                  <Typography variant="subtitle2" color="textSecondary">
                    {stats?.activeUsers || 0} active
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Total Loans
                  </Typography>
                  <Typography variant="h4">
                    {stats?.totalLoans || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Investors
                  </Typography>
                  <Typography variant="h4">
                    {stats?.totalInvestors || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Uploads
                  </Typography>
                  <Typography variant="h4">
                    {stats?.totalUploads || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
          
          <Grid container spacing={3} sx={{ mt: 1 }}>
            {/* Admin Features Quick Access */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader title="Admin Features" />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Button
                        variant="outlined"
                        fullWidth
                        startIcon={<PersonOutline />}
                        onClick={() => navigateToPage('impersonation')}
                        sx={{ justifyContent: 'flex-start', py: 1.5 }}
                      >
                        User Impersonation
                      </Button>
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <Button
                        variant="outlined"
                        fullWidth
                        startIcon={<Visibility />}
                        onClick={() => navigateToPage('module-visibility')}
                        sx={{ justifyContent: 'flex-start', py: 1.5 }}
                      >
                        Module Visibility
                      </Button>
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <Button
                        variant="outlined"
                        fullWidth
                        startIcon={<Security />}
                        onClick={() => navigateToPage('roles')}
                        sx={{ justifyContent: 'flex-start', py: 1.5 }}
                      >
                        Role Management
                      </Button>
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <Button
                        variant="outlined"
                        fullWidth
                        startIcon={<Public />}
                        onClick={() => navigateToPage('geo-restrictions')}
                        sx={{ justifyContent: 'flex-start', py: 1.5 }}
                      >
                        Geo Restrictions
                      </Button>
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <Button
                        variant="outlined"
                        fullWidth
                        startIcon={<History />}
                        onClick={() => navigateToPage('audit-log')}
                        sx={{ justifyContent: 'flex-start', py: 1.5 }}
                      >
                        Audit Logs
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
            
            {/* Recent Audit Logs */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader 
                  title="Recent Admin Activity" 
                  action={
                    <Button 
                      size="small"
                      onClick={() => navigateToPage('audit-log')}
                    >
                      View All
                    </Button>
                  }
                />
                <Divider />
                <CardContent sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {recentLogs.length === 0 ? (
                    <Typography color="textSecondary" align="center">
                      No recent activity
                    </Typography>
                  ) : (
                    <List dense>
                      {recentLogs.map((log) => (
                        <ListItem key={log.id}>
                          <ListItemText
                            primary={formatActionType(log.actionType)}
                            secondary={`${new Date(log.createdAt).toLocaleString()} | ${log.adminEmail || log.adminId}`}
                          />
                        </ListItem>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}
      
      {/* Users Tab */}
      {activeTab === 1 && (
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">User Management</Typography>
              <Button 
                variant="contained" 
                onClick={() => navigateToPage('users')}
              >
                View All Users
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<PersonOutline />}
                  onClick={() => navigateToPage('impersonation')}
                  sx={{ justifyContent: 'flex-start', py: 1.5, mb: 2 }}
                >
                  User Impersonation
                </Button>
                
                <Typography variant="body2" color="textSecondary">
                  Impersonate users to troubleshoot issues from their perspective. 
                  All actions performed during impersonation are logged and tracked.
                </Typography>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<Security />}
                  onClick={() => navigateToPage('roles')}
                  sx={{ justifyContent: 'flex-start', py: 1.5, mb: 2 }}
                >
                  Role Management
                </Button>
                
                <Typography variant="body2" color="textSecondary">
                  Manage user roles and permissions. Assign or remove roles from users
                  to control their access to different features.
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
      
      {/* Access Control Tab */}
      {activeTab === 2 && (
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Access Control</Typography>
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<Visibility />}
                  onClick={() => navigateToPage('module-visibility')}
                  sx={{ justifyContent: 'flex-start', py: 1.5, mb: 2 }}
                >
                  Module Visibility
                </Button>
                
                <Typography variant="body2" color="textSecondary">
                  Control which modules are visible to different user roles.
                  Hide or show specific features based on role requirements.
                </Typography>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<Public />}
                  onClick={() => navigateToPage('geo-restrictions')}
                  sx={{ justifyContent: 'flex-start', py: 1.5, mb: 2 }}
                >
                  Geographic Restrictions
                </Button>
                
                <Typography variant="body2" color="textSecondary">
                  Control access based on geographic location or IP address.
                  Restrict users to specific countries, regions, or networks.
                </Typography>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<Tune />}
                  onClick={() => navigateToPage('settings')}
                  sx={{ justifyContent: 'flex-start', py: 1.5, mb: 2 }}
                >
                  System Settings
                </Button>
                
                <Typography variant="body2" color="textSecondary">
                  Configure system-wide settings including security policies,
                  login requirements, and default preferences.
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
      
      {/* Logs Tab */}
      {activeTab === 3 && (
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">Audit Logs</Typography>
              <Button 
                variant="contained" 
                onClick={() => navigateToPage('audit-log')}
              >
                View All Logs
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="body2" color="textSecondary" paragraph>
              Audit logs track all administrative actions for accountability and security.
              Review logs to monitor system activity and troubleshoot issues.
            </Typography>
            
            {recentLogs.length === 0 ? (
              <Typography color="textSecondary" align="center">
                No recent activity
              </Typography>
            ) : (
              <List>
                {recentLogs.map((log) => (
                  <ListItem key={log.id} divider>
                    <ListItemText
                      primary={formatActionType(log.actionType)}
                      secondary={
                        <>
                          <Typography variant="body2" component="span">
                            {new Date(log.createdAt).toLocaleString()}
                          </Typography>
                          <br />
                          <Typography variant="body2" component="span" color="textSecondary">
                            Admin: {log.adminEmail || log.adminId}
                          </Typography>
                          {log.targetType && (
                            <>
                              <br />
                              <Typography variant="body2" component="span" color="textSecondary">
                                Target: {log.targetType} {log.targetId && `(${log.targetId})`}
                              </Typography>
                            </>
                          )}
                        </>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

// Helper function to format action types for display
const formatActionType = (actionType: string): string => {
  return actionType
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export default AdminDashboard;
