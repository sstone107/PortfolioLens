/**
 * Search utilities for efficient field/column searching
 */

import Fuse from 'fuse.js';

/**
 * Type for database column objects
 */
export interface DatabaseColumn {
  name: string;
  type: string;
  [key: string]: any;
}

/**
 * Type for search result with score
 */
export interface SearchResult {
  item: DatabaseColumn;
  score: number;
  refIndex: number;
}

// Singleton Fuse.js instance
let fuseInstance: Fuse<DatabaseColumn> | null = null;

// Memoized columns used to create the index
let indexedColumns: DatabaseColumn[] = [];

/**
 * Debounced search function creator
 * Returns a function that will execute after waiting for a specified delay
 */
export const createDebouncedSearch = (delay = 150) => {
  let timerId: NodeJS.Timeout | null = null;
  
  return (searchFn: () => void) => {
    if (timerId) {
      clearTimeout(timerId);
    }
    
    timerId = setTimeout(() => {
      searchFn();
      timerId = null;
    }, delay);
  };
};

/**
 * Get or initialize the Fuse.js instance for database columns
 * @param columns Database columns to index
 * @param forceRefresh Force rebuilding the index even if columns haven't changed
 * @returns Fuse.js instance
 */
export const getFuseInstance = (
  columns: DatabaseColumn[],
  forceRefresh = false
): Fuse<DatabaseColumn> => {
  // Check if we need to initialize
  if (
    !fuseInstance ||
    forceRefresh ||
    indexedColumns.length !== columns.length ||
    JSON.stringify(indexedColumns.map(c => c.name)) !== JSON.stringify(columns.map(c => c.name))
  ) {
    // Store reference to indexed columns
    indexedColumns = [...columns];
    
    // Create a new Fuse instance with optimized settings
    fuseInstance = new Fuse(columns, {
      keys: ['name'],
      includeScore: true,
      threshold: 0.3,      // Lower is stricter matching (0 = exact match only)
      distance: 100,       // How far to extend the match
      minMatchCharLength: 2,
      // Use the shouldSort option to get closer matches first
      shouldSort: true,
      // Advanced options for better performance
      ignoreLocation: true,  // Ignore where in the string the pattern appears
    });
  }
  
  return fuseInstance;
};

/**
 * Search for fields matching the query
 * @param columns Database columns to search
 * @param query Search query
 * @param limit Maximum number of results to return
 * @returns Search results with scores
 */
export const searchFields = (
  columns: DatabaseColumn[],
  query: string,
  limit = 50
): SearchResult[] => {
  if (!query) {
    // Return all columns sorted alphabetically if no query
    return columns
      .slice(0, limit)
      .map((item, refIndex) => ({ item, score: 1, refIndex }));
  }
  
  // Get or initialize Fuse instance
  const fuse = getFuseInstance(columns);
  
  // Search with the query
  const results = fuse.search(query);
  
  // Limit results if needed
  return results.slice(0, limit);
};

/**
 * Clear the Fuse.js instance (e.g., when changing tables)
 */
export const clearSearchIndex = (): void => {
  fuseInstance = null;
  indexedColumns = [];
};