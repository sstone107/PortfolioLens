import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  LoanSearchFilter, 
  LoanFilterCriteria, 
  LoanSearchResult,
  LoanSearchOptions,
  LoanSearchService 
} from '../services/loanSearchService';
import { useGetIdentity } from '@refinedev/core';

interface LoanSearchContextType {
  // Current active filter
  currentFilter: LoanFilterCriteria;
  setCurrentFilter: (filter: LoanFilterCriteria) => void;
  
  // Saved filters
  savedFilters: LoanSearchFilter[];
  savingFilter: boolean;
  saveCurrentFilter: (name: string, isFavorite?: boolean) => Promise<string>;
  getSavedFilters: () => Promise<void>;
  deleteFilter: (id: string) => Promise<void>;
  toggleFavorite: (id: string, isFavorite: boolean) => Promise<void>;
  applyFilter: (filter: LoanSearchFilter) => void;
  
  // Search results
  searchResults: LoanSearchResult | null;
  searching: boolean;
  searchLoans: (options?: LoanSearchOptions) => Promise<void>;
  
  // Search options
  searchOptions: LoanSearchOptions;
  setSearchOptions: (options: LoanSearchOptions) => void;
  
  // Misc
  error: string | null;
  clearError: () => void;
}

const defaultSearchOptions: LoanSearchOptions = {
  page: 1,
  pageSize: 20,
  sortBy: 'loan_number',
  sortOrder: 'asc'
};

const LoanSearchContext = createContext<LoanSearchContextType | undefined>(undefined);

export const LoanSearchProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: user } = useGetIdentity();
  const loanSearchService = new LoanSearchService();
  
  // State
  const [currentFilter, setCurrentFilter] = useState<LoanFilterCriteria>({});
  const [savedFilters, setSavedFilters] = useState<LoanSearchFilter[]>([]);
  const [searchResults, setSearchResults] = useState<LoanSearchResult | null>(null);
  const [searchOptions, setSearchOptions] = useState<LoanSearchOptions>(defaultSearchOptions);
  const [error, setError] = useState<string | null>(null);
  
  // Loading states
  const [searching, setSearching] = useState(false);
  const [savingFilter, setSavingFilter] = useState(false);
  
  // Load saved filters when the user changes
  useEffect(() => {
    if (user?.id) {
      getSavedFilters();
    }
  }, [user]);
  
  // Search for loans with the current filter
  const searchLoans = async (options?: LoanSearchOptions) => {
    try {
      setSearching(true);
      setError(null);
      
      // Merge provided options with current options
      const mergedOptions = { ...searchOptions, ...options };
      setSearchOptions(mergedOptions);
      
      // Execute the search
      const results = await loanSearchService.searchLoans(currentFilter, mergedOptions);
      setSearchResults(results);
    } catch (err: any) {
      setError(err.message || 'An error occurred while searching');
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };
  
  // Save the current filter
  const saveCurrentFilter = async (name: string, isFavorite = false): Promise<string> => {
    try {
      setSavingFilter(true);
      setError(null);
      
      if (!user?.id) {
        throw new Error('You must be logged in to save filters');
      }
      
      const filterToSave: LoanSearchFilter = {
        name,
        userId: user.id.toString(),
        filterCriteria: currentFilter,
        isFavorite
      };
      
      const filterId = await loanSearchService.saveFilter(filterToSave);
      await getSavedFilters(); // Refresh the list of saved filters
      return filterId;
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving the filter');
      console.error('Save filter error:', err);
      throw err;
    } finally {
      setSavingFilter(false);
    }
  };
  
  // Get all saved filters for the current user
  const getSavedFilters = async () => {
    try {
      if (!user?.id) return;
      
      const filters = await loanSearchService.getSavedFilters(user.id.toString());
      setSavedFilters(filters);
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading saved filters');
      console.error('Get filters error:', err);
    }
  };
  
  // Delete a saved filter
  const deleteFilter = async (id: string) => {
    try {
      setError(null);
      await loanSearchService.deleteFilter(id);
      setSavedFilters(prev => prev.filter(f => f.id !== id));
    } catch (err: any) {
      setError(err.message || 'An error occurred while deleting the filter');
      console.error('Delete filter error:', err);
    }
  };
  
  // Toggle favorite status of a filter
  const toggleFavorite = async (id: string, isFavorite: boolean) => {
    try {
      setError(null);
      await loanSearchService.toggleFavorite(id, isFavorite);
      
      // Update local state
      setSavedFilters(prev => 
        prev.map(f => f.id === id ? { ...f, isFavorite } : f)
      );
    } catch (err: any) {
      setError(err.message || 'An error occurred while updating favorite status');
      console.error('Toggle favorite error:', err);
    }
  };
  
  // Apply a saved filter
  const applyFilter = async (filter: LoanSearchFilter) => {
    setCurrentFilter(filter.filterCriteria);
    
    // Update last used timestamp if the filter has an ID
    if (filter.id) {
      try {
        await loanSearchService.updateLastUsed(filter.id);
        
        // Update local state
        setSavedFilters(prev => 
          prev.map(f => f.id === filter.id ? { ...f, lastUsed: new Date() } : f)
        );
      } catch (err) {
        console.error('Error updating last used timestamp:', err);
      }
    }
    
    // Immediately search with the applied filter
    await searchLoans({ page: 1 }); // Reset to first page
  };
  
  // Clear any error
  const clearError = () => setError(null);
  
  const value: LoanSearchContextType = {
    currentFilter,
    setCurrentFilter,
    savedFilters,
    savingFilter,
    saveCurrentFilter,
    getSavedFilters,
    deleteFilter,
    toggleFavorite,
    applyFilter,
    searchResults,
    searching,
    searchLoans,
    searchOptions,
    setSearchOptions,
    error,
    clearError
  };
  
  return (
    <LoanSearchContext.Provider value={value}>
      {children}
    </LoanSearchContext.Provider>
  );
};

export const useLoanSearch = (): LoanSearchContextType => {
  const context = useContext(LoanSearchContext);
  
  if (context === undefined) {
    throw new Error('useLoanSearch must be used within a LoanSearchProvider');
  }
  
  return context;
};