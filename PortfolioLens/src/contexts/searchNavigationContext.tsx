import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SearchResult } from '../services/universalSearchService';

interface SearchNavigationContextProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;
  currentResult: SearchResult | null;
  setCurrentResult: (result: SearchResult | null) => void;
  previousPath: string;
  setPreviousPath: (path: string) => void;
  returnToSearch: () => void;
  highlightedTerms: string[];
  setHighlightedTerms: (terms: string[]) => void;
}

const SearchNavigationContext = createContext<SearchNavigationContextProps>({
  searchTerm: '',
  setSearchTerm: () => {},
  searchResults: [],
  setSearchResults: () => {},
  currentResult: null,
  setCurrentResult: () => {},
  previousPath: '',
  setPreviousPath: () => {},
  returnToSearch: () => {},
  highlightedTerms: [],
  setHighlightedTerms: () => {}
});

export const useSearchNavigation = () => useContext(SearchNavigationContext);

export const SearchNavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentResult, setCurrentResult] = useState<SearchResult | null>(null);
  const [previousPath, setPreviousPath] = useState<string>('');
  const [highlightedTerms, setHighlightedTerms] = useState<string[]>([]);
  
  const location = useLocation();
  const navigate = useNavigate();
  
  // Synchronize state from location on navigation
  useEffect(() => {
    if (location.state) {
      if (location.state.searchTerm) {
        setSearchTerm(location.state.searchTerm);
        // Extract terms to highlight
        if (location.state.searchTerm) {
          // Split search term into words for highlighting
          const terms = location.state.searchTerm
            .toLowerCase()
            .split(/\s+/)
            .filter((term: string) => term.length > 2);
          setHighlightedTerms(terms);
        }
      }
      
      if (location.state.previousPath) {
        setPreviousPath(location.state.previousPath);
      }
      
      if (location.state.currentResult) {
        setCurrentResult(location.state.currentResult);
      }
    }
  }, [location]);
  
  // Function to return to previous search results page
  const returnToSearch = () => {
    if (previousPath) {
      navigate(previousPath, {
        state: {
          searchTerm,
          preserveResults: true
        }
      });
    } else {
      // Default fallback if no previous path is stored
      navigate('/loans/search', {
        state: {
          searchTerm
        }
      });
    }
  };
  
  return (
    <SearchNavigationContext.Provider
      value={{
        searchTerm,
        setSearchTerm,
        searchResults,
        setSearchResults,
        currentResult,
        setCurrentResult,
        previousPath,
        setPreviousPath,
        returnToSearch,
        highlightedTerms,
        setHighlightedTerms
      }}
    >
      {children}
    </SearchNavigationContext.Provider>
  );
};

// Helper for highlighting text based on search terms
export const highlightText = (text: string, terms: string[]): React.ReactNode => {
  if (!text || !terms || terms.length === 0) return text;
  
  let result = text;
  
  // Create a regex to match all terms
  const regex = new RegExp(`(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  
  // Split text by matches
  const parts = result.split(regex);
  
  // Return highlighted JSX
  return (
    <>
      {parts.map((part, i) => {
        // Check if this part matches any of the terms
        const isMatch = terms.some(term => 
          part.toLowerCase().includes(term.toLowerCase())
        );
        
        return isMatch ? (
          <mark key={i} style={{ backgroundColor: 'yellow', padding: 0 }}>{part}</mark>
        ) : (
          part
        );
      })}
    </>
  );
};

export default SearchNavigationContext;