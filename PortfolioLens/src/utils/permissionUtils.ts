/**
 * Permission Utility Functions
 * 
 * This utility provides functions to check user permissions in the frontend,
 * which complements the Row-Level Security (RLS) policies in the database.
 * It helps control UI elements based on user roles and permissions.
 */

import { supabaseClient } from "../utility";
import { UserRoleType } from "../types/userRoles";

/**
 * Enum for different resource types in the application
 */
export enum ResourceType {
  LOAN = "loans",
  SERVICER = "servicers",
  INVESTOR = "investors",
  UPLOAD = "uploads",
  LOAN_SNAPSHOT = "loan_snapshots",
}

/**
 * Enum for different operation types
 */
export enum OperationType {
  VIEW = "view",
  CREATE = "create",
  EDIT = "edit",
  DELETE = "delete",
  EXPORT = "export",
}

/**
 * Interface for permission check result
 */
interface PermissionResult {
  allowed: boolean;
  message?: string;
}

/**
 * Check if the current user can perform an operation on a resource
 * 
 * @param resourceType Type of resource (loan, investor, etc.)
 * @param operation Type of operation (view, create, edit, delete)
 * @param resourceId Optional resource ID for item-specific permissions
 * @returns Promise resolving to a permission result
 */
export const checkPermission = async (
  resourceType: ResourceType,
  operation: OperationType,
  resourceId?: string
): Promise<PermissionResult> => {
  try {
    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      return {
        allowed: false,
        message: "You must be logged in to perform this action.",
      };
    }

    // Check user roles
    const { data: userRolesResponse, error: rolesError } = await supabaseClient.rpc(
      'get_user_roles',
      { user_uuid: user.id }
    );

    if (rolesError) {
      console.error("Error checking user roles:", rolesError);
      return {
        allowed: false,
        message: "Unable to verify permissions. Please try again.",
      };
    }

    const userRoles = userRolesResponse as UserRoleType[];
    
    // Admin can do everything
    if (userRoles.includes(UserRoleType.Admin)) {
      return { allowed: true };
    }

    // Check resource-specific permissions
    switch (resourceType) {
      case ResourceType.LOAN:
        return checkLoanPermission(userRoles, operation, resourceId);
      case ResourceType.SERVICER:
        return checkServicerPermission(userRoles, operation);
      case ResourceType.INVESTOR:
        return checkInvestorPermission(userRoles, operation, resourceId);
      case ResourceType.UPLOAD:
        return checkUploadPermission(userRoles, operation, resourceId);
      case ResourceType.LOAN_SNAPSHOT:
        return checkLoanSnapshotPermission(userRoles, operation, resourceId);
      default:
        return {
          allowed: false,
          message: "Unknown resource type.",
        };
    }
  } catch (err) {
    console.error("Error checking permissions:", err);
    return {
      allowed: false,
      message: "An error occurred while checking permissions.",
    };
  }
};

/**
 * Check permissions for loan resources
 */
const checkLoanPermission = async (
  userRoles: UserRoleType[],
  operation: OperationType,
  loanId?: string
): Promise<PermissionResult> => {
  // All internal roles can view loans
  if (operation === OperationType.VIEW) {
    if (
      userRoles.includes(UserRoleType.LoanOfficer) ||
      userRoles.includes(UserRoleType.Accounting) ||
      userRoles.includes(UserRoleType.Exec) ||
      userRoles.includes(UserRoleType.Servicing)
    ) {
      return { allowed: true };
    }

    // External Fund can only view their own loans
    if (userRoles.includes(UserRoleType.ExternalFund) && loanId) {
      // Check if loan is assigned to their fund
      const { data: access, error } = await supabaseClient
        .from('external_fund_access')
        .select('investor_id')
        .eq('user_id', (await supabaseClient.auth.getUser()).data.user?.id);

      if (error || !access.length) {
        return {
          allowed: false,
          message: "You don't have access to this loan.",
        };
      }

      const investorIds = access.map(a => a.investor_id);
      
      const { data: loan, error: loanError } = await supabaseClient
        .from('loan_information')
        .select('investor_id')
        .eq('id', loanId)
        .single();

      if (loanError || !loan) {
        return {
          allowed: false,
          message: "Unable to verify loan access.",
        };
      }

      return {
        allowed: investorIds.includes(loan.investor_id),
        message: investorIds.includes(loan.investor_id) ? undefined : "You don't have access to this loan.",
      };
    }
  }

  // Only Loan Officers can create loans
  if (operation === OperationType.CREATE) {
    return {
      allowed: userRoles.includes(UserRoleType.LoanOfficer),
      message: userRoles.includes(UserRoleType.LoanOfficer) ? undefined : "Only Loan Officers can create loans.",
    };
  }

  // Edit permissions
  if (operation === OperationType.EDIT) {
    // Loan Officers can edit loans they created
    if (userRoles.includes(UserRoleType.LoanOfficer) && loanId) {
      const { data: loan, error } = await supabaseClient
        .from('loan_information')
        .select('created_by')
        .eq('id', loanId)
        .single();

      if (error || !loan) {
        return {
          allowed: false,
          message: "Unable to verify loan ownership.",
        };
      }

      const isCreator = loan.created_by === (await supabaseClient.auth.getUser()).data.user?.id;
      
      return {
        allowed: isCreator,
        message: isCreator ? undefined : "You can only edit loans you created.",
      };
    }

    // Servicing can edit servicing-related fields
    if (userRoles.includes(UserRoleType.Servicing)) {
      return { allowed: true };
    }
  }

  // Delete permissions (only admin can delete, handled above)
  if (operation === OperationType.DELETE) {
    return {
      allowed: false,
      message: "Only administrators can delete loans.",
    };
  }

  // Export permissions
  if (operation === OperationType.EXPORT) {
    return {
      allowed: userRoles.includes(UserRoleType.Accounting) || 
               userRoles.includes(UserRoleType.Exec) ||
               userRoles.includes(UserRoleType.LoanOfficer),
      message: "You don't have permission to export loan data.",
    };
  }

  return { allowed: false, message: "Permission denied." };
};

/**
 * Check permissions for servicer resources
 */
const checkServicerPermission = (
  userRoles: UserRoleType[],
  operation: OperationType
): PermissionResult => {
  // All internal roles can view servicers
  if (operation === OperationType.VIEW) {
    return {
      allowed: userRoles.includes(UserRoleType.LoanOfficer) ||
               userRoles.includes(UserRoleType.Accounting) ||
               userRoles.includes(UserRoleType.Exec) ||
               userRoles.includes(UserRoleType.Servicing),
      message: "You don't have permission to view servicers."
    };
  }

  // Only Loan Officers and Servicing can create/edit servicers
  if (operation === OperationType.CREATE || operation === OperationType.EDIT) {
    return {
      allowed: userRoles.includes(UserRoleType.LoanOfficer) ||
               userRoles.includes(UserRoleType.Servicing),
      message: "Only Loan Officers and Servicing can manage servicers."
    };
  }

  // Delete permissions (only admin can delete, handled above)
  if (operation === OperationType.DELETE) {
    return {
      allowed: false,
      message: "Only administrators can delete servicers."
    };
  }

  return { allowed: false, message: "Permission denied." };
};

/**
 * Check permissions for investor resources
 */
const checkInvestorPermission = async (
  userRoles: UserRoleType[],
  operation: OperationType,
  investorId?: string
): Promise<PermissionResult> => {
  // All internal roles can view investors
  if (operation === OperationType.VIEW) {
    if (
      userRoles.includes(UserRoleType.LoanOfficer) ||
      userRoles.includes(UserRoleType.Accounting) ||
      userRoles.includes(UserRoleType.Exec) ||
      userRoles.includes(UserRoleType.Servicing)
    ) {
      return { allowed: true };
    }

    // External Fund can only view their own investor
    if (userRoles.includes(UserRoleType.ExternalFund) && investorId) {
      const { data: access, error } = await supabaseClient
        .from('external_fund_access')
        .select('investor_id')
        .eq('user_id', (await supabaseClient.auth.getUser()).data.user?.id);

      if (error) {
        return {
          allowed: false,
          message: "Unable to verify investor access.",
        };
      }

      const investorIds = access.map(a => a.investor_id);
      
      return {
        allowed: investorIds.includes(investorId),
        message: investorIds.includes(investorId) ? undefined : "You don't have access to this investor.",
      };
    }
  }

  // Only Loan Officers and Accounting can create/edit investors
  if (operation === OperationType.CREATE || operation === OperationType.EDIT) {
    return {
      allowed: userRoles.includes(UserRoleType.LoanOfficer) ||
               userRoles.includes(UserRoleType.Accounting),
      message: "Only Loan Officers and Accounting can manage investors."
    };
  }

  // Delete permissions (only admin can delete, handled above)
  if (operation === OperationType.DELETE) {
    return {
      allowed: false,
      message: "Only administrators can delete investors."
    };
  }

  return { allowed: false, message: "Permission denied." };
};

/**
 * Check permissions for upload resources
 */
const checkUploadPermission = async (
  userRoles: UserRoleType[],
  operation: OperationType,
  uploadId?: string
): Promise<PermissionResult> => {
  // All internal roles can view uploads
  if (operation === OperationType.VIEW) {
    if (
      userRoles.includes(UserRoleType.LoanOfficer) ||
      userRoles.includes(UserRoleType.Accounting) ||
      userRoles.includes(UserRoleType.Exec) ||
      userRoles.includes(UserRoleType.Servicing)
    ) {
      return { allowed: true };
    }

    // External Fund can only view public uploads or those tagged for their investor
    if (userRoles.includes(UserRoleType.ExternalFund) && uploadId) {
      const { data: upload, error } = await supabaseClient
        .from('uploads')
        .select('is_public, investor_id')
        .eq('id', uploadId)
        .single();

      if (error || !upload) {
        return {
          allowed: false,
          message: "Unable to verify upload access.",
        };
      }

      if (upload.is_public) {
        return { allowed: true };
      }

      const { data: access, error: accessError } = await supabaseClient
        .from('external_fund_access')
        .select('investor_id')
        .eq('user_id', (await supabaseClient.auth.getUser()).data.user?.id);

      if (accessError) {
        return {
          allowed: false,
          message: "Unable to verify investor access.",
        };
      }

      const investorIds = access.map(a => a.investor_id);
      
      return {
        allowed: investorIds.includes(upload.investor_id),
        message: investorIds.includes(upload.investor_id) ? undefined : "You don't have access to this upload.",
      };
    }
  }

  // All internal roles can create uploads
  if (operation === OperationType.CREATE) {
    return {
      allowed: userRoles.includes(UserRoleType.LoanOfficer) ||
               userRoles.includes(UserRoleType.Accounting) ||
               userRoles.includes(UserRoleType.Exec) ||
               userRoles.includes(UserRoleType.Servicing),
      message: "You don't have permission to upload files."
    };
  }

  // Users can only delete their own uploads
  if (operation === OperationType.DELETE && uploadId) {
    const { data: upload, error } = await supabaseClient
      .from('uploads')
      .select('uploaded_by')
      .eq('id', uploadId)
      .single();

    if (error || !upload) {
      return {
        allowed: false,
        message: "Unable to verify upload ownership.",
      };
    }

    const isOwner = upload.uploaded_by === (await supabaseClient.auth.getUser()).data.user?.id;
    
    return {
      allowed: isOwner,
      message: isOwner ? undefined : "You can only delete uploads you created.",
    };
  }

  return { allowed: false, message: "Permission denied." };
};

/**
 * Check permissions for loan snapshot resources
 */
const checkLoanSnapshotPermission = async (
  userRoles: UserRoleType[],
  operation: OperationType,
  snapshotId?: string
): Promise<PermissionResult> => {
  // All internal roles can view loan snapshots
  if (operation === OperationType.VIEW) {
    if (
      userRoles.includes(UserRoleType.LoanOfficer) ||
      userRoles.includes(UserRoleType.Accounting) ||
      userRoles.includes(UserRoleType.Exec) ||
      userRoles.includes(UserRoleType.Servicing)
    ) {
      return { allowed: true };
    }

    // External Fund can only view snapshots of their loans
    if (userRoles.includes(UserRoleType.ExternalFund) && snapshotId) {
      const { data: snapshot, error } = await supabaseClient
        .from('loan_snapshots')
        .select('loan_id')
        .eq('id', snapshotId)
        .single();

      if (error || !snapshot) {
        return {
          allowed: false,
          message: "Unable to verify snapshot access.",
        };
      }

      const { data: loan, error: loanError } = await supabaseClient
        .from('loan_information')
        .select('investor_id')
        .eq('id', snapshot.loan_id)
        .single();

      if (loanError || !loan) {
        return {
          allowed: false,
          message: "Unable to verify loan access.",
        };
      }

      const { data: access, error: accessError } = await supabaseClient
        .from('external_fund_access')
        .select('investor_id')
        .eq('user_id', (await supabaseClient.auth.getUser()).data.user?.id);

      if (accessError) {
        return {
          allowed: false,
          message: "Unable to verify investor access.",
        };
      }

      const investorIds = access.map(a => a.investor_id);
      
      return {
        allowed: investorIds.includes(loan.investor_id),
        message: investorIds.includes(loan.investor_id) ? undefined : "You don't have access to this loan snapshot.",
      };
    }
  }

  // Only Admin, Loan Officers, and Servicing can create snapshots
  if (operation === OperationType.CREATE) {
    return {
      allowed: userRoles.includes(UserRoleType.Admin) ||
               userRoles.includes(UserRoleType.LoanOfficer) ||
               userRoles.includes(UserRoleType.Servicing),
      message: "You don't have permission to create loan snapshots."
    };
  }

  // No one can delete loan snapshots (only Admin, handled above)
  if (operation === OperationType.DELETE) {
    return {
      allowed: false,
      message: "Historical loan snapshots cannot be deleted."
    };
  }

  return { allowed: false, message: "Permission denied." };
};

/**
 * Utility to hide UI elements when user doesn't have permission
 * 
 * @param resourceType Type of resource
 * @param operation Type of operation
 * @param resourceId Optional resource ID
 * @returns Boolean indicating if element should be shown
 */
export const useCanAccess = async (
  resourceType: ResourceType,
  operation: OperationType,
  resourceId?: string
): Promise<boolean> => {
  const { allowed } = await checkPermission(resourceType, operation, resourceId);
  return allowed;
};

/**
 * Higher-order function to handle permission errors in API calls
 * 
 * @param apiCall The API function to call
 * @param resourceType Type of resource
 * @param operation Type of operation
 * @param resourceId Optional resource ID
 * @returns Result of the API call or error
 */
export const withPermissionCheck = async <T>(
  apiCall: () => Promise<T>,
  resourceType: ResourceType,
  operation: OperationType,
  resourceId?: string
): Promise<T> => {
  const { allowed, message } = await checkPermission(resourceType, operation, resourceId);
  
  if (!allowed) {
    throw new Error(message || "Permission denied");
  }
  
  return apiCall();
};
