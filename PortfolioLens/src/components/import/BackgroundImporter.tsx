import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Button, 
  Card, 
  CardContent, 
  CircularProgress, 
  Dialog,
  DialogActions, 
  DialogContent, 
  DialogContentText, 
  DialogTitle,
  FormControl, 
  InputLabel, 
  MenuItem, 
  Paper, 
  Select, 
  SelectChangeEvent, 
  Stack,
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  TextField, 
  Typography, 
  Alert,
  LinearProgress,
  Snackbar,
  IconButton
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { supabaseClient as supabase } from '../../utility/supabaseClient';

// Type definitions
interface ImportTemplate {
  id: string;
  name: string;
  servicer_id?: string | null;
  file_pattern?: string | null;
  header_row: number;
  sheet_mappings?: any[];
  created_at: string;
  updated_at: string;
  version: number;
  is_active: boolean;
  source_file_type?: string | null;
  description?: string | null;
  table_prefix?: string | null;
}

interface ImportJob {
  id: string;
  user_id: string;
  filename: string;
  bucket_path: string;
  template_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  percent_complete: number;
  row_counts: {
    processed?: number;
    skipped?: number;
    failed?: number;
  };
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface ImportError {
  id: string;
  job_id: string;
  table_name: string;
  row_number: number;
  row: Record<string, any>;
  error_message: string;
  resolved: boolean;
  created_at: string;
}

const BackgroundImporter: React.FC = () => {
  // State variables
  const [file, setFile] = useState<File | null>(null);
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [jobErrors, setJobErrors] = useState<Record<string, ImportError[]>>({});
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [errorDialogOpen, setErrorDialogOpen] = useState<boolean>(false);
  const [retryingErrors, setRetryingErrors] = useState<boolean>(false);
  const [snackbar, setSnackbar] = useState<{open: boolean, message: string, severity: 'success' | 'error' | 'info'}>({
    open: false,
    message: '',
    severity: 'info'
  });

  // Fetch templates and jobs on component mount
  useEffect(() => {
    fetchTemplates();
    fetchImportJobs();
    
    // Poll import jobs every 5 seconds
    const interval = setInterval(() => {
      fetchImportJobs();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // Fetch templates from the database
  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('mapping_templates')
        .select('*')
        .order('name');
        
      if (error) throw error;
      
      setTemplates(data || []);
      console.log('Loaded templates:', data?.length || 0, 'templates');
    } catch (error) {
      console.error('Error fetching templates:', error);
      showSnackbar('Failed to load templates', 'error');
    }
  };

  // Fetch import jobs from the database
  const fetchImportJobs = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      setImportJobs(data || []);
      
      // Also check for any jobs with errors
      for (const job of (data || [])) {
        if (job.status === 'completed' && job.row_counts?.failed > 0) {
          fetchJobErrors(job.id);
        }
      }
    } catch (error) {
      console.error('Error fetching import jobs:', error);
      showSnackbar('Failed to load import jobs', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch errors for a specific job
  const fetchJobErrors = async (jobId: string) => {
    try {
      const { data, error } = await supabase
        .from('import_errors')
        .select('*')
        .eq('job_id', jobId)
        .eq('resolved', false);
        
      if (error) throw error;
      
      setJobErrors(prev => ({
        ...prev,
        [jobId]: data || []
      }));
    } catch (error) {
      console.error(`Error fetching errors for job ${jobId}:`, error);
    }
  };

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setFile(files[0]);
    }
  };

  // Handle template selection
  const handleTemplateChange = (event: SelectChangeEvent) => {
    setSelectedTemplate(event.target.value);
  };

  // Upload file and start import job
  const handleUpload = async () => {
    if (!file || !selectedTemplate) {
      showSnackbar('Please select a file and template', 'error');
      return;
    }
    
    try {
      setUploading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      
      if (!userId) {
        throw new Error('User not authenticated');
      }
      
      // First, create an import job record
      const { data: jobData, error: jobError } = await supabase
        .from('import_jobs')
        .insert({
          filename: file.name,
          bucket_path: `${userId}/${file.name}`,
          template_id: selectedTemplate,
          status: 'pending',
          user_id: userId
        })
        .select()
        .single();
        
      if (jobError) throw jobError;
      
      if (!jobData) {
        throw new Error('Failed to create import job');
      }
      
      // Upload the file to the bucket
      const filePath = `${userId}/${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('imports')
        .upload(filePath, file, { 
          cacheControl: '3600',
          upsert: true,
          resumable: true,
          onUploadProgress: (progress) => {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            setUploadProgress(percent);
          }
        });
        
      if (uploadError) throw uploadError;
      
      // Invoke the Edge Function to start processing
      const { error: functionError } = await supabase.functions.invoke('process-import-job', {
        body: { 
          job_id: jobData.id, 
          filename: file.name, 
          user_id: userId
        }
      });
      
      if (functionError) throw functionError;
      
      // Success
      fetchImportJobs();
      setFile(null);
      setSelectedTemplate('');
      showSnackbar('Import job started successfully', 'success');
    } catch (error) {
      console.error('Error uploading file:', error);
      showSnackbar('Failed to start import job', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle opening error details for a job
  const handleViewErrors = (jobId: string) => {
    setSelectedJob(jobId);
    setErrorDialogOpen(true);
  };

  // Handle retrying failed records
  const handleRetryErrors = async () => {
    if (!selectedJob) return;
    
    try {
      setRetryingErrors(true);
      
      const jobErrors = jobErrors[selectedJob] || [];
      if (jobErrors.length === 0) return;
      
      // Find the table name from the first error
      const tableName = jobErrors[0].table_name;
      
      // Invoke the retry Edge Function
      const { error } = await supabase.functions.invoke('retry-import-errors', {
        body: { 
          job_id: selectedJob, 
          table_name: tableName
        }
      });
      
      if (error) throw error;
      
      // Refresh job data
      fetchImportJobs();
      
      // Close dialog
      setErrorDialogOpen(false);
      showSnackbar('Retry process completed', 'success');
    } catch (error) {
      console.error('Error retrying failed records:', error);
      showSnackbar('Failed to retry records', 'error');
    } finally {
      setRetryingErrors(false);
    }
  };

  // Download original file
  const handleDownloadFile = async (job: ImportJob) => {
    try {
      const { data, error } = await supabase.storage
        .from('imports')
        .createSignedUrl(job.bucket_path, 60); // 60 seconds expiry
        
      if (error) throw error;
      
      if (data?.signedURL) {
        window.open(data.signedURL, '_blank');
      }
    } catch (error) {
      console.error('Error creating signed URL:', error);
      showSnackbar('Failed to download file', 'error');
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

  // Get status icon for job
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      case 'processing':
      case 'pending':
      default:
        return <CircularProgress size={20} />;
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        File Import
      </Typography>
      
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Upload New File</Typography>
            
            <FormControl fullWidth>
              <InputLabel id="template-select-label">Import Template</InputLabel>
              <Select
                labelId="template-select-label"
                value={selectedTemplate}
                label="Import Template"
                onChange={handleTemplateChange}
                disabled={uploading}
              >
                {templates.map((template) => (
                  <MenuItem key={template.id} value={template.id}>
                    {template.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <TextField
                type="file"
                inputProps={{
                  accept: '.csv,.xlsx,.xls',
                  onChange: handleFileChange,
                  disabled: uploading
                }}
                sx={{ flex: 1 }}
              />
              
              <Button
                variant="contained"
                color="primary"
                startIcon={<CloudUploadIcon />}
                onClick={handleUpload}
                disabled={!file || !selectedTemplate || uploading}
              >
                Upload
              </Button>
            </Box>
            
            {uploading && (
              <Box sx={{ width: '100%' }}>
                <Typography variant="body2" align="center">
                  {uploadProgress}%
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={uploadProgress} 
                  sx={{ mt: 1 }} 
                />
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Import Jobs</Typography>
        <Button 
          startIcon={<RefreshIcon />} 
          onClick={fetchImportJobs}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>
      
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Status</TableCell>
              <TableCell>File Name</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Progress</TableCell>
              <TableCell>Results</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {importJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  {loading ? 'Loading...' : 'No import jobs found'}
                </TableCell>
              </TableRow>
            ) : (
              importJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    {getStatusIcon(job.status)}
                    <Typography variant="body2" sx={{ ml: 1, display: 'inline' }}>
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </Typography>
                  </TableCell>
                  <TableCell>{job.filename}</TableCell>
                  <TableCell>{new Date(job.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    {job.status === 'processing' && (
                      <>
                        <LinearProgress 
                          variant="determinate" 
                          value={job.percent_complete} 
                          sx={{ mb: 1 }} 
                        />
                        <Typography variant="body2">{job.percent_complete}%</Typography>
                      </>
                    )}
                    {job.status === 'completed' && '100%'}
                    {job.status === 'error' && 'Failed'}
                    {job.status === 'pending' && 'Waiting to start'}
                  </TableCell>
                  <TableCell>
                    {job.status === 'completed' && (
                      <Typography variant="body2">
                        Imported: {job.row_counts?.processed || 0} rows
                        {job.row_counts?.failed > 0 && (
                          <Typography variant="body2" color="error">
                            Failed: {job.row_counts.failed} rows
                          </Typography>
                        )}
                      </Typography>
                    )}
                    {job.status === 'error' && (
                      <Typography variant="body2" color="error">
                        {job.error_message}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Button 
                        size="small" 
                        onClick={() => handleDownloadFile(job)}
                      >
                        Download
                      </Button>
                      
                      {job.status === 'completed' && job.row_counts?.failed > 0 && (
                        <Button 
                          size="small" 
                          color="warning"
                          onClick={() => handleViewErrors(job.id)}
                        >
                          View Errors
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      
      {/* Error Dialog */}
      <Dialog
        open={errorDialogOpen}
        onClose={() => setErrorDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Import Errors</DialogTitle>
        <DialogContent>
          {selectedJob && jobErrors[selectedJob] && (
            <>
              <DialogContentText>
                The following errors occurred during import. You can retry importing these records.
              </DialogContentText>
              
              <TableContainer component={Paper} sx={{ mt: 2 }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Row</TableCell>
                      <TableCell>Error</TableCell>
                      <TableCell>Data</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {jobErrors[selectedJob].map((error) => (
                      <TableRow key={error.id}>
                        <TableCell>{error.row_number}</TableCell>
                        <TableCell>{error.error_message}</TableCell>
                        <TableCell>
                          <pre>{JSON.stringify(error.row, null, 2)}</pre>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setErrorDialogOpen(false)}>Close</Button>
          <Button 
            onClick={handleRetryErrors} 
            color="primary"
            disabled={retryingErrors}
          >
            {retryingErrors ? 'Retrying...' : 'Retry All'}
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

export default BackgroundImporter;