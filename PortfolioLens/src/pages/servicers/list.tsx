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

// Define the servicer interface with strict typing
interface Servicer {
  id: string; // UUID type in PostgreSQL
  name: string;
  code?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  global_attributes?: Record<string, any>; // JSONB type in PostgreSQL
}

/**
 * Servicer list component for displaying all servicers in a data grid
 * with sorting, filtering, and pagination
 */
export const ServicerList: React.FC<IResourceComponentsProps> = () => {
  const { dataGridProps } = useDataGrid<Servicer>({
    syncWithLocation: true,
  });

  // Define columns for the data grid with appropriate types and formatting
  const columns = React.useMemo<GridColDef<Servicer>[]>(
    () => [
      { field: "name", headerName: "Name", flex: 1, minWidth: 200 },
      { field: "code", headerName: "Code", flex: 1, minWidth: 150 },
      { field: "contact_name", headerName: "Contact Name", flex: 1, minWidth: 180 },
      { field: "contact_email", headerName: "Email", flex: 1, minWidth: 200 },
      { field: "contact_phone", headerName: "Phone", flex: 1, minWidth: 150 },
      { 
        field: "active", 
        headerName: "Status", 
        width: 120,
        renderCell: (params) => (
          <span>{params.row.active ? "Active" : "Inactive"}</span>
        ),
      },
      {
        field: "created_at",
        headerName: "Created At",
        width: 180,
        renderCell: (params) => (
          <DateField value={params.row.created_at} format="MM/DD/YYYY HH:mm" />
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
    <List>
      <DataGrid {...dataGridProps} columns={columns} autoHeight />
    </List>
  );
};

export default ServicerList;