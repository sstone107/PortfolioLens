import { SheetInfo, TableInfo, ColumnMapping } from './types';

/**
 * Generates initial column mappings by matching Excel headers to table column names.
 * @param sheetInfo Information about the Excel sheet.
 * @param tableInfo Information about the target database table.
 * @param inferDataTypes Flag to control data type inference (currently basic).
 * @returns A record mapping Excel column names to suggested database columns and types.
 */
export function generateColumnMappings(
  sheetInfo: SheetInfo,
  tableInfo: TableInfo,
  inferDataTypes: boolean // Placeholder for potential future use
): Record<string, ColumnMapping> {
  const mappings: Record<string, ColumnMapping> = {};
  
  // Create a map for quick lookup of DB columns, ignoring case and special chars for matching
  const dbColumnMap = new Map<string, TableInfo['columns'][0]>();
  tableInfo.columns.forEach(col => {
    // Normalize names for matching (lowercase, remove spaces/underscores/hyphens)
    const normalizedName = col.columnName.toLowerCase().replace(/[_\-\s]/g, '');
    dbColumnMap.set(normalizedName, col);
  });

  sheetInfo.columns.forEach(excelCol => {
    const normalizedExcelCol = excelCol.toLowerCase().replace(/[_\-\s]/g, '');
    const matchedDbCol = dbColumnMap.get(normalizedExcelCol);

    if (matchedDbCol) {
       let type: 'string' | 'number' | 'boolean' | 'date' = 'string'; // Default type
       
       // Basic type inference based on DB data type
       const dbDataType = matchedDbCol.dataType.toLowerCase();
       if (['integer', 'bigint', 'numeric', 'real', 'double precision', 'decimal', 'float', 'money'].some(t => dbDataType.includes(t))) {
           type = 'number';
       } else if (dbDataType.includes('boolean') || dbDataType.includes('bit')) {
           type = 'boolean';
       } else if (['date', 'timestamp', 'time'].some(t => dbDataType.includes(t))) {
           type = 'date';
       }
       // Add more specific type checks if needed (e.g., geometry, json, etc.)

      mappings[excelCol] = {
        excelColumn: excelCol, // Add the missing property
        dbColumn: matchedDbCol.columnName,
        type: type
      };
    } else {
        // Optionally, handle columns that don't match (e.g., leave unmapped or map to a default)
        // mappings[excelCol] = { dbColumn: '', type: 'string' }; 
    }
  });
  console.log("Generated Initial Mappings:", mappings);
  return mappings;
}
