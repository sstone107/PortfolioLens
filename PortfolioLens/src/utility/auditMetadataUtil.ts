import { supabaseClient } from "./supabaseClient";

/**
 * Utility for ensuring consistent audit metadata capture throughout the system
 * Provides standardized methods for recording user actions and changes
 */

/**
 * Types of system activities that can be audited
 */
export enum AuditActionType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  VIEW = 'view',
  LOGIN = 'login',
  LOGOUT = 'logout',
  SEARCH = 'search',
  EXPORT = 'export',
  IMPORT = 'import',
  PAYMENT = 'payment',
  SYSTEM = 'system'
}

/**
 * Types of entities that can be audited
 */
export enum AuditEntityType {
  LOAN = 'loan',
  PAYMENT = 'payment',
  BORROWER = 'borrower',
  PROPERTY = 'property',
  USER = 'user',
  IMPORT = 'import',
  SEARCH = 'search',
  DOCUMENT = 'document',
  CONFIGURATION = 'configuration',
  NOTE = 'note',
  SYSTEM = 'system'
}

/**
 * Interface for audit metadata
 */
export interface AuditMetadata {
  entity_type: AuditEntityType;
  entity_id: string;
  action_type: AuditActionType;
  user_id: string;
  timestamp: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Function to record an audit entry
 * @param entityType Type of entity being audited
 * @param entityId ID of the entity being audited
 * @param actionType Type of action being performed
 * @param details Additional details about the action
 * @returns Promise that resolves when the audit entry is recorded
 */
export async function recordAuditEntry(
  entityType: AuditEntityType,
  entityId: string,
  actionType: AuditActionType,
  details?: Record<string, any>
): Promise<{ success: boolean; error: any }> {
  try {
    // Get current user ID from auth state
    const { data: userData } = await supabaseClient.auth.getUser();
    const userId = userData?.user?.id;
    
    if (!userId) {
      console.warn('No user ID available for audit log');
      return { success: false, error: new Error('No user ID available') };
    }
    
    // Record audit entry in loan_change_history if it's a loan-related entity
    if (
      entityType === AuditEntityType.LOAN ||
      entityType === AuditEntityType.BORROWER ||
      entityType === AuditEntityType.PROPERTY
    ) {
      // Use loan history system for loan-related entities
      const loanId = entityType === AuditEntityType.LOAN ? entityId : details?.loan_id;
      
      if (!loanId) {
        return { success: false, error: new Error('Loan ID is required for loan-related entities') };
      }
      
      const { data, error } = await supabaseClient.rpc('record_loan_change', {
        p_loan_id: loanId,
        p_field_name: details?.field_name || `${entityType}.${actionType}`,
        p_old_value: details?.old_value || '',
        p_new_value: details?.new_value || '',
        p_change_type: actionType,
        p_change_source: 'user',
        p_changed_by: userId,
        p_change_reason: details?.reason || `User initiated ${actionType} on ${entityType}`
      });
      
      if (error) {
        console.error('Error recording loan history audit:', error);
        return { success: false, error };
      }
      
      return { success: true, error: null };
    }
    
    // For payment-related actions, use payment transaction system
    if (entityType === AuditEntityType.PAYMENT) {
      // If it's a payment action, use the payment transaction system
      if (actionType === AuditActionType.PAYMENT || actionType === AuditActionType.CREATE) {
        // Payment transactions are recorded automatically by triggers
        // Just return success
        return { success: true, error: null };
      }
    }
    
    // For other entities, record in general audit log table if it exists
    // This is a placeholder for future implementation
    console.log('Recording audit entry for', entityType, entityId, actionType);
    
    return { success: true, error: null };
  } catch (err) {
    console.error('Error in recordAuditEntry:', err);
    return { success: false, error: err };
  }
}

/**
 * Helper to record changes to fields
 * @param entityType Entity type being modified
 * @param entityId Entity ID being modified
 * @param fieldName Name of the field being changed
 * @param oldValue Previous value
 * @param newValue New value
 * @param reason Optional reason for the change
 * @returns Promise that resolves when the change is recorded
 */
export async function recordFieldChange(
  entityType: AuditEntityType,
  entityId: string,
  fieldName: string,
  oldValue: any,
  newValue: any,
  reason?: string
): Promise<{ success: boolean; error: any }> {
  return recordAuditEntry(
    entityType,
    entityId,
    AuditActionType.UPDATE,
    {
      field_name: fieldName,
      old_value: String(oldValue),
      new_value: String(newValue),
      reason
    }
  );
}

/**
 * Helper to wrap database operations with audit logging
 * @param operation Async database operation to perform
 * @param entityType Type of entity being modified
 * @param entityId ID of entity being modified
 * @param actionType Type of action being performed
 * @param details Additional details about the action
 * @returns Result of the database operation
 */
export async function withAuditLogging<T>(
  operation: () => Promise<T>,
  entityType: AuditEntityType,
  entityId: string,
  actionType: AuditActionType,
  details?: Record<string, any>
): Promise<T> {
  try {
    // Perform the operation first
    const result = await operation();
    
    // Log the audit entry
    await recordAuditEntry(entityType, entityId, actionType, details);
    
    return result;
  } catch (error) {
    // Still try to log an audit entry for the failed operation
    const errorDetails = {
      ...details,
      error: error.message || 'Unknown error',
      success: false
    };
    
    await recordAuditEntry(entityType, entityId, actionType, errorDetails);
    
    // Re-throw the original error
    throw error;
  }
}

/**
 * Helper to record search actions
 * @param searchTerm The search term used
 * @param resultCount Number of results found
 * @param filters Optional filters applied to the search
 */
export async function recordSearchAction(
  searchTerm: string,
  resultCount: number,
  filters?: any
): Promise<void> {
  try {
    await recordAuditEntry(
      AuditEntityType.SEARCH,
      'search',
      AuditActionType.SEARCH,
      {
        search_term: searchTerm,
        result_count: resultCount,
        filters
      }
    );
  } catch (error) {
    console.error('Error recording search action:', error);
  }
}

/**
 * Helper to record user activity like login/logout
 * @param actionType The action type (LOGIN or LOGOUT)
 * @param userId User ID
 * @param details Additional details
 */
export async function recordUserActivity(
  actionType: AuditActionType.LOGIN | AuditActionType.LOGOUT,
  userId: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    await recordAuditEntry(
      AuditEntityType.USER,
      userId,
      actionType,
      details
    );
  } catch (error) {
    console.error(`Error recording user ${actionType}:`, error);
  }
}

/**
 * Get user-friendly description of an audit action
 * @param actionType The audit action type
 * @param entityType The entity type (optional)
 * @returns Human-readable description
 */
export function getAuditActionDescription(
  actionType: AuditActionType,
  entityType?: AuditEntityType
): string {
  const entityLabel = entityType ? 
    entityType.charAt(0).toUpperCase() + entityType.slice(1).toLowerCase() : 
    'Item';
  
  switch (actionType) {
    case AuditActionType.CREATE:
      return `Created ${entityLabel}`;
    case AuditActionType.UPDATE:
      return `Updated ${entityLabel}`;
    case AuditActionType.DELETE:
      return `Deleted ${entityLabel}`;
    case AuditActionType.VIEW:
      return `Viewed ${entityLabel}`;
    case AuditActionType.LOGIN:
      return 'User Logged In';
    case AuditActionType.LOGOUT:
      return 'User Logged Out';
    case AuditActionType.SEARCH:
      return 'Performed Search';
    case AuditActionType.EXPORT:
      return `Exported ${entityLabel}`;
    case AuditActionType.IMPORT:
      return `Imported ${entityLabel}`;
    case AuditActionType.PAYMENT:
      return 'Payment Transaction';
    case AuditActionType.SYSTEM:
      return 'System Action';
    default:
      return `${actionType} ${entityLabel}`;
  }
}

export default {
  recordAuditEntry,
  recordFieldChange,
  withAuditLogging,
  recordSearchAction,
  recordUserActivity,
  getAuditActionDescription,
  AuditActionType,
  AuditEntityType
};