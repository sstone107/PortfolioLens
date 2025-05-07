import { Create } from "@refinedev/mui";
import { useForm } from "@refinedev/react-hook-form";
import { Box, TextField, Checkbox, FormControlLabel, Grid } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { IResourceComponentsProps } from "@refinedev/core";

interface ISellerFormData {
  name: string;
  code: string;
  active: boolean;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
}

export const SellerCreate: React.FC<IResourceComponentsProps> = () => {
  const navigate = useNavigate();
  
  const { saveButtonProps, register, formState: { errors } } = useForm<ISellerFormData>({
    refineCoreProps: {
      resource: "sellers",
      redirect: "/partners?tab=1",
    }
  });

  return (
    <Create 
      title="Create Seller" 
      saveButtonProps={saveButtonProps}
      goBack={() => navigate("/partners?tab=1")}
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
                  defaultChecked
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
    </Create>
  );
};

export default SellerCreate;