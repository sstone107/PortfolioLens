import { IResourceComponentsProps, useMany, useList } from "@refinedev/core";
import React from "react";
import {
  Typography,
  Grid,
  Card,
  CardContent,
  Box,
  Paper,
  Divider,
  Stack,
  Chip,
  Avatar,
} from "@mui/material";
import { Pie, PieChart, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import PieChartIcon from "@mui/icons-material/PieChart";
import LocalAtmIcon from "@mui/icons-material/LocalAtm";
import BusinessIcon from "@mui/icons-material/Business";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { useNavigate } from "react-router";

interface Portfolio {
  id: string;
  name: string;
  portfolio_id?: string;
  investor_id?: string;
  investor?: { name: string };
  portfolio_type?: string;
  total_loans?: number;
  total_upb?: number;
  created_at: Date;
}

export const PortfolioDashboard: React.FC<IResourceComponentsProps> = () => {
  const navigate = useNavigate();
  const { data: portfolioData, isLoading } = useList<Portfolio>({
    resource: "portfolios",
  });

  const portfolios = portfolioData?.data || [];

  // Calculate summary statistics
  const totalPortfolios = portfolios.length;
  const totalLoans = portfolios.reduce((sum, p) => sum + (p.total_loans || 0), 0);
  const totalUPB = portfolios.reduce((sum, p) => sum + (p.total_upb || 0), 0);
  
  // Aggregate portfolio types for pie chart
  const portfoliosByType = portfolios.reduce((acc, portfolio) => {
    const type = portfolio.portfolio_type || "Undefined";
    if (!acc[type]) {
      acc[type] = {
        name: type,
        count: 0,
        upb: 0,
      };
    }
    acc[type].count += 1;
    acc[type].upb += portfolio.total_upb || 0;
    return acc;
  }, {} as Record<string, { name: string; count: number; upb: number }>);

  const typeData = Object.values(portfoliosByType);
  
  // Colors for the pie chart
  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];
  
  // Top portfolios by UPB
  const topPortfolios = [...portfolios]
    .sort((a, b) => (b.total_upb || 0) - (a.total_upb || 0))
    .slice(0, 5);

  // Mock performance data
  const performanceData = [
    { status: "Current", count: Math.floor(totalLoans * 0.85), percentage: 85 },
    { status: "30 Days", count: Math.floor(totalLoans * 0.05), percentage: 5 },
    { status: "60 Days", count: Math.floor(totalLoans * 0.03), percentage: 3 },
    { status: "90+ Days", count: Math.floor(totalLoans * 0.04), percentage: 4 },
    { status: "Foreclosure", count: Math.floor(totalLoans * 0.02), percentage: 2 },
    { status: "REO", count: Math.floor(totalLoans * 0.01), percentage: 1 },
  ];

  // Mock data for investor distribution
  const investorData = [
    { name: "Investor A", upb: totalUPB * 0.35, loans: Math.floor(totalLoans * 0.32) },
    { name: "Investor B", upb: totalUPB * 0.25, loans: Math.floor(totalLoans * 0.27) },
    { name: "Investor C", upb: totalUPB * 0.18, loans: Math.floor(totalLoans * 0.15) },
    { name: "Investor D", upb: totalUPB * 0.12, loans: Math.floor(totalLoans * 0.14) },
    { name: "Other", upb: totalUPB * 0.10, loans: Math.floor(totalLoans * 0.12) },
  ];

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>Portfolio Dashboard</Typography>
      
      {/* Summary Stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <PieChartIcon color="primary" fontSize="large" />
                <Typography variant="h6">Portfolios</Typography>
              </Stack>
              <Typography variant="h4">{totalPortfolios}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <AccountBalanceIcon color="primary" fontSize="large" />
                <Typography variant="h6">Loans</Typography>
              </Stack>
              <Typography variant="h4">{totalLoans.toLocaleString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <LocalAtmIcon color="primary" fontSize="large" />
                <Typography variant="h6">Total UPB</Typography>
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
                <TrendingUpIcon color="primary" fontSize="large" />
                <Typography variant="h6">Avg Loan Size</Typography>
              </Stack>
              <Typography variant="h4">
                {(totalLoans ? totalUPB / totalLoans : 0).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts & Analysis */}
      <Grid container spacing={3}>
        {/* Portfolio Distribution */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Portfolio Distribution by Type</Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ height: 300, display: 'flex', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="upb"
                    nameKey="name"
                    label
                  >
                    {typeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => [
                      value.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }),
                      "UPB"
                    ]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        {/* Loan Status Distribution */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Loan Status Distribution</Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={performanceData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <XAxis dataKey="status" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name, props) => [
                      value.toLocaleString(), 
                      name === "count" ? "Loans" : name
                    ]}
                  />
                  <Legend />
                  <Bar name="Count" dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        {/* Top Portfolios */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Top Portfolios by UPB</Typography>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={2}>
              {topPortfolios.map((portfolio) => (
                <Card 
                  key={portfolio.id}
                  sx={{ 
                    cursor: 'pointer',
                    '&:hover': { boxShadow: 3 }
                  }}
                  onClick={() => navigate(`/portfolios/show/${portfolio.id}`)}
                >
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar sx={{ bgcolor: 'primary.main' }}>
                          <PieChartIcon />
                        </Avatar>
                        <Box>
                          <Typography variant="h6">{portfolio.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {portfolio.portfolio_id || "ID: N/A"} • {portfolio.portfolio_type || "Standard"}
                          </Typography>
                        </Box>
                      </Stack>
                      <Box textAlign="right">
                        <Typography variant="h6">
                          {(portfolio.total_upb || 0).toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {portfolio.total_loans || 0} loans
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Paper>
        </Grid>

        {/* Investor Distribution */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Investor Distribution</Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={investorData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} />
                  <Tooltip 
                    formatter={(value, name) => [
                      name === "upb" 
                        ? value.toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })
                        : value.toLocaleString(),
                      name === "upb" ? "UPB" : "Loans"
                    ]}
                  />
                  <Legend />
                  <Bar name="UPB" dataKey="upb" fill="#82ca9d" />
                  <Bar name="Loans" dataKey="loans" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PortfolioDashboard;