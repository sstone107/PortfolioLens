# Advanced Loan Search and Filter System

This module provides comprehensive functionality for searching and filtering loans across multiple criteria. It allows users to create, save, and reuse complex filtering criteria, enhancing the loan management experience.

## Features

- **Multi-Field Search**: Search across all key loan information fields
- **Range Filters**: Filter numeric values (interest rate, UPB, credit score) by ranges
- **Date Filters**: Filter by date ranges (origination date, next due date, etc.)
- **Text Search**: Search for loan IDs, borrower information, and property details
- **Saved Filters**: Save, manage, and reuse filter combinations
- **Logical Operations**: Apply AND/OR logic between filters
- **Persistent Storage**: Saved filters are stored in the database with proper RLS
- **Export Results**: Export filtered results to Excel

## Components

### UI Components

1. **LoanFilterPanel**: Main filter interface with all search options
   - Basic filters shown by default
   - Advanced filters revealed by toggle button
   - Categorized filters for better organization

2. **RangeFilterComponent**: Reusable component for numeric range filters
   - Slider for visual range selection
   - Min/Max input fields
   - Optional adornments for units

3. **DateRangeFilter**: Date range picker component
   - From/To date selectors
   - Clear date functionality

4. **LoanSearchResults**: Displays search results with pagination
   - Sortable columns
   - Export functionality
   - Detailed view links

### Data Services

1. **LoanSearchService**: Core service for search functionality
   - Query building with PostgreSQL filtering
   - Saved filter management
   - Results pagination

2. **LoanSearchContext**: React Context for state management
   - Manages current filter state
   - Handles saved filters
   - Provides hooks for components

### Database Components

1. **saved_filters Table**: Stores user filter configurations
   - JSON storage of filter criteria
   - User-specific filters with RLS
   - Favorite and last-used tracking

2. **loan_portfolio_view**: View joining loan data for efficient searching
   - Combines loan, loan_information, and portfolio data
   - Optimized for search performance

## Implementation Guide

### Adding New Filter Criteria

To add a new filter criterion:

1. Update the `LoanFilterCriteria` interface in `loanSearchService.ts`
2. Add the field to the UI in `LoanFilterPanel.tsx`
3. Implement the filter logic in the `applyFilters` method in `loanSearchService.ts`

Example:

```typescript
// 1. Update interface
export interface LoanFilterCriteria {
  // existing fields...
  new_field?: string; // or RangeFilter<number> for range fields
}

// 2. Add to UI
<TextField
  fullWidth
  label="New Field"
  variant="outlined"
  size="small"
  value={currentFilter.new_field || ''}
  onChange={(e) => updateFilter({ new_field: e.target.value })}
/>

// 3. Apply filter logic
if (filters.new_field) {
  query = query.ilike('table_column_name', `%${filters.new_field}%`);
}
```

## Database Migration

The system requires the `saved_filters` table which is created by the migration script at:
`/src/db/migrations/013_saved_filters.sql`

## Technical Notes

- All filter operations use PostgreSQL's filtering capabilities through Supabase
- Date filtering uses ISO date strings for compatibility
- The saved filters feature uses user authentication to ensure data security
- The system implements proper Row Level Security (RLS) to protect user data

## Dependencies

- Material UI components including MUI X Date Pickers
- date-fns for date handling
- Supabase client for database access
- React Context API for state management