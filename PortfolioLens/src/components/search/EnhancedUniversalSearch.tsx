import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  styled,
  Chip,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  useTheme
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Search as SearchIcon,
  Clear as ClearIcon,
  History as HistoryIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon, 
  Delete as DeleteIcon,
  Keyboard as KeyboardIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Settings as SettingsIcon
} from '@mui/icons-material';
import universalSearchService, { SearchResult, SearchHistoryItem } from '../../services/universalSearchService';

// Custom styled search input
const SearchTextField = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-root': {
    backgroundColor: alpha(theme.palette.common.white, 0.9),
    borderRadius: 24,
    height: 40,
    '&:hover': {
      backgroundColor: theme.palette.common.white,
    },
    transition: theme.transitions.create(['background-color']),
    paddingRight: 8,
  },
  '& .MuiOutlinedInput-notchedOutline': {
    border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}`,
  },
  '& .MuiAutocomplete-input': {
    padding: '6px 6px 6px 0 !important',
  },
  '& .MuiInputBase-input': {
    color: theme.palette.text.primary,
    fontSize: '0.925rem',
  },
  '& .MuiAutocomplete-endAdornment': {
    right: theme.spacing(1),
  },
  '& .MuiInputAdornment-root': {
    marginTop: '0 !important',
    height: '100%',
  }
}));

interface EnhancedUniversalSearchProps {
  minSearchLength?: number;
  placeholder?: string;
  onSearch?: (term: string) => void;
  showShortcutHint?: boolean;
  initialTerm?: string;
}

export const EnhancedUniversalSearch: React.FC<EnhancedUniversalSearchProps> = ({
  minSearchLength = 2,
  placeholder = "Search loans...",
  onSearch,
  showShortcutHint = true,
  initialTerm = ""
}) => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState(initialTerm);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<SearchResult | null>(null);
  const [highlightedOption, setHighlightedOption] = useState<number>(-1);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [historyAnchorEl, setHistoryAnchorEl] = useState<null | HTMLElement>(null);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  
  // Create refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  
  // Load search history on initial render
  useEffect(() => {
    const loadSearchHistory = async () => {
      const { data, error } = await universalSearchService.getSearchHistory(10);
      
      if (!error && data) {
        setSearchHistory(data);
      }
    };
    
    loadSearchHistory();
  }, []);
  
  // Set up keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          setOpen(true);
        }
      }
      
      // Escape to clear and close search
      if (e.key === 'Escape' && open) {
        setOpen(false);
        setSearchTerm('');
      }
      
      // Arrow keys to navigate results when dropdown is open
      if (open && options.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedOption(prev => (prev < options.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedOption(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter' && highlightedOption >= 0) {
          e.preventDefault();
          handleOptionSelect(null, options[highlightedOption]);
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, options, highlightedOption]);
  
  // Fetch search results based on search term
  useEffect(() => {
    let active = true;
    let timer: NodeJS.Timeout | null = null;
    
    // Clear options if less than minimum characters
    if (searchTerm.length < minSearchLength) {
      setOptions([]);
      setOpen(false);
      setIsLoading(false);
      return undefined;
    }
    
    // Only if the dropdown is open and there's enough characters
    if (!open || searchTerm.length < minSearchLength) {
      setIsLoading(false);
      return undefined;
    }
    
    setIsLoading(true);
    
    // Use a small debounce to prevent too many calls
    timer = setTimeout(async () => {
      const { data, error } = await universalSearchService.search(searchTerm);
      
      if (active && !error) {
        setOptions(data || []);
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
  }, [searchTerm, open, minSearchLength]);
  
  // Handle option selection
  const handleOptionSelect = useCallback((event: React.SyntheticEvent | null, option: SearchResult | null) => {
    if (option) {
      setSelectedOption(option);
      navigate(`/loans/detail/${option.id}`, { 
        state: { 
          from: location.pathname, 
          searchTerm,
          previousPath: location.pathname
        } 
      });
    }
  }, [navigate, searchTerm, location.pathname]);
  
  // Clear search input
  const handleClearSearch = () => {
    setSearchTerm('');
    setSelectedOption(null);
  };
  
  // Handle search button click
  const handleSearchClick = () => {
    if (searchTerm.length > 0) {
      if (onSearch) {
        onSearch(searchTerm);
      } else {
        navigate(`/loans/search?q=${encodeURIComponent(searchTerm)}`);
      }
    }
  };
  
  // Open history menu
  const handleHistoryMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setHistoryAnchorEl(event.currentTarget);
  };
  
  // Close history menu
  const handleHistoryMenuClose = () => {
    setHistoryAnchorEl(null);
  };
  
  // Handle selecting a history item
  const handleHistorySelect = (item: SearchHistoryItem) => {
    setSearchTerm(item.search_term);
    setOpen(true);
    handleHistoryMenuClose();
    
    // If search input is available, focus it
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };
  
  // Toggle favorite status for a history item
  const handleToggleFavorite = async (item: SearchHistoryItem, event: React.MouseEvent) => {
    event.stopPropagation();
    
    const { success } = await universalSearchService.toggleFavorite(
      item.id, 
      !item.is_favorite
    );
    
    if (success) {
      setSearchHistory(prevHistory => prevHistory.map(historyItem => 
        historyItem.id === item.id 
          ? { ...historyItem, is_favorite: !historyItem.is_favorite }
          : historyItem
      ));
    }
  };
  
  // Delete a search history item
  const handleDeleteHistoryItem = async (item: SearchHistoryItem, event: React.MouseEvent) => {
    event.stopPropagation();
    
    const { success } = await universalSearchService.deleteSearchHistory(item.id);
    
    if (success) {
      setSearchHistory(prevHistory => 
        prevHistory.filter(historyItem => historyItem.id !== item.id)
      );
    }
  };
  
  // Clear all non-favorite search history
  const handleClearHistory = async () => {
    const { success } = await universalSearchService.clearSearchHistory();
    
    if (success) {
      setSearchHistory(prevHistory => 
        prevHistory.filter(item => item.is_favorite)
      );
    }
    
    handleHistoryMenuClose();
  };
  
  // Show keyboard shortcuts dialog
  const handleOpenKeyboardShortcuts = () => {
    setKeyboardShortcutsOpen(true);
    handleHistoryMenuClose();
  };
  
  // Close keyboard shortcuts dialog
  const handleCloseKeyboardShortcuts = () => {
    setKeyboardShortcutsOpen(false);
  };
  
  return (
    <Box ref={searchBoxRef} sx={{ width: '100%', position: 'relative', zIndex: 1200 }}>
      <Autocomplete
        open={open && searchTerm.length >= minSearchLength}
        onOpen={() => searchTerm.length >= minSearchLength ? setOpen(true) : setOpen(false)}
        onClose={() => setOpen(false)}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        getOptionLabel={(option) => option.display_text || option.loan_number || ''}
        options={options}
        loading={isLoading}
        noOptionsText={searchTerm.length >= minSearchLength && !isLoading && open ? "No loans found" : " "}
        forcePopupIcon={false}
        onChange={handleOptionSelect}
        filterOptions={(x) => x} // Disable client-side filtering
        onHighlightChange={(event, option) => {
          if (option) {
            const index = options.findIndex(o => o.id === option.id);
            setHighlightedOption(index);
          } else {
            setHighlightedOption(-1);
          }
        }}
        PopperComponent={({ style, anchorEl, disablePortal, open: popperOpen, ...props }) => {
          // Don't render the popper at all when there's nothing to show
          if (searchTerm.length < minSearchLength || (options.length === 0 && !isLoading) || !popperOpen) {
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
            inputRef={searchInputRef}
            placeholder={placeholder}
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
                  <SearchIcon sx={{ color: 'text.secondary', ml: 1 }} />
                </InputAdornment>
              ),
              endAdornment: (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
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
                  
                  <IconButton 
                    onClick={handleHistoryMenuOpen}
                    size="small"
                    aria-label="search history"
                    sx={{ color: 'text.secondary' }}
                  >
                    <HistoryIcon fontSize="small" />
                  </IconButton>
                  
                  {isLoading && <CircularProgress color="inherit" size={18} sx={{ mr: 1 }} />}
                </Box>
              ),
            }}
            fullWidth
          />
        )}
        renderOption={(propsWithKey, option, { selected, index }) => {
          // Extract the key from props
          const { key, ...props } = propsWithKey;
          const isHighlighted = index === highlightedOption;
          
          return (
            <Paper 
              key={key} 
              component="li" 
              {...props} 
              elevation={0} 
              sx={{ 
                borderRadius: 0,
                backgroundColor: isHighlighted ? alpha(theme.palette.primary.main, 0.1) : 'inherit'
              }}
            >
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
                    ${option.current_upb?.toLocaleString() || '0'}
                  </Typography>
                </Box>
                
                {/* Show additional identifiers */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', mt: 0.5, gap: 1 }}>
                  {option.investor_loan_number && (
                    <Chip
                      size="small"
                      label={`Investor: ${option.investor_loan_number}`}
                      sx={{ bgcolor: 'info.light', color: 'info.contrastText' }}
                    />
                  )}
                  {option.servicer_name && (
                    <Chip
                      size="small"
                      label={`Servicer: ${option.servicer_name}`}
                      sx={{ bgcolor: 'secondary.light', color: 'secondary.contrastText' }}
                    />
                  )}
                  {option.portfolio_name && (
                    <Chip
                      size="small"
                      label={`Portfolio: ${option.portfolio_name}`}
                      sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}
                    />
                  )}
                </Box>
                
                {/* Show status */}
                {option.loan_status && (
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      mt: 0.5,
                      color: option.loan_status.toLowerCase() === 'current' ? 'success.main' : 
                             option.loan_status.toLowerCase().includes('delinq') ? 'error.main' : 'text.secondary'
                    }}
                  >
                    {option.loan_status}
                  </Typography>
                )}
              </Box>
            </Paper>
          );
        }}
      />
      
      {/* Show keyboard shortcut hint */}
      {showShortcutHint && (
        <Box 
          sx={{ 
            position: 'absolute', 
            right: 52, 
            top: '50%', 
            transform: 'translateY(-50%)',
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            color: 'text.disabled',
            pointerEvents: 'none'
          }}
        >
          <Typography variant="caption" sx={{ mr: 0.5 }}>
            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+K
          </Typography>
        </Box>
      )}
      
      {/* History Menu */}
      <Menu
        anchorEl={historyAnchorEl}
        open={Boolean(historyAnchorEl)}
        onClose={handleHistoryMenuClose}
        PaperProps={{
          elevation: 3,
          sx: { minWidth: 300, maxWidth: 350 }
        }}
      >
        <MenuItem sx={{ justifyContent: 'space-between' }}>
          <Typography variant="subtitle1" fontWeight="medium">Recent Searches</Typography>
          <IconButton size="small" onClick={handleOpenKeyboardShortcuts}>
            <KeyboardIcon fontSize="small" />
          </IconButton>
        </MenuItem>
        
        <Divider />
        
        {searchHistory.filter(item => item.is_favorite).length > 0 && (
          <Box sx={{ py: 1 }}>
            <Typography variant="caption" sx={{ px: 2, color: 'text.secondary' }}>
              Favorites
            </Typography>
            
            {searchHistory
              .filter(item => item.is_favorite)
              .map(item => (
                <MenuItem key={item.id} onClick={() => handleHistorySelect(item)}>
                  <ListItemIcon>
                    <StarIcon fontSize="small" color="warning" />
                  </ListItemIcon>
                  <ListItemText primary={item.search_term} />
                  <IconButton
                    size="small"
                    onClick={(e) => handleDeleteHistoryItem(item, e)}
                    sx={{ ml: 1 }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </MenuItem>
              ))
            }
            
            <Divider />
          </Box>
        )}
        
        {searchHistory.filter(item => !item.is_favorite).length > 0 ? (
          <Box>
            <Typography variant="caption" sx={{ px: 2, py: 1, color: 'text.secondary', display: 'block' }}>
              Recent
            </Typography>
            
            {searchHistory
              .filter(item => !item.is_favorite)
              .slice(0, 10)
              .map(item => (
                <MenuItem key={item.id} onClick={() => handleHistorySelect(item)}>
                  <ListItemIcon>
                    <HistoryIcon fontSize="small" color="disabled" />
                  </ListItemIcon>
                  <ListItemText 
                    primary={item.search_term} 
                    secondary={`${item.result_count} results`}
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => handleToggleFavorite(item, e)}
                    sx={{ mr: 0.5 }}
                  >
                    <StarBorderIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDeleteHistoryItem(item, e)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </MenuItem>
              ))
            }
            
            <Divider />
            
            <MenuItem onClick={handleClearHistory}>
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Clear Search History" />
            </MenuItem>
          </Box>
        ) : (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              No recent searches
            </Typography>
          </MenuItem>
        )}
      </Menu>
      
      {/* Keyboard Shortcuts Dialog */}
      <Dialog
        open={keyboardShortcutsOpen}
        onClose={handleCloseKeyboardShortcuts}
        aria-labelledby="keyboard-shortcuts-title"
      >
        <DialogTitle id="keyboard-shortcuts-title">
          Keyboard Shortcuts
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Search</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Chip 
                label={navigator.platform.includes('Mac') ? '⌘ + K' : 'Ctrl + K'} 
                size="small" 
                variant="outlined" 
              />
              <Typography variant="body2">Focus search box</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Chip label="Esc" size="small" variant="outlined" />
              <Typography variant="body2">Clear search & close dropdown</Typography>
            </Box>
          </Box>
          
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>Navigation</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Chip 
                label={<ArrowUpIcon fontSize="small" />} 
                size="small" 
                variant="outlined" 
              />
              <Typography variant="body2">Previous search result</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Chip 
                label={<ArrowDownIcon fontSize="small" />} 
                size="small" 
                variant="outlined" 
              />
              <Typography variant="body2">Next search result</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Chip label="Enter" size="small" variant="outlined" />
              <Typography variant="body2">Select highlighted result</Typography>
            </Box>
          </Box>
          
          <Box>
            <Typography variant="subtitle1" gutterBottom>History</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Chip 
                icon={<HistoryIcon fontSize="small" />} 
                label="Click"
                size="small" 
                variant="outlined" 
              />
              <Typography variant="body2">View search history</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseKeyboardShortcuts}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EnhancedUniversalSearch;