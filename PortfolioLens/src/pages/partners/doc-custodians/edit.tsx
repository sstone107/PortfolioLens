import { Edit } from "@refinedev/mui";
import { useForm } from "@refinedev/react-hook-form";
import { Box, TextField, Checkbox, FormControlLabel, Grid } from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import { IResourceComponentsProps } from "@refinedev/core";

interface IDocCustodianFormData {
  name: string;
  code: string;
  active: boolean;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
}

export const DocCustodianEdit: React.FC<IResourceComponentsProps> = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  
  const { saveButtonProps, register, formState: { errors }, refineCore: { queryResult } } = useForm<IDocCustodianFormData>({
    refineCoreProps: {
      resource: "doc_custodians",
      id,
      redirect: "/partners"
    }
  });

  // Show loading or handle error states
  const docCustodianData = queryResult?.data?.data;
  if (!docCustodianData) return null;

  return (
    <Edit 
      title="Edit Document Custodian" 
      saveButtonProps={saveButtonProps}
      goBack={() => navigate("/partners?tab=0")}
    >
      <Box
        component="form"
        sx={{ display: "flex", flexDirection: "column" }}
        autoComplete="off"
      >
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              {...register("name", {
                required: "This field is required",
              })}
              error={!!errors.name}
              helperText={errors.name?.message as string}
              margin="normal"
              fullWidth
              label="Name"
              name="name"
              autoFocus
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              {...register("code")}
              margin="normal"
              fullWidth
              label="Code"
              name="code"
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Checkbox
                  {...register("active")}
                  name="active"
                />
              }
              label="Active"
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              {...register("contact_name")}
              margin="normal"
              fullWidth
              label="Contact Name"
              name="contact_name"
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              {...register("contact_email")}
              margin="normal"
              fullWidth
              label="Contact Email"
              name="contact_email"
              type="email"
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              {...register("contact_phone")}
              margin="normal"
              fullWidth
              label="Contact Phone"
              name="contact_phone"
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              {...register("address")}
              margin="normal"
              fullWidth
              label="Address"
              name="address"
              placeholder="Full address including city, state and zip"
            />
          </Grid>
        </Grid>
      </Box>
    </Edit>
  );
};

export default DocCustodianEdit;