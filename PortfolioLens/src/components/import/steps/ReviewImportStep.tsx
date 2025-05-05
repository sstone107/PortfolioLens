import React, { useState, useCallback } from 'react';
import { Box, Button, Typography, Paper, Alert, LinearProgress, Grid } from '@mui/material';
import { PlayArrow as PlayArrowIcon, Code as CodeIcon } from '@mui/icons-material';
import { ImportResultsDisplay } from '../ImportResultsDisplay';
import { WorkbookInfo, ImportSettings, MissingColumnInfo } from '../types';
import SchemaPreview from '../SchemaPreview';
import { SchemaGenerator } from '../services/SchemaGenerator';
import { executeSQL, tableExists } from '../../../utility/supabaseClient';
import { MetadataService } from '../services/MetadataService';

interface ReviewImportStepProps {
  workbookInfo: WorkbookInfo;
  sheetTableMappings: Record<string, string>;
  selectedSheets: Record<string, boolean>;
  importSettings: ImportSettings;
  isImporting: boolean;
  importProgress: number;
  importResults: Record<string, any>;
  errors: Record<string, string>;
  onStartImport: () => Promise<void>;
  onBack: () => void;
  // Props for data access
  excelData?: Record<string, Record<string, any>[]>;
  // Column mappings are critical for schema generation
  columnMappings?: Record<string, Record<string, any>>;
}

/**
 * Step 4 of the import process: Review and Import
 */
export const ReviewImportStep: React.FC<ReviewImportStepProps> = ({
  workbookInfo,
  sheetTableMappings,
  selectedSheets,
  importSettings,
  isImporting,
  importProgress,
  importResults,
  errors,
  onStartImport,
  onBack,
  excelData = {},
  columnMappings = {}
}) => {
  // State for managing schema generation and preview
  const [generatingSchema, setGeneratingSchema] = useState(false);
  const [schemaSQL, setSchemaSQL] = useState<string>('');
  const [showSchemaPreview, setShowSchemaPreview] = useState(false);
  const [schemaCreated, setSchemaCreated] = useState(false);
  
  // Generate SQL for required tables and columns
  const generateSchemaSQL = useCallback(async () => {
    setGeneratingSchema(true);
    
    try {
      const tablesToCreate: { tableName: string }[] = [];
      const columnsToAdd: { tableName: string, columns: MissingColumnInfo[] }[] = [];
      const metadataService = new MetadataService();
      
      console.log('Processing sheets for schema generation:', Object.entries(selectedSheets)
        .filter(([_, selected]) => selected)
        .map(([sheetName]) => sheetName));
      
      // Process each selected sheet
      for (const [sheetName, isSelected] of Object.entries(selectedSheets)) {
        if (!isSelected) {
          console.log(`Skipping sheet ${sheetName} - not selected`);
          continue;
        }
        
        const tableName = sheetTableMappings[sheetName];
        if (!tableName) {
          console.log(`Skipping sheet ${sheetName} - no table mapping`);
          continue;
        }
        
        console.log(`Processing schema for ${sheetName} → ${tableName}`);
        
        // Get sheet data - ALWAYS create the table structure even if no data
        // Just use sample data when available for column detection
        const sheetData = excelData[sheetName] || [];
        if (sheetData.length === 0) {
          console.log(`Warning: No data available for ${sheetName}, will create table structure only`);
        }
        
        // Check if table exists using the dedicated tableExists function
        const doesTableExist = await tableExists(tableName);

        if (!doesTableExist) {
          tablesToCreate.push({ tableName });
        }
        
        // Get existing columns for this table
        const tableInfo = await metadataService.getTableInfo(tableName);
        const existingColumns = tableInfo.columns.map(col => col.columnName.toLowerCase());
        
        // Get the column mappings for this sheet-table pair
        const mappingKey = `${sheetName}-${tableName}`;
        const sheetMappings = columnMappings[mappingKey] || {};
        
        console.log(`Processing column mappings for ${sheetName} → ${tableName}`, 
          Object.keys(sheetMappings).length ? 'Found mappings' : 'No mappings found');
        
        // Extract columns from the mappings
        const columnsFromMappings: MissingColumnInfo[] = [];
        
        // If we have mappings, use them to determine columns
        if (Object.keys(sheetMappings).length > 0) {
          Object.values(sheetMappings).forEach((mapping: any) => {
            if (!mapping.dbColumn) return; // Skip if no DB column mapped
            
            // Skip if column already exists in table
            if (existingColumns.includes(mapping.dbColumn.toLowerCase())) {
              console.log(`Column ${mapping.dbColumn} already exists in ${tableName}`);
              return;
            }
            
            // Convert mapping type to SQL type
            let sqlType = 'text';
            switch(mapping.type) {
              case 'number':
                sqlType = 'numeric';
                break;
              case 'boolean':
                sqlType = 'boolean';
                break;
              case 'date':
                sqlType = 'timestamp';
                break;
              default:
                sqlType = 'text';
            }
            
            // Add to columns list
            columnsFromMappings.push({
              columnName: mapping.dbColumn,
              suggestedType: sqlType,
              originalType: mapping.type
            });
          });
          
          console.log(`Found ${columnsFromMappings.length} columns to add from mappings for ${tableName}:`, 
            columnsFromMappings.map(col => col.columnName).join(', '));
            
          if (columnsFromMappings.length > 0) {
            columnsToAdd.push({
              tableName,
              columns: columnsFromMappings
            });
          }
        }
        // If we have no mappings but we do have sample data, fall back to analyzing the data
        else if (sheetData.length > 0) {
          // Analyze required columns based on data
          const missingColumns = SchemaGenerator.analyzeExcelSchema(tableName, sheetData);
          
          // Filter out columns that already exist
          const filteredColumns = missingColumns.filter(
            col => !existingColumns.includes(col.columnName.toLowerCase())
          );
          
          console.log(`Found ${filteredColumns.length} columns to add from data analysis for ${tableName}:`, 
            filteredColumns.map(col => col.columnName).join(', '));
          
          if (filteredColumns.length > 0) {
            columnsToAdd.push({
              tableName,
              columns: filteredColumns
            });
          }
        }
        // If no table exists and we have neither mappings nor data, create the basic structure
        else if (!tableExists || !tableExists[0] || !tableExists[0].exists) {
          console.log(`Creating basic schema for ${tableName} with standard columns (no mappings or data available)`);
          // No additional columns needed, the CREATE TABLE statement will include id, created_at, updated_at
        }
      }
      
      // Generate SQL
      const sql = SchemaGenerator.generateSQL(tablesToCreate, columnsToAdd);
      setSchemaSQL(sql);
      setShowSchemaPreview(true);
    } catch (error) {
      console.error('Error generating schema SQL:', error);
    } finally {
      setGeneratingSchema(false);
    }
  }, [excelData, selectedSheets, sheetTableMappings]);
  
  // Handle schema creation completion
  const handleSchemaCreateComplete = useCallback((success: boolean) => {
    setSchemaCreated(success);
    setShowSchemaPreview(false);
  }, []);
  
  // If showing schema preview, render that instead
  if (showSchemaPreview) {
    return (
      <SchemaPreview 
        sql={schemaSQL}
        onExecuteComplete={handleSchemaCreateComplete}
        onCancel={() => setShowSchemaPreview(false)}
      />
    );
  }
  
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Review and Start Import
      </Typography>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        You're about to import data from {workbookInfo.fileName} into the database. 
        Please review the selections below before proceeding.
      </Alert>
      
      {schemaCreated && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Schema has been successfully created! You can now proceed with data import.
        </Alert>
      )}
      
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Import Summary:
        </Typography>
        
        <Box sx={{ ml: 2 }}>
          <Typography variant="body2" paragraph>
            <strong>File:</strong> {workbookInfo.fileName}
          </Typography>
          
          <Typography variant="body2" gutterBottom>
            <strong>Selected sheets and their destinations:</strong>
          </Typography>
          
          <Box component="ul" sx={{ mt: 1, mb: 2 }}>
            {Object.entries(selectedSheets)
              .filter(([_, selected]) => selected)
              .map(([sheetName]) => {
                const tableName = sheetTableMappings[sheetName];
                if (!tableName) return null;
                
                const sheet = workbookInfo.sheets.find(s => s.name === sheetName);
                const rowCount = sheet ? sheet.rowCount : 0;
                
                return (
                  <Box component="li" key={sheetName} sx={{ mb: 1 }}>
                    <Typography variant="body2">
                      <strong>{sheetName}</strong> → {tableName} ({rowCount} rows)
                    </Typography>
                  </Box>
                );
              })}
          </Box>
          
          <Typography variant="body2" paragraph>
            <strong>Settings:</strong> 
            {importSettings.createMissingColumns ? 'Create missing columns automatically' : 'Skip missing columns'}, 
            {importSettings.inferDataTypes ? 'Infer data types' : 'Use default data types'}
          </Typography>
        </Box>
      </Paper>
      
      {/* Navigation Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
        <Button 
          variant="outlined"
          onClick={onBack}
          disabled={isImporting || generatingSchema}
        >
          Back
        </Button>
        
        <Box>
          {/* Schema Generation Button */}
          <Button 
            variant="outlined" 
            startIcon={<CodeIcon />} 
            color="secondary"
            onClick={generateSchemaSQL}
            disabled={isImporting || generatingSchema}
            sx={{ mr: 2 }}
          >
            {generatingSchema ? 'Generating Schema...' : 'Generate Schema SQL'}
          </Button>
          
          {/* Import Button */}
          <Button 
            variant="contained" 
            startIcon={<PlayArrowIcon />} 
            color="primary"
            onClick={onStartImport}
            disabled={isImporting || Object.keys(errors).length > 0}
          >
            {isImporting ? `Importing... ${Math.round(importProgress)}%` : 'Start Import'}
          </Button>
        </Box>
      </Box>
      
      {/* Import Progress and Results */}
      <ImportResultsDisplay 
        isImporting={isImporting}
        importProgress={importProgress}
        importResults={importResults}
        sheetTableMappings={sheetTableMappings}
      />
    </Box>
  );
};
