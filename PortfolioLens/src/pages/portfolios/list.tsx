import { IResourceComponentsProps } from "@refinedev/core";
import {
  useDataGrid,
  List,
  EditButton,
  ShowButton,
  DateField,
} from "@refinedev/mui";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import React from "react";
import { Avatar, Box, Card, CardContent, Chip, Grid, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router";
import PieChartIcon from "@mui/icons-material/PieChart";

// Define the portfolio interface with strict typing
interface Portfolio {
  id: string; // UUID type in PostgreSQL
  name: string;
  portfolio_id?: string;
  investor_id?: string;
  investor?: { name: string };
  servicer_id?: string;
  servicer?: { name: string };
  portfolio_type?: string;
  sale_date?: Date;
  transfer_date?: Date;
  total_loans?: number;
  total_upb?: number;
  description?: string;
  doc_custodian?: string;
  seller?: string;
  prior_servicer?: string;
  master_servicing_fee?: number;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  global_attributes?: Record<string, any>; // JSONB type in PostgreSQL
}

/**
 * Portfolio list component for displaying all portfolios in a data grid
 * with sorting, filtering, and pagination
 */
export const PortfolioList: React.FC<IResourceComponentsProps> = () => {
  const { dataGridProps } = useDataGrid<Portfolio>({
    syncWithLocation: true,
  });
  
  const navigate = useNavigate();

  // Define columns for the data grid with appropriate types and formatting
  const columns = React.useMemo<GridColDef<Portfolio>[]>(
    () => [
      { field: "name", headerName: "Name", flex: 1, minWidth: 200 },
      { field: "portfolio_id", headerName: "Portfolio ID", flex: 1, minWidth: 150 },
      { 
        field: "investor", 
        headerName: "Investor", 
        flex: 1, 
        minWidth: 180,
        valueGetter: (params) => params.row.investor?.name || '',
      },
      { 
        field: "servicer", 
        headerName: "Servicer", 
        flex: 1, 
        minWidth: 180,
        valueGetter: (params) => params.row.servicer?.name || '',
      },
      { field: "portfolio_type", headerName: "Type", flex: 1, minWidth: 120 },
      {
        field: "total_loans",
        headerName: "Loans",
        type: "number",
        width: 100,
        align: "right",
        headerAlign: "right",
      },
      {
        field: "total_upb",
        headerName: "UPB",
        type: "number",
        width: 150,
        align: "right",
        headerAlign: "right",
        valueFormatter: (params) =>
          params.value
            ? params.value.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })
            : "",
      },
      {
        field: "sale_date",
        headerName: "Sale Date",
        width: 120,
        renderCell: (params) => (
          <DateField value={params.row.sale_date} format="MM/DD/YYYY" />
        ),
      },
      {
        field: "actions",
        headerName: "Actions",
        sortable: false,
        renderCell: function render({ row }) {
          return (
            <>
              <EditButton hideText recordItemId={row.id} />
              <ShowButton hideText recordItemId={row.id} />
            </>
          );
        },
        align: "center",
        headerAlign: "center",
        minWidth: 80,
      },
    ],
    [],
  );

  // Top 4 portfolios for summary cards
  const topPortfolios = dataGridProps.rows?.slice(0, 4) || [];

  return (
    <List>
      <Stack spacing={2}>
        <Grid container spacing={2} mb={3}>
          {topPortfolios.map((portfolio) => (
            <Grid item xs={12} sm={6} md={3} key={portfolio.id}>
              <Card
                sx={{
                  cursor: "pointer",
                  transition: "transform 0.2s",
                  "&:hover": {
                    transform: "scale(1.02)",
                    boxShadow: 3,
                  },
                }}
                onClick={() => navigate(`/portfolios/show/${portfolio.id}`)}
              >
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                    <Avatar sx={{ bgcolor: "primary.main" }}>
                      <PieChartIcon />
                    </Avatar>
                    <Typography
                      variant="h6"
                      component="div"
                      noWrap
                      sx={{ fontWeight: "bold" }}
                    >
                      {portfolio.name}
                    </Typography>
                  </Stack>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    gutterBottom
                    noWrap
                  >
                    ID: {portfolio.portfolio_id}
                  </Typography>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography variant="body2">
                      {portfolio.total_loans || 0} Loans
                    </Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {portfolio.total_upb
                        ? portfolio.total_upb.toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })
                        : "$0"}
                    </Typography>
                  </Stack>
                  <Box mt={1}>
                    <Chip
                      label={portfolio.portfolio_type || "Standard"}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Typography variant="h6" sx={{ mb: 1 }}>
          All Portfolios
        </Typography>
        <DataGrid {...dataGridProps} columns={columns} autoHeight />
      </Stack>
    </List>
  );
};

export default PortfolioList;