import { IResourceComponentsProps } from "@refinedev/core";
import { Edit } from "@refinedev/mui";
import { Box, TextField, FormControlLabel, Switch } from "@mui/material";
import { useForm } from "@refinedev/react-hook-form";
import { Controller } from "react-hook-form";
import React from "react";

/**
 * Investor edit component for updating existing investors
 * with form validation
 */
export const InvestorEdit: React.FC<IResourceComponentsProps> = () => {
  const {
    saveButtonProps,
    refineCore: { queryResult, formLoading },
    register,
    control,
    formState: { errors },
  } = useForm();

  const investorData = queryResult?.data?.data;

  return (
    <Edit isLoading={formLoading} saveButtonProps={saveButtonProps}>
      <Box
        component="form"
        sx={{ display: "flex", flexDirection: "column" }}
        autoComplete="off"
      >
        <TextField
          {...register("name", {
            required: "This field is required",
          })}
          error={!!errors.name}
          helperText={errors.name?.message as string}
          margin="normal"
          fullWidth
          label="Investor Name"
          name="name"
        />
        <TextField
          {...register("code")}
          error={!!errors.code}
          helperText={errors.code?.message as string}
          margin="normal"
          fullWidth
          label="Investor Code"
          name="code"
        />
        <TextField
          {...register("contact_name")}
          margin="normal"
          fullWidth
          label="Contact Name"
          name="contact_name"
        />
        <TextField
          {...register("contact_email", {
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: "Invalid email address",
            },
          })}
          error={!!errors.contact_email}
          helperText={errors.contact_email?.message as string}
          margin="normal"
          fullWidth
          label="Contact Email"
          name="contact_email"
          type="email"
        />
        <TextField
          {...register("contact_phone")}
          margin="normal"
          fullWidth
          label="Contact Phone"
          name="contact_phone"
        />
        <Controller
          control={control}
          name="active"
          defaultValue={investorData?.active ?? true}
          render={({ field }) => (
            <FormControlLabel
              control={
                <Switch
                  {...field}
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
              }
              label="Active"
              sx={{ margin: "16px 0" }}
            />
          )}
        />
      </Box>
    </Edit>
  );
};

export default InvestorEdit;