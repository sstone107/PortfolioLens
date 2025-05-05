/**
 * Export permissions types and interfaces for PortfolioLens
 * 
 * This file defines the TypeScript types for working with export/download permissions in the application.
 * It maintains strict typing for all export-related operations.
 */

import { UserRoleType } from './userRoles';

/**
 * Enum representing the available export resource types in the system
 */
export enum ExportResourceType {
  Loans = 'loan_information',
  LoanSnapshots = 'loan_snapshots',
  Investors = 'investors',
  Servicers = 'servicers',
  Reports = 'reports',
  Analytics = 'analytics'
}

/**
 * Enum representing the available export format types in the system
 */
export enum ExportFormatType {
  CSV = 'csv',
  PDF = 'pdf',
  Excel = 'excel',
  JSON = 'json',
  API = 'api'
}

/**
 * Interface representing an export permission record
 */
export interface ExportPermission {
  id: string;
  roleName: UserRoleType;
  resourceType: ExportResourceType;
  format: ExportFormatType;
  allowed: boolean;
  maxRecords: number | null;
  requiresApproval: boolean;
  approvalRole: UserRoleType | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Enum representing the possible export log statuses
 */
export enum ExportLogStatus {
  Success = 'success',
  Failed = 'failed',
  PendingApproval = 'pending_approval'
}

/**
 * Interface representing an export log record
 */
export interface ExportLog {
  id: string;
  userId: string;
  roleName: UserRoleType;
  resourceType: ExportResourceType;
  format: ExportFormatType;
  recordCount: number;
  filters: Record<string, any>; // JSONB data from the database
  ipAddress: string;
  userAgent: string;
  status: ExportLogStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  
  // Optional populated fields from joins
  user?: {
    id: string;
    email: string;
  };
  approver?: {
    id: string;
    email: string;
  };
}

/**
 * Type for the parameters when checking if a user can export a resource
 */
export type CanExportParams = {
  resourceType: ExportResourceType;
  format: ExportFormatType;
  recordCount?: number;
};

/**
 * Type for the parameters when logging an export
 */
export type LogExportParams = {
  resourceType: ExportResourceType;
  format: ExportFormatType;
  recordCount: number;
  filters: Record<string, any>;
  ipAddress: string;
  userAgent: string;
};

/**
 * Type for the parameters when approving an export
 */
export type ApproveExportParams = {
  exportLogId: string;
};
