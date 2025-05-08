import React from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  Grid, 
  Avatar,
  Chip,
  Divider,
  CircularProgress,
  Stack,
  Button
} from '@mui/material';
import { 
  Person, 
  Phone, 
  Email, 
  Home, 
  Work, 
  AttachMoney,
  Edit as EditIcon
} from '@mui/icons-material';
import { formatCurrency } from '../../../utility/formatters';

// Interface for the component props
interface BorrowerInfoTabProps {
  borrowers: any[] | undefined;
  isLoading: boolean;
}

/**
 * Component to display contact information with an icon
 */
const ContactItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}> = ({ icon, label, value }) => {
  if (!value) return null;
  
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
      <Box sx={{ mr: 2, color: 'primary.main' }}>
        {icon}
      </Box>
      <Box>
        <Typography variant="caption" color="text.secondary" display="block">
          {label}
        </Typography>
        <Typography variant="body2">
          {value}
        </Typography>
      </Box>
    </Box>
  );
};

/**
 * BorrowerInfoTab component - displays detailed borrower information
 */
export const BorrowerInfoTab: React.FC<BorrowerInfoTabProps> = ({ 
  borrowers,
  isLoading
}) => {
  // If data is loading, show loading indicator
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  // If no borrowers are found
  if (!borrowers || borrowers.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No borrower information available
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<EditIcon />}
          sx={{ mt: 2 }}
        >
          Add Borrower Information
        </Button>
      </Box>
    );
  }

  // Function to get full name
  const getFullName = (borrower: any) => {
    return [
      borrower.first_name,
      borrower.middle_name,
      borrower.last_name
    ].filter(Boolean).join(' ');
  };

  // Function to get borrower initials for avatar
  const getInitials = (borrower: any) => {
    const first = borrower.first_name?.[0] || '';
    const last = borrower.last_name?.[0] || '';
    return (first + last).toUpperCase();
  };

  // Get primary borrower first
  const sortedBorrowers = [...(borrowers || [])].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return 0;
  });

  return (
    <Box>
      <Grid container spacing={3}>
        {sortedBorrowers.map((borrower, index) => (
          <Grid item xs={12} md={6} key={borrower.id || index}>
            <Card 
              elevation={1} 
              sx={{ 
                borderRadius: 2,
                position: 'relative',
                overflow: 'visible'
              }}
            >
              {/* Primary Borrower Indicator */}
              {borrower.is_primary && (
                <Chip
                  label="Primary Borrower"
                  color="primary"
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: -12,
                    right: 16,
                    fontWeight: 'medium',
                    zIndex: 1
                  }}
                />
              )}

              <CardContent>
                <Box sx={{ display: 'flex', mb: 3 }}>
                  {/* Borrower Avatar */}
                  <Avatar
                    sx={{
                      bgcolor: 'primary.main',
                      width: 60,
                      height: 60,
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      mr: 2
                    }}
                  >
                    {getInitials(borrower)}
                  </Avatar>
                  
                  {/* Borrower Name and Basic Info */}
                  <Box>
                    <Typography variant="h6" fontWeight="bold">
                      {getFullName(borrower)}
                    </Typography>
                    
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                      {borrower.ssn_last_four && (
                        <Chip 
                          label={`SSN: xxx-xx-${borrower.ssn_last_four}`} 
                          size="small"
                          variant="outlined"
                        />
                      )}
                      
                      {borrower.borrower_type && (
                        <Chip 
                          label={borrower.borrower_type} 
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Stack>
                  </Box>
                </Box>

                <Divider sx={{ mb: 2 }} />
                
                {/* Contact Information */}
                <Typography variant="subtitle2" color="primary" gutterBottom>
                  Contact Information
                </Typography>
                
                <ContactItem 
                  icon={<Phone fontSize="small" />}
                  label="Phone Number"
                  value={borrower.phone_number}
                />
                
                <ContactItem 
                  icon={<Email fontSize="small" />}
                  label="Email Address"
                  value={borrower.email}
                />
                
                <ContactItem 
                  icon={<Home fontSize="small" />}
                  label="Mailing Address"
                  value={
                    borrower.mailing_address
                      ? `${borrower.mailing_address}, ${borrower.mailing_city || ''}, ${borrower.mailing_state || ''} ${borrower.mailing_zip || ''}`
                      : null
                  }
                />

                <Divider sx={{ my: 2 }} />
                
                {/* Financial Information */}
                <Typography variant="subtitle2" color="primary" gutterBottom>
                  Financial Information
                </Typography>
                
                <Grid container spacing={2}>
                  {borrower.credit_score && (
                    <Grid item xs={6}>
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Credit Score
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {borrower.credit_score}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                  
                  {borrower.annual_income && (
                    <Grid item xs={6}>
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Annual Income
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                          {formatCurrency(borrower.annual_income)}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                  
                  {borrower.employment_status && (
                    <Grid item xs={6}>
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Employment Status
                        </Typography>
                        <Typography variant="body1">
                          {borrower.employment_status}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                  
                  {borrower.employer && (
                    <Grid item xs={6}>
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Employer
                        </Typography>
                        <Typography variant="body1">
                          {borrower.employer}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>
                
                {/* Edit Button */}
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<EditIcon />}
                  >
                    Edit Details
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default BorrowerInfoTab;