import React, { useState, useCallback } from 'react';
import { Box, Button, Typography, Paper, Alert, LinearProgress, Grid, FormControlLabel, Checkbox } from '@mui/material'; // Added FormControlLabel, Checkbox
import { PlayArrow as PlayArrowIcon, Code as CodeIcon } from '@mui/icons-material';
import { ImportResultsDisplay } from '../ImportResultsDisplay';
import { WorkbookInfo, ImportSettings, MissingColumnInfo, BatchColumnMapping } from '../types'; // Added BatchColumnMapping
import SchemaPreview from '../SchemaPreview';
import { SchemaGenerator } from '../services/SchemaGenerator';
import { executeSQL, tableExists } from '../../../utility/supabaseClient';
import { MetadataService } from '../services/MetadataService';
import { SchemaCacheService } from '../services/SchemaCacheService';
import { DatabaseService } from '../services/DatabaseService'; // Added import

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
  // Props for import mode selection
  importMode: 'structureAndData' | 'structureOnly';
  onImportModeChange: (mode: 'structureAndData' | 'structureOnly') => void;
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
  columnMappings = {},
  importMode,
  onImportModeChange
}) => {
  // State for managing schema generation and preview
  const [generatingSchema, setGeneratingSchema] = useState(false);
  // State to hold the parameters for the stored procedure calls
  const [procedureParams, setProcedureParams] = useState<{ tableName: string, columnsJson: string }[]>([]);
  const [showSchemaPreview, setShowSchemaPreview] = useState(false);
  const [schemaCreated, setSchemaCreated] = useState(false);

  // Generate parameters for the stored procedure
  const generateSchemaSQL = useCallback(async () => { // Renamed function but keeping name for now to minimize changes elsewhere
    setGeneratingSchema(true);

    try {
      const tablesToCreate: { tableName: string }[] = [];
      const columnsToAdd: { tableName: string, columns: MissingColumnInfo[] }[] = [];
      const dbService = new DatabaseService(); // Instantiate DatabaseService
      const schemaCacheService = new SchemaCacheService(dbService); // Pass dbService instance
      const metadataService = new MetadataService(schemaCacheService); // Pass schemaCacheService instance

      console.log('Processing sheets for schema generation:', Object.entries(selectedSheets)
        .filter(([_, selected]) => selected)
        .map(([sheetName]) => sheetName));

      // Process each selected sheet
      for (const [sheetName, isSelected] of Object.entries(selectedSheets)) {
        if (!isSelected) {
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

        // Force a refresh of the table schema before getting table info
        if (doesTableExist) {
          try {
            await metadataService.refreshTableSchema(tableName);
          } catch (refreshError) {
            console.error(`[DEBUG ReviewImportStep] Error refreshing schema for ${tableName}:`, refreshError);
          }
        }

        // Get existing columns for this table from cache
        let tableInfo = await metadataService.getCachedTableInfo(tableName);
        // Handle case where tableInfo might be null (e.g., new table or cache miss)

        // Enhanced safety check for tableInfo and columns
        if (!tableInfo || !tableInfo.columns || !Array.isArray(tableInfo.columns) || tableInfo.columns.length === 0) {
          console.warn(`[DEBUG ReviewImportStep] Invalid or missing tableInfo structure for ${tableName}, forcing schema refresh`);

          try {
            // Force a schema refresh using the DatabaseService
            const dbService = metadataService.getDatabaseService();
            if (dbService) {
              console.log(`[DEBUG ReviewImportStep] Forcing schema refresh for ${tableName}`);
              await dbService.getColumns(tableName, true); // true = bypass cache

              // Try to get the table info again after refresh
              await metadataService.refreshTableSchema(tableName);
              const refreshedTableInfo = await metadataService.getCachedTableInfo(tableName);
              if (refreshedTableInfo && refreshedTableInfo.columns && Array.isArray(refreshedTableInfo.columns)) {
                console.log(`[DEBUG ReviewImportStep] Successfully refreshed schema for ${tableName}`);
                tableInfo = refreshedTableInfo;
              }
            }
          } catch (refreshError) {
            console.error(`[DEBUG ReviewImportStep] Error during forced schema refresh for ${tableName}:`, refreshError);
          }

          // If still invalid after refresh attempt, return empty array
          if (!tableInfo || !tableInfo.columns || !Array.isArray(tableInfo.columns)) {
            console.warn(`[DEBUG ReviewImportStep] Still invalid tableInfo structure for ${tableName} after refresh attempt`);
            return []; // Should probably handle this error more gracefully
          }
        }

        const existingColumns = tableInfo.columns
          .filter(col => {
            // More detailed validation and logging
            if (!col) {
              console.warn(`[DEBUG ReviewImportStep] Null column found in tableInfo for ${tableName}`);
              return false;
            }
            if (typeof col.columnName !== 'string' || !col.columnName) {
              console.warn(`[DEBUG ReviewImportStep] Invalid column data found in tableInfo for ${tableName}:`, JSON.stringify(col));
              return false;
            }
            return true;
          })
          .map(col => col.columnName.toLowerCase());


        // Get the column mappings for this sheet-table pair
        const mappingKey = `${sheetName}-${tableName}`;
        const sheetMappings = columnMappings[mappingKey] || {};


        // Extract columns from the mappings
        const columnsFromMappings: MissingColumnInfo[] = [];

        // If we have mappings, use them to determine columns
        if (Object.keys(sheetMappings).length > 0) {
          Object.values(sheetMappings).forEach((mapping: BatchColumnMapping) => { // Use specific type
            // Skip if no DB column mapped or if it's an empty string
            if (!mapping.dbColumn) {
                 console.log(`Skipping mapping for header "${mapping.header}" - no dbColumn defined.`);
                 return;
            }

            // Ensure dbColumn is a non-empty string before using .toLowerCase()
            const dbColumnLower = typeof mapping.dbColumn === 'string' ? mapping.dbColumn.toLowerCase() : '';
            if (!dbColumnLower) {
                 console.log(`Skipping mapping for header "${mapping.header}" - dbColumn is empty or not a string.`);
                 return;
            }

            if (existingColumns.includes(dbColumnLower)) {
              console.log(`Column ${mapping.dbColumn} already exists in ${tableName}`);
              return;
            }

            // Convert mapping type to SQL type
            // Get the inferred data type from the mapping
            const inferredType = mapping.inferredDataType || 'string';
            let sqlType = 'text'; // Default to text

            switch(inferredType) {
              case 'number':
                sqlType = 'numeric';
                break;
              case 'boolean':
                sqlType = 'boolean';
                break;
              case 'date':
                sqlType = 'timestamp'; // Use timestamp for dates
                break;
              default:
                sqlType = 'text';
            }

            // Add to columns list
            columnsFromMappings.push({
              columnName: mapping.dbColumn,
              suggestedType: sqlType,
              originalType: inferredType
            });
          });


          if (columnsFromMappings.length > 0) {
            columnsToAdd.push({
              tableName,
              columns: columnsFromMappings
            });

            // Force a refresh of the schema cache after identifying columns to add
            try {
              const { refreshSchema } = await import('../../../utility/supabaseClient');
              await refreshSchema(2);
            } catch (refreshError) {
              console.error(`Error refreshing schema cache:`, refreshError);
            }
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
        // Corrected check: use the boolean result from the async call
        else if (!doesTableExist) {
          console.log(`Creating basic schema for ${tableName} with standard columns (no mappings or data available)`);
          // No additional columns needed, the CREATE TABLE statement will include id, created_at, updated_at
        }
      }

      // Generate parameters for the stored procedure
      const params = SchemaGenerator.generateProcedureCallParameters(tablesToCreate, columnsToAdd);
      setProcedureParams(params); // Store the parameters in state

      // Only show preview if there are parameters to execute
      if (params.length > 0) {
        setShowSchemaPreview(true);
      } else {
        console.log("No schema changes needed, skipping preview.");
        // Optionally, show a message to the user that no changes are needed
      }
    } catch (error) {
      console.error('Error generating procedure parameters:', error);
    } finally {
      setGeneratingSchema(false);
    }
  }, [excelData, selectedSheets, sheetTableMappings]);

  // Handle schema creation completion
  const handleSchemaCreateComplete = useCallback((success: boolean) => {
    setSchemaCreated(success);
    setShowSchemaPreview(false);
  }, []);

  // Pass procedureParams to SchemaPreview instead of raw SQL
  if (showSchemaPreview && procedureParams.length > 0) {
    return (
      <SchemaPreview
        procedureParams={procedureParams} // Pass the parameters
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

      {/* Import Mode Selection */}
      <Box sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={importMode === 'structureOnly'}
              onChange={(event) => onImportModeChange(event.target.checked ? 'structureOnly' : 'structureAndData')}
              disabled={isImporting || generatingSchema}
            />
          }
          label="Create schema structure only (do not import data)"
        />
      </Box>

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
            onClick={generateSchemaSQL} // Keep original function name for the handler
            disabled={isImporting || generatingSchema}
            sx={{ mr: 2 }}
          >
             {generatingSchema ? 'Generating Schema...' : 'Review Schema Changes'}
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
