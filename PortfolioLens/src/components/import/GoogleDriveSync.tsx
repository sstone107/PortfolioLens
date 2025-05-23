import React, { useState } from 'react';
import { 
  Button, 
  Box,
  CircularProgress,
  Menu,
  MenuItem,
  Typography
} from '@mui/material';
import { CloudDownload, Settings, ArrowDropDown } from '@mui/icons-material';
import { supabaseClient as supabase } from '../../utility/supabaseClient';
import { useNavigate } from 'react-router-dom';

export const GoogleDriveSync: React.FC = () => {
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSyncAll = async () => {
    handleClose();
    setSyncing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke(
        'sync-google-drive',
        {
          body: {} // Sync all configured folders
        }
      );

      if (error) {
        throw error;
      }

      if (data.results && data.results.length > 0) {
        const processed = data.results.filter((r: any) => r.status === 'processing').length;
        const failed = data.results.filter((r: any) => r.status === 'error').length;
        
        let message = `Sync completed! Processed ${processed} files.`;
        if (failed > 0) {
          message += ` ${failed} files failed.`;
        }
        
        alert(message);
        // Navigate to import history to see results
        navigate('/import/history');
      } else {
        alert('No new files found to sync.');
      }

    } catch (err) {
      console.error('Sync error:', err);
      alert(`Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleConfigure = () => {
    handleClose();
    navigate('/import/google-drive-config');
  };

  return (
    <Box>
      <Button
        variant="outlined"
        onClick={handleClick}
        endIcon={<ArrowDropDown />}
        disabled={syncing}
        startIcon={syncing ? <CircularProgress size={20} /> : <CloudDownload />}
      >
        {syncing ? 'Syncing...' : 'Google Drive Sync'}
      </Button>
      
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
      >
        <MenuItem onClick={handleSyncAll}>
          <CloudDownload sx={{ mr: 1 }} />
          Sync All Configured Folders
        </MenuItem>
        <MenuItem onClick={handleConfigure}>
          <Settings sx={{ mr: 1 }} />
          Configure Sync Settings
        </MenuItem>
      </Menu>
    </Box>
  );
};