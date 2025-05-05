/**
 * User Role Management Component for PortfolioLens
 * 
 * This component provides an admin interface to:
 * - View all users and their assigned roles
 * - Assign new roles to users
 * - Remove roles from users
 * 
 * Access to this component should be restricted to Admin users only.
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Grid,
  Divider,
} from "@mui/material";
import { useList, useCustom } from "@refinedev/core";
import { useUserRoles } from "../../contexts/userRoleContext";
import { assignRoleToUser, removeRoleFromUser, getAllRoles } from "../../services/userRoleService";
import { UserRoleType, UserRole, UserRoleAssignment } from "../../types/userRoles";

export const UserRoleManagement: React.FC = () => {
  // Role state
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<UserRoleAssignment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<UserRoleType | "">("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Get current user with roles
  const { userWithRoles } = useUserRoles();
  
  // Get users from Supabase
  const { data: userData, isLoading: usersLoading, isError: usersError } = useList({
    resource: "users",
    dataProviderName: "default",
    meta: {
      select: "id, email, created_at",
    },
    pagination: {
      pageSize: 100,
    },
  });
  
  // Load all roles
  const loadRoles = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load available roles
      const rolesData = await getAllRoles();
      setRoles(rolesData);
      
      // Fetch role assignments through the custom data provider
      const { data }: any = await useCustom({
        url: "user_role_assignments",
        method: "get",
        meta: {
          select: `
            id, 
            user_id, 
            role_id, 
            created_at, 
            role:role_id(id, name),
            user:user_id(email)
          `,
        },
      });
      
      if (data) {
        setRoleAssignments(data);
      }
    } catch (err) {
      console.error("Error loading roles:", err);
      setError(typeof err === "string" ? err : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  };
  
  // Load roles on component mount
  useEffect(() => {
    loadRoles();
  }, []);
  
  // Filtered users based on search
  const filteredUsers = userData?.data?.filter(user => 
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];
  
  // Get user roles by user ID
  const getUserRolesByUserId = (userId: string) => {
    return roleAssignments
      .filter(assignment => assignment.userId === userId)
      .map(assignment => assignment.role?.name as UserRoleType);
  };
  
  // Handle opening the assign role dialog
  const handleOpenAssignDialog = (userId: string | undefined, email: string) => {
    if (!userId) return;
    setSelectedUser(userId.toString());
    setSelectedUserEmail(email);
    setSelectedRole("");
    setAssignDialogOpen(true);
  };
  
  // Handle assigning a role
  const handleAssignRole = async () => {
    if (!selectedUser || !selectedRole) return;
    
    try {
      setActionLoading(true);
      
      await assignRoleToUser({
        userId: selectedUser,
        roleName: selectedRole as UserRoleType,
        assignedBy: userWithRoles?.id,
      });
      
      // Reload role assignments
      await loadRoles();
      
      // Close dialog
      setAssignDialogOpen(false);
      setSelectedUser(null);
      setSelectedRole("");
    } catch (err) {
      console.error("Error assigning role:", err);
      setError(typeof err === "string" ? err : "Failed to assign role");
    } finally {
      setActionLoading(false);
    }
  };
  
  // Handle removing a role
  const handleRemoveRole = async (userId: string | undefined, roleName: UserRoleType) => {
    if (!userId || !roleName) return;
    const userIdStr = userId.toString();
    
    try {
      setActionLoading(true);
      
      await removeRoleFromUser({
        userId: userIdStr,
        roleName,
      });
      
      // Reload role assignments
      await loadRoles();
    } catch (err) {
      console.error("Error removing role:", err);
      setError(typeof err === "string" ? err : "Failed to remove role");
    } finally {
      setActionLoading(false);
    }
  };
  
  if (loading || usersLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="50vh">
        <CircularProgress />
      </Box>
    );
  }
  
  if (usersError || error) {
    return (
      <Alert severity="error">
        {error || "Failed to load users and roles. Please try again."}
      </Alert>
    );
  }
  
  return (
    <Box>
      <Card>
        <CardHeader 
          title="User Role Management" 
          subheader="Assign and manage user roles"
        />
        <CardContent>
          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                variant="outlined"
                label="Search users by email"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Grid>
          </Grid>
          
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Current Roles</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.map((user) => {
                  const userRoles = getUserRolesByUserId(user.id?.toString() || "");
                  
                  return (
                    <TableRow key={user.id}>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {userRoles.length > 0 ? (
                          <Box display="flex" gap={1} flexWrap="wrap">
                            {userRoles.map((role) => (
                              <Chip
                                key={role}
                                label={role}
                                color={role === UserRoleType.Admin ? "error" : "primary"}
                                variant="outlined"
                                size="small"
                                onDelete={() => handleRemoveRole(user.id?.toString(), role)}
                                disabled={actionLoading}
                              />
                            ))}
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No roles assigned
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleOpenAssignDialog(user.id?.toString(), user.email)}
                          disabled={actionLoading}
                        >
                          Assign Role
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
      
      {/* Dialog for assigning roles */}
      <Dialog open={assignDialogOpen} onClose={() => setAssignDialogOpen(false)}>
        <DialogTitle>Assign Role to {selectedUserEmail}</DialogTitle>
        <DialogContent>
          <Box mt={2}>
            <FormControl fullWidth>
              <InputLabel id="role-select-label">Role</InputLabel>
              <Select
                labelId="role-select-label"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRoleType)}
                label="Role"
              >
                {Object.values(UserRoleType).map((role) => (
                  <MenuItem key={role} value={role}>
                    {role}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialogOpen(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleAssignRole}
            color="primary"
            variant="contained"
            disabled={!selectedRole || actionLoading}
          >
            {actionLoading ? <CircularProgress size={24} /> : "Assign"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserRoleManagement;
