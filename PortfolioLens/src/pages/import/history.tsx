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

const ImportJobActions = ({ record }: { record: any }) => {
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
  
  const handleDownloadFile = async () => {
    try {
      const { data, error } = await supabaseClient
        .storage
        .from('imports')
        .download(record.bucket_path);
      
      if (error) throw error;
      
      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = record.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      open?.({ type: 'success', message: 'File downloaded successfully' });
    } catch (error) {
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
        <IconButton
          size="small"
          onClick={handleDownloadFile}
          title="Download Original File"
        >
          <DownloadIcon fontSize="small" />
        </IconButton>
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
  
  useEffect(() => {
    fetchJobs();
    
    // Set up auto-refresh for processing jobs
    const interval = setInterval(() => {
      if (jobs.some(job => job.status === 'processing')) {
        fetchJobs();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);
  
  const fetchJobs = async () => {
    try {
      const { data, error } = await supabaseClient
        .from('import_jobs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      setJobs(data || []);
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
                      <ImportJobActions record={job} />
                    </TableCell>
                  </TableRow>
                ))}
                {jobs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
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