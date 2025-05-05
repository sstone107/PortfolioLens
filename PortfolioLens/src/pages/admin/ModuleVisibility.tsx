/**
 * Module Visibility Management for PortfolioLens
 * 
 * This component allows admins to:
 * - Control which modules are visible to different user roles
 * - Enable/disable access to specific modules by role
 * - View current visibility settings across all roles
 */

import React, { useState, useEffect } from 'react';
import { useGetIdentity } from '@refinedev/core';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
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
  CircularProgress,
  IconButton,
  Switch,
  FormControlLabel,
  Tooltip,
  Snackbar,
} from '@mui/material';
import {
  ArrowBack,
  Visibility,
  VisibilityOff,
  InfoOutlined,
} from '@mui/icons-material';
import { useNavigate } from 'react-router';

import { updateModuleVisibility, getModuleVisibilityForRole } from '../../services/adminService';
import { ModuleType, ModuleVisibility as ModuleVisibilityType } from '../../types/adminTypes';
import { UserRoleType } from '../../types/userRoles';
import { useUserRoles } from '../../contexts/userRoleContext';
import { getUserRoles } from '../../services/userRoleService';

// Module metadata for display
const moduleMetadata = {
  [ModuleType.LOANS]: {
    title: 'Loans',
    description: 'Loan management and details',
    icon: <Visibility />,
  },
  [ModuleType.SERVICERS]: {
    title: 'Servicers',
    description: 'Servicer management and details',
    icon: <Visibility />,
  },
  [ModuleType.INVESTORS]: {
    title: 'Investors',
    description: 'Investor management and details',
    icon: <Visibility />,
  },
  [ModuleType.UPLOADS]: {
    title: 'Uploads',
    description: 'File uploads and management',
    icon: <Visibility />,
  },
  [ModuleType.REPORTS]: {
    title: 'Reports',
    description: 'Reporting and data exports',
    icon: <Visibility />,
  },
  [ModuleType.ADMIN]: {
    title: 'Admin',
    description: 'Administrative functions',
    icon: <Visibility />,
  },
  [ModuleType.SETTINGS]: {
    title: 'Settings',
    description: 'System and user settings',
    icon: <Visibility />,
  },
  [ModuleType.ANALYTICS]: {
    title: 'Analytics',
    description: 'Data analytics and dashboards',
    icon: <Visibility />,
  },
};

// Interface for role module visibilities
interface RoleModuleVisibilities {
  roleId: string;
  roleName: UserRoleType;
  visibilities: {
    [key in ModuleType]?: boolean;
  };
}

export const ModuleVisibility: React.FC = () => {
  const [roles, setRoles] = useState<{ roleId: string; roleName: UserRoleType }[]>([]);
  const [moduleVisibilities, setModuleVisibilities] = useState<RoleModuleVisibilities[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  
  const { data: user } = useGetIdentity<{ id: string; email: string }>();
  const { userWithRoles } = useUserRoles();
  // Router v7 doesn't need arguments for useNavigate() here
const navigate = useNavigate();
  
  // Check if user is admin
  const isAdmin = userWithRoles?.isAdmin || userWithRoles?.roles.includes(UserRoleType.Admin);
  
  // Load roles and module visibilities
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Get all roles
        const rolesData = await getUserRoles();
        const rolesWithIds = rolesData.map(role => ({
          roleId: role.id || '',
          roleName: role.name,
        }));
        setRoles(rolesWithIds);
        
        // Initialize role visibilities
        const visibilitiesData: RoleModuleVisibilities[] = await Promise.all(
          rolesWithIds.map(async (role) => {
            try {
              const moduleData = await getModuleVisibilityForRole(role.roleId);
              
              // Convert to map
              const visibilities: { [key in ModuleType]?: boolean } = {};
              
              // Set defaults (visible for all modules except admin)
              Object.values(ModuleType).forEach((moduleType) => {
                visibilities[moduleType] = moduleType === ModuleType.ADMIN 
                  ? role.roleName === UserRoleType.Admin // Admin module only visible to Admin role by default
                  : true; // Other modules visible by default
              });
              
              // Override with actual settings from DB
              moduleData.forEach((visibility) => {
                visibilities[visibility.module] = visibility.visible;
              });
              
              return {
                roleId: role.id,
                roleName: role.name,
                visibilities,
              };
            } catch (err) {
              console.error(`Error getting visibilities for role ${role.name}:`, err);
              return {
                roleId: role.id,
                roleName: role.name,
                visibilities: {},
              };
            }
          })
        );
        
        setModuleVisibilities(visibilitiesData);
        
        // Set default selected role to first role
        if (rolesWithIds.length > 0 && !selectedRole) {
          setSelectedRole(rolesWithIds[0].id);
        }
      } catch (err) {
        console.error('Error loading roles and module visibilities:', err);
        setError('Failed to load roles and module visibilities. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    if (isAdmin) {
      loadData();
    } else {
      setError('You do not have permission to access this page');
      setLoading(false);
    }
  }, [isAdmin]);
  
  // Handle visibility toggle
  const handleVisibilityToggle = async (roleId: string, module: ModuleType, visible: boolean) => {
    try {
      // Update state optimistically
      setModuleVisibilities((prev) => prev.map((roleVisibility) => {
        if (roleVisibility.roleId === roleId) {
          return {
            ...roleVisibility,
            visibilities: {
              ...roleVisibility.visibilities,
              [module]: visible,
            },
          };
        }
        return roleVisibility;
      }));
      
      // Update in DB
      await updateModuleVisibility({
        roleId,
        module,
        visible,
      });
      
      // Show success message
      const displayRoleName = roles.find((r) => r.roleId === roleId)?.roleName || 'Unknown role';
      const moduleName = moduleMetadata[module]?.title || module;
      const action = visible ? 'enabled' : 'disabled';
      
      setSnackbarMessage(`Successfully ${action} ${moduleName} for ${displayRoleName}`);
      setSnackbarOpen(true);
    } catch (err) {
      console.error('Error updating module visibility:', err);
      
      // Revert state
      const currentVisibilities = await getModuleVisibilityForRole(roleId);
      setModuleVisibilities((prev) => prev.map((roleVisibility) => {
        if (roleVisibility.roleId === roleId) {
          const updatedVisibilities = { ...roleVisibility.visibilities };
          
          currentVisibilities.forEach((visibility) => {
            if (visibility.module === module) {
              updatedVisibilities[module] = visibility.visible;
            }
          });
          
          return {
            ...roleVisibility,
            visibilities: updatedVisibilities,
          };
        }
        return roleVisibility;
      }));
      
      // Show error message
      setSnackbarMessage('Failed to update module visibility. Please try again.');
      setSnackbarOpen(true);
    }
  };
  
  // Handle selecting a role for editing
  const handleSelectRole = (roleId: string) => {
    setSelectedRole(roleId);
  };
  
  // Handle navigation back to admin dashboard
  const handleBackToAdmin = () => {
    navigate('/admin');
  };
  
  // Close snackbar
  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
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
  
  // Find selected role data
  const selectedRoleData = moduleVisibilities.find((rv) => rv.roleId === selectedRole);
  
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
          Module Visibility
        </Typography>
      </Box>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body1">
          <strong>Note:</strong> Controlling module visibility affects which modules users with specific roles can access.
          This is different from permissions within modules, which control what users can do within each module.
        </Typography>
      </Alert>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Roles
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Box>
                {roles.map((role) => (
                  <Button
                    key={role.id}
                    variant={selectedRole === role.id ? 'contained' : 'outlined'}
                    fullWidth
                    sx={{ 
                      justifyContent: 'flex-start', 
                      mb: 1,
                      textTransform: 'none',
                    }}
                    onClick={() => handleSelectRole(role.id)}
                  >
                    {role.name}
                  </Button>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={9}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Module Visibility for {selectedRoleData?.roleName || 'Select a role'}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              {selectedRoleData ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Module</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="center">Visibility</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.values(ModuleType).map((moduleType) => {
                        const visible = selectedRoleData.visibilities[moduleType] !== undefined 
                          ? selectedRoleData.visibilities[moduleType] 
                          : true;
                        
                        // Lock admin module to be visible only for Admin role
                        const isAdminModule = moduleType === ModuleType.ADMIN;
                        const isAdminRole = selectedRoleData.roleName === UserRoleType.Admin;
                        const locked = isAdminModule && !isAdminRole;
                            
                        return (
                          <TableRow key={moduleType}>
                            <TableCell>
                              <Box display="flex" alignItems="center">
                                {moduleMetadata[moduleType]?.icon || <Visibility />}
                                <Typography sx={{ ml: 1 }}>
                                  {moduleMetadata[moduleType]?.title || moduleType}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell>
                              {moduleMetadata[moduleType]?.description || ''}
                            </TableCell>
                            <TableCell align="center">
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={isAdminModule && !isAdminRole ? false : visible}
                                    onChange={(e) => handleVisibilityToggle(
                                      selectedRoleData.roleId,
                                      moduleType,
                                      e.target.checked
                                    )}
                                    disabled={locked}
                                  />
                                }
                                label={visible ? 'Visible' : 'Hidden'}
                                labelPlacement="end"
                              />
                              {locked && (
                                <Tooltip title="The Admin module can only be accessed by users with the Admin role">
                                  <IconButton size="small">
                                    <InfoOutlined fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="textSecondary" align="center">
                  Select a role to manage module visibility
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Notification snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        message={snackbarMessage}
      />
    </Box>
  );
};

export default ModuleVisibility;
