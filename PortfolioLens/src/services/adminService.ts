/**
 * Admin Service for PortfolioLens
 * 
 * This service handles all admin-specific operations including:
 * - User impersonation
 * - Module visibility management
 * - Admin audit log retrieval
 * - User management for admins
 */

import { supabaseClient } from "../utility";
import {
  ImpersonationSession,
  ImpersonationSessionDB,
  ImpersonationRequest,
  ModuleVisibility,
  ModuleVisibilityDB,
  ModuleVisibilityUpdate,
  AdminAuditLog,
  AdminAuditLogDB,
  ModuleType,
  AdminStats,
  AdminUserView,
  ImpersonationStatus,
} from "../types/adminTypes";
import { UserRoleType } from "../types/userRoles";

// Convert DB format to frontend format
const mapImpersonationSession = (session: ImpersonationSessionDB): ImpersonationSession => ({
  id: session.id,
  adminId: session.admin_id,
  impersonatedUserId: session.impersonated_user_id,
  startedAt: new Date(session.started_at),
  endedAt: session.ended_at ? new Date(session.ended_at) : undefined,
  active: session.active,
  reason: session.reason,
  ipAddress: session.ip_address,
  userAgent: session.user_agent,
});

// Convert DB format to frontend format
const mapModuleVisibility = (visibility: ModuleVisibilityDB): ModuleVisibility => ({
  id: visibility.id,
  module: visibility.module,
  roleId: visibility.role_id,
  visible: visibility.visible,
  createdAt: new Date(visibility.created_at),
  createdBy: visibility.created_by,
  updatedAt: new Date(visibility.updated_at),
  updatedBy: visibility.updated_by,
});

// Convert DB format to frontend format
const mapAuditLog = (log: AdminAuditLogDB): AdminAuditLog => ({
  id: log.id,
  adminId: log.admin_id,
  actionType: log.action_type,
  targetId: log.target_id,
  targetType: log.target_type,
  details: log.details,
  ipAddress: log.ip_address,
  userAgent: log.user_agent,
  createdAt: new Date(log.created_at),
});

/**
 * Start impersonating a user
 * 
 * @param request Impersonation request details
 * @returns The created impersonation session
 */
export const startImpersonation = async (
  request: ImpersonationRequest
): Promise<ImpersonationSession> => {
  // Get current user
  const { data: { user } } = await supabaseClient.auth.getUser();
  
  if (!user) {
    throw new Error("You must be logged in to impersonate users");
  }
  
  const { data, error } = await supabaseClient
    .from('impersonation_sessions')
    .insert({
      admin_id: user.id,
      impersonated_user_id: request.userId,
      reason: request.reason || "Administrative purposes",
      active: true,
    })
    .select('*')
    .single();
  
  if (error) {
    console.error("Error starting impersonation:", error);
    throw new Error(`Failed to start impersonation: ${error.message}`);
  }
  
  return mapImpersonationSession(data as ImpersonationSessionDB);
};

/**
 * End an active impersonation session
 * 
 * @param sessionId ID of the impersonation session to end
 * @returns The updated impersonation session
 */
export const endImpersonation = async (
  sessionId: string
): Promise<ImpersonationSession> => {
  const { data, error } = await supabaseClient
    .from('impersonation_sessions')
    .update({
      active: false,
      ended_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select('*')
    .single();
  
  if (error) {
    console.error("Error ending impersonation:", error);
    throw new Error(`Failed to end impersonation: ${error.message}`);
  }
  
  return mapImpersonationSession(data as ImpersonationSessionDB);
};

/**
 * Get all active impersonation sessions for an admin
 * 
 * @param adminId Optional admin ID (defaults to current user)
 * @returns List of active impersonation sessions
 */
export const getActiveImpersonations = async (
  adminId?: string
): Promise<ImpersonationSession[]> => {
  // Get current user if adminId not provided
  let userId = adminId;
  
  if (!userId) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    userId = user?.id;
  }
  
  if (!userId) {
    throw new Error("No user ID available");
  }
  
  const { data, error } = await supabaseClient
    .from('impersonation_sessions')
    .select('*')
    .eq('admin_id', userId)
    .eq('active', true)
    .order('started_at', { ascending: false });
  
  if (error) {
    console.error("Error getting active impersonations:", error);
    throw new Error(`Failed to get active impersonations: ${error.message}`);
  }
  
  return (data as ImpersonationSessionDB[]).map(mapImpersonationSession);
};

/**
 * Get impersonation session by ID
 * 
 * @param sessionId Impersonation session ID
 * @returns The impersonation session
 */
export const getImpersonationSession = async (
  sessionId: string
): Promise<ImpersonationSession> => {
  const { data, error } = await supabaseClient
    .from('impersonation_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  
  if (error) {
    console.error("Error getting impersonation session:", error);
    throw new Error(`Failed to get impersonation session: ${error.message}`);
  }
  
  return mapImpersonationSession(data as ImpersonationSessionDB);
};

/**
 * Update module visibility for a role
 * 
 * @param update Module visibility update details
 * @returns The updated module visibility
 */
export const updateModuleVisibility = async (
  update: ModuleVisibilityUpdate
): Promise<ModuleVisibility> => {
  // Get current user
  const { data: { user } } = await supabaseClient.auth.getUser();
  
  if (!user) {
    throw new Error("You must be logged in to update module visibility");
  }
  
  // Check if record exists
  const { data: existing, error: queryError } = await supabaseClient
    .from('module_visibility')
    .select('*')
    .eq('module', update.module)
    .eq('role_id', update.roleId)
    .maybeSingle();
  
  if (queryError) {
    console.error("Error checking module visibility:", queryError);
    throw new Error(`Failed to check module visibility: ${queryError.message}`);
  }
  
  let result;
  
  if (existing) {
    // Update existing record
    const { data, error } = await supabaseClient
      .from('module_visibility')
      .update({
        visible: update.visible,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    
    if (error) {
      console.error("Error updating module visibility:", error);
      throw new Error(`Failed to update module visibility: ${error.message}`);
    }
    
    result = data;
  } else {
    // Create new record
    const { data, error } = await supabaseClient
      .from('module_visibility')
      .insert({
        module: update.module,
        role_id: update.roleId,
        visible: update.visible,
        created_by: user.id,
        updated_by: user.id,
      })
      .select('*')
      .single();
    
    if (error) {
      console.error("Error creating module visibility:", error);
      throw new Error(`Failed to create module visibility: ${error.message}`);
    }
    
    result = data;
  }
  
  return mapModuleVisibility(result as ModuleVisibilityDB);
};

/**
 * Get module visibility settings for a role
 * 
 * @param roleId Role ID to get visibility settings for
 * @returns List of module visibility settings
 */
export const getModuleVisibilityForRole = async (
  roleId: string
): Promise<ModuleVisibility[]> => {
  const { data, error } = await supabaseClient
    .from('module_visibility')
    .select('*')
    .eq('role_id', roleId);
  
  if (error) {
    console.error("Error getting module visibility:", error);
    throw new Error(`Failed to get module visibility: ${error.message}`);
  }
  
  return (data as ModuleVisibilityDB[]).map(mapModuleVisibility);
};

/**
 * Check if a module is visible to the current user
 * 
 * @param module Module type to check
 * @returns Boolean indicating if module is visible
 */
export const isModuleVisible = async (
  module: ModuleType
): Promise<boolean> => {
  // Get current user
  const { data: { user } } = await supabaseClient.auth.getUser();
  
  if (!user) {
    return false;
  }
  
  const { data, error } = await supabaseClient.rpc(
    'is_module_visible',
    {
      p_user_id: user.id,
      p_module: module,
    }
  );
  
  if (error) {
    console.error("Error checking module visibility:", error);
    return false;
  }
  
  return data;
};

/**
 * Get admin audit logs
 * 
 * @param limit Number of logs to return (default: 50)
 * @param offset Offset for pagination (default: 0)
 * @param actionType Optional action type to filter by
 * @returns List of admin audit logs
 */
export const getAdminAuditLogs = async (
  limit: number = 50,
  offset: number = 0,
  actionType?: string
): Promise<AdminAuditLog[]> => {
  let query = supabaseClient
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (actionType) {
    query = query.eq('action_type', actionType);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error("Error getting admin audit logs:", error);
    throw new Error(`Failed to get admin audit logs: ${error.message}`);
  }
  
  return (data as AdminAuditLogDB[]).map(mapAuditLog);
};

/**
 * Get admin dashboard statistics
 * 
 * @returns Admin dashboard statistics
 */
export const getAdminStats = async (): Promise<AdminStats> => {
  const { data, error } = await supabaseClient.rpc('get_admin_stats');
  
  if (error) {
    console.error("Error getting admin stats:", error);
    throw new Error(`Failed to get admin stats: ${error.message}`);
  }
  
  return {
    totalUsers: data.total_users,
    activeUsers: data.active_users,
    totalLoans: data.total_loans,
    totalServicers: data.total_servicers,
    totalInvestors: data.total_investors,
    totalUploads: data.total_uploads,
    activeImpersonations: data.active_impersonations,
    lastLogin: data.last_login ? new Date(data.last_login) : undefined,
  };
};

/**
 * Get all users with their roles (admin view)
 * 
 * @returns List of users with their roles
 */
export const getAdminUserList = async (): Promise<AdminUserView[]> => {
  const { data, error } = await supabaseClient.rpc('get_users_with_roles');
  
  if (error) {
    console.error("Error getting admin user list:", error);
    throw new Error(`Failed to get admin user list: ${error.message}`);
  }
  
  return data.map((user: any) => ({
    id: user.id,
    email: user.email,
    lastLogin: user.last_login ? new Date(user.last_login) : undefined,
    createdAt: new Date(user.created_at),
    roles: user.roles as UserRoleType[],
    isActive: user.is_active,
    lastIp: user.last_ip,
  }));
};

/**
 * Check if the current user is being impersonated
 * 
 * @returns Impersonation status
 */
export const getImpersonationStatus = async (): Promise<ImpersonationStatus> => {
  // Check for impersonation cookie or localStorage data
  const impersonationData = localStorage.getItem('impersonation');
  
  if (!impersonationData) {
    return { isImpersonating: false };
  }
  
  try {
    const data = JSON.parse(impersonationData);
    
    // Verify the session is still active
    const { data: session, error } = await supabaseClient
      .from('impersonation_sessions')
      .select('*')
      .eq('id', data.sessionId)
      .eq('active', true)
      .single();
    
    if (error || !session) {
      // Session not found or not active, clear impersonation
      localStorage.removeItem('impersonation');
      return { isImpersonating: false };
    }
    
    // Get admin email
    const { data: adminUser } = await supabaseClient
      .from('users')
      .select('email')
      .eq('id', session.admin_id)
      .single();
    
    return {
      isImpersonating: true,
      adminId: session.admin_id,
      adminEmail: adminUser?.email,
      impersonatedUser: {
        id: session.impersonated_user_id,
        email: data.impersonatedEmail,
      },
      sessionId: session.id,
      startedAt: new Date(session.started_at),
    };
  } catch (err) {
    console.error("Error parsing impersonation data:", err);
    localStorage.removeItem('impersonation');
    return { isImpersonating: false };
  }
};
