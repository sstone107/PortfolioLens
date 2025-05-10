import React from "react";
import {
  Box,
  Card,
  CardContent,
  Container,
  Grid,
  Paper,
  Typography,
  Button,
  useTheme,
} from "@mui/material";
import {
  PieChart as PieChartIcon,
  Description as DescriptionIcon,
  AccountBalance as AccountBalanceIcon,
  TrendingUp as TrendingUpIcon,
  Search as SearchIcon,
  TravelExplore as TravelExploreIcon,
  Handshake as HandshakeIcon,
  SupervisorAccount as SupervisorAccountIcon,
  Dashboard as DashboardIcon,
  Keyboard as KeyboardIcon,
} from "@mui/icons-material";
import { useNavigation } from "@refinedev/core";

type ShortcutItem = {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  color: string;
};

export const HomePage: React.FC = () => {
  const { push } = useNavigation();
  const theme = useTheme();

  const shortcuts: ShortcutItem[] = [
    {
      title: "Portfolios",
      description: "Manage your mortgage portfolios",
      icon: <PieChartIcon fontSize="large" />,
      path: "/portfolios",
      color: theme.palette.primary.main,
    },
    {
      title: "Loans",
      description: "View and manage individual loans",
      icon: <DescriptionIcon fontSize="large" />,
      path: "/loans",
      color: theme.palette.secondary.main,
    },
    {
      title: "Import Data",
      description: "Import loan data using templates",
      icon: <TravelExploreIcon fontSize="large" />,
      path: "/batch-import",
      color: "#1a8754", // Green color matching the app's branding
    },
    {
      title: "Advanced Search",
      description: "Search across your loan portfolio",
      icon: <SearchIcon fontSize="large" />,
      path: "/loans/search",
      color: "#6c757d", // Gray color
    },
    {
      title: "Servicers",
      description: "Manage loan servicers",
      icon: <AccountBalanceIcon fontSize="large" />,
      path: "/servicers",
      color: "#fd7e14", // Orange color
    },
    {
      title: "Investors",
      description: "Track investment entities",
      icon: <TrendingUpIcon fontSize="large" />,
      path: "/investors",
      color: "#0d6efd", // Blue color
    },
  ];

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Welcome to PortfolioLens
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Your comprehensive mortgage portfolio management platform
        </Typography>
      </Box>

      {/* Quick Stats Overview */}
      <Paper
        elevation={2}
        sx={{
          p: 3,
          mb: 4,
          display: "flex",
          flexDirection: "column",
          borderRadius: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <DashboardIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
          <Typography variant="h6" component="h2">
            Quick Overview
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Navigate to key sections of the application or view the dashboard for detailed analytics.
        </Typography>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={() => push("/portfolios/dashboard")}
            startIcon={<DashboardIcon />}
          >
            View Dashboard
          </Button>
          <Button
            variant="outlined"
            onClick={() => push("/loans/search")}
            startIcon={<SearchIcon />}
          >
            Search Loans
          </Button>
        </Box>
      </Paper>

      {/* Shortcuts Grid */}
      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        Quick Access
      </Typography>
      <Grid container spacing={3}>
        {shortcuts.map((item, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <Card
              sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                cursor: "pointer",
                transition: "transform 0.2s",
                "&:hover": {
                  transform: "translateY(-4px)",
                },
              }}
              onClick={() => push(item.path)}
            >
              <CardContent>
                <Box sx={{ display: "flex", mb: 1.5, alignItems: "center" }}>
                  <Box sx={{ 
                    color: item.color,
                    bgcolor: `${item.color}15`, // Very light version of the color
                    p: 1,
                    borderRadius: 1,
                    mr: 2
                  }}>
                    {item.icon}
                  </Box>
                  <Typography variant="h6" component="div">
                    {item.title}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {item.description}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Keyboard Shortcuts Section */}
      <Paper
        elevation={2}
        sx={{
          p: 3,
          mt: 4,
          mb: 4,
          display: "flex",
          flexDirection: "column",
          borderRadius: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <KeyboardIcon sx={{ mr: 1, color: theme.palette.info.main }} />
          <Typography variant="h6" component="h2">
            Keyboard Shortcuts
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Use these shortcuts for faster navigation and to quickly access features:
        </Typography>
        <Box component="ul" sx={{ listStyleType: 'none', paddingLeft: 0, margin: 0 }}>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1" component="span">
              <Box component="kbd" sx={{ display: 'inline-block', fontWeight: 'bold', color: theme.palette.text.primary, backgroundColor: theme.palette.grey[200], padding: '2px 6px', borderRadius: '4px', border: `1px solid ${theme.palette.grey[400]}`, mr: 0.5 }}>Ctrl</Box> 
              + 
              <Box component="kbd" sx={{ display: 'inline-block', fontWeight: 'bold', color: theme.palette.text.primary, backgroundColor: theme.palette.grey[200], padding: '2px 6px', borderRadius: '4px', border: `1px solid ${theme.palette.grey[400]}`, ml: 0.5, mr: 0.5 }}>K</Box> 
              (or <Box component="kbd" sx={{ display: 'inline-block', fontWeight: 'bold', color: theme.palette.text.primary, backgroundColor: theme.palette.grey[200], padding: '2px 6px', borderRadius: '4px', border: `1px solid ${theme.palette.grey[400]}`, mr: 0.5 }}>Cmd</Box> 
              + 
              <Box component="kbd" sx={{ display: 'inline-block', fontWeight: 'bold', color: theme.palette.text.primary, backgroundColor: theme.palette.grey[200], padding: '2px 6px', borderRadius: '4px', border: `1px solid ${theme.palette.grey[400]}`, ml: 0.5 }}>K</Box>): Focus Quick Search
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1" component="span">
              <Box component="kbd" sx={{ display: 'inline-block', fontWeight: 'bold', color: theme.palette.text.primary, backgroundColor: theme.palette.grey[200], padding: '2px 6px', borderRadius: '4px', border: `1px solid ${theme.palette.grey[400]}` }}>Esc</Box>: Clear & Close Quick Search
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1" component="span">
              <Box component="kbd" sx={{ display: 'inline-block', fontWeight: 'bold', color: theme.palette.text.primary, backgroundColor: theme.palette.grey[200], padding: '2px 6px', borderRadius: '4px', border: `1px solid ${theme.palette.grey[400]}`, mr: 0.5 }}>↑</Box> 
              / 
              <Box component="kbd" sx={{ display: 'inline-block', fontWeight: 'bold', color: theme.palette.text.primary, backgroundColor: theme.palette.grey[200], padding: '2px 6px', borderRadius: '4px', border: `1px solid ${theme.palette.grey[400]}`, ml: 0.5 }}>↓</Box> 
              Arrows: Navigate Search Results
            </Typography>
          </Box>
          <Box component="li" sx={{ mb: 1 }}>
            <Typography variant="body1" component="span">
              <Box component="kbd" sx={{ display: 'inline-block', fontWeight: 'bold', color: theme.palette.text.primary, backgroundColor: theme.palette.grey[200], padding: '2px 6px', borderRadius: '4px', border: `1px solid ${theme.palette.grey[400]}` }}>Enter</Box>: Select Search Result
            </Typography>
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
          More shortcuts may be available within specific tools and features.
        </Typography>
      </Paper>

      {/* Admin and Help Section */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <SupervisorAccountIcon sx={{ mr: 1, color: "#6f42c1" }} />
                <Typography variant="h6" component="div">
                  Administration
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Access administrative functions like user management and system settings.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => push("/admin")}
              >
                Go to Admin Panel
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <HandshakeIcon sx={{ mr: 1, color: "#20c997" }} />
                <Typography variant="h6" component="div">
                  Partners
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Manage your business partners, custodians, and sellers.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => push("/partners")}
              >
                Manage Partners
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};

export default HomePage;
