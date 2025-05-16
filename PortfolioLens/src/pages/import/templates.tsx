/**
 * Mapping Template Manager Page
 * Page for managing import mapping templates
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Container,
  Grid,
  Card,
  CardContent,
  CardActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Breadcrumbs,
  Link,
  Alert,
  Snackbar,
  Divider,
  CircularProgress,
  Tooltip,
  Stack
} from '@mui/material';
import TemplateEditorDialog from '../../components/import/dialogs/TemplateEditorDialog';
import HomeIcon from '@mui/icons-material/Home';
import FolderIcon from '@mui/icons-material/Folder';
import SettingsIcon from '@mui/icons-material/Settings';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import InfoIcon from '@mui/icons-material/Info';
import AddIcon from '@mui/icons-material/Add';
import FileUploadIcon from '@mui/icons-material/FileUpload';

import { 
  loadTemplates, 
  deleteTemplate, 
  exportTemplate, 
  importTemplate 
} from '../../components/import/mappingLogic';
import { MappingTemplate } from '../../store/batchImportStore';
import { recordMetadataService } from '../../components/import/services/RecordMetadataService';

/**
 * Template Manager page component
 */
const TemplateManagerPage: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<MappingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<MappingTemplate | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [templateToEdit, setTemplateToEdit] = useState<MappingTemplate | null>(null);
  
  // User ID (would come from auth context in real app)
  const userId = 'current_user';
  
  // Load templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const data = await loadTemplates();
        setTemplates(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load templates');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTemplates();
  }, []);
  
  // Handle template deletion
  const handleDeleteClick = (template: MappingTemplate) => {
    setSelectedTemplate(template);
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    if (!selectedTemplate) return;
    
    try {
      await deleteTemplate(selectedTemplate.id);
      
      // Log deletion in audit
      await recordMetadataService.createAuditRecord({
        userId,
        action: 'template_delete',
        entityType: 'template',
        entityId: selectedTemplate.id,
        entityName: selectedTemplate.name,
        details: {
          description: selectedTemplate.description,
          sheetCount: selectedTemplate.sheetMappings.length
        }
      });
      
      // Update template list
      setTemplates(templates.filter(t => t.id !== selectedTemplate.id));
      setSuccess(`Template "${selectedTemplate.name}" deleted successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setDeleteDialogOpen(false);
      setSelectedTemplate(null);
    }
  };
  
  // Handle template export
  const handleExport = async (template: MappingTemplate) => {
    try {
      await exportTemplate(template);
      
      // Log export in audit
      await recordMetadataService.createAuditRecord({
        userId,
        action: 'export',
        entityType: 'template',
        entityId: template.id,
        entityName: template.name,
        details: {
          description: template.description,
          sheetCount: template.sheetMappings.length,
          format: 'json'
        }
      });
      
      setSuccess(`Template "${template.name}" exported successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export template');
    }
  };
  
  // Handle template import
  const handleImportClick = () => {
    setImportDialogOpen(true);
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setImportFile(files[0]);
    }
  };
  
  const handleImportConfirm = async () => {
    if (!importFile) return;
    
    try {
      setImportLoading(true);
      const importedTemplate = await importTemplate(importFile);
      
      // Log import in audit
      await recordMetadataService.createAuditRecord({
        userId,
        action: 'template_create',
        entityType: 'template',
        entityId: importedTemplate.id,
        entityName: importedTemplate.name,
        details: {
          description: importedTemplate.description,
          sheetCount: importedTemplate.sheetMappings.length,
          importedFrom: importFile.name
        }
      });
      
      // Update template list
      setTemplates([importedTemplate, ...templates]);
      setSuccess(`Template "${importedTemplate.name}" imported successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import template');
    } finally {
      setImportDialogOpen(false);
      setImportFile(null);
      setImportLoading(false);
    }
  };
  
  // Handle edit template click
  const handleEditClick = (template: MappingTemplate) => {
    setTemplateToEdit(template);
    setEditDialogOpen(true);
  };
  
  // Handle edit template success
  const handleEditSuccess = (updatedTemplate: MappingTemplate) => {
    // Update template in the list
    setTemplates(templates.map(t => 
      t.id === updatedTemplate.id ? updatedTemplate : t
    ));
    
    // Log edit in audit
    recordMetadataService.createAuditRecord({
      userId,
      action: 'template_update',
      entityType: 'template',
      entityId: updatedTemplate.id,
      entityName: updatedTemplate.name,
      details: {
        description: updatedTemplate.description,
        version: updatedTemplate.version
      }
    }).catch(err => console.error('Error logging template update:', err));
    
    setSuccess(`Template "${updatedTemplate.name}" updated successfully`);
  };

  // Handle template duplication
  const handleDuplicate = async (template: MappingTemplate) => {
    try {
      // Create a copy of the template with a new ID
      const duplicateTemplate: Partial<MappingTemplate> = {
        ...template,
        id: undefined, // Let the server generate a new ID
        name: `${template.name} (Copy)`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Use import functionality to save the duplicate
      const savedTemplate = await importTemplate(
        new File(
          [JSON.stringify({ 
            templateName: duplicateTemplate.name,
            description: duplicateTemplate.description,
            headerRow: duplicateTemplate.headerRow,
            tablePrefix: duplicateTemplate.tablePrefix,
            servicerId: duplicateTemplate.servicerId,
            filePattern: duplicateTemplate.filePattern,
            sheets: duplicateTemplate.sheetMappings
          })], 
          'duplicate.json', 
          { type: 'application/json' }
        )
      );
      
      // Log duplication in audit
      await recordMetadataService.createAuditRecord({
        userId,
        action: 'template_create',
        entityType: 'template',
        entityId: savedTemplate.id,
        entityName: savedTemplate.name,
        details: {
          description: savedTemplate.description,
          duplicatedFrom: template.id,
          duplicatedName: template.name
        }
      });
      
      // Update template list
      setTemplates([savedTemplate, ...templates]);
      setSuccess(`Template "${template.name}" duplicated successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate template');
    }
  };
  
  // Handle error display close
  const handleErrorClose = () => {
    setError(null);
  };
  
  // Handle success display close
  const handleSuccessClose = () => {
    setSuccess(null);
  };
  
  // Format date for display
  const formatDate = (dateString: Date | string | undefined): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  
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
        <Link
          underline="hover"
          sx={{ display: 'flex', alignItems: 'center' }}
          color="inherit"
          href="/import"
        >
          <FolderIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          Import
        </Link>
        <Typography
          sx={{ display: 'flex', alignItems: 'center' }}
          color="text.primary"
        >
          <SettingsIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          Mapping Templates
        </Typography>
      </Breadcrumbs>
      
      {/* Page header */}
      <Box sx={{ mb: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Import Mapping Templates
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" align="center" sx={{ maxWidth: 800 }}>
          Create, manage, and share templates that define how your data files map to database tables.
          Save time on repeated imports and ensure consistency across your team.
        </Typography>
      </Box>
      
      {/* Action buttons */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between' }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => navigate('/import/batch')}
        >
          Create New Template
        </Button>
        
        <Button
          variant="outlined"
          startIcon={<UploadIcon />}
          onClick={handleImportClick}
        >
          Import Template
        </Button>
      </Box>
      
      {/* Templates list */}
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>Loading templates...</Typography>
          </Box>
        ) : templates.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <InfoIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              No Templates Found
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Create your first template by importing data or uploading a template file.
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center">
              <Button 
                variant="contained"
                startIcon={<FileUploadIcon />}
                onClick={() => navigate('/import/batch')}
              >
                Import Data
              </Button>
              <Button 
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={handleImportClick}
              >
                Upload Template
              </Button>
            </Stack>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Template Name</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Sheets</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id} hover>
                    <TableCell>
                      <Typography fontWeight="medium">{template.name}</Typography>
                      {template.filePattern && (
                        <Typography variant="caption" color="text.secondary">
                          Pattern: {template.filePattern}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{template.description}</TableCell>
                    <TableCell>
                      {template.sheetMappings ? template.sheetMappings.length : 0}
                    </TableCell>
                    <TableCell>
                      {formatDate(template.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={`v${template.version || 1}`} 
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Edit Template (Advanced Mode)">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleEditClick(template)}
                            sx={{
                              bgcolor: 'primary.light',
                              '&:hover': {
                                bgcolor: 'primary.main',
                                color: 'white'
                              }
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Duplicate">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleDuplicate(template)}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Export">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleExport(template)}
                          >
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteClick(template)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      
      {/* Import instructions */}
      <Paper sx={{ p: 3, mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          About Import Templates
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" gutterBottom>
              Templates store:
            </Typography>
            <Box component="ul" sx={{ pl: 3 }}>
              <li>Sheet-to-table mappings</li>
              <li>Column-to-field mappings</li>
              <li>Data types for each field</li>
              <li>Header row configuration</li>
              <li>Table prefix settings</li>
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" gutterBottom>
              Benefits:
            </Typography>
            <Box component="ul" sx={{ pl: 3 }}>
              <li>Save time on repetitive imports</li>
              <li>Ensure consistent data structure</li>
              <li>Share configurations with your team</li>
              <li>Automate import workflows</li>
            </Box>
          </Grid>
        </Grid>
      </Paper>
      
      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Template</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the template "{selectedTemplate?.name}"?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Import dialog */}
      <Dialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)}>
        <DialogTitle>Import Template</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography gutterBottom>
              Select a template JSON file to import:
            </Typography>
            
            <Box sx={{ mt: 2, mb: 2 }}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadIcon />}
                fullWidth
                disabled={importLoading}
              >
                Browse Files
                <input
                  type="file"
                  accept=".json"
                  hidden
                  onChange={handleFileChange}
                />
              </Button>
            </Box>
            
            {importFile && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Selected file: {importFile.name}
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleImportConfirm} 
            variant="contained"
            disabled={!importFile || importLoading}
            startIcon={importLoading ? <CircularProgress size={20} /> : undefined}
          >
            {importLoading ? 'Importing...' : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Error snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={handleErrorClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleErrorClose} 
          severity="error" 
          sx={{ width: '100%' }}
        >
          {error}
        </Alert>
      </Snackbar>
      
      {/* Success snackbar */}
      <Snackbar
        open={!!success}
        autoHideDuration={6000}
        onClose={handleSuccessClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleSuccessClose} 
          severity="success" 
          sx={{ width: '100%' }}
        >
          {success}
        </Alert>
      </Snackbar>
      
      {/* Enhanced Template Editor Dialog */}
      <TemplateEditorDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        template={templateToEdit}
        onSuccess={handleEditSuccess}
      />
    </Container>
  );
};

export default TemplateManagerPage;