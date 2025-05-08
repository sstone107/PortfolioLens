import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tabs,
  Tab,
  Chip,
  Divider,
  CircularProgress,
  Avatar,
  Button,
  IconButton,
  Tooltip,
  Alert,
  TextField,
  InputAdornment,
  MenuItem,
  Menu,
  FormControlLabel,
  Checkbox,
  useTheme,
  alpha,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent
} from '@mui/lab';
import {
  Payment as PaymentIcon,
  SwapHoriz as ChangeIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Calendar as CalendarIcon,
  ErrorOutline as ErrorIcon,
  CheckCircle as SuccessIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  ExpandMore as ExpandMoreIcon,
  MoreVert as MoreVertIcon,
  PictureAsPdf as PdfIcon,
  GetApp as DownloadIcon,
  Receipt as ReceiptIcon,
  History as HistoryIcon,
  Close as CloseIcon,
  FilterAlt as FilterAltIcon,
  FilterAltOff as FilterAltOffIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import loanHistoryService, { TimelineEntry, TimelineFilter } from '../../services/loanHistoryService';
import { formatCurrency } from '../../utility/formatters';

interface LoanHistoryTimelineProps {
  loanId: string;
  defaultTab?: number;
}

interface TimelinePeriod {
  label: string;
  value: string;
  days: number;
}

const periods: TimelinePeriod[] = [
  { label: 'Last 30 Days', value: '30d', days: 30 },
  { label: '3 Months', value: '3m', days: 90 },
  { label: '6 Months', value: '6m', days: 180 },
  { label: '1 Year', value: '1y', days: 365 },
  { label: 'All History', value: 'all', days: 0 }
];

/**
 * LoanHistoryTimeline Component - Displays unified timeline of loan history
 */
export const LoanHistoryTimeline: React.FC<LoanHistoryTimelineProps> = ({
  loanId,
  defaultTab = 0
}) => {
  const theme = useTheme();
  const [tabValue, setTabValue] = useState(defaultTab);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TimelineFilter>({
    includePayments: true,
    includeChanges: true,
    searchTerm: ''
  });
  const [selectedPeriod, setSelectedPeriod] = useState<TimelinePeriod>(periods[2]); // Default to 6 months
  const [filterMenuAnchorEl, setFilterMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);
  const [summaryStat, setSummaryStat] = useState<any>(null);
  
  // Fetch timeline data on mount and when filters change
  useEffect(() => {
    const fetchTimelineData = async () => {
      setIsLoading(true);
      
      try {
        // Calculate date range based on selected period
        let startDate = null;
        if (selectedPeriod.days > 0) {
          const now = new Date();
          startDate = new Date(now);
          startDate.setDate(now.getDate() - selectedPeriod.days);
        }
        
        const { data, error } = await loanHistoryService.getLoanTimeline(
          loanId,
          {
            ...filter,
            startDate: startDate ? startDate.toISOString() : undefined
          }
        );
        
        if (error) {
          console.error("Error fetching loan timeline:", error);
          setError("Failed to load timeline data");
        } else {
          setTimelineEntries(data || []);
          setError(null);
        }
      } catch (err) {
        console.error("Exception in fetchTimelineData:", err);
        setError("An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTimelineData();
    
    // Also fetch summary statistics
    const fetchSummaryStats = async () => {
      try {
        const { data } = await loanHistoryService.getHistorySummary(
          loanId, 
          selectedPeriod.value as any
        );
        
        if (data) {
          setSummaryStat(data);
        }
      } catch (err) {
        console.error("Error fetching summary stats:", err);
      }
    };
    
    fetchSummaryStats();
  }, [loanId, filter, selectedPeriod]);
  
  // Handle tab change
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    
    // Update filter based on tab
    if (newValue === 0) { // All
      setFilter(prev => ({
        ...prev,
        includePayments: true,
        includeChanges: true
      }));
    } else if (newValue === 1) { // Payments
      setFilter(prev => ({
        ...prev,
        includePayments: true,
        includeChanges: false
      }));
    } else if (newValue === 2) { // Changes
      setFilter(prev => ({
        ...prev,
        includePayments: false,
        includeChanges: true
      }));
    }
  };
  
  // Handle period change
  const handlePeriodChange = (period: TimelinePeriod) => {
    setSelectedPeriod(period);
  };
  
  // Handle search input change
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(prev => ({
      ...prev,
      searchTerm: event.target.value
    }));
  };
  
  // Handle filter menu open
  const handleFilterMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setFilterMenuAnchorEl(event.currentTarget);
  };
  
  // Handle filter menu close
  const handleFilterMenuClose = () => {
    setFilterMenuAnchorEl(null);
  };
  
  // Handle entry click to show details
  const handleEntryClick = (entry: TimelineEntry) => {
    setSelectedEntry(entry);
    setDetailDialogOpen(true);
  };
  
  // Handle detail dialog close
  const handleDetailDialogClose = () => {
    setDetailDialogOpen(false);
    setSelectedEntry(null);
  };
  
  // Helper to format dates in a consistent way
  const formatDateTime = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
    } catch (e) {
      return dateString;
    }
  };
  
  // Helper to get relative time (e.g., "2 days ago")
  const getRelativeTime = (dateString: string) => {
    try {
      return formatDistanceToNow(parseISO(dateString), { addSuffix: true });
    } catch (e) {
      return '';
    }
  };
  
  // Get the icon for a timeline entry
  const getEntryIcon = (entry: TimelineEntry) => {
    if (entry.entry_type === 'payment') {
      if (entry.entry_details?.status?.toLowerCase()?.includes('late')) {
        return <WarningIcon />;
      } else if (entry.entry_details?.status?.toLowerCase()?.includes('miss')) {
        return <ErrorIcon />;
      } else {
        return <PaymentIcon />;
      }
    } else {
      return <ChangeIcon />;
    }
  };
  
  // Get the color for a timeline entry
  const getEntryColor = (entry: TimelineEntry) => {
    if (entry.entry_type === 'payment') {
      if (entry.entry_details?.status?.toLowerCase()?.includes('late')) {
        return 'warning';
      } else if (entry.entry_details?.status?.toLowerCase()?.includes('miss')) {
        return 'error';
      } else {
        return 'success';
      }
    } else {
      return 'info';
    }
  };
  
  // Render payment details
  const renderPaymentDetails = (details: any) => {
    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">Total Amount:</Typography>
          <Typography variant="subtitle1" fontWeight="bold">
            {formatCurrency(details.amount)}
          </Typography>
        </Box>
        
        <Divider sx={{ my: 1 }} />
        
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Principal</Typography>
            <Typography variant="body2">{formatCurrency(details.principal)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Interest</Typography>
            <Typography variant="body2">{formatCurrency(details.interest)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Escrow</Typography>
            <Typography variant="body2">{formatCurrency(details.escrow)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Late Charges</Typography>
            <Typography variant="body2">{formatCurrency(details.late_charges)}</Typography>
          </Box>
        </Box>
        
        <Divider sx={{ my: 1 }} />
        
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">Due Date</Typography>
          <Typography variant="body2">
            {details.due_date ? format(new Date(details.due_date), 'MMM d, yyyy') : 'N/A'}
          </Typography>
        </Box>
        
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">Payment Method</Typography>
          <Typography variant="body2">{details.payment_method || 'N/A'}</Typography>
        </Box>
        
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">Status</Typography>
          <Chip 
            size="small" 
            label={details.status || 'Unknown'} 
            color={
              details.status?.toLowerCase()?.includes('late') ? 'warning' :
              details.status?.toLowerCase()?.includes('miss') ? 'error' :
              'success'
            }
            sx={{ ml: 1 }}
          />
        </Box>
        
        {details.days_late !== undefined && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">Days Late</Typography>
            <Typography variant="body2">
              {details.days_late > 0 
                ? `${details.days_late} days late` 
                : details.days_late < 0 
                  ? `${Math.abs(details.days_late)} days early` 
                  : 'On time'}
            </Typography>
          </Box>
        )}
        
        {details.description && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">Notes</Typography>
            <Typography variant="body2">{details.description}</Typography>
          </Box>
        )}
      </Box>
    );
  };
  
  // Render change details
  const renderChangeDetails = (details: any) => {
    return (
      <Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">Field Changed:</Typography>
          <Typography variant="body1" fontWeight="medium">{details.field_name}</Typography>
        </Box>
        
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2, mb: 2 }}>
          <Box sx={{ p: 1, bgcolor: alpha(theme.palette.error.main, 0.1), borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">Old Value</Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
              {details.old_value || '(empty)'}
            </Typography>
          </Box>
          <Box sx={{ p: 1, bgcolor: alpha(theme.palette.success.main, 0.1), borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">New Value</Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
              {details.new_value || '(empty)'}
            </Typography>
          </Box>
        </Box>
        
        <Divider sx={{ my: 1 }} />
        
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">Change Type</Typography>
          <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
            {details.change_type || 'Update'}
          </Typography>
        </Box>
        
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">Source</Typography>
          <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
            {details.change_source || 'System'}
          </Typography>
        </Box>
        
        {details.change_reason && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">Reason</Typography>
            <Typography variant="body2">{details.change_reason}</Typography>
          </Box>
        )}
      </Box>
    );
  };
  
  // Render the summary section
  const renderSummary = () => {
    if (!summaryStat) return null;
    
    return (
      <Box sx={{ mb: 3, mt: 1 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <StatCard 
              title="Payment Stats" 
              icon={<ReceiptIcon color="primary" />}
              stats={[
                { label: 'Total Payments', value: summaryStat.paymentStats.totalPayments.toString() },
                { label: 'On-Time Payments', value: summaryStat.paymentStats.onTimePayments.toString() },
                { label: 'Late Payments', value: summaryStat.paymentStats.latePayments.toString() },
                { label: 'Total Amount', value: formatCurrency(summaryStat.paymentStats.totalAmount) }
              ]}
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <StatCard 
              title="Change Stats" 
              icon={<HistoryIcon color="info" />}
              stats={[
                { label: 'Total Changes', value: summaryStat.changeEvents.toString() },
                { label: 'Most Changed Field', value: getTopChangedField() }
              ]}
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <StatCard 
              title="Timeline Overview" 
              icon={<TimelineIcon color="secondary" />}
              stats={[
                { label: 'Total Events', value: summaryStat.totalEvents.toString() },
                { label: 'Last Updated', value: summaryStat.lastUpdated ? 
                  format(new Date(summaryStat.lastUpdated), 'MMM d, yyyy') : 'Never' }
              ]}
            />
          </Grid>
        </Grid>
      </Box>
    );
  };
  
  // Helper to get the most frequently changed field
  const getTopChangedField = () => {
    if (!summaryStat || !summaryStat.changeStats.fieldChanges) return 'None';
    
    const fieldChanges = summaryStat.changeStats.fieldChanges;
    let topField = 'None';
    let maxCount = 0;
    
    Object.entries(fieldChanges).forEach(([field, count]) => {
      if (Number(count) > maxCount) {
        maxCount = Number(count);
        topField = field;
      }
    });
    
    return topField;
  };
  
  // If data is loading, show loading indicator
  if (isLoading && timelineEntries.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Paper sx={{ p: 2, borderRadius: 2 }} elevation={2}>
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: 2,
        flexWrap: 'wrap',
        gap: 1
      }}>
        <Typography variant="h6" fontWeight="medium" sx={{ display: 'flex', alignItems: 'center' }}>
          <TimelineIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
          Loan History Timeline
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {/* Search Box */}
          <TextField
            size="small"
            placeholder="Search timeline..."
            variant="outlined"
            value={filter.searchTerm}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: filter.searchTerm && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setFilter(prev => ({ ...prev, searchTerm: '' }))}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              )
            }}
            sx={{ 
              width: { xs: '100%', sm: 200 },
              '& .MuiOutlinedInput-root': {
                borderRadius: 2
              }
            }}
          />
          
          {/* Time Period Selector */}
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            {periods.map((period) => (
              <Chip
                key={period.value}
                label={period.label}
                onClick={() => handlePeriodChange(period)}
                color={selectedPeriod.value === period.value ? 'primary' : 'default'}
                sx={{ mr: 0.5 }}
              />
            ))}
          </Box>
          
          {/* Mobile Period Selector */}
          <IconButton 
            size="small"
            onClick={handleFilterMenuOpen}
            sx={{ display: { xs: 'flex', md: 'none' } }}
          >
            <FilterIcon />
          </IconButton>
        </Box>
      </Box>
      
      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {/* Stats Summary Section */}
      {renderSummary()}
      
      {/* Tabs */}
      <Tabs
        value={tabValue}
        onChange={handleTabChange}
        aria-label="timeline tabs"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="All History" icon={<HistoryIcon />} iconPosition="start" />
        <Tab label="Payments" icon={<PaymentIcon />} iconPosition="start" />
        <Tab label="Changes" icon={<ChangeIcon />} iconPosition="start" />
      </Tabs>
      
      {/* Timeline */}
      {timelineEntries.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary">
            No history events found in the selected time period.
          </Typography>
        </Box>
      ) : (
        <Timeline position="right" sx={{ p: 0 }}>
          {timelineEntries.map((entry) => (
            <TimelineItem key={entry.entry_id}>
              <TimelineOppositeContent sx={{ m: 'auto 0', maxWidth: 250 }}>
                <Typography variant="body2" color="text.secondary">
                  {formatDateTime(entry.entry_date)}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  {getRelativeTime(entry.entry_date)}
                </Typography>
              </TimelineOppositeContent>
              
              <TimelineSeparator>
                <TimelineConnector />
                <TimelineDot color={getEntryColor(entry) as any}>
                  {getEntryIcon(entry)}
                </TimelineDot>
                <TimelineConnector />
              </TimelineSeparator>
              
              <TimelineContent sx={{ py: 1, px: 2 }}>
                <Paper
                  elevation={1}
                  sx={{ 
                    p: 2, 
                    cursor: 'pointer',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.05)
                    }
                  }}
                  onClick={() => handleEntryClick(entry)}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography variant="subtitle1" fontWeight="medium">
                      {entry.entry_title}
                    </Typography>
                    <Chip
                      size="small"
                      label={entry.entry_type === 'payment' ? 'Payment' : 'Change'}
                      color={entry.entry_type === 'payment' ? 'success' : 'info'}
                    />
                  </Box>
                  
                  {entry.entry_type === 'payment' && (
                    <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        {entry.entry_details?.status || 'Regular Payment'}
                      </Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {formatCurrency(entry.entry_details?.amount || 0)}
                      </Typography>
                    </Box>
                  )}
                  
                  {entry.entry_type === 'change' && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        {`${entry.entry_details?.field_name || 'Field'}: `}
                        <Typography 
                          component="span" 
                          variant="body2" 
                          sx={{ 
                            textDecoration: 'line-through',
                            color: 'error.main',
                            mr: 0.5
                          }}
                        >
                          {entry.entry_details?.old_value?.substring(0, 25) || '(empty)'}
                          {entry.entry_details?.old_value?.length > 25 ? '...' : ''}
                        </Typography>
                        →
                        <Typography 
                          component="span" 
                          variant="body2" 
                          sx={{ 
                            fontWeight: 'medium',
                            color: 'success.main',
                            ml: 0.5
                          }}
                        >
                          {entry.entry_details?.new_value?.substring(0, 25) || '(empty)'}
                          {entry.entry_details?.new_value?.length > 25 ? '...' : ''}
                        </Typography>
                      </Typography>
                    </Box>
                  )}
                  
                  {/* Entry Creator */}
                  <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
                    <Avatar
                      alt={entry.user_name || 'User'}
                      src={entry.user_avatar}
                      sx={{ width: 24, height: 24, mr: 1 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {entry.user_name || 'System'}
                    </Typography>
                  </Box>
                </Paper>
              </TimelineContent>
            </TimelineItem>
          ))}
        </Timeline>
      )}
      
      {/* Filter Menu (for mobile) */}
      <Menu
        anchorEl={filterMenuAnchorEl}
        open={Boolean(filterMenuAnchorEl)}
        onClose={handleFilterMenuClose}
      >
        <MenuItem disabled>
          <Typography variant="subtitle2">Select Time Period</Typography>
        </MenuItem>
        <Divider />
        
        {periods.map((period) => (
          <MenuItem 
            key={period.value}
            selected={selectedPeriod.value === period.value}
            onClick={() => {
              handlePeriodChange(period);
              handleFilterMenuClose();
            }}
          >
            {period.label}
          </MenuItem>
        ))}
        
        <Divider />
        
        <MenuItem>
          <FormControlLabel
            control={
              <Checkbox 
                checked={filter.includePayments} 
                onChange={(e) => setFilter(prev => ({ ...prev, includePayments: e.target.checked }))}
              />
            }
            label="Show Payments"
          />
        </MenuItem>
        
        <MenuItem>
          <FormControlLabel
            control={
              <Checkbox 
                checked={filter.includeChanges} 
                onChange={(e) => setFilter(prev => ({ ...prev, includeChanges: e.target.checked }))}
              />
            }
            label="Show Changes"
          />
        </MenuItem>
      </Menu>
      
      {/* Detail Dialog */}
      <Dialog
        open={detailDialogOpen}
        onClose={handleDetailDialogClose}
        maxWidth="sm"
        fullWidth
      >
        {selectedEntry && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <TimelineDot color={getEntryColor(selectedEntry) as any} sx={{ mr: 1 }}>
                  {getEntryIcon(selectedEntry)}
                </TimelineDot>
                <Typography variant="h6">{selectedEntry.entry_title}</Typography>
              </Box>
            </DialogTitle>
            
            <DialogContent dividers>
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary">Date & Time</Typography>
                <Typography variant="body1">{formatDateTime(selectedEntry.entry_date)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  ({getRelativeTime(selectedEntry.entry_date)})
                </Typography>
              </Box>
              
              <Divider sx={{ my: 2 }} />
              
              {/* Entry Details */}
              {selectedEntry.entry_type === 'payment' ? (
                renderPaymentDetails(selectedEntry.entry_details)
              ) : (
                renderChangeDetails(selectedEntry.entry_details)
              )}
              
              <Divider sx={{ my: 2 }} />
              
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar
                  alt={selectedEntry.user_name || 'User'}
                  src={selectedEntry.user_avatar}
                  sx={{ width: 32, height: 32, mr: 1 }}
                />
                <Box>
                  <Typography variant="body2" fontWeight="medium">
                    {selectedEntry.user_name || 'System'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDateTime(selectedEntry.created_at)}
                  </Typography>
                </Box>
              </Box>
            </DialogContent>
            
            <DialogActions>
              {selectedEntry.entry_type === 'payment' && (
                <Button 
                  startIcon={<PdfIcon />}
                  variant="outlined"
                  color="primary"
                >
                  Generate Receipt
                </Button>
              )}
              
              <Button onClick={handleDetailDialogClose}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Paper>
  );
};

// Helper Components

// Simple grid container and item
const Grid = {
  container: ({ children, spacing = 2, ...props }: any) => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', mx: -spacing / 2, ...props.sx }}>
      {children}
    </Box>
  ),
  item: ({ children, xs = 12, md, ...props }: any) => (
    <Box 
      sx={{ 
        px: 1, 
        width: {
          xs: xs === 12 ? '100%' : `${(xs / 12) * 100}%`,
          md: md ? `${(md / 12) * 100}%` : undefined
        },
        ...props.sx
      }}
    >
      {children}
    </Box>
  )
};

// Timeline icon
const TimelineIcon = () => {
  return <HistoryIcon />;
};

// Stat card component
interface StatCardProps {
  title: string;
  icon: React.ReactNode;
  stats: { label: string; value: string }[];
}

const StatCard: React.FC<StatCardProps> = ({ title, icon, stats }) => {
  const theme = useTheme();
  
  return (
    <Paper 
      elevation={1} 
      sx={{ 
        p: 2, 
        height: '100%',
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ mr: 1 }}>{icon}</Box>
        <Typography variant="subtitle1" fontWeight="medium">{title}</Typography>
      </Box>
      
      <Stack spacing={1.5}>
        {stats.map((stat, index) => (
          <Box key={index}>
            <Typography variant="caption" color="text.secondary">
              {stat.label}
            </Typography>
            <Typography variant="body1" fontWeight="medium">
              {stat.value}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
};

export default LoanHistoryTimeline;