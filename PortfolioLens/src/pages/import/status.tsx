import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Card, 
  CardContent, 
  Typography, 
  LinearProgress, 
  Box,
  Chip,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  Alert,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  CheckCircle,
  Error as ErrorIcon,
  Info,
  Warning,
  Description as FileSpreadsheet,
  ArrowBack,
  Refresh,
  Cancel,
  Download
} from '@mui/icons-material';
import { format } from 'date-fns';
import { importManager, ImportJob, ImportLog, JobUpdate } from '../../services/importManagerService';
import { supabaseClient as supabase } from '../../utility/supabaseClient';

interface SheetStatus {
  sheet_name: string;
  original_name: string;
  status: 'pending' | 'receiving' | 'processing' | 'completed' | 'failed';
  total_rows: number;
  processed_rows: number;
  failed_rows: number;
  target_table: string;
}

export const ImportStatusPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  
  const [job, setJob] = useState<ImportJob | null>(null);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [sheetStatuses, setSheetStatuses] = useState<SheetStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);

  // Load initial data
  useEffect(() => {
    if (!jobId) return;

    const loadData = async () => {
      try {
        // Load job
        const { data: jobData, error: jobError } = await supabase
          .from('import_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (jobError) throw jobError;
        
        setJob({
          ...jobData,
          created_at: new Date(jobData.created_at),
          estimated_completion: jobData.estimated_completion 
            ? new Date(jobData.estimated_completion) 
            : undefined
        });

        // Load logs
        const { data: logsData, error: logsError } = await supabase
          .from('import_logs')
          .select('*')
          .eq('job_id', jobId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (logsError) throw logsError;
        setLogs(logsData || []);

        // Load sheet statuses
        const { data: sheetsData, error: sheetsError } = await supabase
          .from('import_sheet_status')
          .select('*')
          .eq('job_id', jobId)
          .order('sheet_name');

        if (sheetsError) throw sheetsError;
        setSheetStatuses(sheetsData || []);

      } catch (error) {
        console.error('Failed to load import data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Subscribe to real-time updates
    const unsubscribe = importManager.subscribeToJob(jobId, (update: JobUpdate) => {
      if (update.job) {
        setJob(update.job);
      }
      if (update.log) {
        setLogs(prev => [update.log!, ...prev].slice(0, 100)); // Keep last 100 logs
      }
      if (update.sheet_status) {
        setSheetStatuses(prev => {
          const index = prev.findIndex(s => s.sheet_name === update.sheet_status.sheet_name);
          if (index >= 0) {
            const newStatuses = [...prev];
            newStatuses[index] = update.sheet_status;
            return newStatuses;
          }
          return [...prev, update.sheet_status];
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [jobId]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logs.length > 0) {
      const logsContainer = document.getElementById('logs-container');
      if (logsContainer) {
        logsContainer.scrollTop = logsContainer.scrollHeight;
      }
    }
  }, [logs, autoScroll]);

  const handleCancel = async () => {
    if (!jobId || !window.confirm('Are you sure you want to cancel this import?')) return;
    
    try {
      await importManager.cancelImport(jobId);
      navigate('/import');
    } catch (error) {
      console.error('Failed to cancel import:', error);
    }
  };

  const handleDownloadFile = async () => {
    if (!job?.bucket_path) return;
    
    try {
      const { data, error } = await supabase.storage
        .from('imports')
        .download(job.bucket_path);
      
      if (error) throw error;
      
      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = job.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'error';
      case 'processing':
      case 'parsing': return 'primary';
      case 'uploading': return 'info';
      default: return 'default';
    }
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'error': return <ErrorIcon color="error" />;
      case 'warning': return <Warning color="warning" />;
      case 'success': return <CheckCircle color="success" />;
      default: return <Info color="info" />;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <LinearProgress style={{ width: '50%' }} />
      </Box>
    );
  }

  if (!job) {
    return (
      <Box p={3}>
        <Alert severity="error">Import job not found</Alert>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/import')} sx={{ mt: 2 }}>
          Back to Imports
        </Button>
      </Box>
    );
  }

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <IconButton onClick={() => navigate('/import')}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h4">Import Status</Typography>
        </Box>
        
        <Box display="flex" gap={1}>
          {job.bucket_path && (
            <Tooltip title="Download original file">
              <IconButton onClick={handleDownloadFile}>
                <Download />
              </IconButton>
            </Tooltip>
          )}
          {['uploading', 'parsing', 'processing'].includes(job.status) && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<Cancel />}
              onClick={handleCancel}
            >
              Cancel Import
            </Button>
          )}
          {job.status === 'completed' && (
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/loans')}
            >
              View Imported Data
            </Button>
          )}
        </Box>
      </Box>

      {/* Job Overview */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box display="flex" alignItems="center" gap={2}>
              <FileSpreadsheet />
              <Box>
                <Typography variant="h6">{job.filename}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Started {format(job.created_at, 'PPp')}
                </Typography>
              </Box>
            </Box>
            <Chip 
              label={job.status.toUpperCase()} 
              color={getStatusColor(job.status) as any}
              size="small"
            />
          </Box>

          {/* Progress Bar */}
          <Box mb={2}>
            <Box display="flex" justifyContent="space-between" mb={1}>
              <Typography variant="body2">Progress</Typography>
              <Typography variant="body2">{job.progress || 0}%</Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={job.progress || 0} 
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>

          {/* Stats */}
          <Box display="flex" gap={3}>
            {job.total_sheets !== null && (
              <Box>
                <Typography variant="body2" color="text.secondary">Total Sheets</Typography>
                <Typography variant="h6">{job.total_sheets}</Typography>
              </Box>
            )}
            {job.sheets_completed !== null && (
              <Box>
                <Typography variant="body2" color="text.secondary">Sheets Completed</Typography>
                <Typography variant="h6">{job.sheets_completed}</Typography>
              </Box>
            )}
            {job.current_sheet && (
              <Box>
                <Typography variant="body2" color="text.secondary">Current Sheet</Typography>
                <Typography variant="h6">{job.current_sheet}</Typography>
              </Box>
            )}
          </Box>

          {/* Error Message */}
          {job.error_message && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {job.error_message}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Sheet Status */}
      {sheetStatuses.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Sheet Progress</Typography>
            <List>
              {sheetStatuses.map(sheet => (
                <ListItem key={sheet.sheet_name}>
                  <ListItemIcon>
                    {sheet.status === 'completed' ? (
                      <CheckCircle color="success" />
                    ) : sheet.status === 'failed' ? (
                      <ErrorIcon color="error" />
                    ) : (
                      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                        <LinearProgress 
                          variant="determinate" 
                          value={sheet.total_rows > 0 ? (sheet.processed_rows / sheet.total_rows) * 100 : 0}
                          sx={{ width: 24, height: 24, borderRadius: '50%' }}
                        />
                      </Box>
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={sheet.original_name}
                    secondary={
                      <>
                        <Typography variant="caption" display="block" component="span">
                          Target: {sheet.target_table || 'Not set'}
                        </Typography>
                        <Typography variant="caption" display="block" component="span">
                          {sheet.processed_rows}/{sheet.total_rows} rows processed
                          {sheet.failed_rows > 0 && ` (${sheet.failed_rows} failed)`}
                        </Typography>
                      </>
                    }
                  />
                  <Chip 
                    label={sheet.status} 
                    size="small" 
                    color={getStatusColor(sheet.status) as any}
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Logs */}
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="h6">Activity Log</Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="body2" color="text.secondary">Auto-scroll</Typography>
              <Tooltip title="Toggle auto-scroll">
                <IconButton size="small" onClick={() => setAutoScroll(!autoScroll)}>
                  <Refresh color={autoScroll ? 'primary' : 'disabled'} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
          
          <Paper 
            id="logs-container"
            variant="outlined" 
            sx={{ 
              maxHeight: 400, 
              overflowY: 'auto',
              bgcolor: 'grey.50',
              p: 1
            }}
          >
            {logs.length === 0 ? (
              <Typography variant="body2" color="text.secondary" align="center" p={2}>
                No logs yet...
              </Typography>
            ) : (
              <List dense>
                {logs.map(log => (
                  <ListItem key={log.id} alignItems="flex-start">
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      {getLogIcon(log.level)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <>
                          <Typography variant="body2" component="span">{log.message}</Typography>
                          {log.sheet_name && (
                            <Chip label={log.sheet_name} size="small" variant="outlined" sx={{ ml: 1 }} />
                          )}
                        </>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary" component="span">
                          {format(new Date(log.created_at), 'HH:mm:ss')}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </CardContent>
      </Card>
    </Box>
  );
};