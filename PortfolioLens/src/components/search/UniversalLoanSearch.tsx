import React, { useState, useEffect } from 'react';
import { 
  Box, 
  TextField, 
  Autocomplete, 
  CircularProgress, 
  Typography, 
  Paper,
  InputAdornment,
  IconButton,
  alpha,
  styled
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { universalLoanSearch } from '../../services/loanSearchService';

// Custom styled search input
const SearchTextField = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-root': {
    backgroundColor: alpha(theme.palette.common.white, 0.9),
    borderRadius: 20,
    height: 32,
    '&:hover': {
      backgroundColor: theme.palette.common.white,
    },
    transition: theme.transitions.create(['background-color']),
    paddingRight: 8,
  },
  '& .MuiOutlinedInput-notchedOutline': {
    border: 'none',
  },
  '& .MuiAutocomplete-input': {
    padding: '4px 4px 4px 0 !important',
  },
  '& .MuiInputBase-input': {
    color: theme.palette.text.primary,
    fontSize: '0.875rem',
  },
  '& .MuiAutocomplete-endAdornment': {
    right: theme.spacing(1),
  },
  '& .MuiInputAdornment-root': {
    marginTop: '0 !important',
    height: '100%',
  }
}));

interface LoanOption {
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
  borrower_email?: string;
  borrower_phone?: string;
  co_borrower_email?: string;
  co_borrower_phone?: string;
  current_balance?: number;
  status?: string;
  mers_id?: string;
  display_text: string;
}

export const UniversalLoanSearch: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LoanOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Fetch loan data based on search term
  useEffect(() => {
    let active = true;
    let timer: any = null;
    
    // Clear options if less than 3 characters
    if (searchTerm.length < 3) {
      setOptions([]);
      setOpen(false);
      setIsLoading(false); // Make sure loading indicator is off
      return undefined;
    }
    
    // Only if the dropdown is open and there's enough characters
    if (!open || searchTerm.length < 3) {
      setIsLoading(false); // Make sure loading indicator is off
      return undefined;
    }
    
    setIsLoading(true);
    
    // Use a small debounce to prevent too many calls
    timer = setTimeout(async () => {
      const { data, error } = await universalLoanSearch.searchLoans(searchTerm);
      
      if (active && !error) {
        const processedOptions = data && data.length > 0 ? data.map((loan: any) => {
          // Get borrower name - this could be from actual data or our dummy data
          const borrowerName = loan?.borrower_name || 'Unknown';
          
          // Get property address - could be actual or dummy data
          const propertyAddress = loan?.property_address || '';
          
          // Keep track of servicer and investor names
          const servicerName = loan?.servicer_name || '';
          const investorName = loan?.investor_name || '';
          
          // Create search result option with handling for all fields
          return {
            id: loan?.id || '',
            loan_number: loan?.loan_number || '',
            investor_loan_number: loan?.investor_loan_number || '',
            servicer_loan_number: '', // No longer in our schema but kept for backward compatibility
            borrower_name: borrowerName,
            co_borrower_name: '', // No longer in schema but kept for UI compatibility
            property_address: propertyAddress,
            property_city: '', // No longer separately available
            property_state: '', 
            property_zipcode: '',
            borrower_email: '', // No longer in schema but kept for UI compatibility
            borrower_phone: '',
            co_borrower_email: '',
            co_borrower_phone: '',
            current_balance: loan?.upb || 0,
            status: loan?.loan_status || '',
            mers_id: '', // No longer in schema
            // Create a display text that works with our actual data
            display_text: `${loan?.loan_number || ''} - ${borrowerName} ${propertyAddress ? `(${propertyAddress})` : servicerName ? `(${servicerName})` : ''}`,
          };
        }) : [];
        
        setOptions(processedOptions);
        setIsLoading(false);
      } else {
        setOptions([]);
        setIsLoading(false);
      }
    }, 300); // 300ms debounce
    
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [searchTerm, open]);

  // Handle option selection
  const handleOptionSelect = (event: React.SyntheticEvent, option: LoanOption | null) => {
    if (option) {
      navigate(`/loans/detail/${option.id}`);
    }
  };

  // Clear search input
  const handleClearSearch = () => {
    setSearchTerm('');
  };

  // Handle direct search button click (for when user wants to see all matching results)
  const handleSearchClick = () => {
    if (searchTerm.length > 0) {
      navigate(`/loans/search?q=${encodeURIComponent(searchTerm)}`);
    }
  };

  // Create a reference to get the input position for dropdown positioning
  const searchBoxRef = React.useRef<HTMLDivElement>(null);

  return (
    <Box ref={searchBoxRef} sx={{ width: '100%', position: 'relative', zIndex: 1200 }}>
      <Autocomplete
        open={open && searchTerm.length >= 3}
        onOpen={() => searchTerm.length >= 3 ? setOpen(true) : setOpen(false)}
        onClose={() => setOpen(false)}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        getOptionLabel={(option) => option.display_text}
        options={options}
        loading={isLoading}
        noOptionsText={searchTerm.length >= 3 && !isLoading && open ? "No loans found" : " "}
        forcePopupIcon={false}
        onChange={handleOptionSelect}
        filterOptions={(x) => x} // Disable client-side filtering as we're using server-side search
        PopperComponent={({ style, anchorEl, disablePortal, open: popperOpen, ...props }) => {
          // Don't render the popper at all when there's nothing to show
          if (searchTerm.length < 3 || (options.length === 0 && !isLoading) || !popperOpen) {
            return null;
          }
          
          // Get the search box element's position for accurate dropdown placement
          const searchBoxRect = searchBoxRef.current?.getBoundingClientRect();
          
          // Create a custom style that positions the dropdown under the search box
          const customStyle = {
            ...style,
            zIndex: 1300,  // Above app bar
            position: 'fixed', // Use fixed position
            top: searchBoxRect ? `${searchBoxRect.bottom + 8}px` : style?.top,
            left: searchBoxRect ? `${searchBoxRect.left}px` : style?.left,
            width: searchBoxRect ? `${searchBoxRect.width}px` : '350px'
          };
          
          return (
            <Paper 
              {...props} 
              style={customStyle}
              elevation={8} 
              sx={{ 
                overflow: 'hidden',
                borderRadius: 1,
                mt: 1
              }} 
            />
          );
        }}
        renderInput={(params) => (
          <SearchTextField
            {...params}
            placeholder="Search loans..."
            variant="outlined"
            size="small"
            onChange={(e) => setSearchTerm(e.target.value)}
            value={searchTerm}
            inputProps={{
              ...params.inputProps,
              'aria-label': 'Search for loans by number, name, address, etc.'
            }}
            InputProps={{
              ...params.InputProps,
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  {searchTerm.length > 0 && (
                    <IconButton 
                      onClick={handleClearSearch} 
                      size="small" 
                      aria-label="clear search"
                      sx={{ color: 'text.secondary' }}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  )}
                  {isLoading && <CircularProgress color="inherit" size={18} sx={{ ml: 0.5 }} />}
                </Box>
              ),
            }}
            fullWidth
          />
        )}
        renderOption={(propsWithKey, option) => {
          // Extract the key from props
          const { key, ...props } = propsWithKey;
          
          return (
            <Paper key={key} component="li" {...props} elevation={0} sx={{ borderRadius: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', py: 1 }}>
                <Typography variant="body1" fontWeight="bold">
                  {option.loan_number} - {option.borrower_name || 'Unknown'}
                </Typography>
                
                {/* Show co-borrower if exists */}
                {option.co_borrower_name && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                    Co-borrower: {option.co_borrower_name}
                  </Typography>
                )}
                
                {/* Show property info */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <Typography variant="body2" color="text.secondary">
                    {option.property_address || 'No address'}
                  </Typography>
                  <Typography variant="body2" color="text.primary" sx={{ ml: 2 }}>
                    ${option.current_balance?.toLocaleString() || '0'}
                  </Typography>
                </Box>
                
                {/* Show additional identifiers */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', mt: 0.5, gap: 1 }}>
                  {option.investor_loan_number && (
                    <Typography variant="caption" sx={{ bgcolor: 'info.light', px: 1, borderRadius: 1 }}>
                      Investor: {option.investor_loan_number}
                    </Typography>
                  )}
                  {option.servicer_loan_number && (
                    <Typography variant="caption" sx={{ bgcolor: 'secondary.light', px: 1, borderRadius: 1 }}>
                      Servicer: {option.servicer_loan_number}
                    </Typography>
                  )}
                  {option.mers_id && (
                    <Typography variant="caption" sx={{ bgcolor: 'warning.light', px: 1, borderRadius: 1 }}>
                      MERS: {option.mers_id}
                    </Typography>
                  )}
                </Box>
                
                {/* Show status */}
                {option.status && (
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      mt: 0.5,
                      color: option.status.toLowerCase() === 'current' ? 'success.main' : 
                             option.status.toLowerCase().includes('delinq') ? 'error.main' : 'text.secondary'
                    }}
                  >
                    {option.status}
                  </Typography>
                )}
              </Box>
            </Paper>
          );
        }}
      />
    </Box>
  );
};

export default UniversalLoanSearch;