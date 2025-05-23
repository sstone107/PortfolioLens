import React from 'react';
import { Container, Typography, Box, Paper } from '@mui/material';
import TemplateManager from '../../components/import/TemplateManager';

const TemplatesManagerPage: React.FC = () => {
  return (
    <Container maxWidth="lg">
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h4" gutterBottom>Import Templates</Typography>
        <Typography variant="body1" paragraph>
          Create and manage templates for importing data from files. Templates define the structure
          of your import tables and help map file columns to database fields.
        </Typography>
        
        <Box sx={{ mt: 4 }}>
          <TemplateManager />
        </Box>
      </Paper>
    </Container>
  );
};

export default TemplatesManagerPage;