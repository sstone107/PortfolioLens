import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Chip,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  LinearProgress,
  Grid,
  Card,
  CardContent,
  Stack,
  Tabs,
  Tab
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Sync,
  CloudDownload,
  Schedule,
  CheckCircle,
  Error,
  BugReport,
  FolderOpen,
  History,
  CheckCircleOutline,
  ErrorOutline,
  HourglassEmpty,
  Close
} from '@mui/icons-material';
import { format } from 'date-fns';
import { supabaseClient as supabase } from '../../utility/supabaseClient';
import { useNavigate } from 'react-router-dom';

interface SyncConfig {
  id: string;
  folder_id: string;
  folder_name: string;
  template_id: string;
  file_pattern: string | null;
  enabled: boolean;
  include_subfolders: boolean;
  max_depth: number;
  last_sync_at: string | null;
  created_at: string;
  schedule_enabled: boolean;
  schedule_frequency: string | null;
  schedule_cron: string | null;
  schedule_timezone: string | null;
  cron_job_id: number | null;
}

interface Template {
  id: string;
  name: string;
  description: string;
  file_pattern?: string;
}

interface CronJobRun {
  jobid: number;
  jobname: string;
  start_time: string;
  end_time: string | null;
  status: string;
  return_message: string | null;
  runid: number;
}

export const GoogleDriveSyncConfig: React.FC = () => {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SyncConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    folder_id: '',
    folder_name: '',
    template_id: '',
    file_pattern: '',
    enabled: true,
    include_subfolders: false,
    max_depth: 1,
    schedule_enabled: false,
    schedule_frequency: 'daily',
    schedule_cron: '',
    schedule_timezone: 'America/New_York'
  });
  
  // Sync modal state
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    status: 'syncing' | 'success' | 'error';
    message: string;
    results?: any[];
    jobIds?: string[];
  }>({ status: 'syncing', message: 'Initializing sync...' });
  
  // Cron monitoring state
  const [selectedTab, setSelectedTab] = useState(0);
  const [cronHistory, setCronHistory] = useState<CronJobRun[]>([]);
  const [loadingCronHistory, setLoadingCronHistory] = useState(false);
  const [selectedConfigForHistory, setSelectedConfigForHistory] = useState<string | null>(null);
  const [cronHistoryDialogOpen, setCronHistoryDialogOpen] = useState(false);

  // Load configurations
  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('google_drive_sync_config')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConfigs(data || []);
    } catch (err) {
      console.error('Error loading configs:', err);
      setError('Failed to load configurations');
    } finally {
      setLoading(false);
    }
  };

  // Load templates
  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('mapping_templates')
        .select('id, name, description')
        .order('name');

      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  };

  useEffect(() => {
    loadConfigs();
    loadTemplates();
  }, []);

  // Handle form submission
  const handleSubmit = async () => {
    try {
      const data = {
        ...formData,
        file_pattern: formData.file_pattern || null,
        schedule_cron: formData.schedule_frequency === 'custom' ? formData.schedule_cron : null
      };

      let configId: string;

      if (editingConfig) {
        const { error } = await supabase
          .from('google_drive_sync_config')
          .update(data)
          .eq('id', editingConfig.id);

        if (error) throw error;
        configId = editingConfig.id;
      } else {
        const { data: newConfig, error } = await supabase
          .from('google_drive_sync_config')
          .insert(data)
          .select()
          .single();

        if (error) throw error;
        configId = newConfig.id;
      }

      // Manage cron job if scheduling is enabled
      if (data.schedule_enabled && data.enabled) {
        const { error: cronError } = await supabase.rpc('manage_google_drive_sync_cron', {
          p_config_id: configId,
          p_enabled: true,
          p_frequency: data.schedule_frequency,
          p_cron_expression: data.schedule_frequency === 'custom' ? data.schedule_cron : null
        });

        if (cronError) {
          console.error('Error setting up cron job:', cronError);
          setError('Configuration saved but scheduling failed. Please try again.');
        }
      } else if (editingConfig && editingConfig.cron_job_id && !data.schedule_enabled) {
        // Disable existing cron job
        const { error: cronError } = await supabase.rpc('manage_google_drive_sync_cron', {
          p_config_id: configId,
          p_enabled: false,
          p_frequency: 'daily',
          p_cron_expression: null
        });

        if (cronError) {
          console.error('Error disabling cron job:', cronError);
        }
      }

      setDialogOpen(false);
      setEditingConfig(null);
      setFormData({
        folder_id: '',
        folder_name: '',
        template_id: '',
        file_pattern: '',
        enabled: true,
        include_subfolders: false,
        max_depth: 1,
        schedule_enabled: false,
        schedule_frequency: 'daily',
        schedule_cron: '',
        schedule_timezone: 'America/New_York'
      });
      loadConfigs();
    } catch (err) {
      console.error('Error saving config:', err);
      setError('Failed to save configuration');
    }
  };

  // Handle edit
  const handleEdit = (config: SyncConfig) => {
    setEditingConfig(config);
    setFormData({
      folder_id: config.folder_id,
      folder_name: config.folder_name || '',
      template_id: config.template_id,
      file_pattern: config.file_pattern || '',
      enabled: config.enabled,
      include_subfolders: config.include_subfolders || false,
      max_depth: config.max_depth || 1,
      schedule_enabled: config.schedule_enabled || false,
      schedule_frequency: config.schedule_frequency || 'daily',
      schedule_cron: config.schedule_cron || '',
      schedule_timezone: config.schedule_timezone || 'America/New_York'
    });
    setDialogOpen(true);
  };

  // Browse folder contents
  const [browseDialogOpen, setBrowseDialogOpen] = useState(false);
  const [browseResults, setBrowseResults] = useState<any>(null);
  const [browsing, setBrowsing] = useState(false);

  const handleBrowseFolder = async (folderId: string, folderName?: string) => {
    setBrowsing(true);
    setBrowseResults(null);
    setBrowseDialogOpen(true);
    
    try {
      const { data, error } = await supabase.functions.invoke(
        'sync-google-drive',
        {
          body: { 
            testMode: true,
            browseFolderId: folderId
          }
        }
      );

      if (error) throw error;
      
      setBrowseResults({
        folderId,
        folderName: folderName || folderId,
        ...data
      });
    } catch (err: any) {
      console.error('Browse error:', err);
      if (err.message?.includes('service account not configured') || err.message?.includes('credentials missing')) {
        setError('Google Drive integration not configured. Please follow the setup guide to configure service account credentials.');
      } else {
        setError(err.message || 'Failed to browse folder');
      }
      setBrowseDialogOpen(false);
    } finally {
      setBrowsing(false);
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this configuration?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('google_drive_sync_config')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadConfigs();
    } catch (err) {
      console.error('Error deleting config:', err);
      setError('Failed to delete configuration');
    }
  };

  // Handle manual sync
  const handleSync = async (configId: string) => {
    setSyncing(configId);
    setSyncModalOpen(true);
    setSyncProgress({ status: 'syncing', message: 'Searching for files in Google Drive...' });
    
    try {
      const { data, error } = await supabase.functions.invoke(
        'sync-google-drive',
        {
          body: { configId }
        }
      );

      if (error) throw error;
      
      if (data.results && data.results.length > 0) {
        // Extract job IDs from results
        const jobIds = data.results
          .filter(r => r.jobId)
          .map(r => r.jobId);
        
        setSyncProgress({
          status: 'success',
          message: `Successfully found and queued ${data.results.length} file(s) for import.`,
          results: data.results,
          jobIds: jobIds
        });
        
        // Redirect to import history after 2 seconds
        setTimeout(() => {
          navigate('/import/history');
        }, 2000);
      } else {
        setSyncProgress({
          status: 'success',
          message: 'No new files found to sync.',
          results: []
        });
      }
      
      loadConfigs();
    } catch (err) {
      console.error('Sync error:', err);
      setSyncProgress({
        status: 'error',
        message: `Failed to sync files: ${err.message || 'Unknown error'}`
      });
    } finally {
      setSyncing(null);
    }
  };

  // Test file pattern
  const [testingPattern, setTestingPattern] = useState<string | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);
  
  const handleTestPattern = async (configId: string) => {
    setTestingPattern(configId);
    setTestResults(null);
    setTestDialogOpen(true);
    
    try {
      const { data, error } = await supabase.functions.invoke(
        'sync-google-drive',
        {
          body: { configId, testMode: true }
        }
      );

      if (error) throw error;
      
      setTestResults(data);
    } catch (err) {
      console.error('Test error:', err);
      setError('Failed to test pattern');
      setTestDialogOpen(false);
    } finally {
      setTestingPattern(null);
    }
  };

  // Get template name
  const getTemplateName = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    return template?.name || 'Unknown Template';
  };

  // Load cron job history
  const loadCronHistory = async (configId: string) => {
    setLoadingCronHistory(true);
    try {
      const { data, error } = await supabase.rpc('get_cron_job_history', {
        p_config_id: configId,
        p_limit: 50
      });

      if (error) throw error;
      setCronHistory(data || []);
    } catch (err) {
      console.error('Error loading cron history:', err);
      setError('Failed to load job history');
    } finally {
      setLoadingCronHistory(false);
    }
  };

  // Handle viewing cron history
  const handleViewCronHistory = (configId: string) => {
    setSelectedConfigForHistory(configId);
    setCronHistoryDialogOpen(true);
    loadCronHistory(configId);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Google Drive Sync Configuration</Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            onClick={() => navigate('/import')}
          >
            Back to Import
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setDialogOpen(true)}
          >
            Add Configuration
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2" gutterBottom>
          <strong>Before you begin:</strong> Google Drive sync requires OAuth 2.0 authentication.
        </Typography>
        <Typography variant="body2" component="div">
          <ol style={{ margin: '8px 0', paddingLeft: '20px' }}>
            <li>Create a service account in Google Cloud Console</li>
            <li>Share your Google Drive folder with the service account email</li>
            <li>Configure service account credentials in Supabase Edge Functions</li>
          </ol>
        </Typography>
        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
          <Button 
            size="small" 
            href="/GOOGLE_CREDENTIALS_QUICK_SETUP.md"
            target="_blank"
            variant="contained"
          >
            Quick Setup Guide
          </Button>
          <Button 
            size="small" 
            href="/GOOGLE_DRIVE_SETUP.md"
            target="_blank"
          >
            Detailed Guide
          </Button>
        </Box>
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Folder</TableCell>
              <TableCell>Template</TableCell>
              <TableCell>File Pattern</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Schedule</TableCell>
              <TableCell>Last Sync</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {configs.map((config) => (
              <TableRow key={config.id}>
                <TableCell>
                  <Box>
                    <Typography variant="body2" fontWeight="medium">
                      {config.folder_name || 'Unnamed Folder'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {config.folder_id}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>{getTemplateName(config.template_id)}</TableCell>
                <TableCell>
                  {config.file_pattern ? (
                    <Chip label={config.file_pattern} size="small" />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      All files
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    label={config.enabled ? 'Active' : 'Disabled'}
                    color={config.enabled ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {config.schedule_enabled && config.enabled ? (
                    <Chip
                      icon={<Schedule />}
                      label={
                        config.schedule_frequency === 'custom' 
                          ? config.schedule_cron 
                          : config.schedule_frequency
                      }
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Manual
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {config.last_sync_at ? (
                    <Tooltip title={format(new Date(config.last_sync_at), 'PPpp')}>
                      <Typography variant="body2">
                        {format(new Date(config.last_sync_at), 'PP')}
                      </Typography>
                    </Tooltip>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Never
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Browse Folder">
                    <IconButton
                      size="small"
                      onClick={() => handleBrowseFolder(config.folder_id, config.folder_name)}
                    >
                      <FolderOpen />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Test Pattern">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => handleTestPattern(config.id)}
                        disabled={!config.enabled || testingPattern === config.id}
                      >
                        {testingPattern === config.id ? (
                          <CircularProgress size={20} />
                        ) : (
                          <BugReport />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Sync Now">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => handleSync(config.id)}
                        disabled={!config.enabled || syncing === config.id}
                      >
                        <Sync />
                      </IconButton>
                    </span>
                  </Tooltip>
                  {config.schedule_enabled && config.cron_job_id && (
                    <Tooltip title="View Schedule History">
                      <IconButton
                        size="small"
                        onClick={() => handleViewCronHistory(config.id)}
                      >
                        <History />
                      </IconButton>
                    </Tooltip>
                  )}
                  <IconButton size="small" onClick={() => handleEdit(config)}>
                    <Edit />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(config.id)}>
                    <Delete />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {configs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body2" color="text.secondary" py={3}>
                    No sync configurations found. Click "Add Configuration" to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Configuration Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingConfig ? 'Edit Sync Configuration' : 'Add Sync Configuration'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Google Drive Folder ID"
              value={formData.folder_id}
              onChange={(e) => setFormData({ ...formData, folder_id: e.target.value })}
              fullWidth
              required
              helperText="The ID from the folder URL: drive.google.com/drive/folders/[FOLDER_ID]"
            />
            
            <TextField
              label="Folder Name"
              value={formData.folder_name}
              onChange={(e) => setFormData({ ...formData, folder_name: e.target.value })}
              fullWidth
              helperText="A friendly name for this folder"
            />

            <FormControl fullWidth required>
              <InputLabel>Import Template</InputLabel>
              <Select
                value={formData.template_id}
                onChange={(e) => {
                  const templateId = e.target.value;
                  const template = templates.find(t => t.id === templateId);
                  setFormData({ 
                    ...formData, 
                    template_id: templateId,
                    // Auto-suggest pattern from template if no custom pattern set
                    file_pattern: formData.file_pattern || template?.file_pattern || ''
                  });
                }}
                label="Import Template"
              >
                {templates.map((template) => (
                  <MenuItem key={template.id} value={template.id}>
                    {template.name}
                    {template.file_pattern && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        (Pattern: {template.file_pattern})
                      </Typography>
                    )}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="File Pattern (Glob)"
              value={formData.file_pattern}
              onChange={(e) => setFormData({ ...formData, file_pattern: e.target.value })}
              fullWidth
              helperText={`Optional: Glob pattern to match file names. Use * for wildcards (e.g., greenway_*_report.xlsx). ${
                formData.template_id && templates.find(t => t.id === formData.template_id)?.file_pattern
                  ? `Template default: "${templates.find(t => t.id === formData.template_id)?.file_pattern}"`
                  : ''
              }`}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={formData.include_subfolders || false}
                  onChange={(e) => setFormData({ ...formData, include_subfolders: e.target.checked })}
                />
              }
              label="Include subfolders"
            />
            
            {formData.include_subfolders && (
              <TextField
                label="Maximum Subfolder Depth"
                type="number"
                value={formData.max_depth}
                onChange={(e) => setFormData({ ...formData, max_depth: Math.max(1, Math.min(5, parseInt(e.target.value) || 1)) })}
                fullWidth
                helperText="How many levels deep to search (1 = immediate subfolders only, 5 = maximum)"
                InputProps={{
                  inputProps: { min: 1, max: 5 }
                }}
              />
            )}

            <FormControlLabel
              control={
                <Switch
                  checked={formData.enabled || false}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
              }
              label="Enable automatic sync"
            />

            {/* Scheduling Options */}
            <FormControlLabel
              control={
                <Switch
                  checked={formData.schedule_enabled || false}
                  onChange={(e) => setFormData({ ...formData, schedule_enabled: e.target.checked })}
                  disabled={!formData.enabled}
                />
              }
              label="Enable scheduled sync"
            />

            {formData.schedule_enabled && (
              <>
                <FormControl fullWidth>
                  <InputLabel>Sync Frequency</InputLabel>
                  <Select
                    value={formData.schedule_frequency}
                    onChange={(e) => setFormData({ ...formData, schedule_frequency: e.target.value })}
                    label="Sync Frequency"
                  >
                    <MenuItem value="hourly">Every Hour</MenuItem>
                    <MenuItem value="daily">Daily (8 AM)</MenuItem>
                    <MenuItem value="weekly">Weekly (Monday 8 AM)</MenuItem>
                    <MenuItem value="custom">Custom Schedule</MenuItem>
                  </Select>
                </FormControl>

                {formData.schedule_frequency === 'custom' && (
                  <TextField
                    label="Cron Expression"
                    value={formData.schedule_cron}
                    onChange={(e) => setFormData({ ...formData, schedule_cron: e.target.value })}
                    fullWidth
                    helperText="Enter a valid cron expression (e.g., '0 */6 * * *' for every 6 hours)"
                  />
                )}

                <TextField
                  label="Timezone"
                  value={formData.schedule_timezone}
                  onChange={(e) => setFormData({ ...formData, schedule_timezone: e.target.value })}
                  fullWidth
                  helperText="Timezone for scheduled syncs (e.g., America/New_York)"
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setDialogOpen(false);
            setEditingConfig(null);
            setFormData({
              folder_id: '',
              folder_name: '',
              template_id: '',
              file_pattern: '',
              enabled: true,
              include_subfolders: false,
              max_depth: 1,
              schedule_enabled: false,
              schedule_frequency: 'daily',
              schedule_cron: '',
              schedule_timezone: 'America/New_York'
            });
          }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!formData.folder_id || !formData.template_id}
          >
            {editingConfig ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Browse Folder Dialog */}
      <Dialog open={browseDialogOpen} onClose={() => setBrowseDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Browse Folder: {browseResults?.folderName || 'Loading...'}
        </DialogTitle>
        <DialogContent>
          {browsing ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : browseResults ? (
            <Box>
              <Alert severity="info" sx={{ mb: 2 }}>
                Found {browseResults.files?.length || 0} files and {browseResults.folders?.length || 0} subfolders
              </Alert>
              
              {/* Subfolders */}
              {browseResults.folders && browseResults.folders.length > 0 && (
                <Box mb={3}>
                  <Typography variant="subtitle2" gutterBottom>
                    Subfolders:
                  </Typography>
                  <List dense>
                    {browseResults.folders.map((folder: any) => (
                      <ListItem 
                        key={folder.id}
                        button
                        onClick={() => handleBrowseFolder(folder.id, folder.name)}
                      >
                        <ListItemIcon>
                          <FolderOpen />
                        </ListItemIcon>
                        <ListItemText 
                          primary={folder.name} 
                          secondary={`Folder ID: ${folder.id}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}

              {/* Files */}
              {browseResults.files && browseResults.files.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Files:
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Name</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Modified</TableCell>
                          <TableCell>Size</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {browseResults.files.map((file: any) => (
                          <TableRow key={file.id}>
                            <TableCell>{file.name}</TableCell>
                            <TableCell>
                              <Chip 
                                label={file.mimeType.includes('spreadsheet') ? 'Excel' : 'CSV'} 
                                size="small" 
                              />
                            </TableCell>
                            <TableCell>
                              {format(new Date(file.modifiedTime), 'PP')}
                            </TableCell>
                            <TableCell>
                              {file.size ? `${Math.round(parseInt(file.size) / 1024)} KB` : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBrowseDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Test Results Dialog */}
      <Dialog open={testDialogOpen} onClose={() => setTestDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Pattern Test Results
        </DialogTitle>
        <DialogContent>
          {!testResults ? (
            <Box display="flex" flexDirection="column" alignItems="center" p={3}>
              <CircularProgress />
              <Typography variant="body2" sx={{ mt: 2 }}>
                Searching for files matching pattern (this may take a moment if searching subfolders)...
              </Typography>
            </Box>
          ) : (
            <Box>
              {testResults.results && testResults.results.length > 0 ? (
                testResults.results.map((result: any, idx: number) => (
                  <Box key={idx} mb={2}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      <Typography variant="subtitle2">
                        Folder: {result.config}
                      </Typography>
                      <Typography variant="body2">
                        Pattern: {result.pattern || 'All files'}
                      </Typography>
                      <Typography variant="body2">
                        Files found: {result.matchingFiles?.length || 0} (from last 24 hours only)
                      </Typography>
                    </Alert>
                    
                    {result.matchingFiles && result.matchingFiles.length > 0 ? (
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>File Name</TableCell>
                              <TableCell>Modified</TableCell>
                              <TableCell align="right">Size</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {result.matchingFiles.slice(0, 10).map((file: any, fileIdx: number) => (
                              <TableRow key={fileIdx}>
                                <TableCell>{file.name}</TableCell>
                                <TableCell>
                                  {new Date(file.modifiedTime).toLocaleDateString()}
                                </TableCell>
                                <TableCell align="right">
                                  {file.size ? `${(parseInt(file.size) / 1024 / 1024).toFixed(2)} MB` : '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Alert severity="warning">
                        No files found matching the pattern in the last 24 hours.
                      </Alert>
                    )}
                    
                    {result.matchingFiles && result.matchingFiles.length > 10 && (
                      <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                        ... and {result.matchingFiles.length - 10} more files
                      </Typography>
                    )}
                  </Box>
                ))
              ) : (
                <Alert severity="warning">
                  No results returned from test.
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sync Progress Modal */}
      <Dialog 
        open={syncModalOpen} 
        onClose={() => syncProgress.status !== 'syncing' && setSyncModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            {syncProgress.status === 'syncing' && <CircularProgress size={24} />}
            {syncProgress.status === 'success' && <CheckCircle color="success" />}
            {syncProgress.status === 'error' && <Error color="error" />}
            Google Drive Sync
          </Box>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body1">
              {syncProgress.message}
            </Typography>
            
            {syncProgress.status === 'syncing' && (
              <LinearProgress />
            )}
            
            {syncProgress.results && syncProgress.results.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Files queued for import:
                </Typography>
                <List dense>
                  {syncProgress.results.map((result, idx) => (
                    <ListItem key={idx}>
                      <ListItemText 
                        primary={result.filename}
                        secondary={result.status === 'error' ? result.error : `Job ID: ${result.jobId}`}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
            
            {syncProgress.status === 'success' && syncProgress.results && syncProgress.results.length > 0 && (
              <Alert severity="info">
                Redirecting to import history page...
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {syncProgress.status !== 'syncing' && (
            <Button onClick={() => setSyncModalOpen(false)}>
              Close
            </Button>
          )}
          {syncProgress.status === 'success' && syncProgress.jobIds && syncProgress.jobIds.length > 0 && (
            <Button 
              variant="contained"
              onClick={() => navigate('/import/history')}
            >
              View Import History
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Cron History Dialog */}
      <Dialog 
        open={cronHistoryDialogOpen} 
        onClose={() => setCronHistoryDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Schedule Execution History</Typography>
            <IconButton onClick={() => setCronHistoryDialogOpen(false)} size="small">
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {loadingCronHistory ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : cronHistory.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Status</TableCell>
                    <TableCell>Start Time</TableCell>
                    <TableCell>End Time</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Message</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cronHistory.map((run) => {
                    const duration = run.end_time 
                      ? Math.round((new Date(run.end_time).getTime() - new Date(run.start_time).getTime()) / 1000)
                      : null;
                    
                    return (
                      <TableRow key={run.runid}>
                        <TableCell>
                          <Chip
                            size="small"
                            icon={
                              run.status === 'succeeded' ? <CheckCircleOutline /> :
                              run.status === 'failed' ? <ErrorOutline /> :
                              <HourglassEmpty />
                            }
                            label={run.status}
                            color={
                              run.status === 'succeeded' ? 'success' :
                              run.status === 'failed' ? 'error' :
                              'default'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Tooltip title={format(new Date(run.start_time), 'PPpp')}>
                            <Typography variant="body2">
                              {format(new Date(run.start_time), 'MMM d, HH:mm')}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          {run.end_time ? (
                            <Tooltip title={format(new Date(run.end_time), 'PPpp')}>
                              <Typography variant="body2">
                                {format(new Date(run.end_time), 'MMM d, HH:mm')}
                              </Typography>
                            </Tooltip>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              Running...
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {duration !== null ? (
                            <Typography variant="body2">
                              {duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m ${duration % 60}s`}
                            </Typography>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ 
                            maxWidth: 300, 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {run.return_message || '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">
              No execution history found. The job may not have run yet.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => loadCronHistory(selectedConfigForHistory!)}>
            Refresh
          </Button>
          <Button onClick={() => setCronHistoryDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};