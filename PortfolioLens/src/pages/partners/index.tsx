import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Tabs, 
  Tab, 
  Box, 
  Button, 
  Typography,
  Card,
  CardContent,
  Grid
} from "@mui/material";
import { useState, useEffect } from "react";
import AddIcon from "@mui/icons-material/Add";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
import StorefrontIcon from "@mui/icons-material/Storefront";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import { List, useDataGrid } from "@refinedev/mui";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useList } from "@refinedev/core";

// Define the partner interfaces
interface Partner {
  id: string;
  name: string;
  code?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}


// Partners page with tabs
export const PartnersPage = () => {
  const [tabValue, setTabValue] = useState(0);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize tab based on URL query parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      const tabIndex = parseInt(tabParam);
      if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex <= 2) {
        setTabValue(tabIndex);
      }
    }
  }, [searchParams.toString()]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setSearchParams({ tab: newValue.toString() });
  };

  // Fetch data for each partner type
  const { data: docCustodians } = useList<Partner>({ 
    resource: "doc_custodians",
    pagination: { current: 1, pageSize: 10 },
  });

  const { data: sellers } = useList<Partner>({ 
    resource: "sellers",
    pagination: { current: 1, pageSize: 10 },
  });

  const { data: priorServicers } = useList<Partner>({ 
    resource: "prior_servicers",
    pagination: { current: 1, pageSize: 10 },
  });

  // Define columns for the data grids
  const columns = (): GridColDef<Partner>[] => [
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
      field: "actions",
      headerName: "Actions",
      sortable: false,
      renderCell: function render({ row }) {
        return (
          <>
            <Button 
              size="small" 
              onClick={() => navigate(`/partners/${getResourceForTab()}/edit/${row.id}`)}
            >
              Edit
            </Button>
            <Button 
              size="small" 
              onClick={() => navigate(`/partners/${getResourceForTab()}/show/${row.id}`)}
            >
              View
            </Button>
          </>
        );
      },
      align: "center",
      headerAlign: "center",
      minWidth: 150,
    },
  ];

  // Helper to get current resource based on tab
  const getResourceForTab = () => {
    switch (tabValue) {
      case 0: return "doc-custodians";
      case 1: return "sellers";
      case 2: return "prior-servicers";
      default: return "doc-custodians";
    }
  };

  // Handle create button click
  const handleCreateClick = () => {
    navigate(`/partners/${getResourceForTab()}/create`);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Document Custodians" icon={<FolderSpecialIcon />} iconPosition="start" />
          <Tab label="Sellers" icon={<StorefrontIcon />} iconPosition="start" />
          <Tab label="Prior Servicers" icon={<SupportAgentIcon />} iconPosition="start" />
        </Tabs>
      </Box>

      <Box sx={{ p: 2 }}>
        {/* Doc Custodians Tab */}
        {tabValue === 0 && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h5">Document Custodians</Typography>
              <Button 
                variant="contained" 
                startIcon={<AddIcon />} 
                onClick={handleCreateClick}
              >
                Add Document Custodian
              </Button>
            </Box>
            
            {docCustodians?.data?.length === 0 ? (
              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <FolderSpecialIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 2 }}>
                  Document custodians are entities that hold loan documentation. No document custodians have been created yet.
                </Typography>
              </Box>
            ) : (
              <List>
                <DataGrid
                  rows={docCustodians?.data || []}
                  columns={columns()}
                  autoHeight
                  pageSizeOptions={[10, 25, 50, 100]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 10 } },
                  }}
                />
              </List>
            )}
          </>
        )}

        {/* Sellers Tab */}
        {tabValue === 1 && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h5">Sellers</Typography>
              <Button 
                variant="contained" 
                startIcon={<AddIcon />} 
                onClick={handleCreateClick}
              >
                Add Seller
              </Button>
            </Box>
            
            {sellers?.data?.length === 0 ? (
              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <StorefrontIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 2 }}>
                  Sellers are entities from which loans are purchased. No sellers have been created yet.
                </Typography>
              </Box>
            ) : (
              <List>
                <DataGrid
                  rows={sellers?.data || []}
                  columns={columns()}
                  autoHeight
                  pageSizeOptions={[10, 25, 50, 100]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 10 } },
                  }}
                />
              </List>
            )}
          </>
        )}

        {/* Prior Servicers Tab */}
        {tabValue === 2 && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h5">Prior Servicers</Typography>
              <Button 
                variant="contained" 
                startIcon={<AddIcon />} 
                onClick={handleCreateClick}
              >
                Add Prior Servicer
              </Button>
            </Box>
            
            {priorServicers?.data?.length === 0 ? (
              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <SupportAgentIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
                <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 2 }}>
                  Prior servicers previously serviced loans in your portfolio. No prior servicers have been created yet.
                </Typography>
              </Box>
            ) : (
              <List>
                <DataGrid
                  rows={priorServicers?.data || []}
                  columns={columns()}
                  autoHeight
                  pageSizeOptions={[10, 25, 50, 100]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 10 } },
                  }}
                />
              </List>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

export default PartnersPage;