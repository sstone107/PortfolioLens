import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Tabs, 
  Tab, 
  Typography, 
  Paper, 
  Divider,
  useTheme,
  useMediaQuery,
  CircularProgress
} from '@mui/material';
import { 
  InfoOutlined, 
  Person, 
  Receipt, 
  History, 
  Article,
  Comment as CommentIcon
} from '@mui/icons-material';
import { useShow, useList, useGetIdentity } from "@refinedev/core";
import { useParams } from "react-router-dom";
import { borrowerService } from "../../services/borrowerService";
import { usePermission } from "../../hooks/usePermission";

import { LoanSummaryTab } from './tabs/LoanSummaryTab';
import { BorrowerInfoTab } from './tabs/BorrowerInfoTab';
import { PaymentHistoryTab } from './tabs/PaymentHistoryTab';
import { StatusLogTab } from './tabs/StatusLogTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { LoanNotes } from './LoanNotes';

/**
 * TabPanel component to render the content of each tab
 */
const TabPanel = (props: {
  children?: React.ReactNode;
  index: number;
  value: number;
}) => {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`loan-detail-tabpanel-${index}`}
      aria-labelledby={`loan-detail-tab-${index}`}
      {...other}
      style={{ width: '100%' }}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
};

/**
 * Helper function for accessibility
 */
const a11yProps = (index: number) => {
  return {
    id: `loan-detail-tab-${index}`,
    'aria-controls': `loan-detail-tabpanel-${index}`,
  };
};

/**
 * LoanDetailView component - main container for the tabbed loan detail interface
 */
export const LoanDetailView: React.FC = () => {
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const [tabValue, setTabValue] = useState(0);
  const { id } = useParams<{ id: string }>();
  
  // State for borrower data fetched directly
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [isBorrowerLoading, setIsBorrowerLoading] = useState<boolean>(true);

  // Get current user identity
  const { data: identity, isLoading: isIdentityLoading, isError: isIdentityError } = useGetIdentity<any>();
  
  // Check if user has internal role permissions
  const canViewInternalNotes = usePermission({
    resource: "loan_notes",
    action: "view_internal",
  });

  // Get loan data
  const { 
    queryResult: { data: loanData, isLoading, isError } = { data: undefined, isLoading: true, isError: false } 
  } = useShow({
    resource: "loans",
    id: id, // id from useParams
    queryOptions: {
      enabled: !!id, // Fetch only if id is present
    },
  });
  const loan = loanData?.data;

  // Fetch borrower data directly from our service
  useEffect(() => {
    if (loan?.id) {
      setIsBorrowerLoading(true);
      borrowerService.getBorrowersByLoanId(String(loan.id))
        .then(({ data, error }) => {
          if (!error && data) {
            setBorrowers(data);
          } else {
            console.error("Error fetching borrowers:", error);
            setBorrowers([]);
          }
          setIsBorrowerLoading(false);
        })
        .catch(err => {
          console.error("Exception fetching borrowers:", err);
          setBorrowers([]);
          setIsBorrowerLoading(false);
        });
    }
  }, [loan?.id]);

  // Get payment history for this loan
  const { 
    data: paymentData,
    isLoading: isPaymentLoading 
  } = useList({
    resource: "payments",
    filters: [
      {
        field: "loan_id",
        operator: "eq",
        value: loan?.id,
      },
    ],
    queryOptions: {
      enabled: !!loan?.id,
    },
    meta: {
      pagination: {
        pageSize: 50, // Limit to last 50 payments
      },
      sort: [
        {
          field: "effective_date",
          order: "desc", // Most recent payments first
        },
      ],
    }
  });

  // Handle tab change
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // If data is loading, show loading indicator
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // If there was an error loading the data
  if (isError) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error" variant="h6">
          Error loading loan details. Please try again.
        </Typography>
      </Box>
    );
  }

  return (
    <Paper elevation={2} sx={{ mb: 3, borderRadius: 2, overflow: 'hidden' }}>
      {/* Loan Identifier Header */}
      <Box sx={{ backgroundColor: 'primary.main', p: 2, color: 'primary.contrastText' }}>
        <Typography variant="h5" fontWeight="bold">
          Loan #{loan?.loan_number}
        </Typography>
        <Typography variant="body2">
          Last Updated: {new Date(loan?.updated_at).toLocaleString()}
        </Typography>
      </Box>
      
      <Box sx={{ width: '100%' }}>
        {/* Tabs */}
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="Loan detail tabs"
          variant={isSmallScreen ? "scrollable" : "fullWidth"}
          scrollButtons={isSmallScreen ? "auto" : false}
          allowScrollButtonsMobile
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider',
            '& .MuiTab-root': {
              minHeight: '72px',
            }
          }}
        >
          <Tab 
            icon={<InfoOutlined />} 
            label="Loan Summary" 
            {...a11yProps(0)} 
            sx={{ textTransform: 'none' }}
          />
          <Tab 
            icon={<Person />} 
            label="Borrower Info" 
            {...a11yProps(1)} 
            sx={{ textTransform: 'none' }}
          />
          <Tab 
            icon={<Receipt />} 
            label="Payment History" 
            {...a11yProps(2)} 
            sx={{ textTransform: 'none' }}
          />
          <Tab 
            icon={<History />} 
            label="Status Log" 
            {...a11yProps(3)} 
            sx={{ textTransform: 'none' }}
          />
          <Tab 
            icon={<Article />} 
            label="Documents" 
            {...a11yProps(4)} 
            sx={{ textTransform: 'none' }}
          />
          {/* Only show notes tab for internal users */}
          {canViewInternalNotes && (
            <Tab 
              icon={<CommentIcon />} 
              label="Notes" 
              {...a11yProps(5)} 
              sx={{ textTransform: 'none' }}
            />
          )}
        </Tabs>

        {/* Tab Content Panels */}
        <TabPanel value={tabValue} index={0}>
          <LoanSummaryTab loan={loan} />
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          <BorrowerInfoTab 
            borrowers={borrowers} 
            isLoading={isBorrowerLoading} 
          />
        </TabPanel>
        <TabPanel value={tabValue} index={2}>
          <PaymentHistoryTab 
            payments={paymentData?.data} 
            isLoading={isPaymentLoading} 
            loanId={loan?.id ? String(loan.id) : ''}
          />
        </TabPanel>
        <TabPanel value={tabValue} index={3}>
          <StatusLogTab loanId={loan?.id ? String(loan.id) : ''} />
        </TabPanel>
        <TabPanel value={tabValue} index={4}>
          <DocumentsTab loanId={loan?.id ? String(loan.id) : ''} />
        </TabPanel>
        {/* Notes Tab (Only for internal users) */}
        {canViewInternalNotes && (
          <TabPanel value={tabValue} index={5}>
            <LoanNotes 
              loanId={loan?.id ? String(loan.id) : ''}
              currentUserId={identity?.id ? String(identity.id) : undefined}
              currentUserName={identity?.name || identity?.email || 'Unknown User'}
              currentUserAvatar={identity?.avatar}
              userRole={identity?.role ? String(identity.role) : undefined} 
              isInternalUser={!!canViewInternalNotes} // Ensure boolean based on permission result
            />
          </TabPanel>
        )}
      </Box>
    </Paper>
  );
};

export default LoanDetailView;