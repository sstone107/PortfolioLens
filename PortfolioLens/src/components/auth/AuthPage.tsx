import React from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Stack,
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

  const renderSocialButtons = () => {
    if (type === "forgotPassword") return null;

    return (
      <>
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Button
            fullWidth
            variant="outlined"
            color="primary"
            size="large"
            startIcon={<GoogleIcon />}
            onClick={() => handleProviderLogin("google")}
          >
            Continue with Google
          </Button>
        </Stack>
        <Divider sx={{ my: 3 }}>
          <Typography color="textSecondary" variant="body2">
            OR
          </Typography>
        </Divider>
      </>
    );
  };

  return (
    <Container
      component="main"
      maxWidth="xs"
      sx={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      <Card elevation={4}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Typography component="h1" variant="h5" mb={2}>
              {cardTitle}
            </Typography>
            {renderSocialButtons()}
            <RefineAuthPage
              type={type}
              formProps={formProps}
              wrapperProps={{
                style: {
                  width: "100%",
                },
              }}
            />
            
            {type === "login" && (
              <Box sx={{ mt: 2, textAlign: "center" }}>
                <Typography variant="body2" color="textSecondary">
                  Or sign in with a{" "}
                  <Button
                    component="a"
                    href="/magic-link"
                    variant="text"
                    sx={{ p: 0, fontWeight: "bold", verticalAlign: "baseline" }}
                  >
                    magic link
                  </Button>
                </Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
};
