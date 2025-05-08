import React from 'react';
import { 
  Box, 
  Grid, 
  Typography, 
  Paper, 
  Chip, 
  Tooltip,
  Card,
  CardContent,
  Divider,
  Stack
} from '@mui/material';
import { 
  AccountBalance as BankIcon,
  AttachMoney as MoneyIcon,
  CalendarToday as CalendarIcon,
  BusinessCenter as InvestorIcon,
  Home as PropertyIcon
} from '@mui/icons-material';
import { formatCurrency, formatPercent } from '../../../utility/formatters';

// Type for source attribution
type DataSource = 'valon' | 'internal' | 'manual' | 'imported' | 'calculated';

// Interface for the props
interface LoanSummaryTabProps {
  loan: any;
}

/**
 * Field component with source attribution
 */
const AttributedField: React.FC<{
  label: string;
  value: React.ReactNode;
  source?: DataSource;
  icon?: React.ReactNode;
}> = ({ label, value, source, icon }) => {
  // Get source color and label
  const getSourceInfo = (source?: DataSource) => {
    switch(source) {
      case 'valon':
        return { color: 'primary', label: 'Valon' };
      case 'internal':
        return { color: 'secondary', label: 'System' };
      case 'manual':
        return { color: 'warning', label: 'Manually Edited' };
      case 'imported':
        return { color: 'info', label: 'Imported' };
      case 'calculated':
        return { color: 'success', label: 'Calculated' };
      default:
        return { color: 'default', label: 'Unknown' };
    }
  };

  const sourceInfo = getSourceInfo(source);

  return (
    <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        {icon && <Box sx={{ mr: 1, color: 'text.secondary' }}>{icon}</Box>}
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        
        {source && (
          <Tooltip title={`Source: ${sourceInfo.label}`} placement="top">
            <Chip
              label={sourceInfo.label}
              color={sourceInfo.color as any}
              size="small"
              sx={{ ml: 1, height: 20, '& .MuiChip-label': { px: 1, fontSize: '0.625rem' } }}
            />
          </Tooltip>
        )}
      </Box>
      <Typography variant="body1" fontWeight="medium">
        {value || 'N/A'}
      </Typography>
    </Box>
  );
};

// Status chip component
const StatusChip: React.FC<{ status: string, type?: 'loan' | 'delinquency' }> = ({ status, type = 'loan' }) => {
  let color: 'success' | 'warning' | 'error' | 'default' | 'info' = 'default';
  
  if (type === 'loan') {
    // Loan status colors
    switch(status?.toLowerCase()) {
      case 'current':
      case 'active':
      case 'performing':
        color = 'success';
        break;
      case 'delinquent':
      case 'late':
        color = 'warning';
        break;
      case 'default':
      case 'foreclosure':
      case 'bankruptcy':
        color = 'error';
        break;
      case 'paid off':
      case 'matured':
        color = 'info';
        break;
      default:
        color = 'default';
    }
  } else {
    // Delinquency status colors  
    if (status?.toLowerCase().includes('current')) {
      color = 'success';
    } else if (status?.toLowerCase().includes('30')) {
      color = 'warning';
    } else if (status?.toLowerCase().includes('60') || status?.toLowerCase().includes('90')) {
      color = 'error';
    }
  }
  
  return (
    <Chip 
      label={status || 'Unknown'} 
      color={color} 
      size="medium" 
      sx={{ fontWeight: 'medium', minWidth: '80px' }}
    />
  );
};

/**
 * LoanSummaryTab component - displays key loan information with source attribution
 */
export const LoanSummaryTab: React.FC<LoanSummaryTabProps> = ({ loan }) => {
  if (!loan) {
    return <Typography>No loan data available</Typography>;
  }

  return (
    <Box>
      {/* Status Summary Card */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 2, 
          mb: 3, 
          backgroundColor: 'background.default',
          borderRadius: 2
        }}
      >
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Loan Status
              </Typography>
              <StatusChip status={loan.loan_status} type="loan" />
            </Box>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Delinquency Status
              </Typography>
              <StatusChip status={loan.delinquency_status} type="delinquency" />
            </Box>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Days Past Due
              </Typography>
              <Typography variant="h6" fontWeight="bold">
                {loan.days_past_due || '0'} days
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Loan Summary Details */}
      <Grid container spacing={3}>
        {/* Loan Information */}
        <Grid item xs={12} md={6}>
          <Card elevation={1} sx={{ height: '100%', borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <BankIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" fontWeight="bold">
                  Loan Information
                </Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Loan Number" 
                    value={loan.loan_number}
                    source="internal" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Investor Loan Number" 
                    value={loan.investor_loan_number}
                    source="imported" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Lien Position" 
                    value={loan.lien_position || 'N/A'}
                    source="imported" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Loan Term" 
                    value={loan.loan_term ? `${loan.loan_term} months` : 'N/A'} 
                    source="imported"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Loan Type" 
                    value={loan.loan_type || 'N/A'}
                    source="imported" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Amortization Type" 
                    value={loan.amortization_type || 'N/A'}
                    source="imported" 
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Financial Details */}
        <Grid item xs={12} md={6}>
          <Card elevation={1} sx={{ height: '100%', borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <MoneyIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" fontWeight="bold">
                  Financial Details
                </Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Current UPB" 
                    value={formatCurrency(loan.upb || loan.current_upb)}
                    source="valon" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Original Loan Amount" 
                    value={formatCurrency(loan.original_loan_amount)}
                    source="imported" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Note Rate" 
                    value={formatPercent(loan.note_rate || loan.current_interest_rate)}
                    source="valon" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Original Rate" 
                    value={formatPercent(loan.original_interest_rate)}
                    source="imported" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Monthly Payment" 
                    value={formatCurrency(loan.monthly_payment)}
                    source="calculated" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Escrow Balance" 
                    value={formatCurrency(loan.escrow_balance)}
                    source="valon" 
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Dates */}
        <Grid item xs={12} md={6}>
          <Card elevation={1} sx={{ height: '100%', borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <CalendarIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" fontWeight="bold">
                  Key Dates
                </Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Origination Date" 
                    value={loan.origination_date ? new Date(loan.origination_date).toLocaleDateString() : 'N/A'}
                    source="imported" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Maturity Date" 
                    value={loan.maturity_date ? new Date(loan.maturity_date).toLocaleDateString() : 'N/A'}
                    source="imported" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Last Payment Date" 
                    value={loan.last_payment_date ? new Date(loan.last_payment_date).toLocaleDateString() : 'N/A'}
                    source="valon" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Next Payment Due" 
                    value={loan.next_due_date ? new Date(loan.next_due_date).toLocaleDateString() : 'N/A'}
                    source="valon" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Transfer Date" 
                    value={loan.effective_transfer_date ? new Date(loan.effective_transfer_date).toLocaleDateString() : 'N/A'}
                    source="imported" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Last Modified" 
                    value={loan.updated_at ? new Date(loan.updated_at).toLocaleDateString() : 'N/A'}
                    source="internal" 
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Organizations */}
        <Grid item xs={12} md={6}>
          <Card elevation={1} sx={{ height: '100%', borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <InvestorIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" fontWeight="bold">
                  Organizations
                </Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Servicer" 
                    value={loan.servicer?.name || 'N/A'}
                    source="internal" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Investor" 
                    value={loan.investor?.name || 'N/A'}
                    source="internal" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Portfolio" 
                    value={loan.portfolio?.name || 'N/A'}
                    source="internal" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="Original Lender" 
                    value={loan.original_lender || 'N/A'}
                    source="imported" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="MERS MIN" 
                    value={loan.mers_min || 'N/A'}
                    source="imported" 
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <AttributedField 
                    label="MERS Status" 
                    value={loan.mers_status || 'N/A'}
                    source="imported" 
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default LoanSummaryTab;