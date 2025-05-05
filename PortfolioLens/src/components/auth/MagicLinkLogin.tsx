import React, { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  TextField,
  Typography,
  Alert,
  Collapse,
  CircularProgress,
} from "@mui/material";
import { supabaseClient } from "../../utility";

export const MagicLinkLogin: React.FC = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.trim()) {
      setError("Please enter your email address");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { error: authError } = await supabaseClient.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      
      if (authError) {
        throw new Error(authError.message);
      }
      
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to send the magic link. Please try again.");
    } finally {
      setIsLoading(false);
    }
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
              Sign in with Magic Link
            </Typography>
            
            <Collapse in={!!error}>
              <Alert 
                severity="error" 
                sx={{ mb: 2, width: "100%" }}
                onClose={() => setError(null)}
              >
                {error}
              </Alert>
            </Collapse>
            
            <Collapse in={success}>
              <Alert 
                severity="success" 
                sx={{ mb: 2, width: "100%" }}
              >
                Magic link sent! Check your email.
              </Alert>
            </Collapse>
            
            {!success && (
              <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1, width: "100%" }}>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  id="email"
                  label="Email Address"
                  name="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  color="primary"
                  sx={{ mt: 3, mb: 2 }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <CircularProgress size={24} color="inherit" />
                  ) : (
                    "Send Magic Link"
                  )}
                </Button>
              </Box>
            )}
            
            <Typography variant="body2" color="textSecondary" align="center" sx={{ mt: 2 }}>
              We'll send a magic link to your email.
              <br />
              Click the link to sign in securely without a password.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
};
