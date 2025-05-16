/**
 * Template Edit Dialog
 * Dialog for editing mapping template properties
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  CircularProgress,
  Grid,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  Box,
  Alert
} from '@mui/material';
import { MappingTemplate } from '../../../store/batchImportStore';
import { editTemplate } from '../mappingLogic';

interface TemplateEditDialogProps {
  open: boolean;
  onClose: () => void;
  template: MappingTemplate | null;
  onSuccess: (updatedTemplate: MappingTemplate) => void;
}

const TemplateEditDialog: React.FC<TemplateEditDialogProps> = ({
  open,
  onClose,
  template,
  onSuccess
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [filePattern, setFilePattern] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize form when template changes
  useEffect(() => {
    if (template) {
      setName(template.name || '');
      setDescription(template.description || '');
      setFilePattern(template.filePattern || '');
    }
  }, [template]);
  
  const handleSubmit = async () => {
    if (!template?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Call the edit template function with the current values
      const updatedTemplate = await editTemplate(template.id, {
        name,
        description,
        filePattern
      });
      
      onSuccess(updatedTemplate);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update template');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog 
      open={open} 
      onClose={loading ? undefined : onClose} 
      maxWidth="md" 
      fullWidth
    >
      <DialogTitle>Edit Template</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <Box sx={{ mt: 2 }}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                label="Template Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                required
                disabled={loading}
                helperText="Enter a descriptive name for this template"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
                multiline
                rows={3}
                disabled={loading}
                helperText="Describe what type of files this template is for"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="File Pattern"
                value={filePattern}
                onChange={(e) => setFilePattern(e.target.value)}
                fullWidth
                disabled={loading}
                helperText="Pattern to match filenames (e.g., 'remittance_.*\\.xlsx')"
              />
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary">
                Template ID: {template?.id}
              </Typography>
              <Typography variant="subtitle2" color="text.secondary">
                Current Version: {template?.version || 1}
              </Typography>
              <Typography variant="subtitle2" color="text.secondary">
                Created: {template?.createdAt ? new Date(template.createdAt).toLocaleString() : 'N/A'}
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          color="primary"
          disabled={loading || !name.trim()}
          startIcon={loading ? <CircularProgress size={20} /> : undefined}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TemplateEditDialog;