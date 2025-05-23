import React from 'react';
import { Container, Typography, Box, Paper } from '@mui/material';
import BackgroundImporter from '../../components/import/BackgroundImporter';

const BackgroundImportPage: React.FC = () => {
  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>Background File Import</Typography>
        <Typography variant="body1" paragraph>
          Upload large files (up to 50GB) securely. Files will be processed server-side,
          and you can monitor progress or retry failed imports.
        </Typography>
        
        <Box sx={{ mt: 4 }}>
          <BackgroundImporter />
        </Box>
      </Paper>
    </Container>
  );
};

export default BackgroundImportPage;