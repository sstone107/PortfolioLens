import { supabaseClient } from "../utility/supabaseClient";
import { PostgrestFilterBuilder } from "@supabase/postgrest-js";

// Define filter types
export interface LoanSearchFilter {
  id?: string;
  name?: string;
  userId?: string;
  filterCriteria: LoanFilterCriteria;
  isFavorite?: boolean;
  lastUsed?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface DynamicFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'between';
  value: string;
  value2?: string; // For between operator
  id: string;
}

export interface LoanFilterCriteria {
  // loan_information table fields
  interest_rate?: RangeFilter<number>;
  upb?: RangeFilter<number>;
  origination_date?: RangeFilter<Date>;
  loan_term?: RangeFilter<number>;
  ltv?: RangeFilter<number>;
  dti?: RangeFilter<number>;
  credit_score?: RangeFilter<number>;
  current_escrow_balance?: RangeFilter<number>;
  next_due_date?: RangeFilter<Date>;
  payoff_request_date?: RangeFilter<Date>;
  mers_id?: string;
  
  // property/address fields
  property_address?: string;
  property_city?: string;
  property_state?: string;
  property_zipcode?: string;
  
  // borrower fields
  loan_id?: string;
  borrower_name?: string;
  borrower_email?: string;
  borrower_phone?: string;
  status?: string | string[];
  
  // portfolio related
  portfolio_id?: string | string[];
  
  // Dynamic custom filters
  dynamicFilters?: DynamicFilter[];
  
  // Logic settings
  operator?: 'AND' | 'OR';
}

export interface RangeFilter<T> {
  min?: T;
  max?: T;
  exact?: T;
}

export interface LoanSearchResult {
  loans: any[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface LoanSearchOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Service for handling advanced loan searching and filtering
 */
export class LoanSearchService {
  
  /**
   * Search for loans using the provided filter criteria
   */
  async searchLoans(
    filters: LoanFilterCriteria, 
    options: LoanSearchOptions = {}
  ): Promise<LoanSearchResult> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'loan_id',
      sortOrder = 'asc'
    } = options;
    
    // Start with a query against the loan_portfolio_view
    let query = supabaseClient
      .from('loan_portfolio_view')
      .select('*', { count: 'exact' });
    
    // Apply filters using the helper method
    query = this.applyFilters(query, filters);
    
    // Add pagination and sorting
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(from, to);
    
    const { data, error, count } = await query;
    
    if (error) {
      throw error;
    }
    
    return {
      loans: data || [],
      totalCount: count || 0,
      page,
      pageSize
    };
  }
  
  /**
   * Helper method to apply all filters to the query builder
   */
  /**
   * Get available fields for dynamic filtering
   */
  getAvailableFields(): { [key: string]: { label: string; type: 'string' | 'number' | 'date' | 'boolean' } } {
    return {
      // Basic loan fields
      'loan_number': { label: 'Loan Number', type: 'string' },
      'investor_loan_number': { label: 'Investor Loan Number', type: 'string' },
      'mers_id': { label: 'MERS ID', type: 'string' },
      'loan_type': { label: 'Loan Type', type: 'string' },
      'loan_purpose': { label: 'Loan Purpose', type: 'string' },
      'loan_term': { label: 'Loan Term', type: 'number' },
      'loan_status': { label: 'Loan Status', type: 'string' },
      
      // Financial fields
      'original_upb': { label: 'Original UPB', type: 'number' },
      'current_upb': { label: 'Current UPB', type: 'number' },
      'original_interest_rate': { label: 'Original Interest Rate', type: 'number' },
      'current_interest_rate': { label: 'Current Interest Rate', type: 'number' },
      'original_ltv': { label: 'Original LTV', type: 'number' },
      'original_cltv': { label: 'Original CLTV', type: 'number' },
      'current_escrow_balance': { label: 'Current Escrow Balance', type: 'number' },
      
      // Borrower fields
      'borrower_credit_score': { label: 'Borrower Credit Score', type: 'number' },
      'borrower_originating_fico': { label: 'Originating FICO', type: 'number' },
      'original_front_end_dti': { label: 'Original Front-end DTI', type: 'number' },
      'original_back_end_dti': { label: 'Original Back-end DTI', type: 'number' },
      
      // Date fields
      'origination_date': { label: 'Origination Date', type: 'date' },
      'first_payment_date': { label: 'First Payment Date', type: 'date' },
      'maturity_date': { label: 'Maturity Date', type: 'date' },
      'next_due_date': { label: 'Next Due Date', type: 'date' },
      'last_payment_date': { label: 'Last Payment Date', type: 'date' },
      'payoff_request_date': { label: 'Payoff Request Date', type: 'date' },
      
      // Property fields
      'property_type': { label: 'Property Type', type: 'string' },
      'property_state': { label: 'Property State', type: 'string' },
      'property_zipcode': { label: 'Property ZIP', type: 'string' },
      'property_occupancy': { label: 'Property Occupancy', type: 'string' },
      'property_value': { label: 'Property Value', type: 'number' },
      
      // Servicing fields
      'servicer_name': { label: 'Servicer Name', type: 'string' },
      'days_delinquent': { label: 'Days Delinquent', type: 'number' },
      'delinquency_status': { label: 'Delinquency Status', type: 'string' },
      'modification_flag': { label: 'Has Modification', type: 'boolean' },
      'forbearance_flag': { label: 'In Forbearance', type: 'boolean' },
      'foreclosure_flag': { label: 'In Foreclosure', type: 'boolean' },
      'bankruptcy_flag': { label: 'In Bankruptcy', type: 'boolean' },
      
      // Additional fields
      'note_rate': { label: 'Note Rate', type: 'number' },
      'channel': { label: 'Origination Channel', type: 'string' },
      'prepayment_penalty_flag': { label: 'Has Prepayment Penalty', type: 'boolean' },
      'estimated_remaining_term': { label: 'Estimated Remaining Term', type: 'number' },
      'principal_forgiveness_amount': { label: 'Principal Forgiveness', type: 'number' },
      'annual_property_taxes': { label: 'Annual Property Taxes', type: 'number' },
      'annual_hazard_insurance': { label: 'Annual Hazard Insurance', type: 'number' },
      'current_payment_amount': { label: 'Current Payment Amount', type: 'number' },
    };
  }

  private applyDynamicFilters<T>(
    query: PostgrestFilterBuilder<T>,
    dynamicFilters: DynamicFilter[],
    operator: 'AND' | 'OR' = 'AND'
  ): PostgrestFilterBuilder<T> {
    if (!dynamicFilters || dynamicFilters.length === 0) {
      return query;
    }

    // Apply each dynamic filter
    dynamicFilters.forEach(filter => {
      if (!filter.field || !filter.operator || filter.value === undefined || filter.value === '') {
        return; // Skip invalid filters
      }

      const fieldInfo = this.getAvailableFields()[filter.field];
      if (!fieldInfo) return; // Skip unknown fields

      // Format value based on field type
      let processedValue = filter.value;
      if (fieldInfo.type === 'number') {
        processedValue = Number(filter.value) || 0;
      } else if (fieldInfo.type === 'boolean') {
        processedValue = filter.value.toLowerCase() === 'true';
      } else if (fieldInfo.type === 'date' && filter.value) {
        // Date values come in as ISO strings
        try {
          // Ensure consistent date format for Postgres
          const date = new Date(filter.value);
          if (!isNaN(date.getTime())) {
            processedValue = date.toISOString().split('T')[0];
          }
        } catch (e) {
          console.warn(`Invalid date format for field ${filter.field}:`, e);
          return; // Skip this filter on error
        }
      }

      // Apply the filter based on operator
      switch (filter.operator) {
        case 'eq':
          query = query.eq(filter.field, processedValue);
          break;
        case 'neq':
          query = query.neq(filter.field, processedValue);
          break;
        case 'gt':
          query = query.gt(filter.field, processedValue);
          break;
        case 'gte':
          query = query.gte(filter.field, processedValue);
          break;
        case 'lt':
          query = query.lt(filter.field, processedValue);
          break;
        case 'lte':
          query = query.lte(filter.field, processedValue);
          break;
        case 'like':
          query = query.like(filter.field, `%${processedValue}%`);
          break;
        case 'ilike':
          query = query.ilike(filter.field, `%${processedValue}%`);
          break;
        case 'in':
          // Handle array values for 'in' operator
          const values = String(processedValue).split(',').map(v => v.trim());
          query = query.in(filter.field, values);
          break;
        case 'between':
          // Handle between operator by applying gte and lte
          if (filter.value && filter.value2) {
            let fromValue = processedValue;
            let toValue = filter.value2;
            
            // Format the second value for date and number types
            if (fieldInfo.type === 'number') {
              toValue = Number(filter.value2) || 0;
            } else if (fieldInfo.type === 'date' && filter.value2) {
              try {
                const date = new Date(filter.value2);
                if (!isNaN(date.getTime())) {
                  toValue = date.toISOString().split('T')[0];
                }
              } catch (e) {
                console.warn(`Invalid date format for filter.value2 in field ${filter.field}:`, e);
              }
            }
            
            // Apply both conditions for between
            query = query.gte(filter.field, fromValue).lte(filter.field, toValue);
          } else if (filter.value) {
            // If only one value is provided, treat as gte
            query = query.gte(filter.field, processedValue);
          } else if (filter.value2) {
            // If only second value is provided, treat as lte
            let toValue = filter.value2;
            if (fieldInfo.type === 'number') {
              toValue = Number(filter.value2) || 0;
            } else if (fieldInfo.type === 'date' && filter.value2) {
              try {
                const date = new Date(filter.value2);
                if (!isNaN(date.getTime())) {
                  toValue = date.toISOString().split('T')[0];
                }
              } catch (e) {
                console.warn(`Invalid date format for filter.value2 in field ${filter.field}:`, e);
              }
            }
            query = query.lte(filter.field, toValue);
          }
          break;
      }
    });

    // Apply dynamic custom filters if present
    if (filters.dynamicFilters && filters.dynamicFilters.length > 0) {
      query = this.applyDynamicFilters(query, filters.dynamicFilters, filters.operator);
    }
    
    return query;
  }

  private applyFilters<T>(
    query: PostgrestFilterBuilder<T>, 
    filters: LoanFilterCriteria
  ): PostgrestFilterBuilder<T> {
    const { operator = 'AND' } = filters;
    
    // Apply loan_information table filters
    if (filters.interest_rate) {
      if (filters.interest_rate.exact !== undefined) {
        query = query.eq('current_interest_rate', filters.interest_rate.exact);
      } else {
        if (filters.interest_rate.min !== undefined) {
          query = query.gte('current_interest_rate', filters.interest_rate.min);
        }
        if (filters.interest_rate.max !== undefined) {
          query = query.lte('current_interest_rate', filters.interest_rate.max);
        }
      }
    }
    
    if (filters.upb) {
      if (filters.upb.exact !== undefined) {
        query = query.eq('current_upb', filters.upb.exact);
      } else {
        if (filters.upb.min !== undefined) {
          query = query.gte('current_upb', filters.upb.min);
        }
        if (filters.upb.max !== undefined) {
          query = query.lte('current_upb', filters.upb.max);
        }
      }
    }
    
    // Origination date filter is now handled in the date filters section below
    
    if (filters.loan_term) {
      if (filters.loan_term.exact !== undefined) {
        query = query.eq('loan_term', filters.loan_term.exact);
      } else {
        if (filters.loan_term.min !== undefined) {
          query = query.gte('loan_term', filters.loan_term.min);
        }
        if (filters.loan_term.max !== undefined) {
          query = query.lte('loan_term', filters.loan_term.max);
        }
      }
    }
    
    if (filters.ltv) {
      if (filters.ltv.exact !== undefined) {
        query = query.eq('original_ltv', filters.ltv.exact);
      } else {
        if (filters.ltv.min !== undefined) {
          query = query.gte('original_ltv', filters.ltv.min);
        }
        if (filters.ltv.max !== undefined) {
          query = query.lte('original_ltv', filters.ltv.max);
        }
      }
    }
    
    if (filters.dti) {
      if (filters.dti.exact !== undefined) {
        query = query.eq('original_back_end_dti', filters.dti.exact);
      } else {
        if (filters.dti.min !== undefined) {
          query = query.gte('original_back_end_dti', filters.dti.min);
        }
        if (filters.dti.max !== undefined) {
          query = query.lte('original_back_end_dti', filters.dti.max);
        }
      }
    }
    
    if (filters.credit_score) {
      if (filters.credit_score.exact !== undefined) {
        query = query.eq('borrower_originating_fico', filters.credit_score.exact);
      } else {
        if (filters.credit_score.min !== undefined) {
          query = query.gte('borrower_originating_fico', filters.credit_score.min);
        }
        if (filters.credit_score.max !== undefined) {
          query = query.lte('borrower_originating_fico', filters.credit_score.max);
        }
      }
    }
    
    // Current escrow balance filter
    if (filters.current_escrow_balance) {
      if (filters.current_escrow_balance.exact !== undefined) {
        query = query.eq('current_escrow_balance', filters.current_escrow_balance.exact);
      } else {
        if (filters.current_escrow_balance.min !== undefined) {
          query = query.gte('current_escrow_balance', filters.current_escrow_balance.min);
        }
        if (filters.current_escrow_balance.max !== undefined) {
          query = query.lte('current_escrow_balance', filters.current_escrow_balance.max);
        }
      }
    }
    
    // Date filters
    if (filters.next_due_date) {
      if (filters.next_due_date.exact !== undefined) {
        const dateStr = filters.next_due_date.exact instanceof Date 
          ? filters.next_due_date.exact.toISOString().split('T')[0] 
          : filters.next_due_date.exact;
        query = query.eq('next_due_date', dateStr);
      } else {
        if (filters.next_due_date.min !== undefined) {
          const dateStr = filters.next_due_date.min instanceof Date 
            ? filters.next_due_date.min.toISOString().split('T')[0] 
            : filters.next_due_date.min;
          query = query.gte('next_due_date', dateStr);
        }
        if (filters.next_due_date.max !== undefined) {
          const dateStr = filters.next_due_date.max instanceof Date 
            ? filters.next_due_date.max.toISOString().split('T')[0] 
            : filters.next_due_date.max;
          query = query.lte('next_due_date', dateStr);
        }
      }
    }
    
    if (filters.payoff_request_date) {
      if (filters.payoff_request_date.exact !== undefined) {
        const dateStr = filters.payoff_request_date.exact instanceof Date 
          ? filters.payoff_request_date.exact.toISOString().split('T')[0] 
          : filters.payoff_request_date.exact;
        query = query.eq('payoff_request_date', dateStr);
      } else {
        if (filters.payoff_request_date.min !== undefined) {
          const dateStr = filters.payoff_request_date.min instanceof Date 
            ? filters.payoff_request_date.min.toISOString().split('T')[0] 
            : filters.payoff_request_date.min;
          query = query.gte('payoff_request_date', dateStr);
        }
        if (filters.payoff_request_date.max !== undefined) {
          const dateStr = filters.payoff_request_date.max instanceof Date 
            ? filters.payoff_request_date.max.toISOString().split('T')[0] 
            : filters.payoff_request_date.max;
          query = query.lte('payoff_request_date', dateStr);
        }
      }
    }
    
    // Do the same for origination_date
    if (filters.origination_date) {
      if (filters.origination_date.exact !== undefined) {
        const dateStr = filters.origination_date.exact instanceof Date 
          ? filters.origination_date.exact.toISOString().split('T')[0] 
          : filters.origination_date.exact;
        query = query.eq('origination_date', dateStr);
      } else {
        if (filters.origination_date.min !== undefined) {
          const dateStr = filters.origination_date.min instanceof Date 
            ? filters.origination_date.min.toISOString().split('T')[0] 
            : filters.origination_date.min;
          query = query.gte('origination_date', dateStr);
        }
        if (filters.origination_date.max !== undefined) {
          const dateStr = filters.origination_date.max instanceof Date 
            ? filters.origination_date.max.toISOString().split('T')[0] 
            : filters.origination_date.max;
          query = query.lte('origination_date', dateStr);
        }
      }
    }
    
    // Property information filters
    if (filters.property_address) {
      query = query.ilike('property_address', `%${filters.property_address}%`);
    }
    
    if (filters.property_city) {
      query = query.ilike('property_city', `%${filters.property_city}%`);
    }
    
    if (filters.property_state) {
      query = query.ilike('property_state', `%${filters.property_state}%`);
    }
    
    if (filters.property_zipcode) {
      query = query.ilike('property_zipcode', `%${filters.property_zipcode}%`);
    }
    
    // MERS ID filter
    if (filters.mers_id) {
      query = query.ilike('mers_id', `%${filters.mers_id}%`);
    }
    
    // Apply loans table filters
    if (filters.loan_id) {
      query = query.ilike('loan_number', `%${filters.loan_id}%`);
    }
    
    if (filters.borrower_name) {
      // Check both primary borrower and co-borrower names
      if (operator === 'AND') {
        query = query.or(`borrower_first_name.ilike.%${filters.borrower_name}%,borrower_last_name.ilike.%${filters.borrower_name}%,co_borrower_first_name.ilike.%${filters.borrower_name}%,co_borrower_last_name.ilike.%${filters.borrower_name}%`);
      } else {
        query = query.or(`borrower_first_name.ilike.%${filters.borrower_name}%,borrower_last_name.ilike.%${filters.borrower_name}%,co_borrower_first_name.ilike.%${filters.borrower_name}%,co_borrower_last_name.ilike.%${filters.borrower_name}%`);
      }
    }
    
    if (filters.borrower_email) {
      if (operator === 'AND') {
        query = query.or(`borrower_email_address.ilike.%${filters.borrower_email}%,co_borrower_email_address.ilike.%${filters.borrower_email}%`);
      } else {
        query = query.or(`borrower_email_address.ilike.%${filters.borrower_email}%,co_borrower_email_address.ilike.%${filters.borrower_email}%`);
      }
    }
    
    if (filters.borrower_phone) {
      if (operator === 'AND') {
        query = query.or(`borrower_phone.ilike.%${filters.borrower_phone}%,co_borrower_phone.ilike.%${filters.borrower_phone}%`);
      } else {
        query = query.or(`borrower_phone.ilike.%${filters.borrower_phone}%,co_borrower_phone.ilike.%${filters.borrower_phone}%`);
      }
    }
    
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('loan_status', filters.status);
      } else {
        query = query.eq('loan_status', filters.status);
      }
    }
    
    // Apply portfolio-related filters
    if (filters.portfolio_id) {
      if (Array.isArray(filters.portfolio_id)) {
        query = query.in('portfolio_id', filters.portfolio_id);
      } else {
        query = query.eq('portfolio_id', filters.portfolio_id);
      }
    }
    
    // Apply dynamic custom filters if present
    if (filters.dynamicFilters && filters.dynamicFilters.length > 0) {
      query = this.applyDynamicFilters(query, filters.dynamicFilters, filters.operator);
    }
    
    return query;
  }
  
  /**
   * Save a filter for later use
   */
  async saveFilter(filter: LoanSearchFilter): Promise<string> {
    // Make sure to include userId
    if (!filter.userId) {
      throw new Error('User ID is required to save a filter');
    }
    
    // If this is an existing filter, update it
    if (filter.id) {
      const { error } = await supabaseClient
        .from('saved_filters')
        .update({
          name: filter.name,
          filter_criteria: filter.filterCriteria,
          is_favorite: filter.isFavorite,
          last_used: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', filter.id);
      
      if (error) {
        throw error;
      }
      
      return filter.id;
    }
    
    // Otherwise create a new filter
    const { data, error } = await supabaseClient
      .from('saved_filters')
      .insert({
        name: filter.name || 'Unnamed Filter',
        user_id: filter.userId,
        filter_criteria: filter.filterCriteria,
        is_favorite: filter.isFavorite || false,
        last_used: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();
    
    if (error) {
      throw error;
    }
    
    return data.id;
  }
  
  /**
   * Get all saved filters for a user
   */
  async getSavedFilters(userId: string): Promise<LoanSearchFilter[]> {
    const { data, error } = await supabaseClient
      .from('saved_filters')
      .select('*')
      .eq('user_id', userId)
      .order('last_used', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    // Transform database results into our interface format
    return (data || []).map(item => ({
      id: item.id,
      name: item.name,
      userId: item.user_id,
      filterCriteria: item.filter_criteria,
      isFavorite: item.is_favorite,
      lastUsed: new Date(item.last_used),
      created_at: new Date(item.created_at),
      updated_at: new Date(item.updated_at)
    }));
  }
  
  /**
   * Delete a saved filter
   */
  async deleteFilter(filterId: string): Promise<void> {
    const { error } = await supabaseClient
      .from('saved_filters')
      .delete()
      .eq('id', filterId);
    
    if (error) {
      throw error;
    }
  }
  
  /**
   * Toggle a filter's favorite status
   */
  async toggleFavorite(filterId: string, isFavorite: boolean): Promise<void> {
    const { error } = await supabaseClient
      .from('saved_filters')
      .update({
        is_favorite: isFavorite,
        updated_at: new Date().toISOString()
      })
      .eq('id', filterId);
    
    if (error) {
      throw error;
    }
  }
  
  /**
   * Update a filter's last used timestamp
   */
  async updateLastUsed(filterId: string): Promise<void> {
    const { error } = await supabaseClient
      .from('saved_filters')
      .update({
        last_used: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', filterId);
    
    if (error) {
      throw error;
    }
  }
}