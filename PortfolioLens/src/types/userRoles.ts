/**
 * User role types and interfaces for PortfolioLens
 * 
 * This file defines the TypeScript types for working with user roles in the application.
 * It maintains strict typing for all role-related operations.
 */

/**
 * Enum representing the available user roles in the system
 */
export enum UserRoleType {
  Admin = 'Admin',
  LoanOfficer = 'LoanOfficer',
  Accounting = 'Accounting',
  Exec = 'Exec',
  Servicing = 'Servicing',
  ExternalFund = 'ExternalFund'
}

/**
 * Interface representing a user role
 */
export interface UserRole {
  id: string;
  name: UserRoleType;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface representing a role assignment to a user
 */
export interface UserRoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  assignedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  
  // Optional populated fields from joins
  role?: UserRole;
  assignedByUser?: {
    id: string;
    email: string;
  };
}

/**
 * Interface for role-based user metadata used in auth context
 */
export interface UserWithRoles {
  id: string;
  email: string;
  roles: UserRoleType[];
  hasRole: (role: UserRoleType) => boolean;
  isAdmin: boolean;
}

/**
 * Type for the parameters when assigning a role to a user
 */
export type AssignRoleParams = {
  userId: string;
  roleName: UserRoleType;
  assignedBy?: string;
};

/**
 * Type for the parameters when removing a role from a user
 */
export type RemoveRoleParams = {
  userId: string;
  roleName: UserRoleType;
};
