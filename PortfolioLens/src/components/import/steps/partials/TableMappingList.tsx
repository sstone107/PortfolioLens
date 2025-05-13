/**
 * TableMappingList.tsx
 * Virtualized list component for table mapping
 */
import React, { useState } from 'react';
import {
  Box,
  Paper,
  Table,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  FormControlLabel,
  Switch,
  Typography
} from '@mui/material';
import { SheetMapping } from '../../../../store/batchImportStore';
import TableMappingRow from './TableMappingRow';

interface TableMappingListProps {
  sheets: SheetMapping[];
  selectedSheet: SheetMapping | null;
  tables: any[];
  tablesLoading: boolean;
  columnWidths: Record<string, string>;
  isMobile: boolean;
  validateTableExists: (tableName: string) => boolean;
  getSortedTableSuggestions: (sheetName: string) => Array<{name: string; originalName: string; confidence: number}>;
  getEffectiveStatus: (sheet: SheetMapping) => {
    isApproved: boolean;
    needsReview: boolean;
    confidence: number;
    isNewTable: boolean;
  };
  toSqlFriendlyName: (name: string) => string;
  handleMappedNameChange: (sheetId: string, value: string) => void;
  handleHeaderRowChange: (sheetId: string, row: number) => void;
  handleSkipToggle: (sheetId: string, skip: boolean) => void;
  handleApproveNew: (sheetId: string) => void;
  handleSelectSheet: (sheetId: string) => void;
  tablePrefix: string;
  updateSheet: (sheetId: string, updates: Partial<SheetMapping>) => void;
  generateSqlSafeName: (friendlyName: string) => string;
  formatConfidence: (confidenceValue: number) => number;
}

/**
 * Virtualized list component for table mapping with fixed header
 */
const TableMappingList: React.FC<TableMappingListProps> = ({
  sheets,
  selectedSheet,
  tables,
  tablesLoading,
  columnWidths,
  isMobile,
  validateTableExists,
  getSortedTableSuggestions,
  getEffectiveStatus,
  toSqlFriendlyName,
  handleMappedNameChange,
  handleHeaderRowChange,
  handleSkipToggle,
  handleApproveNew,
  handleSelectSheet,
  tablePrefix,
  updateSheet,
  generateSqlSafeName,
  formatConfidence
}) => {
  const theme = useTheme();
  // Always filter to show only loan tables
  const filterLoanTables = true;

  // Define base cell style for rows
  const cellBaseStyle: React.CSSProperties = {
    padding: theme.spacing(1, 2),
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
  
  // We're now rendering the rows directly rather than using a virtualized list

  return (
    <Box sx={{ mb: 2 }} className="TableMappingListContainer">
      <TableContainer 
        component={Paper} 
        sx={{ 
          mb: 0,
          boxShadow: 2,
          borderRadius: '8px 8px 0 0',
          overflow: 'visible'
        }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow sx={{ backgroundColor: theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100] }}>
              <TableCell sx={{ width: columnWidths.sheetName, borderBottom: `2px solid ${theme.palette.primary.main}` }}>Sheet Name</TableCell>
              <TableCell sx={{ width: columnWidths.databaseTable, borderBottom: `2px solid ${theme.palette.primary.main}` }}>Database Table</TableCell>
              <TableCell sx={{ width: columnWidths.headerRow, borderBottom: `2px solid ${theme.palette.primary.main}` }}>Header Row</TableCell>
              <TableCell sx={{ width: columnWidths.skip, textAlign: 'center', borderBottom: `2px solid ${theme.palette.primary.main}` }}>Skip</TableCell>
              <TableCell sx={{ width: columnWidths.status, borderBottom: `2px solid ${theme.palette.primary.main}` }}>Status</TableCell>
              <TableCell sx={{ width: columnWidths.actions, textAlign: 'center', borderBottom: `2px solid ${theme.palette.primary.main}` }}>Actions</TableCell>
            </TableRow>
          </TableHead>
        </Table>
      </TableContainer>

      {/* Table body container with natural height */}
      {/* Render all rows directly for simpler scroll behavior */}
      <Box
        component="div"
        sx={{
          width: '100%',
          borderRadius: '0 0 8px 8px',
          boxShadow: 2,
          // Add overflow auto to enable scrolling if needed
          maxHeight: '65vh',
          overflow: 'auto',
          '& .ReactWindowRow': {
            display: 'flex',
            width: '100%',
            borderBottom: '1px solid rgba(224, 224, 224, 1)'
          },
          '& .MappingRow:last-child': {
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px'
          }
        }}
      >
        {sheets.map((sheet, index) => (
          <TableMappingRow
            key={sheet.id}
            sheet={sheet}
            style={{ height: '60px' }}
            columnWidths={columnWidths}
            cellStyle={cellBaseStyle}
            isSelected={selectedSheet?.id === sheet.id}
            tables={tables}
            tablesLoading={tablesLoading}
            validateTableExists={validateTableExists}
            getSortedTableSuggestions={getSortedTableSuggestions}
            getEffectiveStatus={getEffectiveStatus}
            toSqlFriendlyName={toSqlFriendlyName}
            handleMappedNameChange={handleMappedNameChange}
            handleHeaderRowChange={handleHeaderRowChange}
            handleSkipToggle={handleSkipToggle}
            handleApproveNew={handleApproveNew}
            handleSelectSheet={handleSelectSheet}
            tablePrefix={tablePrefix}
            updateSheet={updateSheet}
            generateSqlSafeName={generateSqlSafeName}
            formatConfidence={formatConfidence}
            showOnlyLoanTables={filterLoanTables}
          />
        ))}
      </Box>
    </Box>
  );
};

export default TableMappingList;