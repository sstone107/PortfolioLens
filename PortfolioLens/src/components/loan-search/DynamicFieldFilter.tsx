import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  IconButton,
  Tooltip,
  Typography,
  SelectChangeEvent
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon
} from '@mui/icons-material';

export interface DynamicFilterField {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'between';
  value: string;
  value2?: string; // For between operator
  id: string; // Unique ID for each filter
}

interface DynamicFieldFilterProps {
  availableFields: { [key: string]: { label: string; type: 'string' | 'number' | 'date' | 'boolean' } };
  dynamicFilters: DynamicFilterField[];
  onChange: (filters: DynamicFilterField[]) => void;
  onAddFilter: () => void;
}

const operatorOptions = {
  string: [
    { label: 'Equals', value: 'eq' },
    { label: 'Not Equals', value: 'neq' },
    { label: 'Contains', value: 'ilike' }
  ],
  number: [
    { label: 'Equals', value: 'eq' },
    { label: 'Not Equals', value: 'neq' },
    { label: 'Greater Than', value: 'gt' },
    { label: 'Greater Than or Equal', value: 'gte' },
    { label: 'Less Than', value: 'lt' },
    { label: 'Less Than or Equal', value: 'lte' },
    { label: 'Between', value: 'between' }
  ],
  date: [
    { label: 'Equals', value: 'eq' },
    { label: 'Not Equals', value: 'neq' },
    { label: 'After', value: 'gt' },
    { label: 'On or After', value: 'gte' },
    { label: 'Before', value: 'lt' },
    { label: 'On or Before', value: 'lte' },
    { label: 'Between', value: 'between' }
  ],
  boolean: [
    { label: 'Is True', value: 'eq' },
    { label: 'Is False', value: 'neq' }
  ]
};

const DynamicFieldFilter: React.FC<DynamicFieldFilterProps> = ({
  availableFields,
  dynamicFilters,
  onChange,
  onAddFilter
}) => {
  // Handle field change
  const handleFieldChange = (index: number, e: SelectChangeEvent) => {
    const newFilters = [...dynamicFilters];
    const fieldName = e.target.value;
    const fieldType = availableFields[fieldName]?.type || 'string';
    
    // Default to appropriate operator for the field type
    const defaultOperator = 
      fieldType === 'number' ? 'eq' : 
      fieldType === 'date' ? 'eq' : 
      fieldType === 'boolean' ? 'eq' : 'ilike';
    
    newFilters[index] = {
      ...newFilters[index],
      field: fieldName,
      operator: defaultOperator,
      value: '' // Reset value when field changes
    };
    
    onChange(newFilters);
  };

  // Handle operator change
  const handleOperatorChange = (index: number, e: SelectChangeEvent) => {
    const newFilters = [...dynamicFilters];
    newFilters[index] = {
      ...newFilters[index],
      operator: e.target.value as DynamicFilterField['operator']
    };
    onChange(newFilters);
  };

  // Handle value change
  const handleValueChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = [...dynamicFilters];
    newFilters[index] = {
      ...newFilters[index],
      value: e.target.value
    };
    onChange(newFilters);
  };
  
  // Handle value2 change (for between operator)
  const handleValue2Change = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = [...dynamicFilters];
    newFilters[index] = {
      ...newFilters[index],
      value2: e.target.value
    };
    onChange(newFilters);
  };

  // Handle remove filter
  const handleRemoveFilter = (index: number) => {
    const newFilters = [...dynamicFilters];
    newFilters.splice(index, 1);
    onChange(newFilters);
  };

  // Get appropriate input type based on field type
  const getInputType = (fieldName: string): string => {
    const fieldType = availableFields[fieldName]?.type || 'string';
    if (fieldType === 'date') return 'date';
    if (fieldType === 'number') return 'number';
    return 'text';
  };

  return (
    <Box>
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        mb: 2 
      }}>
        <Typography variant="subtitle2" color="text.secondary">
          Custom Field Filters
        </Typography>
        <Tooltip title="Add Another Filter">
          <IconButton 
            size="small"
            color="primary"
            onClick={onAddFilter}
            sx={{ 
              border: '1px dashed', 
              borderColor: 'primary.main',
              borderRadius: 1,
              '&:hover': {
                backgroundColor: 'primary.light',
                color: 'primary.contrastText'
              }
            }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {dynamicFilters.map((filter, index) => (
        <Grid container spacing={2} key={filter.id} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Field</InputLabel>
              <Select
                value={filter.field}
                label="Field"
                onChange={(e) => handleFieldChange(index, e)}
              >
                {Object.entries(availableFields).map(([field, info]) => (
                  <MenuItem key={field} value={field}>{info.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Operator</InputLabel>
              <Select
                value={filter.operator}
                label="Operator"
                onChange={(e) => handleOperatorChange(index, e)}
              >
                {filter.field && availableFields[filter.field] &&
                  operatorOptions[availableFields[filter.field].type].map((op) => (
                    <MenuItem key={op.value} value={op.value}>{op.label}</MenuItem>
                  ))
                }
              </Select>
            </FormControl>
          </Grid>
          {filter.operator === 'between' ? (
            // For between operator, show two value fields
            <Grid item xs={10} sm={4}>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="From"
                    size="small"
                    value={filter.value}
                    onChange={(e) => handleValueChange(index, e)}
                    type={getInputType(filter.field)}
                    InputProps={{
                      ...(getInputType(filter.field) === 'date' && { inputProps: { max: '9999-12-31' } }),
                    }}
                    InputLabelProps={{
                      ...(getInputType(filter.field) === 'date' && { shrink: true }),
                    }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="To"
                    size="small"
                    value={filter.value2 || ''}
                    onChange={(e) => handleValue2Change(index, e)}
                    type={getInputType(filter.field)}
                    InputProps={{
                      ...(getInputType(filter.field) === 'date' && { inputProps: { max: '9999-12-31' } }),
                    }}
                    InputLabelProps={{
                      ...(getInputType(filter.field) === 'date' && { shrink: true }),
                    }}
                  />
                </Grid>
              </Grid>
            </Grid>
          ) : (
            // For other operators, show a single value field
            <Grid item xs={10} sm={4}>
              <TextField
                fullWidth
                label="Value"
                size="small"
                value={filter.value}
                onChange={(e) => handleValueChange(index, e)}
                type={getInputType(filter.field)}
                InputProps={{
                  ...(getInputType(filter.field) === 'date' && { inputProps: { max: '9999-12-31' } }),
                }}
                InputLabelProps={{
                  ...(getInputType(filter.field) === 'date' && { shrink: true }),
                }}
              />
            </Grid>
          )}
          <Grid item xs={2} sm={1} sx={{ display: 'flex', alignItems: 'center' }}>
            <Tooltip title="Remove Filter">
              <IconButton
                size="small"
                color="error"
                onClick={() => handleRemoveFilter(index)}
                sx={{ ml: 1 }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Grid>
        </Grid>
      ))}

      {dynamicFilters.length === 0 && (
        <Box 
          sx={{ 
            p: 2, 
            textAlign: 'center',
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 1,
            backgroundColor: 'background.paper'
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Click the + button to add a custom filter
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default DynamicFieldFilter;