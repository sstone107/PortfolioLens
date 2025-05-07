import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormHelperText,
} from '@mui/material';
import { ColumnType } from './types';

interface CreateFieldModalProps {
  open: boolean;
  onClose: () => void;
  excelColumnName: string;
  existingDbColumnNames: string[];
  onSaveField: (newField: { name: string; type: ColumnType }) => void;
}

const makeSqlFriendly = (name: string): string => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^a-z0-9_]/g, '') // Remove non-alphanumeric (except underscore)
    .replace(/__+/g, '_') // Replace multiple underscores with single
    .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
};

export const CreateFieldModal: React.FC<CreateFieldModalProps> = ({
  open,
  onClose,
  excelColumnName,
  existingDbColumnNames,
  onSaveField,
}) => {
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<ColumnType>('string');
  const [fieldNameError, setFieldNameError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFieldName(makeSqlFriendly(excelColumnName));
      setFieldType('string'); // Reset type on open
      setFieldNameError(null); // Reset error on open
    }
  }, [open, excelColumnName]);

  const handleSave = () => {
    const trimmedFieldName = fieldName.trim();
    if (!trimmedFieldName) {
      setFieldNameError('Field name cannot be empty.');
      return;
    }
    if (existingDbColumnNames.map(name => name.toLowerCase()).includes(trimmedFieldName.toLowerCase())) {
      setFieldNameError('This field name already exists in the database table.');
      return;
    }
    // Basic check for potentially problematic SQL names (very simple)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedFieldName)) {
        setFieldNameError('Field name should start with a letter or underscore, and contain only letters, numbers, or underscores.');
        return;
    }

    onSaveField({ name: trimmedFieldName, type: fieldType });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Database Field</DialogTitle>
      <DialogContent dividers>
        <TextField
          autoFocus
          margin="dense"
          id="fieldName"
          label="New Field Name"
          type="text"
          fullWidth
          variant="outlined"
          value={fieldName}
          onChange={(e) => {
            setFieldName(e.target.value);
            if (fieldNameError) setFieldNameError(null); // Clear error on change
          }}
          error={!!fieldNameError}
          helperText={fieldNameError || `Suggested based on Excel column: ${excelColumnName}`}
          sx={{ mb: 2 }}
        />
        <FormControl fullWidth variant="outlined">
          <InputLabel id="fieldType-label">Field Type</InputLabel>
          <Select
            labelId="fieldType-label"
            id="fieldType"
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as ColumnType)}
            label="Field Type"
          >
            <MenuItem value="string">Text (String)</MenuItem>
            <MenuItem value="number">Number (Numeric, Integer)</MenuItem>
            <MenuItem value="boolean">True/False (Boolean)</MenuItem>
            <MenuItem value="date">Date/Timestamp</MenuItem>
            {/* Add other types as needed, e.g., json */}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save Field
        </Button>
      </DialogActions>
    </Dialog>
  );
};
