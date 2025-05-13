/**
 * TableMappingHeader.tsx
 * Header component for the table mapping step with global controls and summary
 */
import React from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  Card,
  CardHeader,
  CardContent,
  Divider,
  Stack,
  CircularProgress,
  useMediaQuery,
  useTheme,
  Switch,
  FormControlLabel
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import { SheetMapping } from '../../../../store/batchImportStore';
import { TABLE_AUTO_APPROVE_THRESHOLD } from '../../hooks/useAutoTableMatch';

interface TableMappingHeaderProps {
  sheets: SheetMapping[];
  globalHeaderRow: number;
  tablePrefix: string;
  tablesLoading: boolean;
  handleGlobalHeaderRowChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleGlobalTablePrefixChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAutoMap: () => void;
  progress: {
    stage: string;
    message: string;
    percent: number;
  };
}

/**
 * Header component for the table mapping step with global controls and summary
 */
const TableMappingHeader: React.FC<TableMappingHeaderProps> = ({
  sheets,
  globalHeaderRow,
  tablePrefix,
  tablesLoading,
  handleGlobalHeaderRowChange,
  handleGlobalTablePrefixChange,
  handleAutoMap,
  progress
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Calculate summary counts
  const pendingSheets = sheets.filter(s => !s.skip && (!s.approved && !s.mappedName === false));
  const approvedSheets = sheets.filter(s => !s.skip && (s.approved || (s.isNewTable && s.mappedName !== '_create_new_')));
  const skippedSheets = sheets.filter(s => s.skip);

  const pendingCount = pendingSheets.length;
  const approvedCount = approvedSheets.length;
  const skippedCount = skippedSheets.length;

  return (
    <Card sx={{ mb: 4 }}>
      <CardHeader
        title="Sheet to Table Mapping"
        subheader={
          progress && progress.stage === 'analyzing'
            ? `Auto-mapping sheets to tables... (Only ≥${TABLE_AUTO_APPROVE_THRESHOLD}% confidence matches will be auto-approved)`
            : "Map each Excel sheet to a database table"
        }
        action={
          progress && progress.stage === 'analyzing' && (
            <CircularProgress size={24} sx={{ mr: 2 }} />
          )
        }
      />
      <Divider />
      <CardContent>
        <Stack spacing={3}>
          {/* Global settings */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
              Global Settings
            </Typography>
            
            <Stack 
              direction={isMobile ? "column" : "row"} 
              spacing={2} 
              alignItems={isMobile ? "flex-start" : "center"}
              sx={{ mb: 1 }}
            >
              <TextField
                label="Header Row"
                type="number"
                size="small"
                // Display 1-based for user
                value={globalHeaderRow + 1}
                onChange={handleGlobalHeaderRowChange}
                InputProps={{ inputProps: { min: 1 } }}
                helperText="Row number starts at 1"
                sx={{ width: 140 }}
              />
              
              <TextField
                label="Table Prefix"
                size="small"
                value={tablePrefix}
                onChange={handleGlobalTablePrefixChange}
                placeholder="e.g., import_"
                helperText="Optional prefix for new tables only"
                sx={{ width: 240 }}
              />
              
              <Button
                variant="outlined"
                onClick={handleAutoMap}
                disabled={tablesLoading || pendingSheets.length === 0}
                startIcon={tablesLoading ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
              >
                Auto-Map Sheets
              </Button>
              
            </Stack>

            {tablesLoading && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Loading database tables... mapping options will expand when ready
              </Typography>
            )}
          </Box>
          
          {/* Summary */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Mapping Summary
            </Typography>
            
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <Chip 
                icon={<WarningIcon />} 
                label={`${pendingCount} Need Review`}
                color="warning"
                variant={pendingCount > 0 ? "filled" : "outlined"}
              />
              
              <Chip 
                icon={<CheckCircleIcon />} 
                label={`${approvedCount} Approved`}
                color="success"
                variant={approvedCount > 0 ? "filled" : "outlined"}
              />
              
              <Chip 
                label={`${skippedCount} Skipped`}
                color="default"
                variant={skippedCount > 0 ? "filled" : "outlined"}
              />

              {sheets.length > 0 && (
                <Chip
                  label={`${sheets.length} Total`}
                  color="primary"
                  variant="outlined"
                />
              )}
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default TableMappingHeader;