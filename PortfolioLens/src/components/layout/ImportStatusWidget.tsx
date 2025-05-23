import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Box, 
  Paper, 
  Typography, 
  LinearProgress, 
  IconButton,
  Collapse,
  Badge,
  Tooltip,
  Chip
} from '@mui/material';
import {
  CloudUpload,
  ExpandLess,
  ExpandMore,
  CheckCircle,
  Error
} from '@mui/icons-material';
import { importManager, ImportJob } from '../../services/importManagerService';

export const ImportStatusWidget: React.FC = () => {
  const [activeJobs, setActiveJobs] = useState<ImportJob[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [pulseAnimation, setPulseAnimation] = useState(false);

  useEffect(() => {
    // Initial load
    const jobs = importManager.getActiveJobs();
    setActiveJobs(jobs);

    // Check for active jobs every 2 seconds
    const interval = setInterval(() => {
      const currentJobs = importManager.getActiveJobs();
      setActiveJobs(currentJobs);
      
      // Pulse animation when new jobs
      if (currentJobs.length > activeJobs.length) {
        setPulseAnimation(true);
        setTimeout(() => setPulseAnimation(false), 1000);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJobs.length]);

  if (activeJobs.length === 0) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle color="success" fontSize="small" />;
      case 'failed':
        return <Error color="error" fontSize="small" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploading': return '#2196f3';
      case 'parsing': return '#ff9800';
      case 'processing': return '#4caf50';
      case 'completed': return '#8bc34a';
      case 'failed': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 320,
        zIndex: 1400,
        backgroundColor: 'background.paper',
        borderRadius: 2,
        overflow: 'hidden',
        animation: pulseAnimation ? 'pulse 0.5s ease-in-out' : undefined,
        '@keyframes pulse': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' }
        }
      }}
    >
      {/* Header */}
      <Box
        sx={{
          backgroundColor: 'primary.main',
          color: 'primary.contrastText',
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <Badge badgeContent={activeJobs.length} color="error">
            <CloudUpload />
          </Badge>
          <Typography variant="subtitle1" fontWeight="medium">
            Active Imports
          </Typography>
        </Box>
        <IconButton size="small" sx={{ color: 'inherit' }}>
          {isExpanded ? <ExpandMore /> : <ExpandLess />}
        </IconButton>
      </Box>

      {/* Job List */}
      <Collapse in={isExpanded}>
        <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
          {activeJobs.map(job => (
            <Box
              key={job.id}
              component={Link}
              to={`/import/status/${job.id}`}
              sx={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                borderBottom: '1px solid',
                borderColor: 'divider',
                px: 2,
                py: 1.5,
                transition: 'background-color 0.2s',
                '&:hover': {
                  backgroundColor: 'action.hover'
                },
                '&:last-child': {
                  borderBottom: 'none'
                }
              }}
            >
              {/* Job Info */}
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                <Typography 
                  variant="body2" 
                  fontWeight="medium"
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '70%'
                  }}
                >
                  {job.filename}
                </Typography>
                <Box display="flex" alignItems="center" gap={0.5}>
                  {getStatusIcon(job.status)}
                  <Chip
                    label={job.status}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
                      backgroundColor: getStatusColor(job.status),
                      color: 'white'
                    }}
                  />
                </Box>
              </Box>

              {/* Progress */}
              <Box mb={0.5}>
                <LinearProgress
                  variant="determinate"
                  value={job.progress || 0}
                  sx={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: 'grey.300',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: getStatusColor(job.status)
                    }
                  }}
                />
              </Box>

              {/* Status Text */}
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">
                  {job.current_sheet 
                    ? `Processing: ${job.current_sheet}` 
                    : `${job.sheets_completed || 0}/${job.total_sheets || '?'} sheets`
                  }
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {job.progress || 0}%
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Collapse>

      {/* Footer */}
      {isExpanded && (
        <Box
          sx={{
            backgroundColor: 'grey.100',
            px: 2,
            py: 1,
            borderTop: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Typography
            component={Link}
            to="/import"
            variant="caption"
            color="primary"
            sx={{
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline'
              }
            }}
          >
            View all imports →
          </Typography>
        </Box>
      )}
    </Paper>
  );
};