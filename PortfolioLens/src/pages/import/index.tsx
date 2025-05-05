import React, { useState, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Stepper, 
  Step, 
  StepLabel, 
  Paper, 
  Button, 
  Container,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Alert,
  CircularProgress
} from '@mui/material';
import { NavigateNext as NextIcon, NavigateBefore as BackIcon } from '@mui/icons-material';
import { ExcelUploader } from '../../components/import/ExcelUploader';
import { ColumnMappingModal } from '../../components/import/ColumnMapper';
import { DatabaseService } from '../../components/import/services/DatabaseService';
import { SheetInfo, WorkbookInfo, TableInfo, ColumnMapping, ImportPreview } from '../../components/import/types';
import { useNotification } from '@refinedev/core';
import { useNavigate } from 'react-router-dom';

/**
 * Page for importing Excel data into the database
 */
export const ExcelImportPage: React.FC = () => {
  // Step management
  const [activeStep, setActiveStep] = useState(0);
  const steps = ['Upload Excel File', 'Select Target Table', 'Map Columns', 'Preview & Import'];
  
  // Notification system
  const { open } = useNotification();
  const navigate = useNavigate();
  
  // Excel data states
  const [workbookInfo, setWorkbookInfo] = useState<WorkbookInfo | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<SheetInfo | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  
  // Database states
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  
  // Mapping states
  const [columnMapping, setColumnMapping] = useState<Record<string, ColumnMapping>>({});
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  
  // Import states
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importSuccess, setImportSuccess] = useState(false);
  
  // Database service instance
  const dbService = new DatabaseService();
  
  // Handle file upload completion
  const handleFileLoaded = useCallback(async (info: WorkbookInfo) => {
    console.log('Excel file loaded:', info);
    setWorkbookInfo(info);
    
    // Select first sheet by default
    if (info.sheets.length > 0) {
      setSelectedSheet(info.sheets[0]);
    }
    
    // Load available tables
    try {
      setIsLoadingTables(true);
      const tables = await dbService.getTables();
      setAvailableTables(tables);
      setIsLoadingTables(false);
    } catch (error) {
      console.error('Error loading tables:', error);
      open?.({
        type: 'error',
        message: 'Failed to load database tables',
        description: error instanceof Error ? error.message : String(error)
      });
      setIsLoadingTables(false);
    }
    
    // Move to next step
    setActiveStep(1);
  }, [dbService, open]);
  
  // Handle table selection
  const handleTableSelect = useCallback(async (tableName: string) => {
    if (!tableName) {
      setTableInfo(null);
      return;
    }
    
    setSelectedTable(tableName);
    
    try {
      const info = await dbService.getTableInfo(tableName);
      setTableInfo(info);
      
      // Move to next step
      setActiveStep(2);
    } catch (error) {
      console.error('Error loading table info:', error);
      open?.({
        type: 'error',
        message: `Failed to load schema for "${tableName}"`,
        description: error instanceof Error ? error.message : String(error)
      });
    }
  }, [dbService, open]);
  
  // Handle column mapping changes
  const handleMappingChange = useCallback((mapping: Record<string, ColumnMapping>) => {
    setColumnMapping(mapping);
  }, []);
  
  // Handle saving column mapping
  const handleSaveMapping = useCallback(async (name: string, mapping: Record<string, ColumnMapping>) => {
    if (!selectedTable) return;
    
    try {
      await dbService.saveMapping(name, selectedTable, mapping);
      
      open?.({
        type: 'success',
        message: 'Mapping saved successfully',
        description: `Mapping "${name}" has been saved and can be reused for future imports.`
      });
    } catch (error) {
      console.error('Error saving mapping:', error);
      open?.({
        type: 'error',
        message: 'Failed to save mapping',
        description: error instanceof Error ? error.message : String(error)
      });
    }
  }, [dbService, selectedTable, open]);
  
  // Generate preview for the data import
  const handleGeneratePreview = useCallback(async () => {
    if (!selectedSheet || !columnMapping || Object.keys(columnMapping).length === 0) {
      return;
    }
    
    setIsGeneratingPreview(true);
    
    try {
      // This would normally call a backend API to generate a preview
      // For now, we'll simulate a preview
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Generate a simple preview with the first 5 rows
      const previewRows = selectedSheet.previewRows.map(row => {
        const result: Record<string, {
          excelValue: any;
          dbValue: any;
          valid: boolean;
          errorMessage?: string;
        }> = {};
        
        // Process each mapped column
        for (const [excelCol, mapping] of Object.entries(columnMapping)) {
          const excelValue = row[excelCol];
          
          // Simulate type conversion
          let dbValue = excelValue;
          let valid = true;
          let errorMessage;
          
          if (excelValue !== undefined && excelValue !== null) {
            try {
              switch (mapping.type) {
                case 'number':
                  dbValue = Number(excelValue);
                  valid = !isNaN(dbValue);
                  if (!valid) errorMessage = 'Not a valid number';
                  break;
                case 'boolean':
                  if (typeof excelValue === 'string') {
                    const lowerValue = excelValue.toLowerCase();
                    dbValue = ['true', 'yes', 'y', '1'].includes(lowerValue);
                  } else {
                    dbValue = Boolean(excelValue);
                  }
                  break;
                case 'date':
                  if (typeof excelValue === 'number') {
                    // Handle Excel serial date
                    const excelEpoch = new Date(1899, 11, 30);
                    const msPerDay = 24 * 60 * 60 * 1000;
                    dbValue = new Date(excelEpoch.getTime() + excelValue * msPerDay);
                  } else {
                    dbValue = new Date(excelValue);
                  }
                  valid = !isNaN(dbValue.getTime());
                  if (!valid) errorMessage = 'Not a valid date';
                  break;
                default:
                  dbValue = String(excelValue);
              }
            } catch (err) {
              valid = false;
              errorMessage = err instanceof Error ? err.message : 'Type conversion error';
            }
          }
          
          result[mapping.dbColumn] = {
            excelValue,
            dbValue,
            valid,
            errorMessage
          };
        }
        
        return result;
      });
      
      setImportPreview({
        columnMappings: columnMapping,
        previewRows: previewRows
      });
      
      // Move to next step
      setActiveStep(3);
    } catch (error) {
      console.error('Error generating preview:', error);
      open?.({
        type: 'error',
        message: 'Failed to generate import preview',
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [selectedSheet, columnMapping, open]);
  
  // Start the import process
  const handleStartImport = useCallback(async () => {
    if (!workbookInfo || !selectedSheet || !selectedTable || !columnMapping || Object.keys(columnMapping).length === 0) {
      return;
    }
    
    setIsImporting(true);
    setImportProgress(0);
    
    try {
      // Simulate import process with progress updates
      for (let i = 0; i <= 100; i += 10) {
        setImportProgress(i);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // In a real implementation, we would:
      // 1. Create an import job in the database
      // 2. Send the Excel file and mapping to the server
      // 3. Process the data in batches on the server
      // 4. Update the UI with progress information
      
      setImportSuccess(true);
      open?.({
        type: 'success',
        message: 'Data imported successfully',
        description: `Imported data from "${selectedSheet.name}" into "${selectedTable}" table.`
      });
      
      // Wait a moment before allowing navigation
      setTimeout(() => {
        setIsImporting(false);
      }, 1000);
      
    } catch (error) {
      console.error('Error importing data:', error);
      open?.({
        type: 'error',
        message: 'Failed to import data',
        description: error instanceof Error ? error.message : String(error)
      });
      setIsImporting(false);
    }
  }, [workbookInfo, selectedSheet, selectedTable, columnMapping, open]);
  
  // Navigate back to table list
  const handleViewTable = useCallback(() => {
    navigate(`/table/${selectedTable}`);
  }, [navigate, selectedTable]);
  
  // Handle moving between steps
  const handleNext = useCallback(() => {
    if (activeStep === 2) {
      // Generate preview before moving to final step
      handleGeneratePreview();
      return;
    }
    
    setActiveStep(prev => prev + 1);
  }, [activeStep, handleGeneratePreview]);
  
  const handleBack = useCallback(() => {
    setActiveStep(prev => prev - 1);
  }, []);
  
  // Check if we can proceed to next step
  const canProceed = useCallback(() => {
    switch (activeStep) {
      case 0:
        return !!workbookInfo;
      case 1:
        return !!selectedTable && !!tableInfo;
      case 2:
        return Object.keys(columnMapping).length > 0;
      case 3:
        return !isImporting;
      default:
        return false;
    }
  }, [activeStep, workbookInfo, selectedTable, tableInfo, columnMapping, isImporting]);
  
  // Render step content
  const renderStepContent = useCallback(() => {
    switch (activeStep) {
      case 0:
        return (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              Upload Excel File
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Upload an Excel file (.xlsx or .xls) containing the data you want to import.
              The file will be analyzed to extract sheet and column information.
            </Typography>
            <ExcelUploader 
              onFileLoaded={handleFileLoaded}
              isLoading={isProcessingFile}
            />
          </Box>
        );
        
      case 1:
        return (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              Select Target Table
            </Typography>
            
            {workbookInfo && (
              <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                <Typography variant="subtitle2">File Information:</Typography>
                <Typography variant="body2">
                  {workbookInfo.fileName} ({workbookInfo.sheets.length} sheets)
                </Typography>
                
                <Box sx={{ mt: 2 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Select Sheet</InputLabel>
                    <Select
                      value={selectedSheet?.name || ''}
                      label="Select Sheet"
                      onChange={(e) => {
                        const sheetName = e.target.value;
                        const sheet = workbookInfo.sheets.find(s => s.name === sheetName);
                        if (sheet) {
                          setSelectedSheet(sheet);
                        }
                      }}
                    >
                      {workbookInfo.sheets.map(sheet => (
                        <MenuItem key={sheet.name} value={sheet.name}>
                          {sheet.name} ({sheet.rowCount} rows, {sheet.columnCount} columns)
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Paper>
            )}
            
            <Typography variant="subtitle1" gutterBottom>
              Select the database table where you want to import the data:
            </Typography>
            
            <FormControl fullWidth sx={{ mt: 1 }}>
              <InputLabel>Target Table</InputLabel>
              <Select
                value={selectedTable}
                label="Target Table"
                onChange={(e) => handleTableSelect(e.target.value)}
                disabled={isLoadingTables}
              >
                <MenuItem value="">
                  <em>Select a table</em>
                </MenuItem>
                {availableTables.map(table => (
                  <MenuItem key={table} value={table}>{table}</MenuItem>
                ))}
              </Select>
            </FormControl>
            
            {isLoadingTables && (
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                <Typography variant="body2">Loading database tables...</Typography>
              </Box>
            )}
          </Box>
        );
        
      case 2:
        return (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              Map Excel Columns to Database Fields
            </Typography>
            <Typography variant="body2" color="textSecondary" paragraph>
              Define how columns from your Excel file map to fields in the database table.
              You can use auto-mapping to quickly match columns with similar names.
            </Typography>
            
            {selectedSheet && tableInfo && (
              <ColumnMappingModal
                open={true}
                onClose={() => console.log('Modal close requested')}
                sheetInfo={selectedSheet}
                tableInfo={tableInfo}
                tableName={tableInfo.tableName || 'Table'}
                initialMappings={{}}
                onSave={handleMappingChange}
                exampleData={{}}
              />
            )}
          </Box>
        );
        
      case 3:
        return (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              Preview & Import Data
            </Typography>
            
            {importPreview && (
              <Box>
                <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Import Summary
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box>
                      <Typography variant="subtitle2" component="span">Source: </Typography>
                      <Typography variant="body2" component="span">
                        {workbookInfo?.fileName}, Sheet: {selectedSheet?.name}
                      </Typography>
                    </Box>
                    
                    <Box>
                      <Typography variant="subtitle2" component="span">Target: </Typography>
                      <Typography variant="body2" component="span">
                        Table: {selectedTable}
                      </Typography>
                    </Box>
                    
                    <Box>
                      <Typography variant="subtitle2" component="span">Columns Mapped: </Typography>
                      <Typography variant="body2" component="span">
                        {Object.keys(columnMapping).length} of {selectedSheet?.columns.length}
                      </Typography>
                    </Box>
                    
                    <Box>
                      <Typography variant="subtitle2" component="span">Total Rows: </Typography>
                      <Typography variant="body2" component="span">
                        {selectedSheet?.rowCount}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
                
                {isImporting ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <CircularProgress variant="determinate" value={importProgress} size={60} />
                    <Typography variant="h6" sx={{ mt: 2 }}>
                      Importing Data...
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {importProgress}% Complete
                    </Typography>
                  </Box>
                ) : importSuccess ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Alert severity="success" sx={{ mb: 3 }}>
                      Data imported successfully!
                    </Alert>
                    <Button
                      variant="contained"
                      onClick={handleViewTable}
                    >
                      View Table Data
                    </Button>
                  </Box>
                ) : (
                  <Box sx={{ mt: 3, textAlign: 'center' }}>
                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      onClick={handleStartImport}
                    >
                      Start Import
                    </Button>
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                      This will import {selectedSheet?.rowCount} rows to the {selectedTable} table.
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        );
        
      default:
        return null;
    }
  }, [
    activeStep,
    workbookInfo,
    selectedSheet,
    selectedTable,
    tableInfo,
    availableTables,
    isLoadingTables,
    isProcessingFile,
    columnMapping,
    importPreview,
    isImporting,
    importProgress,
    importSuccess,
    handleFileLoaded,
    handleTableSelect,
    handleMappingChange,
    handleSaveMapping,
    handleViewTable,
    handleStartImport
  ]);
  
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>
          Excel Data Import
        </Typography>
        
        <Divider sx={{ my: 2 }} />
        
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map(label => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        
        {renderStepContent()}
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
          <Button
            variant="outlined"
            startIcon={<BackIcon />}
            onClick={handleBack}
            disabled={activeStep === 0 || isImporting}
          >
            Back
          </Button>
          
          {activeStep < steps.length - 1 && (
            <Button
              variant="contained"
              endIcon={<NextIcon />}
              onClick={handleNext}
              disabled={!canProceed() || isGeneratingPreview}
            >
              {isGeneratingPreview ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  Generating Preview...
                </>
              ) : (
                'Next'
              )}
            </Button>
          )}
        </Box>
      </Box>
    </Container>
  );
};

export default ExcelImportPage;
