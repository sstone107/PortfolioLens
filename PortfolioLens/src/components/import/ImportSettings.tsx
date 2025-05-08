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
import { ImportSettings } from './types';

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

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSettings({
      ...localSettings,
      [event.target.name]: event.target.checked,
    });
  };

  const handleApply = () => {
    // Ensure all fields are present when applying, even if not directly editable in this dialog version
    const fullSettingsToApply: ImportSettings = {
      useFirstRowAsHeader: localSettings.useFirstRowAsHeader,
      useSheetNameForTableMatch: localSettings.useSheetNameForTableMatch,
      inferDataTypes: localSettings.inferDataTypes,
      createMissingColumns: localSettings.createMissingColumns,
      // Carry over other settings not directly editable in this dialog
      enableDataEnrichment: settings.enableDataEnrichment || false,
      applyGlobalAttributes: settings.applyGlobalAttributes || false,
      useSubServicerTags: settings.useSubServicerTags || false,
      createAuditTrail: settings.createAuditTrail || false,
    };
    onApply(fullSettingsToApply);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Import Settings</DialogTitle>
      <DialogContent>
        <FormControlLabel
          control={<Checkbox checked={localSettings.useFirstRowAsHeader} onChange={handleChange} name="useFirstRowAsHeader" />}
          label="Use first row as header"
        />
        <FormControlLabel
          control={<Checkbox checked={localSettings.useSheetNameForTableMatch} onChange={handleChange} name="useSheetNameForTableMatch" />}
          label="Use sheet name for table match"
        />
        <FormControlLabel
          control={<Checkbox checked={localSettings.inferDataTypes} onChange={handleChange} name="inferDataTypes" />}
          label="Infer data types"
        />
        <FormControlLabel
          control={<Checkbox checked={localSettings.createMissingColumns} onChange={handleChange} name="createMissingColumns" />}
          label="Create missing columns"
        />
        {/* TODO: Add controls for other ImportSettings fields if they should be user-configurable */}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleApply}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
};
