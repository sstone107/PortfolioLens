import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Slider, 
  TextField, 
  Grid,
  Typography,
  Stack,
  InputAdornment,
  Tooltip,
  IconButton
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';

interface RangeFilterComponentProps<T> {
  label: string;
  min: number;
  max: number;
  step: number;
  value: { min?: number; max?: number; exact?: number };
  onChange: (value: { min?: number; max?: number; exact?: number }) => void;
  adornment?: string;
  tooltipText?: string;
  disabled?: boolean;
}

const RangeFilterComponent = <T extends number | Date>({
  label,
  min,
  max,
  step,
  value,
  onChange,
  adornment,
  tooltipText,
  disabled = false
}: RangeFilterComponentProps<T>) => {
  // Local state for the inputs
  const [localMin, setLocalMin] = useState<string>(value.min?.toString() || '');
  const [localMax, setLocalMax] = useState<string>(value.max?.toString() || '');
  const [sliderValue, setSliderValue] = useState<number[]>([
    value.min ?? min,
    value.max ?? max
  ]);

  // Update local state when props change
  useEffect(() => {
    setLocalMin(value.min?.toString() || '');
    setLocalMax(value.max?.toString() || '');
    setSliderValue([
      value.min ?? min,
      value.max ?? max
    ]);
  }, [value, min, max]);

  // Handle slider change
  const handleSliderChange = (event: Event, newValue: number | number[]) => {
    if (disabled) return;
    
    if (Array.isArray(newValue)) {
      setSliderValue(newValue);
      setLocalMin(newValue[0].toString());
      setLocalMax(newValue[1].toString());
      
      onChange({
        min: newValue[0],
        max: newValue[1]
      });
    }
  };

  // Handle min input change
  const handleMinChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    
    const newMin = event.target.value;
    setLocalMin(newMin);
    
    if (newMin === '') {
      setSliderValue([min, sliderValue[1]]);
      onChange({ min: undefined, max: value.max });
    } else {
      const numValue = parseFloat(newMin);
      if (!isNaN(numValue)) {
        setSliderValue([numValue, sliderValue[1]]);
        onChange({ min: numValue, max: value.max });
      }
    }
  };

  // Handle max input change
  const handleMaxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    
    const newMax = event.target.value;
    setLocalMax(newMax);
    
    if (newMax === '') {
      setSliderValue([sliderValue[0], max]);
      onChange({ min: value.min, max: undefined });
    } else {
      const numValue = parseFloat(newMax);
      if (!isNaN(numValue)) {
        setSliderValue([sliderValue[0], numValue]);
        onChange({ min: value.min, max: numValue });
      }
    }
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
      
      <Box sx={{ px: 2, mb: 3 }}>
        <Slider
          value={sliderValue}
          onChange={handleSliderChange}
          valueLabelDisplay="auto"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          sx={{ 
            color: 'primary.main',
            '& .MuiSlider-thumb': {
              width: 16,
              height: 16,
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              '&:hover, &.Mui-focusVisible': {
                boxShadow: '0 3px 6px rgba(0,0,0,0.3)',
              }
            },
            '& .MuiSlider-valueLabel': {
              backgroundColor: 'primary.main',
              borderRadius: 1,
              fontSize: '0.75rem',
              padding: '4px 8px',
            }
          }}
        />
      </Box>
      
      <Grid container spacing={3}>
        <Grid item xs={6}>
          <TextField
            label="Min"
            value={localMin}
            onChange={handleMinChange}
            size="small"
            fullWidth
            variant="outlined"
            InputProps={{
              endAdornment: adornment ? (
                <InputAdornment position="end">{adornment}</InputAdornment>
              ) : undefined
            }}
            disabled={disabled}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 1,
              }
            }}
          />
        </Grid>
        <Grid item xs={6}>
          <TextField
            label="Max"
            value={localMax}
            onChange={handleMaxChange}
            size="small"
            fullWidth
            variant="outlined"
            InputProps={{
              endAdornment: adornment ? (
                <InputAdornment position="end">{adornment}</InputAdornment>
              ) : undefined
            }}
            disabled={disabled}
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

export default RangeFilterComponent;