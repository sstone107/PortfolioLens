import { createTheme } from "@mui/material/styles";

// PortfolioLens Theme with updated color palette
// Primary: #1a8754, Secondary: #6c757d, Accent: #e9f7ef

export const GreenwayLightTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1a8754", // Primary green from color palette
      light: "#3c9970", // Lighter shade of primary
      dark: "#14663f", // Darker shade of primary
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#6c757d", // Secondary gray from color palette
      light: "#868e96",
      dark: "#495057",
      contrastText: "#ffffff",
    },
    background: {
      default: "#f5f5f5",
      paper: "#ffffff",
    },
    success: {
      main: "#4caf50",
    },
    info: {
      main: "#03a9f4",
    },
    warning: {
      main: "#ff9800",
    },
    error: {
      main: "#f44336",
    },
  },
  typography: {
    fontFamily: "'Roboto', 'Helvetica', 'Arial', sans-serif",
    h1: {
      fontWeight: 500,
    },
    h2: {
      fontWeight: 500,
    },
    h3: {
      fontWeight: 500,
    },
    h4: {
      fontWeight: 500,
    },
    h5: {
      fontWeight: 500,
    },
    h6: {
      fontWeight: 500,
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#1a8754", // Updated to use the primary color
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          textTransform: "none",
        },
        contained: {
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0px 2px 4px -1px rgba(0,0,0,0.2)",
            backgroundColor: "#14663f", // Darker primary on hover
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: "#e9f7ef", // Accent color for hover
          },
          "&.Mui-selected": {
            backgroundColor: "#e9f7ef",
            "&:hover": {
              backgroundColor: "#d8eee2", // Slightly darker accent on hover
            },
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: "#e9f7ef", // Accent color for hover
          },
          "&.Mui-selected": {
            backgroundColor: "#e9f7ef",
            "&:hover": {
              backgroundColor: "#d8eee2", // Slightly darker accent on hover
            },
          },
        },
      },
    },
  },
});

export const GreenwayDarkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#3c9970", // Lighter version of primary for dark mode
      light: "#5eab87",
      dark: "#1a8754",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#868e96", // Lighter version of secondary for dark mode
      light: "#adb5bd",
      dark: "#6c757d",
      contrastText: "#ffffff",
    },
    background: {
      default: "#121212",
      paper: "#1e1e1e",
    },
    success: {
      main: "#4caf50",
    },
    info: {
      main: "#29b6f6",
    },
    warning: {
      main: "#ffa726",
    },
    error: {
      main: "#ef5350",
    },
  },
  typography: {
    fontFamily: "'Roboto', 'Helvetica', 'Arial', sans-serif",
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#1a8754", // Updated to use the primary color
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          textTransform: "none",
        },
        contained: {
          "&:hover": {
            backgroundColor: "#14663f", // Darker primary on hover
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: "#1f503a", // Darker hover for dark mode
          },
          "&.Mui-selected": {
            backgroundColor: "#1f503a",
            "&:hover": {
              backgroundColor: "#193d2d", // Even darker on hover
            },
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: "#1f503a", // Darker hover for dark mode
          },
          "&.Mui-selected": {
            backgroundColor: "#1f503a",
            "&:hover": {
              backgroundColor: "#193d2d", // Even darker on hover
            },
          },
        },
      },
    },
  },
});
