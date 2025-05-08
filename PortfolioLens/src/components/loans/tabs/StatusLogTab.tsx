import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Divider,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  CircularProgress,
  Button,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent
} from '@mui/lab';
import {
  History as HistoryIcon,
  WarningAmber as WarningIcon,
  CheckCircle as CheckCircleIcon,
  ErrorOutline as ErrorIcon,
  Add as AddIcon,
  Autorenew as AutorenewIcon,
  Edit as EditIcon,
  Event as EventIcon,
  Info as InfoIcon,
  FilterList as FilterIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { useList } from "@refinedev/core";

// Interface for the component props
interface StatusLogTabProps {
  loanId: string;
}

// Available loan statuses
const loanStatuses = [
  'Current',
  'Delinquent',
  'Default',
  'Foreclosure',
  'Bankruptcy',
  'REO',
  'Paid Off',
  'Liquidated',
  'Transferred'
];

// Interface for status log entry
interface StatusLogEntry {
  id: string;
  loan_id: string;
  previous_status: string;
  new_status: string;
  changed_by: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
  change_reason?: string;
  created_at: string;
  is_system_generated?: boolean;
}

/**
 * Component to render the status log in a timeline
 */
const StatusTimeline: React.FC<{
  statusLogs: StatusLogEntry[];
}> = ({ statusLogs }) => {
  if (!statusLogs || statusLogs.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          No status changes recorded for this loan
        </Typography>
      </Box>
    );
  }

  // Function to get dot color based on status
  const getStatusColor = (status: string): "success" | "warning" | "error" | "info" | "inherit" => {
    switch (status?.toLowerCase()) {
      case 'current':
      case 'paid off':
        return 'success';
      case 'delinquent':
        return 'warning';
      case 'default':
      case 'foreclosure':
      case 'bankruptcy':
      case 'reo':
      case 'liquidated':
        return 'error';
      default:
        return 'info';
    }
  };

  // Function to get icon based on status
  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'current':
      case 'paid off':
        return <CheckCircleIcon />;
      case 'delinquent':
        return <WarningIcon />;
      case 'default':
      case 'foreclosure':
      case 'bankruptcy':
      case 'reo':
      case 'liquidated':
        return <ErrorIcon />;
      default:
        return <InfoIcon />;
    }
  };

  return (
    <Timeline position="alternate">
      {statusLogs.map((log, index) => (
        <TimelineItem key={log.id || index}>
          <TimelineOppositeContent color="text.secondary">
            {new Date(log.created_at).toLocaleString()}
          </TimelineOppositeContent>
          
          <TimelineSeparator>
            <TimelineDot color={getStatusColor(log.new_status)}>
              {getStatusIcon(log.new_status)}
            </TimelineDot>
            {index < statusLogs.length - 1 && <TimelineConnector />}
          </TimelineSeparator>
          
          <TimelineContent>
            <Paper
              elevation={1}
              sx={{
                p: 2,
                borderRadius: 2,
                borderLeft: 5,
                borderColor: theme => theme.palette[getStatusColor(log.new_status)].main
              }}
            >
              <Typography variant="h6" component="h3" fontWeight="medium">
                {log.new_status}
              </Typography>
              
              {log.previous_status && (
                <Typography variant="body2" color="text.secondary">
                  From: {log.previous_status}
                </Typography>
              )}
              
              {log.change_reason && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Reason: {log.change_reason}
                </Typography>
              )}
              
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <Avatar 
                  src={log.changed_by?.avatar_url} 
                  sx={{ width: 24, height: 24, mr: 1 }}
                >
                  {log.changed_by?.full_name?.[0] || <PersonIcon fontSize="small" />}
                </Avatar>
                <Typography variant="body2" color="text.secondary">
                  {log.is_system_generated 
                    ? 'System Generated' 
                    : `Updated by ${log.changed_by?.full_name || 'Unknown'}`}
                </Typography>
              </Box>
            </Paper>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
};

/**
 * StatusLogTab component - displays status changes over time
 */
export const StatusLogTab: React.FC<StatusLogTabProps> = ({ loanId }) => {
  // State for dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [reason, setReason] = useState('');

  // Fetch status log data
  const { data, isLoading, refetch } = useList({
    resource: "loan_status_logs",
    filters: [
      {
        field: "loan_id",
        operator: "eq",
        value: loanId,
      },
    ],
    sorters: [
      {
        field: "created_at",
        order: "desc",
      },
    ],
    pagination: {
      current: 1,
      pageSize: 50,
    },
    queryOptions: {
      enabled: !!loanId,
    },
  });

  const statusLogs = data?.data as StatusLogEntry[] || [];

  // Dialog handlers
  const handleDialogOpen = () => {
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setNewStatus('');
    setReason('');
  };

  const handleStatusChange = (event: SelectChangeEvent<string>) => {
    setNewStatus(event.target.value);
  };

  const handleReasonChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setReason(event.target.value);
  };

  // Handle submitting new status
  const handleSubmit = async () => {
    // Here you would make an API call to create a new status log
    // For example:
    // await create({
    //   resource: "loan_status_logs",
    //   values: {
    //     loan_id: loanId,
    //     previous_status: currentStatus,
    //     new_status: newStatus,
    //     change_reason: reason,
    //   },
    // });
    
    // Close dialog and refetch data
    handleDialogClose();
    refetch();
  };

  // If data is loading, show loading indicator
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header with action buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <HistoryIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" fontWeight="medium">
            Status Change History
          </Typography>
        </Box>
        
        <Box>
          <Button
            variant="outlined"
            startIcon={<FilterIcon />}
            sx={{ mr: 1 }}
          >
            Filter
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleDialogOpen}
          >
            Add Status Change
          </Button>
        </Box>
      </Box>

      {/* Status Timeline */}
      <Box sx={{ maxHeight: '600px', overflow: 'auto' }}>
        <StatusTimeline statusLogs={statusLogs} />
      </Box>

      {/* Add Status Change Dialog */}
      <Dialog open={isDialogOpen} onClose={handleDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          Update Loan Status
        </DialogTitle>
        
        <DialogContent dividers>
          <FormControl fullWidth margin="normal">
            <InputLabel id="new-status-label">New Status</InputLabel>
            <Select
              labelId="new-status-label"
              value={newStatus}
              label="New Status"
              onChange={handleStatusChange}
            >
              {loanStatuses.map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <TextField
            label="Reason for Change"
            multiline
            rows={4}
            value={reason}
            onChange={handleReasonChange}
            fullWidth
            margin="normal"
            placeholder="Explain why the status is being changed..."
          />
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleDialogClose}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={handleSubmit}
            disabled={!newStatus}
          >
            Update Status
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StatusLogTab;