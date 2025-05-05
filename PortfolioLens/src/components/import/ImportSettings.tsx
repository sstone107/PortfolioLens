import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Checkbox,
  FormControlLabel,
} from '@mui/material';

export interface ImportSettings {
  useFirstRowAsHeader: boolean;
  useSheetNameForTableMatch: boolean;
  inferDataTypes: boolean;
  createMissingColumns: boolean;
}

interface ImportSettingsDialogProps {
  open: boolean;
  settings: ImportSettings;
  onClose: () => void;
  onApply: (settings: ImportSettings) => void;
}

/**
 * Dialog component for Excel import settings
 */
export const ImportSettingsDialog: React.FC<ImportSettingsDialogProps> = ({
  open,
  settings,
  onClose,
  onApply,
}) => {
  // Local state to track settings changes within the dialog
  const [localSettings, setLocalSettings] = React.useState<ImportSettings>(settings);

  // Update local settings when the props change
  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Handle setting changes
  const handleChange = (setting: keyof ImportSettings) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setLocalSettings({
      ...localSettings,
      [setting]: e.target.checked,
    });
  };

  // Apply settings and close
  const handleApply = () => {
    onApply(localSettings);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Import Settings</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1, minWidth: '300px' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={localSettings.useFirstRowAsHeader}
                onChange={handleChange('useFirstRowAsHeader')}
              />
            }
            label="Use first row as column headers"
          />
          
          <FormControlLabel
            control={
              <Checkbox
                checked={localSettings.useSheetNameForTableMatch}
                onChange={handleChange('useSheetNameForTableMatch')}
              />
            }
            label="Auto-match tables by sheet name"
          />
          
          <FormControlLabel
            control={
              <Checkbox
                checked={localSettings.inferDataTypes}
                onChange={handleChange('inferDataTypes')}
              />
            }
            label="Auto-detect column data types"
          />
          
          <FormControlLabel
            control={
              <Checkbox
                checked={localSettings.createMissingColumns}
                onChange={handleChange('createMissingColumns')}
              />
            }
            label="Create missing columns in tables"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleApply} variant="contained">Apply</Button>
      </DialogActions>
    </Dialog>
  );
};
