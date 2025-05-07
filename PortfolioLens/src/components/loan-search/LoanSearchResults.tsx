import React, { useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Stack,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Alert
} from '@mui/material';
import {
  DownloadForOffline as DownloadIcon,
  Assessment as ReportIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Description as DescriptionIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useLoanSearch } from '../../contexts/loanSearchContext';
import { useNavigation } from '@refinedev/core';
import * as XLSX from 'xlsx';

interface LoanSearchResultsProps {
  // Additional props if needed
}

const LoanSearchResults: React.FC<LoanSearchResultsProps> = () => {
  const {
    searchResults,
    searching,
    searchLoans,
    searchOptions,
    setSearchOptions,
    error
  } = useLoanSearch();
  
  const { show, edit } = useNavigation();
  
  // Handle pagination change
  const handlePageChange = (event: React.ChangeEvent<unknown>, page: number) => {
    setSearchOptions({ ...searchOptions, page });
    searchLoans({ page });
  };
  
  // Handle rows per page change
  const handleRowsPerPageChange = (event: SelectChangeEvent<number>) => {
    const pageSize = Number(event.target.value);
    setSearchOptions({ ...searchOptions, pageSize, page: 1 });
    searchLoans({ pageSize, page: 1 });
  };
  
  // Handle sort field change
  const handleSortByChange = (event: SelectChangeEvent<string>) => {
    const sortBy = event.target.value;
    setSearchOptions({ ...searchOptions, sortBy });
    searchLoans({ sortBy });
  };
  
  // Handle sort order change
  const handleSortOrderChange = (event: SelectChangeEvent<string>) => {
    const sortOrder = event.target.value as 'asc' | 'desc';
    setSearchOptions({ ...searchOptions, sortOrder });
    searchLoans({ sortOrder });
  };
  
  // Export to Excel
  const exportToExcel = () => {
    if (!searchResults || searchResults.loans.length === 0) return;
    
    // Format data for export (simplify loan data)
    const dataForExport = searchResults.loans.map(loan => {
      // Remove any circular references or functions
      const exportableLoan = { ...loan };
      
      // Format dates or other special fields as needed
      if (exportableLoan.origination_date) {
        exportableLoan.origination_date = new Date(exportableLoan.origination_date).toLocaleDateString();
      }
      if (exportableLoan.last_payment_date) {
        exportableLoan.last_payment_date = new Date(exportableLoan.last_payment_date).toLocaleDateString();
      }
      if (exportableLoan.maturity_date) {
        exportableLoan.maturity_date = new Date(exportableLoan.maturity_date).toLocaleDateString();
      }
      
      // Format numeric fields
      if (exportableLoan.current_upb) {
        exportableLoan.current_upb = Number(exportableLoan.current_upb).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      }
      if (exportableLoan.current_interest_rate) {
        exportableLoan.current_interest_rate = `${(Number(exportableLoan.current_interest_rate) * 100).toFixed(3)}%`;
      }
      
      return exportableLoan;
    });
    
    // Create worksheet and workbook
    const worksheet = XLSX.utils.json_to_sheet(dataForExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Loans');
    
    // Generate a download
    const now = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    XLSX.writeFile(workbook, `loan-search-results-${now}.xlsx`);
  };
  
  // Map for displaying human-readable sort field names
  const sortFieldLabels: Record<string, string> = {
    'loan_number': 'Loan Number',
    'investor_loan_number': 'Investor Loan #',
    'current_upb': 'UPB',
    'current_interest_rate': 'Interest Rate',
    'loan_status': 'Status',
    'delinquency_status': 'Delinquency',
    'last_payment_date': 'Last Payment Date',
    'maturity_date': 'Maturity Date',
    'origination_date': 'Origination Date',
    'portfolio_name': 'Portfolio',
    'borrower_first_name': 'Borrower Name'
  };
  
  return (
    <Paper sx={{ 
      p: 3, 
      borderRadius: 2,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
    }}>
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: 3,
        pb: 2,
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        <Typography 
          variant="h5" 
          sx={{ 
            display: 'flex', 
            alignItems: 'center',
            fontWeight: 'medium',
            color: 'primary.main'
          }}
        >
          <ReportIcon sx={{ mr: 1.5, fontSize: 28 }} />
          Search Results
          {searchResults && (
            <Chip 
              label={`${searchResults.totalCount} loans found`} 
              size="medium" 
              color="primary" 
              variant="outlined"
              sx={{ 
                ml: 2, 
                borderRadius: 1,
                px: 1
              }} 
            />
          )}
        </Typography>
        
        {searchResults && searchResults.loans.length > 0 && (
          <Button
            variant="outlined"
            size="large"
            startIcon={<DownloadIcon />}
            onClick={exportToExcel}
            sx={{
              borderRadius: 1,
              px: 2,
              py: 1
            }}
          >
            Export to Excel
          </Button>
        )}
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {searching ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : searchResults ? (
        <>
          {/* Sort and pagination controls */}
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={searchOptions.sortBy}
                  label="Sort By"
                  onChange={handleSortByChange}
                >
                  {Object.entries(sortFieldLabels).map(([field, label]) => (
                    <MenuItem key={field} value={field}>{label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Order</InputLabel>
                <Select
                  value={searchOptions.sortOrder}
                  label="Order"
                  onChange={handleSortOrderChange}
                >
                  <MenuItem value="asc">Ascending</MenuItem>
                  <MenuItem value="desc">Descending</MenuItem>
                </Select>
              </FormControl>
            </Box>
            
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Show</InputLabel>
                <Select
                  value={searchOptions.pageSize}
                  label="Show"
                  onChange={handleRowsPerPageChange}
                >
                  <MenuItem value={10}>10</MenuItem>
                  <MenuItem value={20}>20</MenuItem>
                  <MenuItem value={50}>50</MenuItem>
                  <MenuItem value={100}>100</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
          
          {/* Results Grid */}
          {searchResults.loans.length === 0 ? (
            <Box sx={{ 
              textAlign: 'center', 
              py: 6,
              px: 3, 
              borderRadius: 2,
              backgroundColor: 'background.paper',
              border: '1px dashed',
              borderColor: 'divider',
            }}>
              <DescriptionIcon sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No loans found
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Try adjusting your search criteria to find matching loans.
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={3}>
              {searchResults.loans.map((loan) => (
                <Grid item xs={12} md={6} key={loan.id}>
                  <Card 
                    variant="outlined"
                    sx={{
                      borderRadius: 2,
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        transform: 'translateY(-2px)'
                      }
                    }}
                  >
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={2}>
                        <Box sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          pb: 1,
                          borderBottom: '1px solid',
                          borderColor: 'divider'
                        }}>
                          <Typography 
                            variant="h6" 
                            sx={{ 
                              fontWeight: 'bold',
                              color: 'primary.main'
                            }}
                          >
                            {loan.loan_number}
                          </Typography>
                          
                          <Stack direction="row" spacing={1}>
                            <Tooltip title="View Details">
                              <IconButton 
                                size="small"
                                color="primary"
                                sx={{ 
                                  backgroundColor: 'action.hover',
                                  '&:hover': { 
                                    backgroundColor: 'primary.light',
                                    color: 'primary.contrastText'
                                  }
                                }}
                                onClick={() => show('loans', loan.id)}
                              >
                                <ViewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit Loan">
                              <IconButton 
                                size="small"
                                color="info"
                                sx={{ 
                                  backgroundColor: 'action.hover',
                                  '&:hover': { 
                                    backgroundColor: 'info.light',
                                    color: 'info.contrastText'
                                  }
                                }}
                                onClick={() => edit('loans', loan.id)}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </Box>
                        
                        <Grid container spacing={2}>
                          <Grid item xs={6}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                              Investor Loan #
                            </Typography>
                            <Typography variant="body1" fontWeight="medium">
                              {loan.investor_loan_number || 'N/A'}
                            </Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                              Portfolio
                            </Typography>
                            <Typography variant="body1" fontWeight="medium">
                              {loan.portfolio_name || 'Not Assigned'}
                            </Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                              UPB
                            </Typography>
                            <Typography variant="body1" fontWeight="medium">
                              {typeof loan.current_upb === 'number' 
                                ? loan.current_upb.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
                                : 'N/A'}
                            </Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                              Interest Rate
                            </Typography>
                            <Typography variant="body1" fontWeight="medium">
                              {typeof loan.current_interest_rate === 'number'
                                ? `${(loan.current_interest_rate * 100).toFixed(3)}%`
                                : 'N/A'}
                            </Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                              Status
                            </Typography>
                            <Chip 
                              label={loan.loan_status || 'Unknown'} 
                              size="small" 
                              color={
                                loan.loan_status === 'Active' ? 'success' :
                                loan.loan_status === 'Delinquent' ? 'warning' :
                                loan.loan_status === 'Default' ? 'error' :
                                'default'
                              }
                              sx={{
                                fontWeight: 'medium',
                                borderRadius: 1,
                                px: 1
                              }}
                            />
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                              Origination Date
                            </Typography>
                            <Typography variant="body1" fontWeight="medium">
                              {loan.origination_date 
                                ? new Date(loan.origination_date).toLocaleDateString()
                                : 'N/A'}
                            </Typography>
                          </Grid>
                        </Grid>
                        
                        {loan.borrower_first_name && (
                          <Box sx={{ 
                            pt: 1, 
                            mt: 1, 
                            borderTop: '1px dashed', 
                            borderColor: 'divider' 
                          }}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                              Borrower
                            </Typography>
                            <Typography variant="body1" fontWeight="medium">
                              {`${loan.borrower_first_name || ''} ${loan.borrower_last_name || ''}`}
                            </Typography>
                          </Box>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
          
          {/* Pagination */}
          {searchResults.totalCount > 0 && (
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              mt: 4,
              pt: 3,
              borderTop: '1px solid',
              borderColor: 'divider'
            }}>
              <Pagination
                count={Math.ceil(searchResults.totalCount / searchResults.pageSize)}
                page={searchResults.page}
                onChange={handlePageChange}
                color="primary"
                size="large"
                showFirstButton
                showLastButton
                sx={{
                  '& .MuiPaginationItem-root': {
                    borderRadius: 1,
                    mx: 0.5
                  }
                }}
              />
            </Box>
          )}
        </>
      ) : (
        <Box sx={{ 
          textAlign: 'center', 
          py: 8,
          px: 3,
          backgroundColor: 'background.paper',
          border: '1px dashed',
          borderColor: 'divider',
          borderRadius: 2,
          boxShadow: 'inset 0 0 12px rgba(0,0,0,0.03)'
        }}>
          <Box sx={{ mb: 3 }}>
            <SearchIcon sx={{ fontSize: 72, color: 'primary.light', opacity: 0.7, mb: 1 }} />
          </Box>
          <Typography variant="h5" color="text.primary" gutterBottom fontWeight="medium">
            Ready to Search
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 500, mx: 'auto' }}>
            Use the filters above to search through your loan portfolio. You can save your frequently used searches for quick access.
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default LoanSearchResults;