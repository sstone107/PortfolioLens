import { supabaseClient } from "../utility/supabaseClient";

export interface TimelineEntry {
  entry_id: string;
  loan_id: string;
  entry_type: 'payment' | 'change';
  entry_date: string;
  entry_title: string;
  entry_details: any; // JSON structure depending on entry type
  created_by?: string;
  created_at: string;
  // UI-specific fields
  user_name?: string;
  user_avatar?: string;
}

export interface TimelineFilter {
  startDate?: string;
  endDate?: string;
  includePayments?: boolean;
  includeChanges?: boolean;
  searchTerm?: string;
}

export interface TimelineOptions {
  limit?: number;
  offset?: number;
}

/**
 * Service for retrieving and managing loan history timeline
 */
export const loanHistoryService = {
  /**
   * Get a loan's unified history timeline
   * @param loanId The loan ID to fetch history for
   * @param filter Optional filters for the timeline
   * @param options Optional pagination options
   * @returns Timeline entries sorted by date
   */
  getLoanTimeline: async (
    loanId: string,
    filter?: TimelineFilter,
    options?: TimelineOptions
  ) => {
    try {
      if (!loanId) {
        return { data: [], error: new Error('Loan ID is required') };
      }

      const defaultOptions = {
        limit: 50,
        offset: 0
      };
      
      const mergedOptions = { ...defaultOptions, ...options };
      
      // Call the get_loan_timeline RPC function
      const { data, error } = await supabaseClient
        .rpc('get_loan_timeline', {
          p_loan_id: loanId,
          p_start_date: filter?.startDate || null,
          p_end_date: filter?.endDate || null,
          p_include_payments: filter?.includePayments !== false,
          p_include_changes: filter?.includeChanges !== false,
          p_limit: mergedOptions.limit,
          p_offset: mergedOptions.offset
        });
      
      if (error) {
        console.error("Error fetching loan timeline:", error);
        return { data: [], error };
      }
      
      if (!data || data.length === 0) {
        return { data: [], error: null };
      }
      
      // Fetch user information for user-friendly display
      const userIds = new Set(data.map(entry => entry.created_by).filter(Boolean));
      
      if (userIds.size > 0) {
        const { data: userData, error: userError } = await supabaseClient
          .from('users')
          .select('id, full_name, avatar_url')
          .in('id', Array.from(userIds));
        
        if (!userError && userData && userData.length > 0) {
          // Create a map of user data by ID
          const userMap = new Map(userData.map(user => [user.id, user]));
          
          // Enhance timeline entries with user information
          data.forEach(entry => {
            const user = entry.created_by ? userMap.get(entry.created_by) : null;
            if (user) {
              entry.user_name = user.full_name || 'Unknown User';
              entry.user_avatar = user.avatar_url;
            } else {
              entry.user_name = 'System';
            }
          });
        }
      }
      
      // Apply search term filter on client side
      let filteredData = data;
      if (filter?.searchTerm) {
        const searchTerm = filter.searchTerm.toLowerCase();
        filteredData = data.filter(entry => {
          // Search in title and details
          const titleMatch = entry.entry_title.toLowerCase().includes(searchTerm);
          
          // Search in details JSON
          let detailsMatch = false;
          if (entry.entry_details) {
            if (entry.entry_type === 'payment') {
              detailsMatch = (
                (entry.entry_details.status && entry.entry_details.status.toLowerCase().includes(searchTerm)) ||
                (entry.entry_details.payment_method && entry.entry_details.payment_method.toLowerCase().includes(searchTerm)) ||
                (entry.entry_details.description && entry.entry_details.description.toLowerCase().includes(searchTerm))
              );
            } else if (entry.entry_type === 'change') {
              detailsMatch = (
                (entry.entry_details.field_name && entry.entry_details.field_name.toLowerCase().includes(searchTerm)) ||
                (entry.entry_details.new_value && entry.entry_details.new_value.toLowerCase().includes(searchTerm)) ||
                (entry.entry_details.old_value && entry.entry_details.old_value.toLowerCase().includes(searchTerm)) ||
                (entry.entry_details.change_reason && entry.entry_details.change_reason.toLowerCase().includes(searchTerm))
              );
            }
          }
          
          return titleMatch || detailsMatch;
        });
      }
      
      return { data: filteredData, error: null };
    } catch (err) {
      console.error("Exception in getLoanTimeline:", err);
      return { data: [], error: err };
    }
  },
  
  /**
   * Record a manual loan attribute change
   * @param loanId The loan ID
   * @param fieldName The field that changed
   * @param oldValue The previous value
   * @param newValue The new value
   * @param reason Optional reason for the change
   * @returns Success status
   */
  recordManualChange: async (
    loanId: string,
    fieldName: string,
    oldValue: string,
    newValue: string,
    reason?: string
  ) => {
    try {
      if (!loanId || !fieldName) {
        return { success: false, error: new Error('Loan ID and field name are required') };
      }
      
      // Call the record_loan_change RPC function
      const { data, error } = await supabaseClient
        .rpc('record_loan_change', {
          p_loan_id: loanId,
          p_field_name: fieldName,
          p_old_value: oldValue,
          p_new_value: newValue,
          p_change_type: 'manual',
          p_change_source: 'user',
          p_changed_by: (await supabaseClient.auth.getUser()).data?.user?.id,
          p_change_reason: reason || 'Manual change by user'
        });
      
      if (error) {
        console.error("Error recording loan change:", error);
        return { success: false, error };
      }
      
      return { success: true, data, error: null };
    } catch (err) {
      console.error("Exception in recordManualChange:", err);
      return { success: false, error: err };
    }
  },
  
  /**
   * Get payment transaction details
   * @param transactionId The payment transaction ID
   * @returns The payment transaction details
   */
  getPaymentTransaction: async (transactionId: string) => {
    try {
      if (!transactionId) {
        return { data: null, error: new Error('Transaction ID is required') };
      }
      
      const { data, error } = await supabaseClient
        .from('payment_transactions')
        .select(`
          *,
          user:created_by (
            id,
            full_name,
            avatar_url
          )
        `)
        .eq('id', transactionId)
        .single();
      
      if (error) {
        console.error("Error fetching payment transaction:", error);
        return { data: null, error };
      }
      
      // Enhance with user information
      const enhancedData = {
        ...data,
        user_name: data.user?.full_name || 'System',
        user_avatar: data.user?.avatar_url
      };
      
      return { data: enhancedData, error: null };
    } catch (err) {
      console.error("Exception in getPaymentTransaction:", err);
      return { data: null, error: err };
    }
  },
  
  /**
   * Get loan change details
   * @param changeId The loan change ID
   * @returns The loan change details
   */
  getLoanChange: async (changeId: string) => {
    try {
      if (!changeId) {
        return { data: null, error: new Error('Change ID is required') };
      }
      
      const { data, error } = await supabaseClient
        .from('loan_change_history')
        .select(`
          *,
          user:changed_by (
            id,
            full_name,
            avatar_url
          )
        `)
        .eq('id', changeId)
        .single();
      
      if (error) {
        console.error("Error fetching loan change:", error);
        return { data: null, error };
      }
      
      // Enhance with user information
      const enhancedData = {
        ...data,
        user_name: data.user?.full_name || 'System',
        user_avatar: data.user?.avatar_url
      };
      
      return { data: enhancedData, error: null };
    } catch (err) {
      console.error("Exception in getLoanChange:", err);
      return { data: null, error: err };
    }
  },
  
  /**
   * Generate summary statistics for a loan's history
   * @param loanId The loan ID
   * @param period Optional time period ('1m', '3m', '6m', '1y', 'all')
   * @returns Summary statistics for the loan history
   */
  getHistorySummary: async (loanId: string, period: '1m' | '3m' | '6m' | '1y' | 'all' = '6m') => {
    try {
      if (!loanId) {
        return { data: null, error: new Error('Loan ID is required') };
      }
      
      // Calculate date range based on period
      let startDate: Date | null = null;
      const now = new Date();
      
      if (period === '1m') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      } else if (period === '3m') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      } else if (period === '6m') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      } else if (period === '1y') {
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      }
      
      // Get timeline data
      const { data, error } = await loanHistoryService.getLoanTimeline(
        loanId,
        {
          startDate: startDate ? startDate.toISOString() : undefined,
          includePayments: true,
          includeChanges: true
        },
        { limit: 1000 } // Get a large number for stats calculation
      );
      
      if (error) {
        return { data: null, error };
      }
      
      // Calculate summary statistics
      const summary = {
        totalEvents: data.length,
        paymentEvents: data.filter(entry => entry.entry_type === 'payment').length,
        changeEvents: data.filter(entry => entry.entry_type === 'change').length,
        lastUpdated: data.length > 0 ? new Date(data[0].entry_date) : null,
        paymentStats: {
          totalPayments: 0,
          onTimePayments: 0,
          latePayments: 0,
          totalAmount: 0
        },
        changeStats: {
          fieldChanges: new Map<string, number>()
        }
      };
      
      // Analyze payment data
      data.filter(entry => entry.entry_type === 'payment').forEach(entry => {
        summary.paymentStats.totalPayments++;
        
        if (entry.entry_details) {
          // Add payment amount
          if (typeof entry.entry_details.amount === 'number') {
            summary.paymentStats.totalAmount += entry.entry_details.amount;
          }
          
          // Count late vs on-time payments
          if (
            entry.entry_details.days_late && 
            typeof entry.entry_details.days_late === 'number' && 
            entry.entry_details.days_late > 0
          ) {
            summary.paymentStats.latePayments++;
          } else {
            summary.paymentStats.onTimePayments++;
          }
        }
      });
      
      // Analyze change data
      data.filter(entry => entry.entry_type === 'change').forEach(entry => {
        if (entry.entry_details && entry.entry_details.field_name) {
          const fieldName = entry.entry_details.field_name;
          const currentCount = summary.changeStats.fieldChanges.get(fieldName) || 0;
          summary.changeStats.fieldChanges.set(fieldName, currentCount + 1);
        }
      });
      
      // Convert field changes map to object for easier JSON serialization
      const fieldChangesObject: Record<string, number> = {};
      summary.changeStats.fieldChanges.forEach((count, field) => {
        fieldChangesObject[field] = count;
      });
      
      const finalSummary = {
        ...summary,
        changeStats: {
          ...summary.changeStats,
          fieldChanges: fieldChangesObject
        }
      };
      
      return { data: finalSummary, error: null };
    } catch (err) {
      console.error("Exception in getHistorySummary:", err);
      return { data: null, error: err };
    }
  }
};

export default loanHistoryService;