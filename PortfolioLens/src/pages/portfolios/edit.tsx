import { IResourceComponentsProps } from "@refinedev/core";
import { Edit, useAutocomplete } from "@refinedev/mui";
import { Box, TextField, Autocomplete, MenuItem, InputAdornment } from "@mui/material";
import { useForm } from "@refinedev/react-hook-form";
import { Controller } from "react-hook-form";
import React from "react";

// Portfolio type options
const portfolioTypeOptions = [
  "Fannie",
  "Freddie",
  "Ginnie",
  "Private",
  "Mixed",
];

/**
 * Portfolio edit component for updating existing portfolios
 * with form validation and relationship selection
 */
export const PortfolioEdit: React.FC<IResourceComponentsProps> = () => {
  const {
    saveButtonProps,
    refineCore: { queryResult, formLoading },
    register,
    control,
    formState: { errors },
    setValue,
  } = useForm();

  const portfolioData = queryResult?.data?.data;

  // Servicer autocomplete for relationship selection
  const { autocompleteProps: servicerAutocompleteProps } = useAutocomplete({
    resource: "servicers",
    defaultValue: portfolioData?.servicer_id,
  });

  // Investor autocomplete for relationship selection
  const { autocompleteProps: investorAutocompleteProps } = useAutocomplete({
    resource: "investors",
    defaultValue: portfolioData?.investor_id,
  });
  
  // Doc Custodian autocomplete
  const { autocompleteProps: docCustodianAutocompleteProps } = useAutocomplete({
    resource: "doc_custodians",
    defaultValue: portfolioData?.doc_custodian_id,
  });
  
  // Seller autocomplete
  const { autocompleteProps: sellerAutocompleteProps } = useAutocomplete({
    resource: "sellers",
    defaultValue: portfolioData?.seller_id,
  });
  
  // Prior Servicer autocomplete
  const { autocompleteProps: priorServicerAutocompleteProps } = useAutocomplete({
    resource: "prior_servicers",
    defaultValue: portfolioData?.prior_servicer_id,
  });

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
          label="Portfolio Name"
          name="name"
        />
        <TextField
          {...register("portfolio_id", {
            required: "This field is required - used to match loans by investor loan number"
          })}
          error={!!errors.portfolio_id}
          helperText={(errors.portfolio_id?.message as string) || "Used to match loans with matching investor loan number"}
          margin="normal"
          fullWidth
          label="Portfolio ID / Loan Identifier"
          name="portfolio_id"
        />
        <Controller
          control={control}
          name="investor_id"
          defaultValue={portfolioData?.investor_id}
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
                />
              )}
            />
          )}
        />
        <Controller
          control={control}
          name="servicer_id"
          defaultValue={portfolioData?.servicer_id}
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
                />
              )}
            />
          )}
        />
        <Controller
          control={control}
          name="portfolio_type"
          defaultValue={portfolioData?.portfolio_type}
          render={({ field }) => (
            <TextField
              {...field}
              select
              margin="normal"
              fullWidth
              label="Portfolio Type"
              name="portfolio_type"
              error={!!errors.portfolio_type}
              helperText={errors.portfolio_type?.message as string}
            >
              {portfolioTypeOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <TextField
          {...register("total_loans", {
            valueAsNumber: true,
          })}
          type="number"
          margin="normal"
          fullWidth
          label="Total Loans"
          name="total_loans"
          error={!!errors.total_loans}
          helperText={errors.total_loans?.message as string}
        />
        <TextField
          {...register("total_upb", {
            valueAsNumber: true,
          })}
          type="number"
          margin="normal"
          fullWidth
          label="Total UPB"
          name="total_upb"
          error={!!errors.total_upb}
          helperText={errors.total_upb?.message as string}
          InputProps={{
            startAdornment: <InputAdornment position="start">$</InputAdornment>,
          }}
        />
        <TextField
          {...register("master_servicing_fee", {
            valueAsNumber: true,
          })}
          type="number"
          margin="normal"
          fullWidth
          label="Master Servicing Fee ($)"
          name="master_servicing_fee"
          error={!!errors.master_servicing_fee}
          helperText={errors.master_servicing_fee?.message as string}
          InputProps={{
            startAdornment: <InputAdornment position="start">$</InputAdornment>,
          }}
        />
        <TextField
          {...register("sale_date")}
          margin="normal"
          fullWidth
          label="Sale Date"
          name="sale_date"
          type="date"
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          {...register("transfer_date")}
          margin="normal"
          fullWidth
          label="Transfer Date"
          name="transfer_date"
          type="date"
          InputLabelProps={{ shrink: true }}
        />
        <Controller
          control={control}
          name="doc_custodian_id"
          defaultValue={portfolioData?.doc_custodian_id}
          render={({ field }) => (
            <Autocomplete
              {...docCustodianAutocompleteProps}
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
                  label="Document Custodian"
                  margin="normal"
                  variant="outlined"
                  error={!!errors.doc_custodian_id}
                  helperText={errors.doc_custodian_id?.message as string}
                />
              )}
            />
          )}
        />
        <Controller
          control={control}
          name="seller_id"
          defaultValue={portfolioData?.seller_id}
          render={({ field }) => (
            <Autocomplete
              {...sellerAutocompleteProps}
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
                  label="Seller"
                  margin="normal"
                  variant="outlined"
                  error={!!errors.seller_id}
                  helperText={errors.seller_id?.message as string}
                />
              )}
            />
          )}
        />
        <Controller
          control={control}
          name="prior_servicer_id"
          defaultValue={portfolioData?.prior_servicer_id}
          render={({ field }) => (
            <Autocomplete
              {...priorServicerAutocompleteProps}
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
                  label="Prior Servicer"
                  margin="normal"
                  variant="outlined"
                  error={!!errors.prior_servicer_id}
                  helperText={errors.prior_servicer_id?.message as string}
                />
              )}
            />
          )}
        />
        <TextField
          {...register("description")}
          margin="normal"
          fullWidth
          label="Description"
          name="description"
          multiline
          rows={3}
        />
        <TextField
          {...register("notes")}
          margin="normal"
          fullWidth
          label="Notes"
          name="notes"
          multiline
          rows={3}
        />
      </Box>
    </Edit>
  );
};

export default PortfolioEdit;