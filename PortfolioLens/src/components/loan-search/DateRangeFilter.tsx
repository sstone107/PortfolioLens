import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Stack,
  IconButton,
  Tooltip,
  TextField,
  Grid,
  InputAdornment
} from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import InfoIcon from '@mui/icons-material/Info';

interface DateRangeFilterProps {
  label: string;
  value: { min?: Date; max?: Date; exact?: Date };
  onChange: (value: { min?: Date; max?: Date; exact?: Date }) => void;
  tooltipText?: string;
  disabled?: boolean;
}

// Helper to format date for input
const formatDateForInput = (date: Date | undefined): string => {
  if (!date) return '';
  
  // Try to convert to ISO format and get only the date part
  try {
    return date instanceof Date 
      ? date.toISOString().split('T')[0] 
      : '';
  } catch (e) {
    return '';
  }
};

// Helper to parse input date string to Date object
const parseInputDate = (value: string): Date | undefined => {
  if (!value) return undefined;
  
  try {
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  } catch (e) {
    return undefined;
  }
};

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  label,
  value,
  onChange,
  tooltipText,
  disabled = false
}) => {
  // Local state for the inputs
  const [localMin, setLocalMin] = useState<string>(formatDateForInput(value.min));
  const [localMax, setLocalMax] = useState<string>(formatDateForInput(value.max));

  // Update local state when props change
  useEffect(() => {
    setLocalMin(formatDateForInput(value.min));
    setLocalMax(formatDateForInput(value.max));
  }, [value]);

  // Handle min date change
  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    
    const dateString = e.target.value;
    setLocalMin(dateString);
    
    onChange({
      min: parseInputDate(dateString),
      max: value.max
    });
  };

  // Handle max date change
  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    
    const dateString = e.target.value;
    setLocalMax(dateString);
    
    onChange({
      min: value.min,
      max: parseInputDate(dateString)
    });
  };

  return (
    <Box sx={{ 
      mb: 4, 
      px: 2, 
      py: 2.5, 
      border: '1px solid', 
      borderColor: 'divider', 
      borderRadius: 1,
      backgroundColor: 'background.paper',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={2}>
        <Typography variant="subtitle1" fontWeight="medium" color="primary.main">
          {label}
        </Typography>
        
        {tooltipText && (
          <Tooltip title={tooltipText} arrow>
            <IconButton size="small">
              <InfoIcon fontSize="small" color="action" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      
      <Grid container spacing={3}>
        <Grid item xs={6}>
          <TextField
            fullWidth
            label="From"
            variant="outlined"
            type="date"
            size="small"
            value={localMin}
            onChange={handleMinChange}
            disabled={disabled}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <CalendarTodayIcon fontSize="small" color="action" />
                </InputAdornment>
              )
            }}
            InputLabelProps={{
              shrink: true
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 1,
              }
            }}
          />
        </Grid>
        <Grid item xs={6}>
          <TextField
            fullWidth
            label="To"
            variant="outlined"
            type="date"
            size="small"
            value={localMax}
            onChange={handleMaxChange}
            disabled={disabled}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <CalendarTodayIcon fontSize="small" color="action" />
                </InputAdornment>
              )
            }}
            InputLabelProps={{
              shrink: true
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 1,
              }
            }}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default DateRangeFilter;