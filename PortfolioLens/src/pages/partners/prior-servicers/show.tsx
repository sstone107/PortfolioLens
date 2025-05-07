import { useShow, IResourceComponentsProps } from "@refinedev/core";
import { Show, TextField, useDataGrid } from "@refinedev/mui";
import { Typography, Grid, Card, CardContent } from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";

export const PriorServicerShow: React.FC<IResourceComponentsProps> = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  
  const { queryResult } = useShow({
    resource: "prior_servicers",
    id,
  });
  
  const { data, isLoading } = queryResult;
  const record = data?.data;

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!record) {
    return <div>Prior Servicer not found</div>;
  }

  return (
    <Show 
      title="Prior Servicer Details" 
      goBack={() => navigate("/partners?tab=2")}
    >
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Basic Information
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1">Name</Typography>
                  <Typography variant="body1">{record.name}</Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1">Code</Typography>
                  <Typography variant="body1">{record.code || "N/A"}</Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1">Status</Typography>
                  <Typography variant="body1">
                    {record.active ? "Active" : "Inactive"}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Contact Information
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1">Contact Name</Typography>
                  <Typography variant="body1">{record.contact_name || "N/A"}</Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1">Contact Email</Typography>
                  <Typography variant="body1">{record.contact_email || "N/A"}</Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1">Contact Phone</Typography>
                  <Typography variant="body1">{record.contact_phone || "N/A"}</Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Address
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="subtitle1">Address</Typography>
                  <Typography variant="body1">
                    {record.address || "N/A"}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Information
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1">Created At</Typography>
                  <Typography variant="body1">
                    {new Date(record.created_at).toLocaleString()}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle1">Last Updated</Typography>
                  <Typography variant="body1">
                    {new Date(record.updated_at).toLocaleString()}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Show>
  );
};

export default PriorServicerShow;