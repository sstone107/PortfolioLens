import { IResourceComponentsProps, useShow } from "@refinedev/core";
import {
  Show,
  NumberField,
  TextFieldComponent as TextField,
  DateField,
} from "@refinedev/mui";
import { Typography, Stack, Box } from "@mui/material";
import React from "react";

/**
 * Loan show component for displaying detailed loan information
 */
export const LoanShow: React.FC<IResourceComponentsProps> = () => {
  const { queryResult } = useShow();
  const { data, isLoading } = queryResult;

  const record = data?.data;

  return (
    <Show isLoading={isLoading}>
      <Stack gap={1}>
        <Typography variant="body1" fontWeight="bold">
          Loan Number
        </Typography>
        <TextField value={record?.loan_number} />

        <Typography variant="body1" fontWeight="bold">
          Investor Loan Number
        </Typography>
        <TextField value={record?.investor_loan_number} />

        <Typography variant="body1" fontWeight="bold">
          Servicer
        </Typography>
        <TextField value={record?.servicer?.name} />

        <Typography variant="body1" fontWeight="bold">
          Investor
        </Typography>
        <TextField value={record?.investor?.name} />

        <Typography variant="body1" fontWeight="bold">
          UPB
        </Typography>
        <NumberField
          value={record?.upb}
          options={{ style: "currency", currency: "USD" }}
        />

        <Typography variant="body1" fontWeight="bold">
          Note Rate
        </Typography>
        <Box>
          {record?.note_rate && (
            <Typography>
              {(record.note_rate * 100).toFixed(3)}%
            </Typography>
          )}
        </Box>

        <Typography variant="body1" fontWeight="bold">
          Loan Status
        </Typography>
        <TextField value={record?.loan_status} />

        <Typography variant="body1" fontWeight="bold">
          Delinquency Status
        </Typography>
        <TextField value={record?.delinquency_status} />

        <Typography variant="body1" fontWeight="bold">
          Last Payment Date
        </Typography>
        <DateField value={record?.last_payment_date} format="MM/DD/YYYY" />

        <Typography variant="body1" fontWeight="bold">
          Maturity Date
        </Typography>
        <DateField value={record?.maturity_date} format="MM/DD/YYYY" />

        <Typography variant="body1" fontWeight="bold">
          Created At
        </Typography>
        <DateField value={record?.created_at} format="MM/DD/YYYY HH:mm" />

        <Typography variant="body1" fontWeight="bold">
          Updated At
        </Typography>
        <DateField value={record?.updated_at} format="MM/DD/YYYY HH:mm" />
      </Stack>
    </Show>
  );
};

export default LoanShow;
