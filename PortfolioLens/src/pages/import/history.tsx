import React, { useState, useEffect } from 'react';
import { useGetIdentity, useNotification } from '@refinedev/core';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  LinearProgress,
  Grid,
  Alert,
  Button,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Visibility as VisibilityIcon,
  Info as InfoIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { supabaseClient } from '../../utility/supabaseClient';
import { formatDistanceToNow } from 'date-fns';

// Job status display mapping
const statusConfig = {
  pending: { color: 'warning', label: 'Pending' },
  processing: { color: 'info', label: 'Processing' },
  completed: { color: 'success', label: 'Completed' },
  error: { color: 'error', label: 'Failed' },
};

const ImportJobStatus = ({ record }: { record: any }) => {
  const config = statusConfig[record.status as keyof typeof statusConfig];
  return (
    <Chip
      label={config.label}
      color={config.color as any}
      size="small"
      sx={{ minWidth: 90 }}
    />
  );
};

const ImportJobProgress = ({ record }: { record: any }) => {
  if (record.status !== 'processing') return null;
  
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 120 }}>
      <Box sx={{ width: '100%', mr: 1 }}>
        <LinearProgress 
          variant="determinate" 
          value={record.percent_complete || 0} 
        />
      </Box>
      <Box sx={{ minWidth: 35 }}>
        <Typography variant="body2" color="text.secondary">
          {`${record.percent_complete || 0}%`}
        </Typography>
      </Box>
    </Box>
  );
};

const ImportJobStats = ({ record }: { record: any }) => {
  const counts = record.row_counts || {};
  const processed = counts.processed || 0;
  const failed = counts.failed || 0;
  const skipped = counts.skipped || 0;
  const total = processed + failed + skipped;
  
  if (total === 0) return <Typography variant="body2">-</Typography>;
  
  return (
    <Box>
      <Typography variant="body2" component="span" sx={{ color: 'success.main' }}>
        {processed.toLocaleString()} processed
      </Typography>
      {failed > 0 && (
        <Typography variant="body2" component="span" sx={{ color: 'error.main', ml: 1 }}>
          {failed.toLocaleString()} failed
        </Typography>
      )}
      {skipped > 0 && (
        <Typography variant="body2" component="span" sx={{ color: 'warning.main', ml: 1 }}>
          {skipped.toLocaleString()} skipped
        </Typography>
      )}
    </Box>
  );
};

const ImportJobActions = ({ record, onRefresh, identity }: { record: any; onRefresh: () => void; identity?: any }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [templateName, setTemplateName] = useState<string>('');
  const { open } = useNotification();
  
  useEffect(() => {
    if (record.template_id && showDetails) {
      fetchTemplateName();
    }
  }, [record.template_id, showDetails]);
  
  const fetchTemplateName = async () => {
    try {
      const { data, error } = await supabaseClient
        .from('mapping_templates')
        .select('name')
        .eq('id', record.template_id)
        .single();
      
      if (!error && data) {
        setTemplateName(data.name);
      }
    } catch (error) {
      console.error('Error fetching template:', error);
    }
  };
  
  const handleCancelJob = async () => {
    if (!window.confirm('Are you sure you want to cancel this import?')) return;
    
    try {
      // Import the service
      const { importManager } = await import('../../services/importManagerService');
      await importManager.cancelImport(record.id);
      
      open?.({ type: 'success', message: 'Import cancelled successfully' });
      onRefresh();
    } catch (error) {
      open?.({ type: 'error', message: `Failed to cancel import: ${error}` });
    }
  };

  const handleDownloadFile = async () => {
    try {
      // If no bucket_path, cannot download
      if (!record.bucket_path) {
        open?.({ type: 'error', message: 'File not available for download' });
        return;
      }

      // Create a proper signed URL for download
      const { data: urlData, error: urlError } = await supabaseClient
        .storage
        .from('imports')
        .createSignedUrl(record.bucket_path, 3600); // 1 hour expiry
      
      if (urlError) throw urlError;
      
      // Open in new window or trigger download
      const a = document.createElement('a');
      a.href = urlData.signedUrl;
      a.download = record.filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      open?.({ type: 'success', message: 'File download started' });
    } catch (error) {
      console.error('Download error:', error);
      open?.({ type: 'error', message: `Failed to download file: ${error}` });
    }
  };
  
  return (
    <>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <IconButton
          size="small"
          onClick={() => setShowDetails(true)}
          title="View Details"
        >
          <VisibilityIcon fontSize="small" />
        </IconButton>
        {['pending', 'processing'].includes(record.status) && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={handleCancelJob}
            startIcon={<CancelIcon />}
          >
            Cancel
          </Button>
        )}
        {record.bucket_path && (
          <IconButton
            size="small"
            onClick={handleDownloadFile}
            title="Download Original File"
          >
            <DownloadIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      
      {/* Details Dialog */}
      <Dialog
        open={showDetails}
        onClose={() => setShowDetails(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Import Job Details
          <Typography variant="subtitle2" color="text.secondary">
            {record.filename}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Status
              </Typography>
              <ImportJobStatus record={record} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Uploaded By
              </Typography>
              <Typography variant="body1">
                {identity?.id === record.user_id ? `You (${identity?.email})` : 'Another User'}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Template Used
              </Typography>
              <Typography variant="body1">
                {templateName || 'No template'}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Started
              </Typography>
              <Typography variant="body1">
                {new Date(record.created_at).toLocaleString()}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2" color="text.secondary">
                Completed
              </Typography>
              <Typography variant="body1">
                {record.completed_at 
                  ? new Date(record.completed_at).toLocaleString()
                  : '-'
                }
              </Typography>
            </Grid>
            
            {record.error_message && (
              <Grid item xs={12}>
                <Alert severity="error">
                  <Typography variant="body2">{record.error_message}</Typography>
                </Alert>
              </Grid>
            )}
            
            {record.row_counts?.bySheet && (
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                  Sheet Summary
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Sheet Name</TableCell>
                        <TableCell align="right">Processed</TableCell>
                        <TableCell align="right">Failed</TableCell>
                        <TableCell align="right">Skipped</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(record.row_counts.bySheet).map(([sheet, stats]: [string, any]) => (
                        <TableRow key={sheet}>
                          <TableCell>{sheet}</TableCell>
                          <TableCell align="right">{stats.processed || 0}</TableCell>
                          <TableCell align="right">{stats.failed || 0}</TableCell>
                          <TableCell align="right">{stats.skipped || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDetails(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const ImportHistoryListActions = ({ onRefresh }: { onRefresh: () => void }) => {
  const navigate = useNavigate();
  
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
      <Button
        onClick={onRefresh}
        startIcon={<RefreshIcon />}
        size="small"
        variant="outlined"
      >
        Refresh
      </Button>
      <Button
        onClick={() => navigate('/import/batch')}
        variant="contained"
        color="primary"
        size="small"
      >
        New Import
      </Button>
    </Box>
  );
};

export const ImportHistoryList = () => {
  const { data: identity } = useGetIdentity();
  const { open } = useNotification();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userMap, setUserMap] = useState<Record<string, any>>({});
  
  useEffect(() => {
    fetchJobs();
  }, []);

  // Set up auto-refresh for processing jobs
  useEffect(() => {
    const interval = setInterval(() => {
      if (jobs.some(job => ['processing', 'pending'].includes(job.status))) {
        fetchJobs();
      }
    }, 3000); // Check every 3 seconds
    
    return () => clearInterval(interval);
  }, [jobs]); // Re-create interval when jobs change
  
  const fetchJobs = async () => {
    try {
      const { data, error } = await supabaseClient
        .from('import_jobs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Check for stale processing jobs
      const jobs = data || [];
      const staleJobs = jobs.filter(job => {
        if (!['processing', 'pending'].includes(job.status)) return false;
        
        const createdAt = new Date(job.created_at);
        const now = new Date();
        const ageMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
        
        // Mark as stale if processing for more than 30 minutes
        return ageMinutes > 30;
      });
      
      // Update stale jobs
      if (staleJobs.length > 0) {
        const staleIds = staleJobs.map(j => j.id);
        await supabaseClient
          .from('import_jobs')
          .update({ 
            status: 'error',
            error_message: 'Import timed out after 30 minutes'
          })
          .in('id', staleIds);
        
        // Re-fetch after updating stale jobs
        const { data: refreshedData } = await supabaseClient
          .from('import_jobs')
          .select('*')
          .order('created_at', { ascending: false });
        
        setJobs(refreshedData || []);
      } else {
        setJobs(jobs);
      }
    } catch (error) {
      open?.({ type: 'error', message: `Failed to fetch import jobs: ${error}` });
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Import History
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          View and manage your data import jobs
        </Typography>
        
        <Box sx={{ mt: 3 }}>
          <ImportHistoryListActions onRefresh={fetchJobs} />
          
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>File Name</TableCell>
                  <TableCell>Uploaded By</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Progress</TableCell>
                  <TableCell>Statistics</TableCell>
                  <TableCell>Started</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Typography variant="body2">{job.filename}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {identity?.id === job.user_id ? 'You' : 'Another User'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <ImportJobStatus record={job} />
                    </TableCell>
                    <TableCell>
                      <ImportJobProgress record={job} />
                    </TableCell>
                    <TableCell>
                      <ImportJobStats record={job} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {job.completed_at
                          ? `${Math.round((new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 1000)}s`
                          : '-'
                        }
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <ImportJobActions record={job} onRefresh={fetchJobs} identity={identity} />
                    </TableCell>
                  </TableRow>
                ))}
                {jobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                        No import jobs found. Start by importing some data.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ImportHistoryList;