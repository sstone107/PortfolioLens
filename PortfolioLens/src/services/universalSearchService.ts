import { supabaseClient } from "../utility/supabaseClient";

export interface SearchResult {
  id: string;
  loan_number: string;
  investor_loan_number?: string;
  servicer_loan_number?: string;
  borrower_name?: string;
  co_borrower_name?: string;
  property_address?: string;
  property_city?: string;
  property_state?: string;
  property_zipcode?: string;
  current_upb?: number;
  loan_status?: string;
  servicer_name?: string;
  investor_name?: string;
  portfolio_name?: string;
  relevance_score: number;
  total_count: number;
  display_text?: string;
}

export interface SearchFilter {
  status?: string;
  portfolio_id?: string;
  date_from?: string;
  date_to?: string;
  [key: string]: any;
}

export interface SearchOptions {
  page?: number;
  pageSize?: number;
  saveHistory?: boolean;
}

export interface SearchHistoryItem {
  id: string;
  user_id: string;
  search_term: string;
  filters?: SearchFilter;
  result_count: number;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Service for handling universal loan search operations
 */
export const universalSearchService = {
  /**
   * Perform a universal search across loan data
   * @param searchTerm Text to search for
   * @param filters Optional filters to apply
   * @param options Optional search options
   * @returns Search results with pagination info
   */
  search: async (
    searchTerm: string,
    filters?: SearchFilter,
    options?: SearchOptions
  ) => {
    try {
      const defaultOptions = {
        page: 1,
        pageSize: 10,
        saveHistory: true
      };
      
      const mergedOptions = { ...defaultOptions, ...options };
      const { page, pageSize, saveHistory } = mergedOptions;
      
      if (!searchTerm.trim()) {
        return { data: [], totalCount: 0, page, pageSize, error: null };
      }
      
      // Call the universal_search RPC function
      const { data, error } = await supabaseClient
        .rpc('universal_search', {
          search_term: searchTerm.trim(),
          filters: filters ? JSON.stringify(filters) : null,
          page_number: page,
          page_size: pageSize
        });
      
      if (error) {
        console.error("Error in universal search:", error);
        return { 
          data: [], 
          totalCount: 0, 
          page, 
          pageSize, 
          error 
        };
      }
      
      // Process search results
      let totalCount = 0;
      const processedResults = data.map((result: any) => {
        // Get total count from the first record (all records have the same value)
        if (totalCount === 0 && result.total_count) {
          totalCount = parseInt(result.total_count, 10);
        }
        
        // Create a display_text field for easy rendering
        const displayText = `${result.loan_number || ''} - ${result.borrower_name || 'Unknown'}${
          result.property_address ? ` (${result.property_address})` : 
          result.servicer_name ? ` (${result.servicer_name})` : ''
        }`;
        
        return {
          ...result,
          display_text: displayText
        };
      });
      
      // If option is enabled, save to search history
      if (saveHistory && data.length > 0) {
        const userId = supabaseClient.auth.getUser().then(({ data }) => data?.user?.id);
        if (userId) {
          await universalSearchService.saveSearchHistory(
            searchTerm,
            filters,
            totalCount
          ).catch(err => console.error("Error saving search history:", err));
        }
      }
      
      return { 
        data: processedResults, 
        totalCount, 
        page, 
        pageSize,
        error: null 
      };
    } catch (err) {
      console.error("Exception in universal search:", err);
      return { 
        data: [], 
        totalCount: 0, 
        page: options?.page || 1, 
        pageSize: options?.pageSize || 10, 
        error: err 
      };
    }
  },
  
  /**
   * Save a search to the user's search history
   * @param searchTerm The search term
   * @param filters Any filters that were applied
   * @param resultCount Number of results found
   * @returns The ID of the created/updated search history entry
   */
  saveSearchHistory: async (
    searchTerm: string,
    filters?: SearchFilter,
    resultCount: number = 0
  ) => {
    try {
      // Get current user
      const { data: authData } = await supabaseClient.auth.getUser();
      const userId = authData?.user?.id;
      
      if (!userId) {
        throw new Error("User not authenticated");
      }
      
      // Call the record_search_history function
      const { data, error } = await supabaseClient
        .rpc('record_search_history', {
          p_user_id: userId,
          p_search_term: searchTerm,
          p_filters: filters ? JSON.stringify(filters) : null,
          p_result_count: resultCount
        });
      
      if (error) {
        console.error("Error saving search history:", error);
        throw error;
      }
      
      return { id: data, error: null };
    } catch (err) {
      console.error("Exception in saveSearchHistory:", err);
      return { id: null, error: err };
    }
  },
  
  /**
   * Get a user's search history
   * @param limit Maximum number of history items to return
   * @returns List of search history items
   */
  getSearchHistory: async (limit: number = 10) => {
    try {
      const { data, error } = await supabaseClient
        .from('search_history')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error("Error fetching search history:", error);
        return { data: [], error };
      }
      
      return { data, error: null };
    } catch (err) {
      console.error("Exception in getSearchHistory:", err);
      return { data: [], error: err };
    }
  },
  
  /**
   * Toggle favorite status for a search history item
   * @param id The search history item ID
   * @param isFavorite Whether to mark as favorite
   * @returns Success status
   */
  toggleFavorite: async (id: string, isFavorite: boolean) => {
    try {
      const { error } = await supabaseClient
        .from('search_history')
        .update({ is_favorite: isFavorite })
        .eq('id', id);
      
      if (error) {
        console.error("Error toggling favorite status:", error);
        return { success: false, error };
      }
      
      return { success: true, error: null };
    } catch (err) {
      console.error("Exception in toggleFavorite:", err);
      return { success: false, error: err };
    }
  },
  
  /**
   * Get a user's favorite searches
   * @param limit Maximum number of favorites to return
   * @returns List of favorite search items
   */
  getFavorites: async (limit: number = 10) => {
    try {
      const { data, error } = await supabaseClient
        .from('search_history')
        .select('*')
        .eq('is_favorite', true)
        .order('updated_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error("Error fetching favorite searches:", error);
        return { data: [], error };
      }
      
      return { data, error: null };
    } catch (err) {
      console.error("Exception in getFavorites:", err);
      return { data: [], error: err };
    }
  },
  
  /**
   * Delete a search history item
   * @param id The search history item ID
   * @returns Success status
   */
  deleteSearchHistory: async (id: string) => {
    try {
      const { error } = await supabaseClient
        .from('search_history')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error("Error deleting search history:", error);
        return { success: false, error };
      }
      
      return { success: true, error: null };
    } catch (err) {
      console.error("Exception in deleteSearchHistory:", err);
      return { success: false, error: err };
    }
  },
  
  /**
   * Clear all search history for the current user
   * @returns Success status
   */
  clearSearchHistory: async () => {
    try {
      const { error } = await supabaseClient
        .from('search_history')
        .delete()
        .not('is_favorite', 'eq', true); // Preserve favorites
      
      if (error) {
        console.error("Error clearing search history:", error);
        return { success: false, error };
      }
      
      return { success: true, error: null };
    } catch (err) {
      console.error("Exception in clearSearchHistory:", err);
      return { success: false, error: err };
    }
  }
};

export default universalSearchService;