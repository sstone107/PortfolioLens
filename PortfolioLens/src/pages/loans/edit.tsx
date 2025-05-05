import { IResourceComponentsProps } from "@refinedev/core";
import { Edit, useAutocomplete } from "@refinedev/mui";
import { Box, TextField, Autocomplete, MenuItem } from "@mui/material";
import { useForm } from "@refinedev/react-hook-form";
import { Controller } from "react-hook-form";
import React from "react";

// Loan status options
const loanStatusOptions = [
  "Active",
  "Paid Off",
  "Foreclosure",
  "REO",
  "Bankruptcy",
  "Inactive",
];

// Delinquency status options
const delinquencyStatusOptions = [
  "Current",
  "30 Days",
  "60 Days",
  "90 Days",
  "120+ Days",
  "In Foreclosure",
];

/**
 * Loan edit component for updating existing loans
 * with form validation and relationship selection
 */
export const LoanEdit: React.FC<IResourceComponentsProps> = () => {
  const {
    saveButtonProps,
    refineCore: { queryResult, formLoading },
    register,
    control,
    formState: { errors },
    setValue,
  } = useForm();

  const loanData = queryResult?.data?.data;

  // Servicer autocomplete for relationship selection
  const { autocompleteProps: servicerAutocompleteProps } = useAutocomplete({
    resource: "servicers",
    defaultValue: loanData?.servicer_id,
  });

  // Investor autocomplete for relationship selection
  const { autocompleteProps: investorAutocompleteProps } = useAutocomplete({
    resource: "investors",
    defaultValue: loanData?.investor_id,
  });

  return (
    <Edit isLoading={formLoading} saveButtonProps={saveButtonProps}>
      <Box
        component="form"
        sx={{ display: "flex", flexDirection: "column" }}
        autoComplete="off"
      >
        <TextField
          {...register("loan_number", {
            required: "This field is required",
          })}
          error={!!errors.loan_number}
          helperText={errors.loan_number?.message as string}
          margin="normal"
          fullWidth
          label="Loan Number"
          name="loan_number"
          disabled
        />
        <TextField
          {...register("investor_loan_number")}
          margin="normal"
          fullWidth
          label="Investor Loan Number"
          name="investor_loan_number"
        />
        <Controller
          control={control}
          name="servicer_id"
          rules={{ required: "This field is required" }}
          defaultValue={loanData?.servicer_id}
          render={({ field }) => (
            <Autocomplete
              {...servicerAutocompleteProps}
              {...field}
              onChange={(_, value) => {
                field.onChange(value?.id ?? undefined);
              }}
              getOptionLabel={(item) => {
                return item.name ? item.name : "";
              }}
              isOptionEqualToValue={(option, value) =>
                value === undefined || option?.id === value?.id
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Servicer"
                  margin="normal"
                  variant="outlined"
                  error={!!errors.servicer_id}
                  helperText={errors.servicer_id?.message as string}
                  required
                />
              )}
            />
          )}
        />
        <Controller
          control={control}
          name="investor_id"
          rules={{ required: "This field is required" }}
          defaultValue={loanData?.investor_id}
          render={({ field }) => (
            <Autocomplete
              {...investorAutocompleteProps}
              {...field}
              onChange={(_, value) => {
                field.onChange(value?.id ?? undefined);
              }}
              getOptionLabel={(item) => {
                return item.name ? item.name : "";
              }}
              isOptionEqualToValue={(option, value) =>
                value === undefined || option?.id === value?.id
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Investor"
                  margin="normal"
                  variant="outlined"
                  error={!!errors.investor_id}
                  helperText={errors.investor_id?.message as string}
                  required
                />
              )}
            />
          )}
        />
        <TextField
          {...register("upb", {
            required: "This field is required",
            valueAsNumber: true,
          })}
          error={!!errors.upb}
          helperText={errors.upb?.message as string}
          margin="normal"
          fullWidth
          label="UPB"
          name="upb"
          type="number"
          inputProps={{ step: "0.01" }}
        />
        <TextField
          {...register("note_rate", {
            required: "This field is required",
            valueAsNumber: true,
          })}
          error={!!errors.note_rate}
          helperText={(errors.note_rate?.message as string) || "Enter as decimal (e.g., 0.0575 for 5.75%)"}
          margin="normal"
          fullWidth
          label="Note Rate"
          name="note_rate"
          type="number"
          inputProps={{ step: "0.001" }}
        />
        <Controller
          control={control}
          name="loan_status"
          rules={{ required: "This field is required" }}
          defaultValue={loanData?.loan_status}
          render={({ field }) => (
            <TextField
              {...field}
              margin="normal"
              fullWidth
              label="Loan Status"
              name="loan_status"
              select
              error={!!errors.loan_status}
              helperText={errors.loan_status?.message as string}
            >
              {loanStatusOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <Controller
          control={control}
          name="delinquency_status"
          defaultValue={loanData?.delinquency_status || "Current"}
          render={({ field }) => (
            <TextField
              {...field}
              margin="normal"
              fullWidth
              label="Delinquency Status"
              name="delinquency_status"
              select
              error={!!errors.delinquency_status}
              helperText={errors.delinquency_status?.message as string}
            >
              {delinquencyStatusOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <TextField
          {...register("last_payment_date")}
          margin="normal"
          fullWidth
          label="Last Payment Date"
          name="last_payment_date"
          type="date"
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          {...register("maturity_date")}
          margin="normal"
          fullWidth
          label="Maturity Date"
          name="maturity_date"
          type="date"
          InputLabelProps={{ shrink: true }}
        />
      </Box>
    </Edit>
  );
};

export default LoanEdit;
