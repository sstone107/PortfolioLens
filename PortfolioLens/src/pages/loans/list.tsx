import { IResourceComponentsProps } from "@refinedev/core";
import {
  List,
  EditButton,
  ShowButton,
  DateField,
} from "@refinedev/mui";
import { Button } from "@mui/material";
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import MapIcon from "@mui/icons-material/Map";
import { LoanSearchProvider, useLoanSearch } from "../../contexts/loanSearchContext";
import { LoanFilterPanel, LoanSearchResults } from "../../components/loan-search";

/**
 * Loan list component for displaying all loans with advanced search functionality
 */
const LoanListContent: React.FC = () => {
  const { searchLoans, searchResults, searching } = useLoanSearch();
  
  // Initial search on component mount
  useEffect(() => {
    // Load initial data
    searchLoans();
  }, []);
  
  // Handle search button click
  const handleSearch = () => {
    searchLoans({ page: 1 }); // Reset to first page when searching
  };
  
  return (
    <List
      headerButtons={({ defaultButtons }) => (
        <>
          {defaultButtons}
          <Button
            component={Link}
            to="/loans/portfolio-mapping"
            variant="contained"
            startIcon={<MapIcon />}
          >
            Portfolio Mapping
          </Button>
        </>
      )}
    >
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Search and filter loans across your portfolio. Use the advanced options to narrow down results and save your frequently used filters for quick access.
        </Typography>
      </Box>
      
      {/* Search filter panel */}
      <LoanFilterPanel onSearch={handleSearch} />
      
      {/* Search results */}
      <LoanSearchResults />
    </List>
  );
};

/**
 * Loan list wrapper with provider
 */
export const LoanList: React.FC<IResourceComponentsProps> = () => {
  return (
    <LoanSearchProvider>
      <LoanListContent />
    </LoanSearchProvider>
  );
};

export default LoanList;