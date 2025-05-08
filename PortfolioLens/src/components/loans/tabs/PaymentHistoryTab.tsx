import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Divider,
  Chip,
  CircularProgress,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TablePagination,
  useTheme,
  alpha,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  CalendarToday as CalendarIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useList } from "@refinedev/core";
import { formatCurrency } from '../../../utility/formatters';

// Interface for component props
interface PaymentHistoryTabProps {
  loanId: string;
  payments?: any[];
  isLoading: boolean;
}

/**
 * Status chip component for payment status
 */
const PaymentStatusChip: React.FC<{ status: string }> = ({ status }) => {
  let color: 'success' | 'warning' | 'error' | 'default' | 'info' = 'default';
  
  switch(status?.toLowerCase()) {
    case 'on time':
    case 'posted':
    case 'processed':
      color = 'success';
      break;
    case 'late':
    case 'delayed':
      color = 'warning';
      break;
    case 'missed':
    case 'returned':
    case 'failed':
      color = 'error';
      break;
    case 'pending':
    case 'scheduled':
      color = 'info';
      break;
    default:
      color = 'default';
  }
  
  return (
    <Chip 
      label={status} 
      color={color} 
      size="small" 
      sx={{ fontWeight: 'medium', minWidth: '80px' }}
    />
  );
};

/**
 * Format payment method
 */
const formatPaymentMethod = (method: string): string => {
  switch(method?.toLowerCase()) {
    case 'ach':
      return 'ACH';
    case 'check':
      return 'Check';
    case 'wire':
      return 'Wire Transfer';
    case 'cc':
      return 'Credit Card';
    default:
      return method || 'N/A';
  }
};

/**
 * PaymentHistoryTab component - displays payment history with filters and summary
 */
export const PaymentHistoryTab: React.FC<PaymentHistoryTabProps> = ({
  loanId,
  payments: initialPayments,
  isLoading: initialLoading
}) => {
  const theme = useTheme();
  
  // State variables for pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // State for filters
  const [dateRange, setDateRange] = useState<{
    startDate: Date | null;
    endDate: Date | null;
  }>({ startDate: null, endDate: null });
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Fetch payment history data
  const { data, isLoading } = useList({
    resource: "payments",
    filters: [
      {
        field: "loan_id",
        operator: "eq",
        value: loanId,
      },
    ],
    sorters: [
      {
        field: "transaction_date",
        order: "desc",
      },
    ],
    pagination: {
      current: 1,
      pageSize: 100, // Get all for summary calculations
    },
    queryOptions: {
      enabled: !!loanId && !initialPayments,
    },
  });

  // Combine data from props and fetch
  const payments = initialPayments || data?.data || [];
  const loading = initialLoading || isLoading;

  // Calculate payment summary
  const calculateSummary = () => {
    if (!payments || payments.length === 0) {
      return {
        totalPayments: 0,
        totalAmount: 0,
        onTimeCount: 0,
        lateCount: 0,
        avgPayment: 0,
      };
    }

    const total = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    const onTime = payments.filter(p => 
      p.status?.toLowerCase() === 'on time' || 
      p.status?.toLowerCase() === 'posted'
    ).length;
    const late = payments.filter(p => 
      p.status?.toLowerCase() === 'late' || 
      p.status?.toLowerCase() === 'missed'
    ).length;

    return {
      totalPayments: payments.length,
      totalAmount: total,
      onTimeCount: onTime,
      lateCount: late,
      avgPayment: total / payments.length,
    };
  };

  const summary = calculateSummary();

  // Filter payments based on selected filters
  const filteredPayments = payments.filter(payment => {
    // Filter by status
    if (statusFilter !== 'all' && payment.status?.toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }
    
    // Filter by date range
    if (dateRange.startDate && new Date(payment.transaction_date) < dateRange.startDate) {
      return false;
    }
    if (dateRange.endDate) {
      const endDateWithTime = new Date(dateRange.endDate);
      endDateWithTime.setHours(23, 59, 59, 999);
      if (new Date(payment.transaction_date) > endDateWithTime) {
        return false;
      }
    }
    
    return true;
  });

  // Handle pagination change
  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Handle filter changes
  const handleStatusFilterChange = (event: SelectChangeEvent<string>) => {
    setStatusFilter(event.target.value);
    setPage(0);
  };

  const handleStartDateChange = (date: Date | null) => {
    setDateRange(prev => ({ ...prev, startDate: date }));
    setPage(0);
  };

  const handleEndDateChange = (date: Date | null) => {
    setDateRange(prev => ({ ...prev, endDate: date }));
    setPage(0);
  };

  const handleResetFilters = () => {
    setStatusFilter('all');
    setDateRange({ startDate: null, endDate: null });
    setPage(0);
  };

  // If data is loading, show loading indicator
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  // If no payment history is found
  if (!payments || payments.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No payment history available
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Payment Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Total Payments
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {summary.totalPayments}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                All time
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Total Amount Paid
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {formatCurrency(summary.totalAmount)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <TrendingUpIcon color="success" fontSize="small" sx={{ mr: 0.5 }} />
                <Typography variant="body2" color="success.main">
                  Loan Progress
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Average Payment
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {formatCurrency(summary.avgPayment)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Per transaction
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Payment Performance
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Chip 
                  icon={<TrendingUpIcon />} 
                  label={`${summary.onTimeCount} On Time`} 
                  color="success" 
                  size="small" 
                  sx={{ fontWeight: 'medium' }}
                />
                <Chip 
                  icon={<TrendingDownIcon />} 
                  label={`${summary.lateCount} Late`} 
                  color="error" 
                  size="small" 
                  sx={{ fontWeight: 'medium', ml: 1 }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {summary.totalPayments > 0 
                  ? `${Math.round(summary.onTimeCount / summary.totalPayments * 100)}% on-time rate` 
                  : 'No payments recorded'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <FilterIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" fontWeight="medium">
            Filter Payments
          </Typography>
        </Box>
        
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <DatePicker
              label="From Date"
              value={dateRange.startDate}
              onChange={handleStartDateChange}
              slotProps={{ textField: { fullWidth: true, size: 'small' } }}
            />
          </Grid>
          
          <Grid item xs={12} sm={3}>
            <DatePicker
              label="To Date"
              value={dateRange.endDate}
              onChange={handleEndDateChange}
              slotProps={{ textField: { fullWidth: true, size: 'small' } }}
            />
          </Grid>
          
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="payment-status-filter-label">Payment Status</InputLabel>
              <Select
                labelId="payment-status-filter-label"
                value={statusFilter}
                label="Payment Status"
                onChange={handleStatusFilterChange}
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="on time">On Time</MenuItem>
                <MenuItem value="late">Late</MenuItem>
                <MenuItem value="missed">Missed</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} sm={3} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              onClick={handleResetFilters}
              sx={{ mr: 1 }}
            >
              Reset
            </Button>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
            >
              Export
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Payment History Table */}
      <Paper sx={{ width: '100%', borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 440 }}>
          <Table stickyHeader aria-label="payment history table">
            <TableHead>
              <TableRow>
                <TableCell 
                  sx={{ 
                    fontWeight: 'bold', 
                    backgroundColor: theme.palette.background.default 
                  }}
                >
                  Payment Date
                </TableCell>
                <TableCell 
                  sx={{ 
                    fontWeight: 'bold', 
                    backgroundColor: theme.palette.background.default 
                  }}
                >
                  Status
                </TableCell>
                <TableCell 
                  align="right"
                  sx={{ 
                    fontWeight: 'bold', 
                    backgroundColor: theme.palette.background.default 
                  }}
                >
                  Amount
                </TableCell>
                <TableCell 
                  align="right"
                  sx={{ 
                    fontWeight: 'bold', 
                    backgroundColor: theme.palette.background.default 
                  }}
                >
                  Principal
                </TableCell>
                <TableCell 
                  align="right"
                  sx={{ 
                    fontWeight: 'bold', 
                    backgroundColor: theme.palette.background.default 
                  }}
                >
                  Interest
                </TableCell>
                <TableCell 
                  align="right"
                  sx={{ 
                    fontWeight: 'bold', 
                    backgroundColor: theme.palette.background.default 
                  }}
                >
                  Escrow
                </TableCell>
                <TableCell 
                  sx={{ 
                    fontWeight: 'bold', 
                    backgroundColor: theme.palette.background.default 
                  }}
                >
                  Method
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredPayments
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((payment, index) => {
                  // Determine row background for alternating rows
                  const isEven = index % 2 === 0;
                  
                  return (
                    <TableRow
                      hover
                      key={payment.id || index}
                      sx={{ 
                        '&:last-child td, &:last-child th': { border: 0 },
                        backgroundColor: isEven ? 'inherit' : alpha(theme.palette.primary.light, 0.05)
                      }}
                    >
                      <TableCell>
                        {payment.transaction_date
                          ? new Date(payment.transaction_date).toLocaleDateString()
                          : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <PaymentStatusChip status={payment.status || 'Unknown'} />
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight="medium">
                          {formatCurrency(payment.amount)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(payment.principal_amount)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(payment.interest_amount)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(payment.escrow_amount)}
                      </TableCell>
                      <TableCell>
                        {formatPaymentMethod(payment.payment_method)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              
              {filteredPayments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <Typography variant="body1" color="text.secondary">
                      No payment records match your filters
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={filteredPayments.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
    </Box>
  );
};

export default PaymentHistoryTab;