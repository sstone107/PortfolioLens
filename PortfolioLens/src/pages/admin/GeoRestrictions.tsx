/**
 * Geographic Restrictions Management for PortfolioLens
 * 
 * This component allows admins to:
 * - View all geographic and IP-based restrictions
 * - Create new restrictions
 * - Edit existing restrictions
 * - Associate restrictions with user roles
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  FormControlLabel,
  Switch,
  Chip,
  Tabs,
  Tab,
  Snackbar,
  Autocomplete,
} from '@mui/material';
import {
  ArrowBack,
  Add,
  Edit,
  Delete,
  Block,
  Check,
  Language,
  Dns,
  Public,
  LocationCity,
} from '@mui/icons-material';
import { useNavigation } from '@refinedev/core';

import {
  getAllGeoRestrictions,
  createGeoRestriction,
  updateGeoRestriction,
  deleteGeoRestriction,
  associateRestrictionWithRole,
  removeRestrictionFromRole,
  getRestrictionsForRole,
  getAllLoginAttempts,
} from '../../services/geoRestrictionService';
import { getUserRoles } from '../../services/userRoleService';
import {
  GeoRestriction,
  RestrictionType,
  RestrictionMode,
  CreateGeoRestrictionRequest,
  UpdateGeoRestrictionRequest,
  UserLoginLocation,
} from '../../types/geoRestrictions';
import { ModuleGuard } from '../../components/common/ModuleGuard';
import { ModuleType } from '../../types/adminTypes';
import { UserRoleType } from '../../types/userRoles';
import { useUserRoles } from '../../contexts/userRoleContext';

export const GeoRestrictions: React.FC = () => {
  // State variables
  const [restrictions, setRestrictions] = useState<GeoRestriction[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: UserRoleType }[]>([]);
  const [loginHistory, setLoginHistory] = useState<UserLoginLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tabIndex, setTabIndex] = useState<number>(0);
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState<boolean>(false);
  const [editDialogOpen, setEditDialogOpen] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState<boolean>(false);
  
  // Form states
  const [selectedRestriction, setSelectedRestriction] = useState<GeoRestriction | null>(null);
  const [restrictionName, setRestrictionName] = useState<string>('');
  const [restrictionDescription, setRestrictionDescription] = useState<string>('');
  const [restrictionType, setRestrictionType] = useState<RestrictionType>(RestrictionType.COUNTRY);
  const [restrictionMode, setRestrictionMode] = useState<RestrictionMode>(RestrictionMode.ALLOW);
  const [restrictionValue, setRestrictionValue] = useState<string>('');
  const [restrictionActive, setRestrictionActive] = useState<boolean>(true);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  
  // Snackbar state
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  
  const { data: user } = useGetIdentity<{ id: string, email: string }>();
  const { userWithRoles } = useUserRoles();
  const { push } = useNavigation();
  
  // Check if user is admin
  const isAdmin = userWithRoles?.isAdmin || userWithRoles?.roles.includes(UserRoleType.Admin);
  
  // Load restrictions data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const [restrictionsData, rolesData, loginData] = await Promise.all([
          getAllGeoRestrictions(),
          getUserRoles(user?.id || ''),
          getAllLoginAttempts(20),
        ]);
        
        setRestrictions(restrictionsData);
        
        const rolesWithIds = rolesData.map(role => ({
          id: role.id || '',
          name: role.name,
        }));
        setRoles(rolesWithIds);
        
        setLoginHistory(loginData);
      } catch (err) {
        console.error('Error loading geo restrictions data:', err);
        setError('Failed to load geo restrictions data. Please try again.');
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
  
  // Handle tab change
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
  };
  
  // Reset form fields
  const resetForm = () => {
    setRestrictionName('');
    setRestrictionDescription('');
    setRestrictionType(RestrictionType.COUNTRY);
    setRestrictionMode(RestrictionMode.ALLOW);
    setRestrictionValue('');
    setRestrictionActive(true);
    setSelectedRoles([]);
  };
  
  // Open create dialog
  const handleOpenCreate = () => {
    resetForm();
    setCreateDialogOpen(true);
  };
  
  // Open edit dialog
  const handleOpenEdit = (restriction: GeoRestriction) => {
    setSelectedRestriction(restriction);
    setRestrictionName(restriction.name);
    setRestrictionDescription(restriction.description || '');
    setRestrictionType(restriction.type);
    setRestrictionMode(restriction.mode);
    setRestrictionValue(restriction.value);
    setRestrictionActive(restriction.isActive);
    setEditDialogOpen(true);
  };
  
  // Open delete dialog
  const handleOpenDelete = (restriction: GeoRestriction) => {
    setSelectedRestriction(restriction);
    setDeleteDialogOpen(true);
  };
  
  // Open role dialog
  const handleOpenRoleDialog = (restriction: GeoRestriction) => {
    setSelectedRestriction(restriction);
    setRoleDialogOpen(true);
    // Load roles for this restriction
    loadRolesForRestriction(restriction);
  };
  
  // Load roles for a restriction
  const loadRolesForRestriction = async (restriction: GeoRestriction) => {
    try {
      // For each role, check if the restriction is associated with it
      const promises = roles.map(async (role) => {
        const restrictions = await getRestrictionsForRole(role.id);
        return restrictions.some(r => r.id === restriction.id) ? role.id : null;
      });
      
      const associatedRoleIds = (await Promise.all(promises)).filter(id => id !== null) as string[];
      setSelectedRoles(associatedRoleIds);
    } catch (err) {
      console.error('Error loading roles for restriction:', err);
      setSnackbarMessage('Error loading roles for restriction');
      setSnackbarOpen(true);
    }
  };
  
  // Handle creation of new restriction
  const handleCreateRestriction = async () => {
    try {
      const newRestriction: CreateGeoRestrictionRequest = {
        name: restrictionName,
        description: restrictionDescription,
        type: restrictionType,
        mode: restrictionMode,
        value: restrictionValue,
        isActive: restrictionActive,
        roleIds: selectedRoles,
      };
      
      await createGeoRestriction(newRestriction);
      
      // Refresh the list
      const updatedRestrictions = await getAllGeoRestrictions();
      setRestrictions(updatedRestrictions);
      
      setSnackbarMessage('Restriction created successfully');
      setSnackbarOpen(true);
      setCreateDialogOpen(false);
    } catch (err) {
      console.error('Error creating restriction:', err);
      setSnackbarMessage('Error creating restriction');
      setSnackbarOpen(true);
    }
  };
  
  // Handle update of existing restriction
  const handleUpdateRestriction = async () => {
    if (!selectedRestriction) return;
    
    try {
      const updatedRestriction: UpdateGeoRestrictionRequest = {
        id: selectedRestriction.id,
        name: restrictionName,
        description: restrictionDescription,
        type: restrictionType,
        mode: restrictionMode,
        value: restrictionValue,
        isActive: restrictionActive,
      };
      
      await updateGeoRestriction(updatedRestriction);
      
      // Refresh the list
      const updatedRestrictions = await getAllGeoRestrictions();
      setRestrictions(updatedRestrictions);
      
      setSnackbarMessage('Restriction updated successfully');
      setSnackbarOpen(true);
      setEditDialogOpen(false);
    } catch (err) {
      console.error('Error updating restriction:', err);
      setSnackbarMessage('Error updating restriction');
      setSnackbarOpen(true);
    }
  };
  
  // Handle deletion of restriction
  const handleDeleteRestriction = async () => {
    if (!selectedRestriction) return;
    
    try {
      await deleteGeoRestriction(selectedRestriction.id);
      
      // Refresh the list
      const updatedRestrictions = await getAllGeoRestrictions();
      setRestrictions(updatedRestrictions);
      
      setSnackbarMessage('Restriction deleted successfully');
      setSnackbarOpen(true);
      setDeleteDialogOpen(false);
    } catch (err) {
      console.error('Error deleting restriction:', err);
      setSnackbarMessage('Error deleting restriction');
      setSnackbarOpen(true);
    }
  };
  
  // Handle role association changes
  const handleRoleChange = async () => {
    if (!selectedRestriction) return;
    
    try {
      // For each role, check if it was previously associated
      const promises = roles.map(async (role) => {
        const wasSelected = selectedRoles.includes(role.id);
        const isSelected = selectedRoles.includes(role.id);
        
        if (wasSelected !== isSelected) {
          if (isSelected) {
            // Associate restriction with role
            await associateRestrictionWithRole(selectedRestriction.id, role.id);
          } else {
            // Remove restriction from role
            await removeRestrictionFromRole(selectedRestriction.id, role.id);
          }
        }
      });
      
      await Promise.all(promises);
      
      setSnackbarMessage('Role associations updated successfully');
      setSnackbarOpen(true);
      setRoleDialogOpen(false);
    } catch (err) {
      console.error('Error updating role associations:', err);
      setSnackbarMessage('Error updating role associations');
      setSnackbarOpen(true);
    }
  };
  
  // Handle navigation back to admin dashboard
  const handleBackToAdmin = () => {
    push('/admin');
  };
  
  // Close snackbar
  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };
  
  // Get icon for restriction type
  const getRestrictionTypeIcon = (type: RestrictionType) => {
    switch (type) {
      case RestrictionType.IP_RANGE:
        return <Dns />;
      case RestrictionType.COUNTRY:
        return <Public />;
      case RestrictionType.REGION:
        return <Language />;
      case RestrictionType.CITY:
        return <LocationCity />;
      default:
        return <Block />;
    }
  };
  
  // Format value displayed for restriction type
  const getRestrictionTypeLabel = (type: RestrictionType) => {
    switch (type) {
      case RestrictionType.IP_RANGE:
        return 'IP Range';
      case RestrictionType.COUNTRY:
        return 'Country';
      case RestrictionType.REGION:
        return 'Region';
      case RestrictionType.CITY:
        return 'City';
      default:
        return type;
    }
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
          Geographic & IP Restrictions
        </Typography>
      </Box>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body1">
          <strong>Note:</strong> Geographic and IP restrictions control where users can access the application from.
          Restrictions can be applied based on IP address ranges, countries, regions, or cities.
        </Typography>
      </Alert>
      
      <Paper sx={{ mb: 3 }}>
        <Tabs 
          value={tabIndex} 
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label="Restrictions" />
          <Tab label="Login History" />
        </Tabs>
      </Paper>
      
      {/* Restrictions Tab */}
      {tabIndex === 0 && (
        <Box>
          <Box display="flex" justifyContent="flex-end" mb={2}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleOpenCreate}
            >
              Add Restriction
            </Button>
          </Box>
          
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell align="center">Active</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {restrictions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No restrictions found
                    </TableCell>
                  </TableRow>
                ) : (
                  restrictions.map((restriction) => (
                    <TableRow key={restriction.id}>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          {getRestrictionTypeIcon(restriction.type)}
                          <Typography sx={{ ml: 1 }}>
                            {restriction.name}
                          </Typography>
                        </Box>
                        {restriction.description && (
                          <Typography variant="caption" color="textSecondary">
                            {restriction.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{getRestrictionTypeLabel(restriction.type)}</TableCell>
                      <TableCell>
                        <Chip
                          label={restriction.mode}
                          color={restriction.mode === RestrictionMode.ALLOW ? 'success' : 'error'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{restriction.value}</TableCell>
                      <TableCell align="center">
                        {restriction.isActive ? (
                          <Check color="success" />
                        ) : (
                          <Block color="error" />
                        )}
                      </TableCell>
                      <TableCell>
                        <IconButton
                          onClick={() => handleOpenEdit(restriction)}
                          size="small"
                          color="primary"
                        >
                          <Edit />
                        </IconButton>
                        <IconButton
                          onClick={() => handleOpenRoleDialog(restriction)}
                          size="small"
                          color="secondary"
                        >
                          <Language />
                        </IconButton>
                        <IconButton
                          onClick={() => handleOpenDelete(restriction)}
                          size="small"
                          color="error"
                        >
                          <Delete />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
      
      {/* Login History Tab */}
      {tabIndex === 1 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>IP Address</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Time</TableCell>
                <TableCell align="center">Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loginHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    No login history found
                  </TableCell>
                </TableRow>
              ) : (
                loginHistory.map((login) => (
                  <TableRow key={login.id}>
                    <TableCell>{login.userEmail || login.userId}</TableCell>
                    <TableCell>{login.ipAddress}</TableCell>
                    <TableCell>
                      {[login.city, login.region, login.country].filter(Boolean).join(', ') || 'Unknown'}
                    </TableCell>
                    <TableCell>{new Date(login.loginTime).toLocaleString()}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={login.isAllowed ? 'Allowed' : 'Blocked'}
                        color={login.isAllowed ? 'success' : 'error'}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {/* Create Restriction Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create New Restriction</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Create a new geographic or IP-based restriction. Specify the type of restriction,
            whether to allow or deny access, and the value to match against.
          </DialogContentText>
          
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                margin="dense"
                id="name"
                label="Restriction Name"
                type="text"
                fullWidth
                variant="outlined"
                value={restrictionName}
                onChange={(e) => setRestrictionName(e.target.value)}
                required
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="dense">
                <InputLabel id="restriction-type-label">Restriction Type</InputLabel>
                <Select
                  labelId="restriction-type-label"
                  id="restriction-type"
                  value={restrictionType}
                  label="Restriction Type"
                  onChange={(e) => setRestrictionType(e.target.value as RestrictionType)}
                >
                  <MenuItem value={RestrictionType.IP_RANGE}>IP Range</MenuItem>
                  <MenuItem value={RestrictionType.COUNTRY}>Country</MenuItem>
                  <MenuItem value={RestrictionType.REGION}>Region</MenuItem>
                  <MenuItem value={RestrictionType.CITY}>City</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                margin="dense"
                id="description"
                label="Description"
                type="text"
                fullWidth
                variant="outlined"
                value={restrictionDescription}
                onChange={(e) => setRestrictionDescription(e.target.value)}
                multiline
                rows={2}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="dense">
                <InputLabel id="restriction-mode-label">Restriction Mode</InputLabel>
                <Select
                  labelId="restriction-mode-label"
                  id="restriction-mode"
                  value={restrictionMode}
                  label="Restriction Mode"
                  onChange={(e) => setRestrictionMode(e.target.value as RestrictionMode)}
                >
                  <MenuItem value={RestrictionMode.ALLOW}>Allow</MenuItem>
                  <MenuItem value={RestrictionMode.DENY}>Deny</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                margin="dense"
                id="value"
                label={`Value (${getRestrictionTypeLabel(restrictionType)})`}
                type="text"
                fullWidth
                variant="outlined"
                value={restrictionValue}
                onChange={(e) => setRestrictionValue(e.target.value)}
                required
                helperText={getRestrictionValueHelp(restrictionType)}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={restrictionActive}
                    onChange={(e) => setRestrictionActive(e.target.checked)}
                  />
                }
                label="Active"
              />
            </Grid>
            
            <Grid item xs={12}>
              <Autocomplete
                multiple
                id="roles"
                options={roles}
                getOptionLabel={(option) => option.name}
                value={roles.filter(role => selectedRoles.includes(role.id))}
                onChange={(e, newValue) => {
                  setSelectedRoles(newValue.map(role => role.id));
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    variant="outlined"
                    label="Apply to Roles"
                    placeholder="Select roles"
                  />
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleCreateRestriction} 
            variant="contained"
            disabled={!restrictionName || !restrictionValue}
          >
            Create Restriction
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Edit Restriction Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit Restriction</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                margin="dense"
                id="name-edit"
                label="Restriction Name"
                type="text"
                fullWidth
                variant="outlined"
                value={restrictionName}
                onChange={(e) => setRestrictionName(e.target.value)}
                required
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="dense">
                <InputLabel id="restriction-type-label-edit">Restriction Type</InputLabel>
                <Select
                  labelId="restriction-type-label-edit"
                  id="restriction-type-edit"
                  value={restrictionType}
                  label="Restriction Type"
                  onChange={(e) => setRestrictionType(e.target.value as RestrictionType)}
                >
                  <MenuItem value={RestrictionType.IP_RANGE}>IP Range</MenuItem>
                  <MenuItem value={RestrictionType.COUNTRY}>Country</MenuItem>
                  <MenuItem value={RestrictionType.REGION}>Region</MenuItem>
                  <MenuItem value={RestrictionType.CITY}>City</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                margin="dense"
                id="description-edit"
                label="Description"
                type="text"
                fullWidth
                variant="outlined"
                value={restrictionDescription}
                onChange={(e) => setRestrictionDescription(e.target.value)}
                multiline
                rows={2}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="dense">
                <InputLabel id="restriction-mode-label-edit">Restriction Mode</InputLabel>
                <Select
                  labelId="restriction-mode-label-edit"
                  id="restriction-mode-edit"
                  value={restrictionMode}
                  label="Restriction Mode"
                  onChange={(e) => setRestrictionMode(e.target.value as RestrictionMode)}
                >
                  <MenuItem value={RestrictionMode.ALLOW}>Allow</MenuItem>
                  <MenuItem value={RestrictionMode.DENY}>Deny</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                margin="dense"
                id="value-edit"
                label={`Value (${getRestrictionTypeLabel(restrictionType)})`}
                type="text"
                fullWidth
                variant="outlined"
                value={restrictionValue}
                onChange={(e) => setRestrictionValue(e.target.value)}
                required
                helperText={getRestrictionValueHelp(restrictionType)}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={restrictionActive}
                    onChange={(e) => setRestrictionActive(e.target.checked)}
                  />
                }
                label="Active"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleUpdateRestriction} 
            variant="contained"
            disabled={!restrictionName || !restrictionValue}
          >
            Update Restriction
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Deletion</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the restriction "{selectedRestriction?.name}"?
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteRestriction} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Role Association Dialog */}
      <Dialog open={roleDialogOpen} onClose={() => setRoleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Manage Role Associations</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Select which roles should have this restriction applied to them.
          </DialogContentText>
          
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel id="role-select-label">Roles</InputLabel>
            <Select
              labelId="role-select-label"
              id="role-select"
              multiple
              value={selectedRoles}
              onChange={(e) => setSelectedRoles(e.target.value as string[])}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((roleId) => {
                    const role = roles.find(r => r.id === roleId);
                    return role ? (
                      <Chip key={roleId} label={role.name} />
                    ) : null;
                  })}
                </Box>
              )}
            >
              {roles.map((role) => (
                <MenuItem key={role.id} value={role.id}>
                  {role.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRoleChange} variant="contained">
            Save Associations
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        message={snackbarMessage}
      />
    </Box>
  );
};

// Helper function to get help text for restriction value
const getRestrictionValueHelp = (type: RestrictionType): string => {
  switch (type) {
    case RestrictionType.IP_RANGE:
      return 'Enter IP range in CIDR format (e.g., 192.168.1.0/24)';
    case RestrictionType.COUNTRY:
      return 'Enter country name (e.g., United States)';
    case RestrictionType.REGION:
      return 'Enter region/state name (e.g., California)';
    case RestrictionType.CITY:
      return 'Enter city name (e.g., San Francisco)';
    default:
      return '';
  }
};

export default GeoRestrictions;
