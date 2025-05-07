import { IResourceComponentsProps } from "@refinedev/core";
import {
  useDataGrid,
  List,
  EditButton,
  ShowButton,
  DateField,
} from "@refinedev/mui";
import { Button } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import React from "react";
import { Link } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import MapIcon from "@mui/icons-material/Map";

// Define the loan interface with strict typing
interface Loan {
  id: number;
  loan_number: string;
  investor_loan_number?: string;
  servicer_id: number;
  investor_id: number;
  upb: number;
  note_rate: number;
  loan_status: string;
  delinquency_status?: string;
  last_payment_date?: Date;
  maturity_date?: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Loan list component for displaying all loans in a data grid
 * with sorting, filtering, and pagination
 */
export const LoanList: React.FC<IResourceComponentsProps> = () => {
  const { dataGridProps } = useDataGrid<Loan>({
    syncWithLocation: true,
  });

  // Define columns for the data grid with appropriate types and formatting
  const columns = React.useMemo<GridColDef<Loan>[]>(
    () => [
      { field: "loan_number", headerName: "Loan Number", flex: 1, minWidth: 150 },
      { field: "investor_loan_number", headerName: "Investor Loan #", flex: 1, minWidth: 150 },
      {
        field: "upb",
        headerName: "UPB",
        type: "number",
        width: 120,
        valueFormatter: (params: any) =>
          params.value ? params.value.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
          }) : "",
      },
      {
        field: "note_rate",
        headerName: "Note Rate",
        type: "number",
        width: 100,
        valueFormatter: (params: any) =>
          params.value ? `${(params.value * 100).toFixed(3)}%` : "",
      },
      { field: "loan_status", headerName: "Status", width: 120 },
      { field: "delinquency_status", headerName: "Delinquency", width: 120 },
      {
        field: "last_payment_date",
        headerName: "Last Payment",
        width: 120,
        renderCell: (params) => (
          <DateField value={params.row.last_payment_date} format="MM/DD/YYYY" />
        ),
      },
      {
        field: "maturity_date",
        headerName: "Maturity",
        width: 120,
        renderCell: (params) => (
          <DateField value={params.row.maturity_date} format="MM/DD/YYYY" />
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
          Manage loan records and their associations with portfolios. Use the Portfolio Mapping tool above to associate investor loan numbers with portfolios.
        </Typography>
      </Box>
      <DataGrid {...dataGridProps} columns={columns} autoHeight />
    </List>
  );
};

export default LoanList;
