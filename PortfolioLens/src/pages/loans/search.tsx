import React from 'react';
import { IResourceComponentsProps } from "@refinedev/core";
import { Box, Typography } from "@mui/material";
import { List } from "@refinedev/mui";
import { LoanFilterPanel, LoanSearchResults } from "../../components/loan-search";

/**
 * Advanced Loan Search page component
 */
export const LoanSearch: React.FC<IResourceComponentsProps> = () => {
  // Handle search button click
  const handleSearch = () => {
    // The search itself is handled within the useLoanSearch context
  };

  return (
    <List
      title="Advanced Loan Search"
      breadcrumb={false}
    >
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Use the advanced search tools below to find specific loans across your portfolios. 
          Save your frequent searches for quick access and export results as needed.
        </Typography>
      </Box>
      
      {/* Search filter panel */}
      <LoanFilterPanel onSearch={handleSearch} />
      
      {/* Search results */}
      <LoanSearchResults />
    </List>
  );
};

export default LoanSearch;