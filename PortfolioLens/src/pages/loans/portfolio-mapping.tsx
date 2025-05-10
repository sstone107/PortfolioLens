import React, { useState, useCallback } from 'react';
import {
  Container,
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  MenuItem,
  Select,
  Checkbox,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Breadcrumbs,
  Link,
  Divider,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import {
  Home as HomeIcon,
  Upload as UploadIcon,
  Description as DescriptionIcon,
  Publish as PublishIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  CloudDownload as DownloadIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { useNotification, useInvalidate, useNavigation, BaseRecord } from '@refinedev/core';
import { LoanPortfolioMappingService } from '../../services/loanPortfolioMappingService';
import { LoanMappingResult, LoanMappingImportOptions, UnmappedLoan, InconsistentLoanMapping } from '../../types/loanPortfolioMapping';
import { FileReader } from '../../utility/FileReader';
import { useAutocomplete } from '@refinedev/mui';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`loan-mapping-tabpanel-${index}`}
      aria-labelledby={`loan-mapping-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

/**
 * Portfolio Mapping Page
 * Associates investor loan numbers with portfolios
 */
export const LoanPortfolioMappingPage: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedLoanNumbers, setParsedLoanNumbers] = useState<string[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<LoanMappingResult | null>(null);
  const [importOptions, setImportOptions] = useState<LoanMappingImportOptions>({
    clearExisting: false,
    skipDuplicates: true,
    allowReassignment: false
  });
  const [unmappedLoans, setUnmappedLoans] = useState<UnmappedLoan[]>([]);
  const [inconsistentMappings, setInconsistentMappings] = useState<InconsistentLoanMapping[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Hooks
  const { open } = useNotification();
  const invalidate = useInvalidate();
  const { push } = useNavigation();
  const mappingService = new LoanPortfolioMappingService();

  // Portfolio autocomplete
  const { autocompleteProps: portfolioAutocompleteProps } = useAutocomplete({
    resource: "portfolios",
    defaultValue: undefined,
  });

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    
    // Load reports data when switching to validation tab
    if (newValue === 1) {
      loadValidationReports();
    }
  };

  const loadValidationReports = async () => {
    setLoadingReports(true);
    try {
      const [unmapped, inconsistent] = await Promise.all([
        mappingService.getUnmappedLoans(),
        mappingService.getInconsistentMappings()
      ]);
      
      setUnmappedLoans(unmapped);
      setInconsistentMappings(inconsistent);
    } catch (error) {
      open({
        type: 'error',
        message: 'Failed to load validation reports',
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setLoadingReports(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }
    
    const file = files[0];
    setSelectedFile(file);
    
    try {
      // Parse file based on type
      if (file.name.endsWith('.csv')) {
        const data = await FileReader.readCsvFile(file);
        processParsedData(data);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const workbookInfo = await FileReader.readFile(file);
        if (workbookInfo && workbookInfo.sheets && workbookInfo.sheets.length > 0) {
          const sheetData = await FileReader.getSheetData(file, workbookInfo.sheets[0].name);
          processParsedData(sheetData);
        }
      } else {
        open({
          type: 'error',
          message: 'Unsupported file format',
          description: 'Please upload a CSV or Excel file'
        });
      }
    } catch (error) {
      open({
        type: 'error',
        message: 'Error reading file',
        description: error instanceof Error ? error.message : String(error)
      });
    }
  };
  
  const processParsedData = (data: any[]) => {
    if (!data || data.length === 0) {
      open({
        type: 'error',
        message: 'Empty file',
        description: 'The uploaded file contains no data'
      });
      return;
    }
    
    // Extract loan numbers from various potential column names
    const loanNumbers: string[] = [];
    const possibleColumnNames = [
      'investor_loan_number', 'loan_number', 'loan_id', 
      'investor_loan_id', 'id', 'loan', 'number'
    ];
    
    data.forEach(row => {
      let loanNumber: string | null = null;
      
      // Try all possible column names
      for (const colName of possibleColumnNames) {
        if (row[colName] && typeof row[colName] === 'string' && row[colName].trim()) {
          loanNumber = row[colName].trim();
          break;
        }
      }
      
      // If no matching column, try first column or any column with a value
      if (!loanNumber) {
        const firstKey = Object.keys(row)[0];
        if (firstKey && row[firstKey] && typeof row[firstKey] === 'string') {
          loanNumber = row[firstKey].trim();
        } else {
          // Last resort: look for any string value
          for (const key in row) {
            if (row[key] && typeof row[key] === 'string' && row[key].trim()) {
              loanNumber = row[key].trim();
              break;
            }
          }
        }
      }
      
      if (loanNumber) {
        loanNumbers.push(loanNumber);
      }
    });
    
    if (loanNumbers.length === 0) {
      open({
        type: 'error',
        message: 'No loan numbers found',
        description: 'Could not extract loan numbers from the uploaded file'
      });
    } else {
      setParsedLoanNumbers(loanNumbers);
      open({
        type: 'success',
        message: 'File processed successfully',
        description: `Found ${loanNumbers.length} loan numbers`
      });
    }
  };
  
  const handleSubmit = async () => {
    if (!selectedPortfolioId) {
      open({
        type: 'error',
        message: 'No portfolio selected',
        description: 'Please select a target portfolio'
      });
      return;
    }
    
    if (parsedLoanNumbers.length === 0) {
      open({
        type: 'error',
        message: 'No loan numbers',
        description: 'Please upload a file with loan numbers'
      });
      return;
    }
    
    setIsLoading(true);
    setResult(null);
    
    try {
      // Get user ID from auth context or use a default for now
      const userId = 'system'; // In production, should come from auth context
      
      const result = await mappingService.mapLoansToPortfolio(
        parsedLoanNumbers,
        selectedPortfolioId,
        userId,
        importOptions
      );
      
      setResult(result);
      
      if (result.successful > 0) {
        open({
          type: 'success',
          message: 'Mapping completed',
          description: `Successfully mapped ${result.successful} loans to the selected portfolio`
        });
        
        // Refresh data in refinejs
        invalidate({
          resource: "loans",
          invalidates: ["list"]
        });
      } else {
        open({
          type: 'warning',
          message: 'No loans mapped',
          description: 'The operation completed but no loans were mapped'
        });
      }
    } catch (error) {
      open({
        type: 'error',
        message: 'Error mapping loans',
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleOptionChange = (option: keyof LoanMappingImportOptions) => {
    setImportOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };
  
  const handleDownloadReport = (reportType: 'unmapped' | 'inconsistent') => {
    let csvContent = '';
    
    if (reportType === 'unmapped') {
      csvContent = 'Loan ID,Investor Loan ID,Investor ID,Investor Name\n';
      unmappedLoans.forEach(loan => {
        csvContent += `${loan.loan_id},${loan.investor_loan_id},${loan.investor_id},${loan.investor_name}\n`;
      });
    } else {
      csvContent = 'Investor Loan Number,Portfolio ID,Portfolio Name,Loan ID,Investor ID,Investor Name\n';
      inconsistentMappings.forEach(mapping => {
        csvContent += `${mapping.investor_loan_number},${mapping.portfolio_id},${mapping.portfolio_name || ''},${mapping.loan_id || ''},${mapping.investor_id || ''},${mapping.investor_name || ''}\n`;
      });
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${reportType}-loans-report.csv`);
    link.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 3 }}>
        {/* Breadcrumbs navigation */}
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
          <Link
            component={RouterLink}
            to="/"
            sx={{ display: 'flex', alignItems: 'center' }}
          >
            <HomeIcon sx={{ mr: 0.5 }} fontSize="inherit" />
            Home
          </Link>
          <Link
            component={RouterLink}
            to="/loans"
            sx={{ display: 'flex', alignItems: 'center' }}
          >
            <DescriptionIcon sx={{ mr: 0.5 }} fontSize="inherit" />
            Loans
          </Link>
          <Typography
            sx={{ display: 'flex', alignItems: 'center' }}
            color="text.primary"
          >
            <UploadIcon sx={{ mr: 0.5 }} fontSize="inherit" />
            Portfolio Mapping
          </Typography>
        </Breadcrumbs>

        <Typography variant="h4" gutterBottom>
          Loan Portfolio Mapping
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Associate investor loan numbers with portfolios by uploading a CSV or Excel file.
        </Typography>
        
        <Divider sx={{ mb: 3 }} />
        
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange} aria-label="loan mapping tabs">
            <Tab label="Map Loans to Portfolio" id="loan-mapping-tab-0" />
            <Tab label="Validation Reports" id="loan-mapping-tab-1" />
          </Tabs>
        </Box>
        
        <TabPanel value={activeTab} index={0}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Upload Loan Numbers
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Upload a CSV or Excel file containing investor loan numbers. The system will extract loan numbers from the first column or any column with a suitable name.
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <Button
                      variant="contained"
                      component="label"
                      startIcon={<UploadIcon />}
                      disabled={isLoading}
                    >
                      Select File
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        hidden
                        onChange={handleFileChange}
                      />
                    </Button>
                    {selectedFile && (
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        Selected: {selectedFile.name} 
                        ({parsedLoanNumbers.length} loan numbers found)
                      </Typography>
                    )}
                  </Box>
                </Box>
                
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Select Target Portfolio
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Choose the portfolio to associate with the uploaded loan numbers.
                  </Typography>
                  <FormControl fullWidth sx={{ mt: 2 }}>
                    <InputLabel id="portfolio-select-label">Portfolio</InputLabel>
                    <Select
                      labelId="portfolio-select-label"
                      value={selectedPortfolioId}
                      label="Portfolio"
                      onChange={(e) => setSelectedPortfolioId(e.target.value)}
                      disabled={isLoading}
                    >
                      {portfolioAutocompleteProps.options?.map((portfolio: BaseRecord) => (
                        <MenuItem key={portfolio.id} value={portfolio.id}>
                          {portfolio.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Import Options
                  </Typography>
                  <FormGroup>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={importOptions.clearExisting}
                          onChange={() => handleOptionChange('clearExisting')}
                          disabled={isLoading}
                        />
                      }
                      label="Clear existing mappings for this portfolio"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={importOptions.skipDuplicates}
                          onChange={() => handleOptionChange('skipDuplicates')}
                          disabled={isLoading || importOptions.allowReassignment}
                        />
                      }
                      label="Skip duplicates (loan numbers already mapped to other portfolios)"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={importOptions.allowReassignment}
                          onChange={() => handleOptionChange('allowReassignment')}
                          disabled={isLoading || importOptions.skipDuplicates}
                        />
                      }
                      label="Allow reassignment (move loans from existing portfolio mappings)"
                    />
                  </FormGroup>
                </Box>
                
                <Box sx={{ mt: 3 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSubmit}
                    disabled={isLoading || !selectedFile || !selectedPortfolioId || parsedLoanNumbers.length === 0}
                    startIcon={isLoading ? <CircularProgress size={20} /> : <PublishIcon />}
                  >
                    {isLoading ? 'Processing...' : 'Map Loans to Portfolio'}
                  </Button>
                </Box>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Import Results
                  </Typography>
                  {result ? (
                    <Box>
                      <Alert severity={result.successful > 0 ? "success" : "warning"} sx={{ mb: 2 }}>
                        <Typography variant="body1">
                          {result.successful > 0 
                            ? `Successfully mapped ${result.successful} loans to the selected portfolio.` 
                            : "No loans were successfully mapped."}
                        </Typography>
                      </Alert>
                      
                      <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Status</TableCell>
                              <TableCell align="right">Count</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            <TableRow>
                              <TableCell>Successful</TableCell>
                              <TableCell align="right">{result.successful}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell>Failed</TableCell>
                              <TableCell align="right">{result.failed}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell>Invalid</TableCell>
                              <TableCell align="right">{result.invalid}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell>Duplicates</TableCell>
                              <TableCell align="right">{result.duplicates}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell>Total Processed</TableCell>
                              <TableCell align="right">{result.successful + result.failed + result.invalid + result.duplicates}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </TableContainer>
                      
                      {(result.details.failure.length > 0 || result.details.invalid.length > 0 || result.details.duplicate.length > 0) && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                          <Typography variant="body2" gutterBottom>
                            Issues were encountered with some loan numbers:
                          </Typography>
                          {result.details.duplicate.length > 0 && (
                            <Typography variant="body2" gutterBottom>
                              • {result.details.duplicate.length} loan numbers were already mapped to portfolios
                            </Typography>
                          )}
                          {result.details.invalid.length > 0 && (
                            <Typography variant="body2" gutterBottom>
                              • {result.details.invalid.length} loan numbers were invalid or empty
                            </Typography>
                          )}
                          {result.details.failure.length > 0 && (
                            <Typography variant="body2">
                              • {result.details.failure.length} loan numbers failed to be mapped due to errors
                            </Typography>
                          )}
                        </Alert>
                      )}
                    </Box>
                  ) : (
                    <Alert severity="info">
                      Import results will appear here after processing.
                    </Alert>
                  )}
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </TabPanel>
        
        <TabPanel value={activeTab} index={1}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6">
                Data Validation Reports
              </Typography>
              <Button 
                startIcon={<RefreshIcon />}
                variant="outlined"
                onClick={() => loadValidationReports()}
                disabled={loadingReports}
              >
                Refresh Reports
              </Button>
            </Box>
            
            {loadingReports ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Grid container spacing={3}>
                <Grid item xs={12} lg={6}>
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="subtitle1">
                        Unmapped Loans {unmappedLoans.length > 0 && `(${unmappedLoans.length})`}
                      </Typography>
                      <Tooltip title="Download CSV">
                        <IconButton 
                          onClick={() => handleDownloadReport('unmapped')}
                          disabled={unmappedLoans.length === 0}
                        >
                          <DownloadIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    
                    {unmappedLoans.length === 0 ? (
                      <Alert severity="success">
                        All loans are properly mapped to portfolios.
                      </Alert>
                    ) : (
                      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                        <Table stickyHeader size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Investor Loan ID</TableCell>
                              <TableCell>Investor</TableCell>
                              <TableCell align="right">Actions</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {unmappedLoans.map((loan) => (
                              <TableRow key={loan.loan_id}>
                                <TableCell>{loan.investor_loan_id}</TableCell>
                                <TableCell>{loan.investor_name}</TableCell>
                                <TableCell align="right">
                                  <Tooltip title="View Loan">
                                    <IconButton 
                                      size="small"
                                      onClick={() => push(`/loans/show/${loan.loan_id}`)}
                                    >
                                      <DescriptionIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Box>
                </Grid>
                
                <Grid item xs={12} lg={6}>
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="subtitle1">
                        Inconsistent Mappings {inconsistentMappings.length > 0 && `(${inconsistentMappings.length})`}
                      </Typography>
                      <Tooltip title="Download CSV">
                        <IconButton 
                          onClick={() => handleDownloadReport('inconsistent')}
                          disabled={inconsistentMappings.length === 0}
                        >
                          <DownloadIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    
                    {inconsistentMappings.length === 0 ? (
                      <Alert severity="success">
                        No inconsistent mappings found.
                      </Alert>
                    ) : (
                      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                        <Table stickyHeader size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Investor Loan Number</TableCell>
                              <TableCell>Portfolio</TableCell>
                              <TableCell>Issue</TableCell>
                              <TableCell align="right">Actions</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {inconsistentMappings.map((mapping) => (
                              <TableRow key={mapping.investor_loan_number}>
                                <TableCell>{mapping.investor_loan_number}</TableCell>
                                <TableCell>{mapping.portfolio_name || 'Unknown'}</TableCell>
                                <TableCell>
                                  {!mapping.loan_id && (
                                    <Chip 
                                      icon={<WarningIcon />} 
                                      label="Loan missing" 
                                      size="small" 
                                      color="warning"
                                    />
                                  )}
                                  {!mapping.portfolio_name && (
                                    <Chip 
                                      icon={<WarningIcon />} 
                                      label="Portfolio missing" 
                                      size="small" 
                                      color="warning"
                                      sx={{ ml: 1 }}
                                    />
                                  )}
                                </TableCell>
                                <TableCell align="right">
                                  <Tooltip title="Delete Mapping">
                                    <IconButton 
                                      size="small"
                                      color="error"
                                      onClick={() => {
                                        if (confirm('Delete this inconsistent mapping?')) {
                                          mappingService.removeLoansFromMappings([mapping.investor_loan_number])
                                            .then(() => {
                                              loadValidationReports();
                                              open({
                                                type: 'success',
                                                message: 'Mapping deleted',
                                                description: 'The inconsistent mapping was removed'
                                              });
                                            })
                                            .catch((error) => {
                                              open({
                                                type: 'error',
                                                message: 'Failed to delete mapping',
                                                description: error instanceof Error ? error.message : String(error)
                                              });
                                            });
                                        }
                                      }}
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Box>
                </Grid>
              </Grid>
            )}
          </Paper>
        </TabPanel>
      </Box>
    </Container>
  );
};

export default LoanPortfolioMappingPage;