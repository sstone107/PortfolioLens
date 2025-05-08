import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  useTheme,
  alpha,
  CircularProgress,
  IconButton,
  Zoom
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Cancel as CancelIcon,
  Info as InfoIcon,
  Download as DownloadIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import { formatCurrency, formatDate } from '../../utility/formatters';
import { Payment } from '../../services/paymentService';

interface PaymentTimelineProps {
  payments: Payment[];
  isLoading: boolean;
  loanId: string;
  onExportVOM?: () => void;
  onViewDetails?: (paymentId: string) => void;
}

/**
 * Payment Timeline Component - Displays an interactive timeline of payments
 */
export const PaymentTimeline: React.FC<PaymentTimelineProps> = ({
  payments,
  isLoading,
  loanId,
  onExportVOM,
  onViewDetails
}) => {
  const theme = useTheme();
  const [timelineMonths, setTimelineMonths] = useState<number>(12);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  
  // Filter payments to only show the selected range
  const filteredPayments = useMemo(() => {
    if (!payments || payments.length === 0) return [];
    
    return payments
      .slice(0, timelineMonths)
      .sort((a, b) => new Date(a.due_date || a.transaction_date).getTime() - 
                       new Date(b.due_date || b.transaction_date).getTime());
  }, [payments, timelineMonths]);
  
  // Handle timeline range change
  const handleTimelineRangeChange = (
    event: React.MouseEvent<HTMLElement>,
    newValue: number | null,
  ) => {
    if (newValue !== null) {
      setTimelineMonths(newValue);
    }
  };
  
  // Get color for a payment based on days late
  const getPaymentColor = (payment: Payment) => {
    // Default settings if days_late is not available
    if (payment.days_late === undefined) {
      if (payment.status?.toLowerCase() === 'on time' || 
          payment.status?.toLowerCase() === 'posted') {
        return theme.palette.success.main;
      } else if (payment.status?.toLowerCase() === 'late') {
        return theme.palette.warning.main;
      } else if (payment.status?.toLowerCase() === 'missed') {
        return theme.palette.error.main;
      } else {
        return theme.palette.grey[500];
      }
    }
    
    // Color by days late
    const daysLate = payment.days_late;
    
    if (daysLate <= 0) {
      // On time or early payment
      return theme.palette.success.main;
    } else if (daysLate > 0 && daysLate <= 14) {
      // Paid within 14 days of due date
      return theme.palette.success.light;
    } else if (daysLate > 14 && daysLate <= 30) {
      // Paid within same month (15-30 days late)
      return theme.palette.warning.main;
    } else {
      // Paid after month end (30+ days late)
      return theme.palette.error.main;
    }
  };
  
  // Get status icon for a payment
  const getPaymentStatusIcon = (payment: Payment) => {
    // Default settings if days_late is not available
    if (payment.days_late === undefined) {
      if (payment.status?.toLowerCase() === 'on time' ||
          payment.status?.toLowerCase() === 'posted') {
        return <CheckCircleIcon color="success" fontSize="small" />;
      } else if (payment.status?.toLowerCase() === 'late') {
        return <WarningIcon color="warning" fontSize="small" />;
      } else if (payment.status?.toLowerCase() === 'missed') {
        return <CancelIcon color="error" fontSize="small" />;
      } else {
        return <InfoIcon color="disabled" fontSize="small" />;
      }
    }
    
    // Icon by days late
    const daysLate = payment.days_late;
    
    if (daysLate <= 0) {
      return <CheckCircleIcon color="success" fontSize="small" />;
    } else if (daysLate > 0 && daysLate <= 14) {
      return <CheckCircleIcon sx={{ color: theme.palette.success.light }} fontSize="small" />;
    } else if (daysLate > 14 && daysLate <= 30) {
      return <WarningIcon color="warning" fontSize="small" />;
    } else {
      return <CancelIcon color="error" fontSize="small" />;
    }
  };
  
  // Get payment status text
  const getPaymentStatusText = (payment: Payment) => {
    // Default settings if days_late is not available
    if (payment.days_late === undefined) {
      return payment.status || 'Unknown';
    }
    
    // Status by days late
    const daysLate = payment.days_late;
    
    if (daysLate < 0) {
      return `Early (${Math.abs(daysLate)} days)`;
    } else if (daysLate === 0) {
      return 'On Time';
    } else if (daysLate > 0 && daysLate <= 14) {
      return `Late (${daysLate} days)`;
    } else if (daysLate > 14 && daysLate <= 30) {
      return `Late (${daysLate} days)`;
    } else {
      return `Severely Late (${daysLate} days)`;
    }
  };
  
  // If data is loading, show loading indicator
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  // If no payment data is available
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
    <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }} elevation={2}>
      {/* Timeline Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight="medium" sx={{ display: 'flex', alignItems: 'center' }}>
          <CalendarIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
          Payment Timeline
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {/* Toggle for 12/24 month view */}
          <ToggleButtonGroup
            value={timelineMonths}
            exclusive
            onChange={handleTimelineRangeChange}
            size="small"
            aria-label="timeline range"
            sx={{ mr: 2 }}
          >
            <ToggleButton value={12} aria-label="12 months">
              12 Months
            </ToggleButton>
            <ToggleButton value={24} aria-label="24 months">
              24 Months
            </ToggleButton>
          </ToggleButtonGroup>
          
          {/* Export VOM button */}
          {onExportVOM && (
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              size="small"
              onClick={onExportVOM}
            >
              Download VOM
            </Button>
          )}
        </Box>
      </Box>
      
      {/* Timeline Legend */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ mr: 3 }}>
          <Box component="span" sx={{ 
            display: 'inline-block', 
            width: 12, 
            height: 12, 
            borderRadius: '50%', 
            backgroundColor: theme.palette.success.main,
            mr: 1
          }} />
          On Time
        </Typography>
        
        <Typography variant="body2" sx={{ mr: 3 }}>
          <Box component="span" sx={{ 
            display: 'inline-block', 
            width: 12, 
            height: 12, 
            borderRadius: '50%', 
            backgroundColor: theme.palette.success.light,
            mr: 1
          }} />
          &lt;14 Days Late
        </Typography>
        
        <Typography variant="body2" sx={{ mr: 3 }}>
          <Box component="span" sx={{ 
            display: 'inline-block', 
            width: 12, 
            height: 12, 
            borderRadius: '50%', 
            backgroundColor: theme.palette.warning.main,
            mr: 1
          }} />
          14-30 Days Late
        </Typography>
        
        <Typography variant="body2">
          <Box component="span" sx={{ 
            display: 'inline-block', 
            width: 12, 
            height: 12, 
            borderRadius: '50%', 
            backgroundColor: theme.palette.error.main,
            mr: 1
          }} />
          &gt;30 Days Late
        </Typography>
      </Box>
      
      {/* Timeline Container */}
      <Box sx={{ 
        position: 'relative', 
        pt: 1, 
        pb: 6,
        overflowX: 'auto',
        '&::-webkit-scrollbar': {
          height: 8,
        },
        '&::-webkit-scrollbar-track': {
          backgroundColor: alpha(theme.palette.primary.main, 0.1),
          borderRadius: 4,
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: alpha(theme.palette.primary.main, 0.2),
          borderRadius: 4,
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.3),
          }
        }
      }}>
        {/* Timeline Line */}
        <Box sx={{ 
          position: 'absolute',
          top: '38px', 
          left: 0, 
          right: 0, 
          height: '2px', 
          backgroundColor: alpha(theme.palette.primary.main, 0.2),
          zIndex: 0
        }} />
        
        {/* Timeline Markers */}
        <Box sx={{ 
          display: 'flex', 
          minWidth: filteredPayments.length * 90,
          position: 'relative'
        }}>
          {filteredPayments.map((payment, index) => {
            const paymentColor = getPaymentColor(payment);
            const isSelected = selectedPayment === payment.id;
            
            return (
              <Box 
                key={payment.id || index} 
                sx={{ 
                  flex: '0 0 auto',
                  width: 90,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                }}
              >
                {/* Date label */}
                <Typography 
                  variant="caption" 
                  sx={{ 
                    mb: 1, 
                    fontWeight: isSelected ? 'bold' : 'normal',
                    color: isSelected ? 'primary.main' : 'text.secondary'
                  }}
                >
                  {formatDate(payment.due_date || payment.transaction_date, 'MM/DD/YY')}
                </Typography>
                
                {/* Timeline marker (clickable dot) */}
                <Tooltip
                  title={
                    <Box sx={{ p: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                        {formatDate(payment.due_date || payment.transaction_date)}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Due Date:
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'medium' }}>
                          {formatDate(payment.due_date || payment.transaction_date)}
                        </Typography>
                      </Box>
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Paid Date:
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'medium' }}>
                          {formatDate(payment.transaction_date)}
                        </Typography>
                      </Box>
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Status:
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'medium' }}>
                          {getPaymentStatusText(payment)}
                        </Typography>
                      </Box>
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Amount:
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'medium' }}>
                          {formatCurrency(payment.amount)}
                        </Typography>
                      </Box>
                      
                      {payment.payment_method && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Method:
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 'medium' }}>
                            {payment.payment_method}
                          </Typography>
                        </Box>
                      )}
                      
                      {onViewDetails && (
                        <Button
                          size="small"
                          onClick={() => onViewDetails(payment.id)}
                          startIcon={<OpenInNewIcon fontSize="small" />}
                          sx={{ mt: 1, width: '100%' }}
                        >
                          View Details
                        </Button>
                      )}
                    </Box>
                  }
                  arrow
                  TransitionComponent={Zoom}
                  enterDelay={100}
                  leaveDelay={200}
                  placement="top"
                >
                  <Box
                    onClick={() => setSelectedPayment(prevId => 
                      prevId === payment.id ? null : payment.id
                    )}
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      backgroundColor: paymentColor,
                      cursor: 'pointer',
                      border: isSelected ? `2px solid ${theme.palette.primary.main}` : 'none',
                      boxShadow: isSelected ? `0 0 0 2px ${alpha(theme.palette.primary.main, 0.3)}` : 'none',
                      transition: 'all 0.2s ease-in-out',
                      zIndex: 1,
                      transform: isSelected ? 'scale(1.3)' : 'scale(1)',
                      '&:hover': {
                        transform: 'scale(1.3)',
                        boxShadow: `0 0 0 2px ${alpha(paymentColor, 0.3)}`
                      }
                    }}
                  />
                </Tooltip>
                
                {/* Status indicator below the dot */}
                <Box sx={{ mt: 0.5 }}>
                  {getPaymentStatusIcon(payment)}
                </Box>
                
                {/* Amount label */}
                <Typography 
                  variant="caption" 
                  sx={{ 
                    mt: 0.5, 
                    fontWeight: isSelected ? 'bold' : 'normal',
                    color: isSelected ? 'primary.main' : 'text.primary'
                  }}
                >
                  {formatCurrency(payment.amount, 'USD', 0)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Paper>
  );
};

export default PaymentTimeline;