/**
 * User Role Service for PortfolioLens
 * 
 * This service manages user roles by providing methods to:
 * - Fetch roles for a user
 * - Assign roles to users
 * - Remove roles from users
 * - Check role permissions
 */

import { supabaseClient } from "../utility";
import { 
  UserRole, 
  UserRoleType, 
  UserRoleAssignment, 
  AssignRoleParams,
  RemoveRoleParams 
} from "../types/userRoles";

/**
 * Get all available roles in the system
 */
export const getAllRoles = async (): Promise<UserRole[]> => {
  const { data, error } = await supabaseClient
    .from('user_roles')
    .select('*')
    .order('name');
  
  if (error) {
    console.error("Error fetching roles:", error);
    throw error;
  }
  
  return data.map(role => ({
    ...role,
    createdAt: new Date(role.created_at),
    updatedAt: new Date(role.updated_at)
  }));
};

/**
 * Get roles for a specific user
 * @param userId The user ID to get roles for
 */
export const getUserRoles = async (userId: string): Promise<UserRoleType[]> => {
  // Using the database function we created for this purpose
  const { data, error } = await supabaseClient
    .rpc('get_user_roles', { user_uuid: userId });
  
  if (error) {
    console.error(`Error fetching roles for user ${userId}:`, error);
    throw error;
  }
  
  return data.map(item => item.role_name as UserRoleType);
};

/**
 * Check if a user has a specific role
 * @param userId The user ID to check
 * @param roleName The role to check for
 */
export const hasRole = async (userId: string, roleName: UserRoleType): Promise<boolean> => {
  // Using the database function we created for this purpose
  const { data, error } = await supabaseClient
    .rpc('has_role', { 
      user_uuid: userId,
      role_name: roleName
    });
  
  if (error) {
    console.error(`Error checking if user ${userId} has role ${roleName}:`, error);
    throw error;
  }
  
  return data;
};

/**
 * Check if user is an admin
 * @param userId The user ID to check
 */
export const isAdmin = async (userId: string): Promise<boolean> => {
  return hasRole(userId, UserRoleType.Admin);
};

/**
 * Assign a role to a user
 * @param params Object containing userId, roleName, and optionally assignedBy
 */
export const assignRoleToUser = async (params: AssignRoleParams): Promise<string> => {
  const { userId, roleName, assignedBy } = params;
  
  // Log the start of the operation with key parameters
  console.log(`Assigning role ${roleName} to user ${userId}`);
  
  // Using the database function we created for this purpose
  const { data, error } = await supabaseClient
    .rpc('assign_role_to_user', { 
      p_user_id: userId,
      p_role_name: roleName,
      p_assigned_by: assignedBy
    });
  
  if (error) {
    console.error(`Error assigning role ${roleName} to user ${userId}:`, error);
    throw error;
  }
  
  // Log success
  console.log(`Successfully assigned role ${roleName} to user ${userId}`);
  
  return data;
};

/**
 * Remove a role from a user
 * @param params Object containing userId and roleName
 */
export const removeRoleFromUser = async (params: RemoveRoleParams): Promise<boolean> => {
  const { userId, roleName } = params;
  
  // Log the start of the operation with key parameters
  console.log(`Removing role ${roleName} from user ${userId}`);
  
  // Using the database function we created for this purpose
  const { data, error } = await supabaseClient
    .rpc('remove_role_from_user', { 
      p_user_id: userId,
      p_role_name: roleName
    });
  
  if (error) {
    console.error(`Error removing role ${roleName} from user ${userId}:`, error);
    throw error;
  }
  
  // Log success or failure
  if (data) {
    console.log(`Successfully removed role ${roleName} from user ${userId}`);
  } else {
    console.log(`User ${userId} did not have role ${roleName} assigned`);
  }
  
  return data;
};

/**
 * Get all user role assignments with optional filtering
 * Primarily for admin interfaces
 */
export const getUserRoleAssignments = async (options?: {
  userId?: string;
  roleId?: string;
}): Promise<UserRoleAssignment[]> => {
  let query = supabaseClient
    .from('user_role_assignments')
    .select(`
      *,
      role:role_id(id, name, description),
      assignedByUser:assigned_by(id, email)
    `);
  
  // Apply filters if provided
  if (options?.userId) {
    query = query.eq('user_id', options.userId);
  }
  
  if (options?.roleId) {
    query = query.eq('role_id', options.roleId);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) {
    console.error("Error fetching user role assignments:", error);
    throw error;
  }
  
  return data.map(assignment => ({
    id: assignment.id,
    userId: assignment.user_id,
    roleId: assignment.role_id,
    assignedBy: assignment.assigned_by,
    createdAt: new Date(assignment.created_at),
    updatedAt: new Date(assignment.updated_at),
    role: assignment.role ? {
      id: assignment.role.id,
      name: assignment.role.name,
      description: assignment.role.description,
      createdAt: new Date(assignment.role.created_at),
      updatedAt: new Date(assignment.role.updated_at)
    } : undefined,
    assignedByUser: assignment.assignedByUser ? {
      id: assignment.assignedByUser.id,
      email: assignment.assignedByUser.email
    } : undefined
  }));
};
