import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Autocomplete,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  FormHelperText,
  Stack,
  Collapse,
  CircularProgress
} from '@mui/material';
import {
  FilterAlt as FilterIcon,
  Save as SaveIcon,
  Restore as ResetIcon,
  Favorite as FavoriteIcon,
  FavoriteBorder as FavoriteBorderIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import { LoanFilterCriteria, LoanSearchFilter, DynamicFilter, LoanSearchService } from '../../services/loanSearchService';
import { useLoanSearch } from '../../contexts/loanSearchContext';
import RangeFilterComponent from './RangeFilter';
import DateRangeFilter from './DateRangeFilter';
import DynamicFieldFilter from './DynamicFieldFilter';
import { useList } from '@refinedev/core';
import { v4 as uuidv4 } from 'uuid';

interface LoanFilterPanelProps {
  onSearch: () => void;
}

const LoanFilterPanel: React.FC<LoanFilterPanelProps> = ({ onSearch }) => {
  const {
    currentFilter,
    setCurrentFilter,
    savedFilters,
    saveCurrentFilter,
    savingFilter,
    deleteFilter,
    toggleFavorite,
    applyFilter,
    searching
  } = useLoanSearch();

  // Fetch portfolios for dropdown
  const { data: portfoliosData } = useList({
    resource: 'portfolios',
    config: {
      pagination: { mode: 'off' }
    }
  });
  const portfolios = portfoliosData?.data || [];

  // Available fields for dynamic filters
  const loanSearchService = new LoanSearchService();
  const availableFields = loanSearchService.getAvailableFields();

  // Local state for the filter panel
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedSavedFilter, setSelectedSavedFilter] = useState<LoanSearchFilter | null>(null);

  // Handle saving a filter
  const handleSaveFilter = async () => {
    if (!filterName.trim()) return;
    
    try {
      await saveCurrentFilter(filterName, isFavorite);
      setSaveDialogOpen(false);
      setFilterName('');
      setIsFavorite(false);
    } catch (error) {
      console.error('Error saving filter:', error);
    }
  };

  // Handle applying a saved filter
  const handleApplySavedFilter = (filter: LoanSearchFilter) => {
    setSelectedSavedFilter(filter);
    applyFilter(filter);
  };

  // Handle filter changes
  const updateFilter = (updates: Partial<LoanFilterCriteria>) => {
    setCurrentFilter({ ...currentFilter, ...updates });
  };
  
  // Handle dynamic filter changes
  const handleDynamicFiltersChange = (filters: DynamicFilter[]) => {
    updateFilter({ dynamicFilters: filters });
  };
  
  // Add a new dynamic filter
  const addDynamicFilter = () => {
    const newFilter: DynamicFilter = {
      id: uuidv4(),
      field: Object.keys(availableFields)[0] || '',
      operator: 'eq',
      value: ''
    };
    
    const currentDynamicFilters = currentFilter.dynamicFilters || [];
    handleDynamicFiltersChange([...currentDynamicFilters, newFilter]);
  };

  // Reset the filter
  const resetFilter = () => {
    setCurrentFilter({
      dynamicFilters: [] // Reset to empty array instead of undefined
    });
    setSelectedSavedFilter(null);
  };

  // Toggle advanced filters
  const toggleAdvanced = () => {
    setAdvancedOpen(!advancedOpen);
  };

  return (
    <Paper sx={{ 
      p: 3, 
      mb: 4, 
      borderRadius: 2,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
    }}>
      <Typography 
        variant="h5" 
        sx={{ 
          mb: 3, 
          display: 'flex', 
          alignItems: 'center',
          fontWeight: 'medium',
          color: 'primary.main'
        }}
      >
        <FilterIcon sx={{ mr: 1.5, fontSize: 28 }} />
        Loan Search
      </Typography>

      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Loan ID / Number"
            variant="outlined"
            size="medium"
            value={currentFilter.loan_id || ''}
            onChange={(e) => updateFilter({ loan_id: e.target.value })}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 1,
                backgroundColor: 'background.paper'
              }
            }}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Borrower Name"
            variant="outlined"
            size="medium"
            value={currentFilter.borrower_name || ''}
            onChange={(e) => updateFilter({ borrower_name: e.target.value })}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 1,
                backgroundColor: 'background.paper'
              }
            }}
          />
        </Grid>
      </Grid>

      <Box sx={{ mb: 3 }}>
        <Button
          variant="outlined"
          size="medium"
          endIcon={advancedOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          onClick={toggleAdvanced}
          sx={{ mb: 2 }}
        >
          {advancedOpen ? 'Hide Advanced Filters' : 'Show Advanced Filters'}
        </Button>

        <Collapse in={advancedOpen}>
          <Grid container spacing={2}>
            {/* Financial Filters Section */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 1 }}>
                Financial Filters
              </Typography>
              <Divider sx={{ mb: 2 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <RangeFilterComponent
                label="Interest Rate (%)"
                min={0}
                max={15}
                step={0.125}
                value={currentFilter.interest_rate || {}}
                onChange={(value) => updateFilter({ interest_rate: value })}
                adornment="%"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <RangeFilterComponent
                label="Unpaid Principal Balance (UPB)"
                min={0}
                max={1000000}
                step={1000}
                value={currentFilter.upb || {}}
                onChange={(value) => updateFilter({ upb: value })}
                adornment="$"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <RangeFilterComponent
                label="Current Escrow Balance"
                min={0}
                max={50000}
                step={100}
                value={currentFilter.current_escrow_balance || {}}
                onChange={(value) => updateFilter({ current_escrow_balance: value })}
                adornment="$"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <RangeFilterComponent
                label="Loan Term (months)"
                min={0}
                max={480}
                step={12}
                value={currentFilter.loan_term || {}}
                onChange={(value) => updateFilter({ loan_term: value })}
                adornment="mo"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <RangeFilterComponent
                label="LTV Ratio (%)"
                min={0}
                max={100}
                step={0.5}
                value={currentFilter.ltv || {}}
                onChange={(value) => updateFilter({ ltv: value })}
                adornment="%"
                tooltipText="Loan-to-Value Ratio"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <RangeFilterComponent
                label="DTI Ratio (%)"
                min={0}
                max={100}
                step={0.5}
                value={currentFilter.dti || {}}
                onChange={(value) => updateFilter({ dti: value })}
                adornment="%"
                tooltipText="Debt-to-Income Ratio"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <RangeFilterComponent
                label="Credit Score"
                min={300}
                max={850}
                step={1}
                value={currentFilter.credit_score || {}}
                onChange={(value) => updateFilter({ credit_score: value })}
              />
            </Grid>

            {/* Borrower Info Section */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 3 }}>
                Borrower Information
              </Typography>
              <Divider sx={{ mb: 2 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Borrower Email"
                variant="outlined"
                size="small"
                value={currentFilter.borrower_email || ''}
                onChange={(e) => updateFilter({ borrower_email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Borrower Phone"
                variant="outlined"
                size="small"
                value={currentFilter.borrower_phone || ''}
                onChange={(e) => updateFilter({ borrower_phone: e.target.value })}
              />
            </Grid>

            {/* Property Information Section */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 3 }}>
                Property Information
              </Typography>
              <Divider sx={{ mb: 2 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Property Address"
                variant="outlined"
                size="small"
                value={currentFilter.property_address || ''}
                onChange={(e) => updateFilter({ property_address: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="City"
                variant="outlined"
                size="small"
                value={currentFilter.property_city || ''}
                onChange={(e) => updateFilter({ property_city: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="State"
                variant="outlined"
                size="small"
                value={currentFilter.property_state || ''}
                onChange={(e) => updateFilter({ property_state: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Zip Code"
                variant="outlined"
                size="small"
                value={currentFilter.property_zipcode || ''}
                onChange={(e) => updateFilter({ property_zipcode: e.target.value })}
              />
            </Grid>

            {/* Loan Identifiers Section */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 3 }}>
                Loan Identifiers
              </Typography>
              <Divider sx={{ mb: 2 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="MERS ID"
                variant="outlined"
                size="small"
                value={currentFilter.mers_id || ''}
                onChange={(e) => updateFilter({ mers_id: e.target.value })}
              />
            </Grid>

            {/* Date Filters Section */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 3 }}>
                Date Filters
              </Typography>
              <Divider sx={{ mb: 2 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <DateRangeFilter
                label="Origination Date"
                value={currentFilter.origination_date || {}}
                onChange={(value) => updateFilter({ origination_date: value })}
                tooltipText="Date when the loan was originated"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <DateRangeFilter
                label="Next Due Date"
                value={currentFilter.next_due_date || {}}
                onChange={(value) => updateFilter({ next_due_date: value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <DateRangeFilter
                label="Payoff Request Date"
                value={currentFilter.payoff_request_date || {}}
                onChange={(value) => updateFilter({ payoff_request_date: value })}
                tooltipText="Date when a payoff was requested"
              />
            </Grid>

            {/* Portfolio & Status Section */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 3 }}>
                Loan Status & Portfolio
              </Typography>
              <Divider sx={{ mb: 2 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Loan Status</InputLabel>
                <Select
                  multiple
                  value={Array.isArray(currentFilter.status) ? currentFilter.status : (currentFilter.status ? [currentFilter.status] : [])}
                  onChange={(e) => updateFilter({ status: e.target.value as string[] })}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as string[]).map((value) => (
                        <Chip key={value} label={value} size="small" />
                      ))}
                    </Box>
                  )}
                >
                  <MenuItem value="Active">Active</MenuItem>
                  <MenuItem value="Delinquent">Delinquent</MenuItem>
                  <MenuItem value="Default">Default</MenuItem>
                  <MenuItem value="Paid Off">Paid Off</MenuItem>
                  <MenuItem value="Foreclosure">Foreclosure</MenuItem>
                  <MenuItem value="REO">REO</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Portfolio</InputLabel>
                <Select
                  multiple
                  value={Array.isArray(currentFilter.portfolio_id) ? currentFilter.portfolio_id : (currentFilter.portfolio_id ? [currentFilter.portfolio_id] : [])}
                  onChange={(e) => updateFilter({ portfolio_id: e.target.value as string[] })}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as string[]).map((value) => {
                        const portfolioName = portfolios.find(p => p.id === value)?.name || value;
                        return <Chip key={value} label={portfolioName} size="small" />;
                      })}
                    </Box>
                  )}
                >
                  {portfolios.map((portfolio) => (
                    <MenuItem key={portfolio.id} value={portfolio.id}>
                      {portfolio.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Other Custom Fields Section */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 3 }}>
                Other Custom Fields
              </Typography>
              <Divider sx={{ mb: 2 }} />
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ 
                p: 3, 
                border: '1px solid', 
                borderColor: 'divider', 
                borderRadius: 1,
                backgroundColor: 'background.paper',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <DynamicFieldFilter
                  availableFields={availableFields}
                  dynamicFilters={currentFilter.dynamicFilters || []}
                  onChange={handleDynamicFiltersChange}
                  onAddFilter={addDynamicFilter}
                />
              </Box>
            </Grid>

            {/* Filter Logic */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 3 }}>
                Search Options
              </Typography>
              <Divider sx={{ mb: 2 }} />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Filter Logic</InputLabel>
                <Select
                  value={currentFilter.operator || 'AND'}
                  onChange={(e) => updateFilter({ operator: e.target.value as 'AND' | 'OR' })}
                >
                  <MenuItem value="AND">Match ALL criteria (AND)</MenuItem>
                  <MenuItem value="OR">Match ANY criteria (OR)</MenuItem>
                </Select>
                <FormHelperText>
                  Determines how multiple filters are combined
                </FormHelperText>
              </FormControl>
            </Grid>
          </Grid>
        </Collapse>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Grid container spacing={3} alignItems="center">
        <Grid item xs={12} md={6}>
          <Autocomplete
            options={savedFilters}
            getOptionLabel={(option) => option.name}
            value={selectedSavedFilter}
            onChange={(_, newValue) => {
              if (newValue) {
                handleApplySavedFilter(newValue);
              }
            }}
            renderInput={(params) => (
              <TextField 
                {...params} 
                label="Saved Filters" 
                variant="outlined"
                size="medium"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1,
                    backgroundColor: 'background.paper'
                  }
                }}
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props}>
                <Stack direction="row" spacing={1} alignItems="center" width="100%">
                  <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 'medium' }}>
                    {option.name}
                  </Typography>
                  {option.isFavorite && (
                    <FavoriteIcon color="error" fontSize="small" />
                  )}
                  <Tooltip title="Delete Filter">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFilter(option.id!);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>
            )}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button
              variant="contained"
              size="large"
              startIcon={<SearchIcon />}
              onClick={onSearch}
              disabled={searching}
              sx={{ 
                px: 3,
                py: 1,
                borderRadius: 1,
                boxShadow: 2
              }}
            >
              {searching ? <CircularProgress size={24} /> : 'Search'}
            </Button>
            <Button
              variant="outlined"
              size="large" 
              startIcon={<SaveIcon />}
              onClick={() => setSaveDialogOpen(true)}
              sx={{ 
                px: 2,
                borderRadius: 1
              }}
            >
              Save
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<ResetIcon />}
              onClick={resetFilter}
              sx={{ 
                px: 2,
                borderRadius: 1
              }}
            >
              Reset
            </Button>
          </Stack>
        </Grid>
      </Grid>

      {/* Save Filter Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>Save Filter</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Filter Name"
            fullWidth
            variant="outlined"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
          />
          <FormControlLabel
            control={
              <Switch
                checked={isFavorite}
                onChange={(e) => setIsFavorite(e.target.checked)}
              />
            }
            label="Add to Favorites"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveFilter} 
            disabled={!filterName.trim() || savingFilter}
            startIcon={savingFilter ? <CircularProgress size={16} /> : null}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default LoanFilterPanel;