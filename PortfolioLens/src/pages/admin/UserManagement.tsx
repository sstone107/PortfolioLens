import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  CircularProgress,
  Alert,
  Snackbar
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  PersonAdd as PersonAddIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { formatDate } from '../../utility/formatters';
import { supabaseClient } from '../../utility/supabaseClient';

interface UserData {
  id: string;
  email: string;
  full_name: string | null;
  role_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role_name?: string;
}

interface RoleData {
  id: string;
  name: string;
  description: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role_id: '',
    is_active: true
  });
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info' | 'warning'
  });

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Use our dedicated RPC function to get users with roles
      const { data, error } = await supabaseClient.rpc('get_users_with_roles');
      
      if (error) {
        console.error('Error fetching users with roles:', error);
        
        // Fallback to just fetching users without role information
        const { data: usersData, error: usersError } = await supabaseClient
          .from('users')
          .select(`
            id, 
            email, 
            full_name, 
            is_active, 
            created_at, 
            updated_at
          `)
          .order('created_at', { ascending: false });

        if (usersError) {
          console.error('Error fetching users fallback:', usersError);
          setError('Failed to load users. Please try again.');
        } else {
          setUsers(usersData || []);
          setError(null);
        }
      } else {
        setUsers(data || []);
        setError(null);
      }
    } catch (err) {
      console.error('Exception fetching users:', err);
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      // Use our dedicated RPC function to get roles safely
      const { data, error } = await supabaseClient.rpc('get_user_roles_safe');
      
      if (error) {
        console.error('Error fetching roles with safe RPC:', error);
        
        // Fall back to standard approach - this might still fail with recursion
        const { data: fallbackData, error: fallbackError } = await supabaseClient
          .from('user_roles')
          .select('id, name, description')
          .order('name');

        if (fallbackError) {
          console.error('Error fetching roles:', fallbackError);
        } else {
          setRoles(fallbackData || []);
        }
      } else {
        setRoles(data || []);
      }
    } catch (err) {
      console.error('Exception fetching roles:', err);
    }
  };

  const getRoleName = (roleId: string): string => {
    const role = roles.find(r => r.id === roleId);
    return role ? role.name : 'Unknown';
  };

  const handleOpenDialog = (user: UserData | null = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        full_name: user.full_name || '',
        role_id: user.role_id,
        is_active: user.is_active
      });
    } else {
      setEditingUser(null);
      setFormData({
        email: '',
        full_name: '',
        role_id: roles.length > 0 ? roles[0].id : '',
        is_active: true
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name as string]: value
    }));
  };

  const handleSaveUser = async () => {
    try {
      if (editingUser) {
        // Update existing user
        const { error } = await supabaseClient
          .from('users')
          .update({
            full_name: formData.full_name,
            role_id: formData.role_id,
            is_active: formData.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingUser.id);

        if (error) {
          console.error('Error updating user:', error);
          setSnackbar({
            open: true,
            message: `Failed to update user: ${error.message}`,
            severity: 'error'
          });
          return;
        }

        setSnackbar({
          open: true,
          message: 'User updated successfully',
          severity: 'success'
        });
      } else {
        // This part would be implemented if we wanted to add new users directly,
        // but since we're using Supabase Auth, users are created through sign-up
        setSnackbar({
          open: true,
          message: 'User creation is handled through Supabase Auth',
          severity: 'info'
        });
      }

      handleCloseDialog();
      fetchUsers(); // Refresh the list
    } catch (err) {
      console.error('Exception saving user:', err);
      setSnackbar({
        open: true,
        message: 'An unexpected error occurred',
        severity: 'error'
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    // Show confirmation dialog here if needed
    
    try {
      // Note: We don't actually delete users, just set them as inactive
      const { error } = await supabaseClient
        .from('users')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        console.error('Error deactivating user:', error);
        setSnackbar({
          open: true,
          message: `Failed to deactivate user: ${error.message}`,
          severity: 'error'
        });
        return;
      }

      setSnackbar({
        open: true,
        message: 'User deactivated successfully',
        severity: 'success'
      });

      fetchUsers(); // Refresh the list
    } catch (err) {
      console.error('Exception deactivating user:', err);
      setSnackbar({
        open: true,
        message: 'An unexpected error occurred',
        severity: 'error'
      });
    }
  };

  const handleSyncUsers = async () => {
    try {
      setLoading(true);
      
      // Call our dedicated RPC function to sync users
      const { data, error } = await supabaseClient.rpc('sync_users_rpc');
      
      if (error) {
        console.error('Error syncing users:', error);
        setSnackbar({
          open: true,
          message: `Failed to sync users: ${error.message}`,
          severity: 'error'
        });
      } else {
        // Parse the result
        const result = data;
        
        setSnackbar({
          open: true,
          message: `Users synchronized successfully: ${result.inserted_users} new, ${result.updated_users} updated, ${result.assigned_roles} roles assigned`,
          severity: 'success'
        });
        
        fetchUsers(); // Refresh the list
      }
    } catch (err) {
      console.error('Exception syncing users:', err);
      setSnackbar({
        open: true,
        message: 'An unexpected error occurred',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };
  
  // Function to make sstone16@gmail.com an admin
  const handleMakeSstone16Admin = async () => {
    try {
      setLoading(true);
      
      // Call our dedicated RPC function to make sstone16@gmail.com an admin
      const { data, error } = await supabaseClient.rpc('make_sstone16_admin');
      
      if (error) {
        console.error('Error making sstone16 admin:', error);
        setSnackbar({
          open: true,
          message: `Failed to fix admin access: ${error.message}`,
          severity: 'error'
        });
      } else {
        setSnackbar({
          open: true,
          message: `Admin access fixed: ${data}`,
          severity: 'success'
        });
        
        fetchUsers(); // Refresh the list
      }
    } catch (err) {
      console.error('Exception fixing admin access:', err);
      setSnackbar({
        open: true,
        message: 'An unexpected error occurred',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" component="h1">
          User Management
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleSyncUsers}
            sx={{ mr: 1 }}
          >
            Sync Users
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            onClick={handleMakeSstone16Admin}
            sx={{ mr: 1 }}
          >
            Fix Admin Access
          </Button>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add User
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 250px)' }}>
          <Table stickyHeader aria-label="users table">
            <TableHead>
              <TableRow>
                <TableCell>Email</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <CircularProgress size={40} sx={{ my: 2 }} />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography variant="body1" sx={{ py: 2 }}>
                      No users found. Click "Sync Users" to import from auth system.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.full_name || '-'}</TableCell>
                    <TableCell>{getRoleName(user.role_id)}</TableCell>
                    <TableCell>
                      {user.is_active ? (
                        <Box component="span" sx={{ color: 'success.main' }}>Active</Box>
                      ) : (
                        <Box component="span" sx={{ color: 'text.disabled' }}>Inactive</Box>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(user.created_at)}</TableCell>
                    <TableCell>
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDialog(user)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Deactivate">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={!user.is_active}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* User Form Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingUser ? 'Edit User' : 'Add User'}
        </DialogTitle>
        <DialogContent>
          <Box component="form" sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              label="Email"
              name="email"
              value={formData.email}
              onChange={handleFormChange}
              disabled={!!editingUser} // Can't change email for existing users
            />
            <TextField
              margin="normal"
              fullWidth
              label="Full Name"
              name="full_name"
              value={formData.full_name}
              onChange={handleFormChange}
            />
            <FormControl fullWidth margin="normal">
              <InputLabel id="role-label">Role</InputLabel>
              <Select
                labelId="role-label"
                name="role_id"
                value={formData.role_id}
                label="Role"
                onChange={handleFormChange}
              >
                {roles.map((role) => (
                  <MenuItem key={role.id} value={role.id}>
                    {role.name} - {role.description}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth margin="normal">
              <InputLabel id="status-label">Status</InputLabel>
              <Select
                labelId="status-label"
                name="is_active"
                value={formData.is_active}
                label="Status"
                onChange={handleFormChange}
              >
                <MenuItem value={true}>Active</MenuItem>
                <MenuItem value={false}>Inactive</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSaveUser} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default UserManagement;