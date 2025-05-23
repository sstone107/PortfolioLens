import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Stack,
  Alert,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { supabase } from '../../utility/supabaseClient';

// Define field type options
const FIELD_TYPES = ['text', 'numeric', 'boolean', 'date', 'timestamp', 'uuid'];

// Type definitions
interface ImportTemplateField {
  column: string;
  type: string;
}

interface ImportTemplate {
  id: string;
  name: string;
  description: string;
  table_name: string;
  fields: ImportTemplateField[];
  user_id: string;
  created_at: string;
  updated_at: string;
}

const TemplateManager: React.FC = () => {
  // State for templates list
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // State for template editor
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [currentTemplate, setCurrentTemplate] = useState<ImportTemplate | null>(null);
  const [templateName, setTemplateName] = useState<string>('');
  const [templateDescription, setTemplateDescription] = useState<string>('');
  const [tableName, setTableName] = useState<string>('');
  const [fields, setFields] = useState<ImportTemplateField[]>([]);
  const [newField, setNewField] = useState<{ column: string; type: string }>({ column: '', type: 'text' });
  
  // State for notifications
  const [snackbar, setSnackbar] = useState<{open: boolean, message: string, severity: 'success' | 'error' | 'info'}>({
    open: false,
    message: '',
    severity: 'info'
  });

  // Fetch templates on component mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  // Fetch templates from the database
  const fetchTemplates = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('import_templates')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      showSnackbar('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Open editor for creating a new template
  const handleAddTemplate = () => {
    setCurrentTemplate(null);
    setTemplateName('');
    setTemplateDescription('');
    setTableName('in_');
    setFields([]);
    setEditorOpen(true);
  };

  // Open editor for editing an existing template
  const handleEditTemplate = (template: ImportTemplate) => {
    setCurrentTemplate(template);
    setTemplateName(template.name);
    setTemplateDescription(template.description || '');
    setTableName(template.table_name);
    setFields([...template.fields]);
    setEditorOpen(true);
  };

  // Delete a template
  const handleDeleteTemplate = async (template: ImportTemplate) => {
    if (!confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('import_templates')
        .delete()
        .eq('id', template.id);
        
      if (error) throw error;
      
      fetchTemplates();
      showSnackbar('Template deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting template:', error);
      showSnackbar('Failed to delete template', 'error');
    }
  };

  // Add a new field to the template
  const handleAddField = () => {
    if (!newField.column.trim()) {
      showSnackbar('Field name is required', 'error');
      return;
    }
    
    // Check for duplicate field names
    if (fields.some(f => f.column.toLowerCase() === newField.column.toLowerCase())) {
      showSnackbar('Field name already exists', 'error');
      return;
    }
    
    setFields([...fields, { ...newField }]);
    setNewField({ column: '', type: 'text' });
  };

  // Remove a field from the template
  const handleRemoveField = (index: number) => {
    const newFields = [...fields];
    newFields.splice(index, 1);
    setFields(newFields);
  };

  // Validate table name format
  const validateTableName = (name: string): boolean => {
    // Must start with in_ prefix
    if (!name.startsWith('in_')) {
      showSnackbar('Table name must start with "in_" prefix', 'error');
      return false;
    }
    
    // Must be lowercase_snake_case
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      showSnackbar('Table name must be in lowercase_snake_case format', 'error');
      return false;
    }
    
    return true;
  };

  // Save the template
  const handleSaveTemplate = async () => {
    // Validate inputs
    if (!templateName.trim()) {
      showSnackbar('Template name is required', 'error');
      return;
    }
    
    if (!tableName.trim()) {
      showSnackbar('Table name is required', 'error');
      return;
    }
    
    if (!validateTableName(tableName)) {
      return;
    }
    
    if (fields.length === 0) {
      showSnackbar('At least one field is required', 'error');
      return;
    }
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      
      if (!userId) {
        throw new Error('User not authenticated');
      }
      
      // Prepare template data
      const templateData = {
        name: templateName.trim(),
        description: templateDescription.trim(),
        table_name: tableName.trim(),
        fields,
        user_id: userId
      };
      
      if (currentTemplate) {
        // Update existing template
        const { error } = await supabase
          .from('import_templates')
          .update(templateData)
          .eq('id', currentTemplate.id);
          
        if (error) throw error;
        
        showSnackbar('Template updated successfully', 'success');
      } else {
        // Create new template
        const { error } = await supabase
          .from('import_templates')
          .insert(templateData);
          
        if (error) throw error;
        
        showSnackbar('Template created successfully', 'success');
      }
      
      // Close editor and refresh templates
      setEditorOpen(false);
      fetchTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      showSnackbar('Failed to save template', 'error');
    }
  };

  // Show snackbar notification
  const showSnackbar = (message: string, severity: 'success' | 'error' | 'info') => {
    setSnackbar({
      open: true,
      message,
      severity
    });
  };

  // Close snackbar
  const handleCloseSnackbar = () => {
    setSnackbar({
      ...snackbar,
      open: false
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Import Templates</Typography>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<AddIcon />} 
          onClick={handleAddTemplate}
        >
          New Template
        </Button>
      </Box>
      
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Table Name</TableCell>
              <TableCell>Fields</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  {loading ? 'Loading...' : 'No templates found'}
                </TableCell>
              </TableRow>
            ) : (
              templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>{template.name}</TableCell>
                  <TableCell>{template.description}</TableCell>
                  <TableCell>{template.table_name}</TableCell>
                  <TableCell>{template.fields.length} fields</TableCell>
                  <TableCell>
                    <IconButton 
                      color="primary" 
                      onClick={() => handleEditTemplate(template)}
                      size="small"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      color="error" 
                      onClick={() => handleDeleteTemplate(template)}
                      size="small"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      
      {/* Template Editor Dialog */}
      <Dialog 
        open={editorOpen} 
        onClose={() => setEditorOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {currentTemplate ? 'Edit Template' : 'Create Template'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              label="Template Name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              fullWidth
              required
            />
            
            <TextField
              label="Description"
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
            />
            
            <TextField
              label="Table Name"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              fullWidth
              required
              helperText="Must start with 'in_' and use lowercase_snake_case format"
            />
            
            <Box>
              <Typography variant="h6" gutterBottom>Fields</Typography>
              
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Field Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell width="100px">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={index}>
                        <TableCell>{field.column}</TableCell>
                        <TableCell>{field.type}</TableCell>
                        <TableCell>
                          <IconButton 
                            color="error" 
                            onClick={() => handleRemoveField(index)}
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell>
                        <TextField
                          placeholder="Field Name"
                          value={newField.column}
                          onChange={(e) => setNewField({ ...newField, column: e.target.value })}
                          size="small"
                          fullWidth
                        />
                      </TableCell>
                      <TableCell>
                        <FormControl fullWidth size="small">
                          <Select
                            value={newField.type}
                            onChange={(e) => setNewField({ ...newField, type: e.target.value })}
                          >
                            {FIELD_TYPES.map((type) => (
                              <MenuItem key={type} value={type}>
                                {type}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="contained" 
                          color="primary"
                          onClick={handleAddField}
                          fullWidth
                        >
                          Add
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditorOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveTemplate}
            color="primary"
            variant="contained"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TemplateManager;