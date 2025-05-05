/**
 * Unauthorized Page Component
 * 
 * This component is displayed when a user attempts to access a route 
 * they don't have permission to view.
 */

import React from "react";
import { useNavigation } from "@refinedev/core";
import { Box, Typography, Button, Paper } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";

export const Unauthorized: React.FC = () => {
  const { push, goBack } = useNavigation();

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="80vh"
    >
      <Paper
        elevation={3}
        sx={{
          p: 5,
          maxWidth: 600,
          textAlign: "center",
          borderRadius: 2,
        }}
      >
        <LockIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
        
        <Typography variant="h4" gutterBottom>
          Access Denied
        </Typography>
        
        <Typography variant="body1" color="text.secondary" paragraph>
          You don't have permission to access this page. If you believe this is an error,
          please contact your administrator for assistance.
        </Typography>
        
        <Box mt={4} display="flex" justifyContent="center" gap={2}>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={() => push("/")}
          >
            Return to Dashboard
          </Button>
          
          <Button 
            variant="outlined"
            onClick={() => goBack()}
          >
            Go Back
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default Unauthorized;
