/**
 * Record Metadata Service
 * Handles tracking import operations and maintaining audit logs
 */
import { supabaseClient } from '../../../utility/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

export interface ImportActivity {
  id: string;
  userId: string;
  fileName: string;
  templateId?: string;
  timestamp: Date;
  status: 'success' | 'partial' | 'failed';
  tablesCreated: string[];
  rowsAffected: number;
  errorDetails?: any;
}

export interface AuditRecord {
  id: string;
  userId: string;
  action: 'import' | 'export' | 'template_create' | 'template_update' | 'template_delete';
  entityType: 'sheet' | 'table' | 'template';
  entityId?: string;
  entityName: string;
  timestamp: Date;
  details: any;
}

/**
 * Service for tracking metadata about import operations
 */
export class RecordMetadataService {
  /**
   * Create a new import activity record
   */
  async logImportActivity(activity: Omit<ImportActivity, 'id' | 'timestamp'>): Promise<string> {
    try {
      const id = uuidv4();
      const timestamp = new Date();
      
      const record = {
        id,
        user_id: activity.userId,
        file_name: activity.fileName,
        template_id: activity.templateId,
        timestamp: timestamp.toISOString(),
        status: activity.status,
        tables_created: activity.tablesCreated,
        rows_affected: activity.rowsAffected,
        error_details: activity.errorDetails
      };
      
      const { error } = await supabaseClient
        .from('import_activities')
        .insert(record);
      
      if (error) {
        console.error('Error logging import activity:', error);
        throw error;
      }
      
      // Also create an audit log entry
      await this.createAuditRecord({
        userId: activity.userId,
        action: 'import',
        entityType: 'sheet',
        entityName: activity.fileName,
        details: {
          status: activity.status,
          tablesCreated: activity.tablesCreated,
          rowsAffected: activity.rowsAffected
        }
      });
      
      return id;
    } catch (error) {
      console.error('Error in logImportActivity:', error);
      throw error;
    }
  }
  
  /**
   * Create an audit record for tracking user actions
   */
  async createAuditRecord(audit: Omit<AuditRecord, 'id' | 'timestamp'>): Promise<string> {
    try {
      const id = uuidv4();
      const timestamp = new Date();
      
      const record = {
        id,
        user_id: audit.userId,
        action: audit.action,
        entity_type: audit.entityType,
        entity_id: audit.entityId,
        entity_name: audit.entityName,
        timestamp: timestamp.toISOString(),
        details: audit.details
      };
      
      const { error } = await supabaseClient
        .from('audit_logs')
        .insert(record);
      
      if (error) {
        console.error('Error creating audit record:', error);
        throw error;
      }
      
      return id;
    } catch (error) {
      console.error('Error in createAuditRecord:', error);
      // Non-critical error, just log it
      return '';
    }
  }
  
  /**
   * Get import activities for a user
   */
  async getImportActivities(userId: string, limit = 50): Promise<ImportActivity[]> {
    try {
      const { data, error } = await supabaseClient
        .from('import_activities')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error('Error fetching import activities:', error);
        throw error;
      }
      
      // Transform to our interface format
      return (data || []).map(record => ({
        id: record.id,
        userId: record.user_id,
        fileName: record.file_name,
        templateId: record.template_id,
        timestamp: new Date(record.timestamp),
        status: record.status,
        tablesCreated: record.tables_created,
        rowsAffected: record.rows_affected,
        errorDetails: record.error_details
      }));
    } catch (error) {
      console.error('Error in getImportActivities:', error);
      throw error;
    }
  }
  
  /**
   * Get audit records for a specific entity
   */
  async getEntityAuditTrail(entityType: string, entityId: string, limit = 20): Promise<AuditRecord[]> {
    try {
      const { data, error } = await supabaseClient
        .from('audit_logs')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error('Error fetching entity audit trail:', error);
        throw error;
      }
      
      // Transform to our interface format
      return (data || []).map(record => ({
        id: record.id,
        userId: record.user_id,
        action: record.action,
        entityType: record.entity_type,
        entityId: record.entity_id,
        entityName: record.entity_name,
        timestamp: new Date(record.timestamp),
        details: record.details
      }));
    } catch (error) {
      console.error('Error in getEntityAuditTrail:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const recordMetadataService = new RecordMetadataService();