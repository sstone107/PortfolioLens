import { IResourceComponentsProps, useShow } from "@refinedev/core";
import {
  Show,
  TextFieldComponent as TextField,
  DateField,
  BooleanField,
} from "@refinedev/mui";
import { Typography, Stack, Box, Chip } from "@mui/material";
import React from "react";

/**
 * Servicer show component for displaying detailed servicer information
 */
export const ServicerShow: React.FC<IResourceComponentsProps> = () => {
  const { queryResult } = useShow();
  const { data, isLoading } = queryResult;

  const record = data?.data;

  return (
    <Show isLoading={isLoading}>
      <Stack gap={1}>
        <Typography variant="body1" fontWeight="bold">
          Name
        </Typography>
        <TextField value={record?.name} />

        <Typography variant="body1" fontWeight="bold">
          Code
        </Typography>
        <TextField value={record?.code} />

        <Typography variant="body1" fontWeight="bold">
          Contact Name
        </Typography>
        <TextField value={record?.contact_name} />

        <Typography variant="body1" fontWeight="bold">
          Contact Email
        </Typography>
        <TextField value={record?.contact_email} />

        <Typography variant="body1" fontWeight="bold">
          Contact Phone
        </Typography>
        <TextField value={record?.contact_phone} />

        <Typography variant="body1" fontWeight="bold">
          Status
        </Typography>
        <Box>
          {record?.active !== undefined && (
            <Chip 
              label={record.active ? "Active" : "Inactive"}
              color={record.active ? "success" : "default"}
            />
          )}
        </Box>

        <Typography variant="body1" fontWeight="bold">
          Created At
        </Typography>
        <DateField value={record?.created_at} format="MM/DD/YYYY HH:mm" />

        <Typography variant="body1" fontWeight="bold">
          Updated At
        </Typography>
        <DateField value={record?.updated_at} format="MM/DD/YYYY HH:mm" />

        {record?.global_attributes && (
          <>
            <Typography variant="body1" fontWeight="bold">
              Global Attributes
            </Typography>
            <Box
              sx={{
                p: 1,
                bgcolor: "background.paper",
                borderRadius: 1,
                maxHeight: "200px",
                overflow: "auto",
              }}
            >
              <pre>{JSON.stringify(record.global_attributes, null, 2)}</pre>
            </Box>
          </>
        )}
      </Stack>
    </Show>
  );
};

export default ServicerShow;