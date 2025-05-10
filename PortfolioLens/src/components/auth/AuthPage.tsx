import React from "react";
import {
  Box,
  Button,
  Divider,
  Typography,
} from "@mui/material";
import { AuthPage as RefineAuthPage } from "@refinedev/mui";
import GoogleIcon from "@mui/icons-material/Google";
import { supabaseClient } from "../../utility";

type AuthProviders = "google";

type AuthPageProps = {
  type: "login" | "register" | "forgotPassword";
  title?: string;
  formProps?: any;
};

export const AuthPage: React.FC<AuthPageProps> = ({
  type,
  title,
  formProps,
}) => {
  const handleProviderLogin = async (provider: AuthProviders) => {
    await supabaseClient.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
  };

  let cardTitle = title;
  if (!cardTitle) {
    switch (type) {
      case "login":
        cardTitle = "Sign in to your account";
        break;
      case "register":
        cardTitle = "Create a new account";
        break;
      case "forgotPassword":
        cardTitle = "Reset your password";
        break;
    }
  }

  // This function renders the content above the standard form
  const renderProviderButtons = () => {
    return (
      <>
        <Button
          fullWidth
          variant="outlined"
          color="primary"
          size="large"
          startIcon={<GoogleIcon />}
          onClick={() => handleProviderLogin("google")}
          sx={{ mb: 2 }}
        >
          Continue with Google
        </Button>

        <Divider sx={{ my: 2, width: "100%" }}>
          <Typography color="textSecondary" variant="body2">
            OR
          </Typography>
        </Divider>
      </>
    );
  };

  // This function renders content below the standard form
  const renderFooter = () => {
    if (type !== "login") return null;
    
    return (
      <Box mt={2} width="100%">
        <Button
          fullWidth
          variant="outlined"
          color="secondary"
          size="large"
          onClick={() => {
            window.location.href = "/magic-link";
          }}
        >
          Sign in with Magic Link
        </Button>
      </Box>
    );
  };

  return (
    <RefineAuthPage
      type={type}
      title={cardTitle}
      wrapperProps={{
        sx: {
          paddingTop: 2,
          paddingBottom: 2,
        }
      }}
      contentProps={{
        sx: {
          paddingX: 0
        }
      }}
      formProps={formProps}
      renderContent={(content: React.ReactNode) => {
        return (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%"
            }}
          >
            {renderProviderButtons()}
            {content}
            {renderFooter()}
          </Box>
        );
      }}
    />
  );
};
