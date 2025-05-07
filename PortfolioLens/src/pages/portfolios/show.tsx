import { IResourceComponentsProps, useShow, useList, useMany } from "@refinedev/core";
import {
  Show,
  TextFieldComponent as TextField,
  DateField,
  NumberField,
} from "@refinedev/mui";
import { 
  Typography, 
  Stack, 
  Box, 
  Grid, 
  Card, 
  CardContent, 
  Divider, 
  Chip,
  Paper,
  Tab,
  Tabs,
  Button
} from "@mui/material";
import React, { useState } from "react";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import PieChartIcon from "@mui/icons-material/PieChart";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import LocalAtmIcon from "@mui/icons-material/LocalAtm";
import AssignmentIcon from "@mui/icons-material/Assignment";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

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
      id={`portfolio-tabpanel-${index}`}
      aria-labelledby={`portfolio-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

/**
 * Portfolio show component for displaying detailed portfolio information
 */
export const PortfolioShow: React.FC<IResourceComponentsProps> = () => {
  const { queryResult } = useShow();
  const { data, isLoading } = queryResult;
  const [tabValue, setTabValue] = useState(0);

  const record = data?.data;

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Mock data for loan performance chart
  const performanceData = [
    { name: "Current", value: 85, color: "#4caf50" },
    { name: "30 Days", value: 5, color: "#ffeb3b" },
    { name: "60 Days", value: 3, color: "#ff9800" },
    { name: "90+ Days", value: 7, color: "#f44336" },
  ];

  // Mock data for loan balance distribution
  const balanceData = [
    { range: "$0-$100k", count: 320 },
    { range: "$100k-$200k", count: 450 },
    { range: "$200k-$300k", count: 280 },
    { range: "$300k-$400k", count: 120 },
    { range: "$400k-$500k", count: 80 },
    { range: "$500k+", count: 50 },
  ];

  // Define columns for the loans data grid
  const loanColumns: GridColDef[] = [
    { field: "id", headerName: "ID", width: 90 },
    { field: "loan_number", headerName: "Loan Number", flex: 1, minWidth: 150 },
    { field: "borrower_name", headerName: "Borrower", flex: 1, minWidth: 180 },
    { 
      field: "upb", 
      headerName: "UPB", 
      type: "number",
      width: 120,
      valueFormatter: (params) => 
        params.value ? params.value.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
        }) : "",
    },
    { field: "status", headerName: "Status", width: 120 },
    { field: "note_rate", headerName: "Note Rate", width: 120 },
    { field: "ltv", headerName: "LTV", width: 80 },
    { field: "occupancy", headerName: "Occupancy", width: 120 },
  ];

  // Mock loan data
  const loanData = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    loan_number: `LOAN-${1000 + index}`,
    borrower_name: `Borrower ${index + 1}`,
    upb: Math.floor(Math.random() * 500000) + 50000,
    status: index % 10 === 0 ? "30 Days" : index % 15 === 0 ? "60 Days" : "Current",
    note_rate: (Math.random() * 3 + 3).toFixed(3),
    ltv: Math.floor(Math.random() * 40) + 50,
    occupancy: index % 3 === 0 ? "Investment" : "Primary",
  }));

  // Calculate summary statistics
  const totalLoans = record?.total_loans || 0;
  const totalUPB = record?.total_upb || 0;
  const avgLoanSize = totalLoans > 0 ? totalUPB / totalLoans : 0;
  const avgNoteRate = 5.25; // Mock data

  return (
    <Show isLoading={isLoading} title={<Typography variant="h5">{record?.name}</Typography>}>
      <Stack gap={2}>
        {/* Summary Cards */}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                  <PieChartIcon color="primary" />
                  <Typography variant="subtitle1">Total Loans</Typography>
                </Stack>
                <Typography variant="h4">{totalLoans.toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                  <LocalAtmIcon color="primary" />
                  <Typography variant="subtitle1">Total UPB</Typography>
                </Stack>
                <Typography variant="h4">
                  {totalUPB.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                  <AccountBalanceIcon color="primary" />
                  <Typography variant="subtitle1">Avg Loan Size</Typography>
                </Stack>
                <Typography variant="h4">
                  {avgLoanSize.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                  <AssignmentIcon color="primary" />
                  <Typography variant="subtitle1">Avg Rate</Typography>
                </Stack>
                <Typography variant="h4">{avgNoteRate}%</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="portfolio tabs">
            <Tab label="Overview" />
            <Tab label="Loans" />
            <Tab label="Performance" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Portfolio Details
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                <Stack gap={2}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Portfolio ID
                    </Typography>
                    <Typography variant="body1">{record?.portfolio_id}</Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Portfolio Type
                    </Typography>
                    <Typography variant="body1">
                      <Chip 
                        label={record?.portfolio_type || "Standard"} 
                        color="primary" 
                        variant="outlined" 
                        size="small" 
                      />
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Investor
                    </Typography>
                    <Typography variant="body1">{record?.investor?.name}</Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Servicer
                    </Typography>
                    <Typography variant="body1">{record?.servicer?.name}</Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Sale Date
                    </Typography>
                    <DateField value={record?.sale_date} format="MM/DD/YYYY" />
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Transfer Date
                    </Typography>
                    <DateField value={record?.transfer_date} format="MM/DD/YYYY" />
                  </Box>
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Additional Information
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                <Stack gap={2}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Document Custodian
                    </Typography>
                    <Typography variant="body1">{record?.doc_custodian?.name || record?.doc_custodian}</Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Seller
                    </Typography>
                    <Typography variant="body1">{record?.seller?.name || record?.seller}</Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Prior Servicer
                    </Typography>
                    <Typography variant="body1">{record?.prior_servicer?.name || record?.prior_servicer}</Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Master Servicing Fee
                    </Typography>
                    <Typography variant="body1">
                      {record?.master_servicing_fee ? 
                        record.master_servicing_fee.toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }) : "N/A"}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Description
                    </Typography>
                    <Typography variant="body1">{record?.description}</Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Notes
                    </Typography>
                    <Typography variant="body1">{record?.notes}</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Paper sx={{ p: 2, mb: 3 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Loan Balance Distribution
                </Typography>
                <Box sx={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      width={500}
                      height={300}
                      data={balanceData}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <XAxis dataKey="range" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  Delinquency Status
                </Typography>
                <Box sx={{ height: 300, display: 'flex', justifyContent: 'center' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={performanceData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label
                      >
                        {performanceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value) => [`${value}%`, 'Percentage']}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </Grid>
            </Grid>
          </Paper>

          <Paper sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Portfolio Loans
              </Typography>
              <Box>
                <Chip 
                  label="Directly Associated Loans" 
                  color="primary" 
                  sx={{ mr: 1 }}
                  variant="outlined"
                />
                <Chip 
                  label="Mapped via Loan-Portfolio Mapping" 
                  color="secondary"
                  variant="outlined"
                />
              </Box>
            </Box>
            <Divider sx={{ mb: 2 }} />
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              This view shows both loans directly associated with this portfolio via the portfolio_id field as well as loans mapped through the loan-portfolio mapping system.
            </Typography>
            
            <DataGrid
              rows={loanData}
              columns={[
                ...loanColumns,
                { 
                  field: "mappingType", 
                  headerName: "Association Type", 
                  width: 180,
                  renderCell: (params) => (
                    <Chip 
                      label={params.row.id % 2 === 0 ? "Direct" : "Mapped"} 
                      color={params.row.id % 2 === 0 ? "primary" : "secondary"}
                      variant="outlined"
                      size="small"
                    />
                  )
                }
              ]}
              autoHeight
              pageSizeOptions={[10, 25, 50, 100]}
              initialState={{
                pagination: {
                  paginationModel: {
                    pageSize: 10,
                  },
                },
              }}
              disableRowSelectionOnClick
            />
          </Paper>
          
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Loan-Portfolio Mapping Details
              </Typography>
            </Box>
            <Divider sx={{ mb: 2 }} />
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              The table below shows all investor loan numbers that have been mapped to this portfolio using the loan-portfolio mapping system.
              These mappings provide an audit trail and allow for flexible associations between loans and portfolios.
            </Typography>
            
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Button 
                variant="outlined" 
                color="primary"
                href="/loans/portfolio-mapping"
                startIcon={<MapIcon />}
              >
                Manage Portfolio Mappings
              </Button>
            </Box>
            
            <DataGrid
              rows={Array.from({ length: 10 }, (_, index) => ({
                id: index + 1,
                investor_loan_number: `INV-${10000 + index}`,
                linked_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
                linked_by: "John Doe",
                loan_status: index % 5 === 0 ? "Not Found" : "Active",
              }))}
              columns={[
                { field: "investor_loan_number", headerName: "Investor Loan Number", flex: 1, minWidth: 180 },
                { 
                  field: "linked_at", 
                  headerName: "Linked At", 
                  width: 180,
                  renderCell: (params) => (
                    <DateField value={params.row.linked_at} format="MM/DD/YYYY hh:mm A" />
                  )
                },
                { field: "linked_by", headerName: "Linked By", width: 150 },
                { 
                  field: "loan_status", 
                  headerName: "Status", 
                  width: 120,
                  renderCell: (params) => (
                    <Chip 
                      label={params.row.loan_status} 
                      color={params.row.loan_status === "Not Found" ? "error" : "success"}
                      size="small"
                    />
                  )
                },
              ]}
              autoHeight
              initialState={{
                pagination: {
                  paginationModel: {
                    pageSize: 5,
                  },
                },
              }}
              pageSizeOptions={[5, 10, 25]}
              disableRowSelectionOnClick
            />
          </Paper>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Performance Summary
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                <Stack gap={2}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      30+ Day Delinquency Rate
                    </Typography>
                    <Typography variant="body1">
                      <Chip 
                        label="15%" 
                        color="warning" 
                        size="small" 
                      />
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      60+ Day Delinquency Rate
                    </Typography>
                    <Typography variant="body1">
                      <Chip 
                        label="10%" 
                        color="error" 
                        size="small" 
                      />
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Foreclosure Rate
                    </Typography>
                    <Typography variant="body1">
                      <Chip 
                        label="3%" 
                        color="error" 
                        size="small" 
                      />
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      REO Rate
                    </Typography>
                    <Typography variant="body1">
                      <Chip 
                        label="1%" 
                        color="error" 
                        size="small" 
                      />
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Prepayment Speed (CPR)
                    </Typography>
                    <Typography variant="body1">
                      <Chip 
                        label="8%" 
                        color="success" 
                        size="small" 
                      />
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Current Portfolio Yield
                    </Typography>
                    <Typography variant="body1">
                      <Chip 
                        label="5.2%" 
                        color="success" 
                        size="small" 
                      />
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Loan Status Transitions (Last 3 Months)
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                <Box sx={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      width={500}
                      height={300}
                      data={[
                        { month: "Mar", performing: 92, delinquent: 5, foreclosure: 2, reo: 1 },
                        { month: "Apr", performing: 90, delinquent: 6, foreclosure: 3, reo: 1 },
                        { month: "May", performing: 85, delinquent: 8, foreclosure: 4, reo: 3 },
                      ]}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      stackOffset="expand"
                      layout="vertical"
                    >
                      <XAxis type="number" domain={[0, 1]} tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
                      <YAxis dataKey="month" type="category" />
                      <Tooltip 
                        formatter={(value, name) => [`${(value * 100).toFixed(2)}%`, name]}
                      />
                      <Bar dataKey="performing" stackId="a" fill="#4caf50" name="Performing" />
                      <Bar dataKey="delinquent" stackId="a" fill="#ff9800" name="Delinquent" />
                      <Bar dataKey="foreclosure" stackId="a" fill="#f44336" name="Foreclosure" />
                      <Bar dataKey="reo" stackId="a" fill="#9c27b0" name="REO" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>
      </Stack>
    </Show>
  );
};

export default PortfolioShow;