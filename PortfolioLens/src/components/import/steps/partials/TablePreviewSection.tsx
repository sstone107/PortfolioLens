/**
 * TablePreviewSection.tsx
 * Component for displaying sample data preview
 */
import React from 'react';
import { getDisplayName } from '../../utils/tableNameUtils';
import {
  Box,
  Typography,
  Button,
  Alert,
} from '@mui/material';
import { SheetMapping } from '../../../../store/batchImportStore';
import SampleDataTable from '../../SampleDataTable';

interface TablePreviewSectionProps {
  selectedSheet: SheetMapping | null;
  sheets: SheetMapping[];
  showAllSamples: boolean;
  setShowAllSamples: (show: boolean) => void;
}

/**
 * Component for displaying sample data preview of selected and all sheets
 */
const TablePreviewSection: React.FC<TablePreviewSectionProps> = ({
  selectedSheet,
  sheets,
  showAllSamples,
  setShowAllSamples
}) => {
  return (
    <Box>
      {/* Selected sheet preview */}
      {selectedSheet && (
        <Box>
          <Typography variant="subtitle1" gutterBottom>
            Preview: {selectedSheet.originalName}
            {selectedSheet.skip ? ' (Skipped)' : selectedSheet.mappedName === '_create_new_' ? ' → New Table' : ` → ${getDisplayName(selectedSheet.mappedName)}`}
          </Typography>
          
          <SampleDataTable 
            sheet={selectedSheet} 
            headerRow={selectedSheet.headerRow} 
            showDataTypes={true}
          />
        </Box>
      )}
      
      {/* No selection prompt */}
      {!selectedSheet && sheets.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Click the view icon on a sheet to preview its data
        </Alert>
      )}
      
      {/* Show all samples toggle */}
      {sheets.length > 0 && (
        <Button 
          variant="outlined" 
          onClick={() => setShowAllSamples(!showAllSamples)}
          sx={{ mt: 2 }}
        >
          {showAllSamples ? 'Hide All Samples' : 'Show All Samples'}
        </Button>
      )}
      
      {/* All sheet previews */}
      {showAllSamples && (
        <Box sx={{ mt: 2 }}>
          {sheets.map((sheet) => (
            <Box key={sheet.id} sx={{ mt: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                {sheet.originalName} {sheet.skip ? '(Skipped)' : sheet.mappedName === '_create_new_' ? '→ New Table' : `→ ${getDisplayName(sheet.mappedName)}`}
              </Typography>
              
              <SampleDataTable 
                sheet={sheet} 
                headerRow={sheet.headerRow} 
                showDataTypes={true}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default TablePreviewSection;