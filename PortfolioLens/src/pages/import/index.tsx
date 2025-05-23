/**
 * Import Home Page
 * Landing page for the import functionality
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Container,
  Grid,
  Paper,
  Breadcrumbs,
  Link,
  Divider
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import FolderIcon from '@mui/icons-material/Folder';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SettingsIcon from '@mui/icons-material/Settings';
import HistoryIcon from '@mui/icons-material/History';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import GoogleDriveIcon from '@mui/icons-material/CloudSync';

/**
 * Import home page component
 */
const ImportHomePage: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <Link
          underline="hover"
          sx={{ display: 'flex', alignItems: 'center' }}
          color="inherit"
          href="/"
        >
          <HomeIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          Home
        </Link>
        <Typography
          sx={{ display: 'flex', alignItems: 'center' }}
          color="text.primary"
        >
          <FolderIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          Import
        </Typography>
      </Breadcrumbs>
      
      {/* Page header */}
      <Box sx={{ mb: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Data Import Center
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" align="center" sx={{ maxWidth: 800 }}>
          Import data from various sources into your database. Choose the method that best suits your needs.
        </Typography>
      </Box>
      
      
      {/* Import options */}
      <Grid container spacing={3}>
        {/* Google Drive Sync */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                <GoogleDriveIcon sx={{ fontSize: 60, color: 'primary.main' }} />
              </Box>
              <Typography variant="h5" component="h2" gutterBottom align="center">
                Google Drive Sync
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Automatically sync files from Google Drive folders. Configure multiple folders 
                with custom patterns and templates.
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                Features:
              </Typography>
              <Box component="ul" sx={{ pl: 2 }}>
                <li>Automatic file detection</li>
                <li>Pattern matching</li>
                <li>Scheduled syncs</li>
                <li>Template-based imports</li>
              </Box>
            </CardContent>
            <CardActions>
              <Button 
                variant="contained" 
                fullWidth
                color="primary"
                startIcon={<GoogleDriveIcon />}
                onClick={() => navigate('/import/google-drive-config')}
              >
                Configure Google Drive
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        {/* Batch Import */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                <CloudUploadIcon sx={{ fontSize: 60, color: 'primary.main' }} />
              </Box>
              <Typography variant="h5" component="h2" gutterBottom align="center">
                Batch Import
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Import multiple tables of data from Excel or CSV files. 
                Smart mapping automatically matches columns to database fields.
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                Ideal for:
              </Typography>
              <Box component="ul" sx={{ pl: 2 }}>
                <li>Large datasets</li>
                <li>Multi-table imports</li>
                <li>Regular data uploads</li>
              </Box>
            </CardContent>
            <CardActions>
              <Button 
                variant="contained" 
                fullWidth
                color="primary"
                startIcon={<CloudUploadIcon />}
                onClick={() => navigate('/import/batch')}
              >
                Start Batch Import
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        {/* Mapping Templates */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                <SettingsIcon sx={{ fontSize: 60, color: 'secondary.main' }} />
              </Box>
              <Typography variant="h5" component="h2" gutterBottom align="center">
                Mapping Templates
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Create and manage reusable templates that define how your data files map to database tables.
                Save time on repeated imports.
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                Features:
              </Typography>
              <Box component="ul" sx={{ pl: 2 }}>
                <li>Reuse mapping configurations</li>
                <li>Share templates with team</li>
                <li>Auto-detect mappings</li>
              </Box>
            </CardContent>
            <CardActions>
              <Button 
                variant="outlined" 
                fullWidth
                color="secondary"
                startIcon={<SettingsIcon />}
                onClick={() => navigate('/import/templates')}
              >
                Manage Templates
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        {/* Import History */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                <HistoryIcon sx={{ fontSize: 60, color: 'info.main' }} />
              </Box>
              <Typography variant="h5" component="h2" gutterBottom align="center">
                Import History
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                View and manage your past imports. Track success rates, error logs,
                and retry failed imports.
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                Benefits:
              </Typography>
              <Box component="ul" sx={{ pl: 2 }}>
                <li>Track import activity</li>
                <li>Review success rates</li>
                <li>Troubleshoot failed imports</li>
              </Box>
            </CardContent>
            <CardActions>
              <Button 
                variant="outlined" 
                fullWidth
                color="info"
                startIcon={<HistoryIcon />}
                onClick={() => navigate('/import/history')}
              >
                View History
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
      
      {/* Help section */}
      <Paper sx={{ p: 3, mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Import Documentation
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Button 
              startIcon={<SaveAltIcon />} 
              variant="text" 
              color="primary"
              sx={{ textAlign: 'left', justifyContent: 'flex-start' }}
            >
              Download Sample Template
            </Button>
          </Grid>
          <Grid item xs={12} md={4}>
            <Button 
              startIcon={<SaveAltIcon />} 
              variant="text" 
              color="primary"
              sx={{ textAlign: 'left', justifyContent: 'flex-start' }}
            >
              Import Guide PDF
            </Button>
          </Grid>
          <Grid item xs={12} md={4}>
            <Button 
              startIcon={<SaveAltIcon />} 
              variant="text" 
              color="primary"
              sx={{ textAlign: 'left', justifyContent: 'flex-start' }}
            >
              View Documentation
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
};

export default ImportHomePage;