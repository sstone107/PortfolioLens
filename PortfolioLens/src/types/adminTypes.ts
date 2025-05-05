/**
 * Admin Types for PortfolioLens
 * 
 * This file contains TypeScript interfaces and types for admin-specific 
 * features including impersonation sessions and module visibility control.
 */

import { UserRoleType } from "./userRoles";

/**
 * Module types available in the application
 */
export enum ModuleType {
  LOANS = "loans",
  SERVICERS = "servicers",
  INVESTORS = "investors",
  UPLOADS = "uploads",
  REPORTS = "reports",
  ADMIN = "admin",
  SETTINGS = "settings",
  ANALYTICS = "analytics",
  DATA_IMPORT = "data-import"
}

/**
 * Admin action types for audit logging
 */
export enum AdminActionType {
  IMPERSONATION_START = "impersonation_start",
  IMPERSONATION_END = "impersonation_end",
  MODULE_VISIBILITY_CHANGE = "module_visibility_change",
  ROLE_ASSIGNMENT = "role_assignment",
  ROLE_REMOVAL = "role_removal",
  USER_CREATION = "user_creation",
  USER_DELETION = "user_deletion",
  SETTINGS_CHANGE = "settings_change"
}

/**
 * Impersonation session data
 */
export interface ImpersonationSession {
  id: string;
  adminId: string;
  impersonatedUserId: string;
  startedAt: Date;
  endedAt?: Date;
  active: boolean;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * DB format for impersonation session
 */
export interface ImpersonationSessionDB {
  id: string;
  admin_id: string;
  impersonated_user_id: string;
  started_at: string;
  ended_at?: string;
  active: boolean;
  reason?: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Module visibility settings
 */
export interface ModuleVisibility {
  id: string;
  module: ModuleType;
  roleId: string;
  roleName?: UserRoleType; // For display purposes, not stored in DB
  visible: boolean;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

/**
 * DB format for module visibility
 */
export interface ModuleVisibilityDB {
  id: string;
  module: ModuleType;
  role_id: string;
  visible: boolean;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

/**
 * Admin audit log entry
 */
export interface AdminAuditLog {
  id: string;
  adminId: string;
  adminEmail?: string; // For display purposes, not stored in DB
  actionType: AdminActionType;
  targetId?: string;
  targetType?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

/**
 * DB format for admin audit log
 */
export interface AdminAuditLogDB {
  id: string;
  admin_id: string;
  action_type: AdminActionType;
  target_id?: string;
  target_type?: string;
  details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

/**
 * User impersonation request
 */
export interface ImpersonationRequest {
  userId: string;
  reason?: string;
}

/**
 * Module visibility update request
 */
export interface ModuleVisibilityUpdate {
  module: ModuleType;
  roleId: string;
  visible: boolean;
}

/**
 * Admin dashboard statistics
 */
export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalLoans: number;
  totalServicers: number;
  totalInvestors: number;
  totalUploads: number;
  activeImpersonations: number;
  lastLogin?: Date;
}

/**
 * System user with additional admin-only data
 */
export interface AdminUserView {
  id: string;
  email: string;
  lastLogin?: Date;
  createdAt: Date;
  roles: UserRoleType[];
  isActive: boolean;
  lastIp?: string;
}

/**
 * Impersonation status for the current user
 */
export interface ImpersonationStatus {
  isImpersonating: boolean;
  adminId?: string;
  adminEmail?: string;
  impersonatedUser?: {
    id: string;
    email: string;
  };
  sessionId?: string;
  startedAt?: Date;
}
