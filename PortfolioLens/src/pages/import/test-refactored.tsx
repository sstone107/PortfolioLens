/**
 * Test page for the refactored column mapping component
 * This allows you to test the refactored component outside of the main import flow
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Container,
  Breadcrumbs,
  Link,
  Button
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import FolderIcon from '@mui/icons-material/Folder';
import BugReportIcon from '@mui/icons-material/BugReport';
import TestRefactoredUI from '../../components/import/TestRefactoredUI';
import { useBatchImportStore } from '../../store/batchImportStore';

/**
 * Test Refactored UI Page
 */
const TestRefactoredPage: React.FC = () => {
  const navigate = useNavigate();
  const { reset } = useBatchImportStore();
  
  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <Link
          underline="hover"
          sx={{ display: 'flex', alignItems: 'center' }}
          color="inherit"
          href="/"
        >
          <HomeIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          Home
        </Link>
        <Link
          underline="hover"
          sx={{ display: 'flex', alignItems: 'center' }}
          color="inherit"
          href="/import"
        >
          <FolderIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          Import
        </Link>
        <Typography
          sx={{ display: 'flex', alignItems: 'center' }}
          color="text.primary"
        >
          <BugReportIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          Test Refactored UI
        </Typography>
      </Breadcrumbs>
      
      {/* Actions */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
        <Button 
          variant="outlined" 
          onClick={() => navigate('/import')}
        >
          Back to Import Home
        </Button>
        
        <Button 
          variant="outlined" 
          color="secondary"
          onClick={() => reset()}
        >
          Reset Import State
        </Button>
      </Box>
      
      {/* Test component */}
      <TestRefactoredUI />
    </Container>
  );
};

export default TestRefactoredPage;