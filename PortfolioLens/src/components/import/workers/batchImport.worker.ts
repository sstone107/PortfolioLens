/// <reference lib="webworker" />

import {
  SheetProcessingState,
  SchemaCache,
  RankedTableSuggestion,
  RankedColumnSuggestion,
  BatchColumnMapping,
  ColumnType,
  CachedDbTable,
  CachedDbColumn,
  NewColumnProposal,
  SchemaProposal // Import SchemaProposal type
} from '../types'; // Adjust path as needed
import { calculateSimilarity, normalizeForMatching } from '../BatchImporterUtils'; // Adjust path as needed
import { inferDataType } from '../dataTypeInference'; // Use the new implementation
import { AnalysisEngine } from '../services/AnalysisEngine'; // Import the new Analysis Engine

interface WorkerTaskData {
  sheetName: string;
  headers: string[];
  sampleData: Record<string, any>[];
  schemaCache: SchemaCache; // Pass the necessary schema data
  selectedTable?: string | null; // Add selectedTable from the main thread state
}

interface WorkerResultData {
  sheetProcessingState?: SheetProcessingState; // Include the processed sheet state
  status: 'processed' | 'error';
  error?: string;
}

/**
 * Ranks potential database tables against a sheet name based on similarity, type compatibility, and content patterns.
 */
function rankTableSuggestions(sheetName: string, headers: string[], sampleData: Record<string, any>[], schemaCache: SchemaCache, topN: number = 5): RankedTableSuggestion[] {
  const normalizedSheetName = normalizeForMatching(sheetName);
  const suggestions: RankedTableSuggestion[] = [];

  for (const tableName in schemaCache.tables) {
    const dbTable = schemaCache.tables[tableName];
    if (!dbTable) continue;

    const normalizedTableName = normalizeForMatching(tableName);
    const nameSimilarityScore = calculateSimilarity(normalizedSheetName, normalizedTableName);

    // Placeholder for type compatibility and content pattern scoring
    // These functions would analyze sampleData and headers against dbTable.columns
    const typeCompatibilityScore = calculateTypeCompatibilityScoreForTable(headers, sampleData, dbTable); // Needs implementation
    const contentPatternScore = calculateContentPatternScoreForTable(headers, sampleData, dbTable); // Needs implementation

    // Combine scores (example: simple average)
    const combinedScore = (nameSimilarityScore + typeCompatibilityScore + contentPatternScore) / 3;

    // Determine confidence level based on combined score
    let confidenceLevel: 'High' | 'Medium' | 'Low';
    if (combinedScore > 0.8) {
      confidenceLevel = 'High';
    } else if (combinedScore > 0.5) {
      confidenceLevel = 'Medium';
    } else {
      confidenceLevel = 'Low';
    }

    // Add basic filtering, e.g., only suggest if combined score > threshold?
    if (combinedScore > 0.1) { // Example threshold
       suggestions.push({
         tableName,
         confidenceScore: combinedScore,
         confidenceLevel,
         matchType: combinedScore > 0.8 ? 'exact' : combinedScore > 0.5 ? 'partial' : 'fuzzy'
       });
    }
  }

  // Sort by score descending and take top N
  suggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);
  return suggestions.slice(0, topN);
}

// Placeholder function - Needs actual implementation
function calculateTypeCompatibilityScoreForTable(headers: string[], sampleData: Record<string, any>[], dbTable: CachedDbTable): number {
  // Logic to analyze sample data types for each header and compare with dbTable column types
  // Return a score (e.g., average compatibility across columns)
  return 0; // Placeholder
}

// Placeholder function - Needs actual implementation
function calculateContentPatternScoreForTable(headers: string[], sampleData: Record<string, any>[], dbTable: CachedDbTable): number {
  // Logic to analyze content patterns in sample data for each header and compare with dbTable column patterns/expectations
  // Return a score
  return 0; // Placeholder
}

// Placeholder function - Needs actual implementation
function calculateContentPatternScoreForColumn(sampleValues: any[], dbColumn: CachedDbColumn): number {
  // Logic to analyze content patterns in sampleValues and compare with dbColumn patterns/expectations
  // Return a score (0.0 to 1.0)
  return 0; // Placeholder
}


/**
 * Performs automatic mapping of sheet headers to database columns.
 */
function performAutoMapping(
  headers: string[],
  sampleData: Record<string, any>[],
  targetTable: CachedDbTable | null,
  topNColumns: number = 3
): { [header: string]: BatchColumnMapping } {
  const mappings: { [header: string]: BatchColumnMapping } = {};

  headers.forEach(header => {
    if (!header) return; // Skip empty headers

    const normalizedHeader = normalizeForMatching(header);
    const sampleValues = sampleData.map(row => row[header]).filter(v => v !== null && v !== undefined && v !== '');
    const inferredDataType: ColumnType | null = inferDataType(sampleValues, header); // Use new implementation with detailed logging

    let suggestedColumns: RankedColumnSuggestion[] = [];
    let bestMatchColumn: string | null = null;
    let bestMatchScore = 0;
    let bestMatchConfidence: 'High' | 'Medium' | 'Low' | undefined;


    if (targetTable) {
      const potentialColumns: RankedColumnSuggestion[] = [];
      targetTable.columns.forEach(dbCol => {
        const normalizedDbCol = normalizeForMatching(dbCol.columnName);
        const nameSimilarityScore = calculateSimilarity(normalizedHeader, normalizedDbCol);

        const isTypeCompatible = checkTypeCompatibility(inferredDataType, dbCol.dataType);
        const typeCompatibilityScore = isTypeCompatible ? 1.0 : 0.0; // Simple score for compatibility

        const contentPatternScore = calculateContentPatternScoreForColumn(sampleValues, dbCol); // Needs implementation

        // Combine scores (example: weighted average)
        // Adjust weights based on importance of each factor
        const combinedScore = (nameSimilarityScore * 0.4) + (typeCompatibilityScore * 0.3) + (contentPatternScore * 0.3);


        // Determine confidence level for column suggestion
        let confidenceLevel: 'High' | 'Medium' | 'Low';
        if (combinedScore > 0.8) {
          confidenceLevel = 'High';
        } else if (combinedScore > 0.5) {
          confidenceLevel = 'Medium';
        } else {
          confidenceLevel = 'Low';
        }

        potentialColumns.push({
          columnName: dbCol.columnName,
          confidenceScore: combinedScore, // Use combined score here
          isTypeCompatible,
          confidenceLevel // Add confidence level
        });
      });

      // Sort potential columns by combined score
      potentialColumns.sort((a, b) => b.confidenceScore - a.confidenceScore);
      suggestedColumns = potentialColumns.slice(0, topNColumns);

      // Determine best match if score is high enough
      if (suggestedColumns.length > 0 && suggestedColumns[0].confidenceScore > 0.6) { // Example threshold for auto-mapping
        bestMatchColumn = suggestedColumns[0].columnName;
        bestMatchScore = suggestedColumns[0].confidenceScore;
        bestMatchConfidence = suggestedColumns[0].confidenceLevel;
      }
    }

    // Determine action and potentially generate schema proposal
    let action: 'map' | 'skip' | 'create' = 'skip';
    let newColumnProposal: NewColumnProposal | undefined;

    if (bestMatchColumn) {
        action = 'map';
    } else if (inferredDataType && header) { // If no match but we have inferred type and a header, suggest creating a column
        action = 'create';
        // Basic proposal - needs refinement for actual SQL type mapping
        const suggestedSqlType = mapColumnTypeToSql(inferredDataType); // Needs implementation
        newColumnProposal = {
            columnName: normalizeForMatching(header), // Use normalizeForMatching for basic sanitization/consistency
            sqlType: suggestedSqlType,
            isNullable: true, // Default to nullable for new columns
        };
    }


    mappings[header] = {
      header,
      sampleValue: sampleValues.length > 0 ? sampleValues[0] : null,
      mappedColumn: bestMatchColumn,
      confidenceScore: bestMatchScore, // Confidence score for the mapped column
      confidenceLevel: bestMatchConfidence, // Confidence level for the mapped column
      suggestedColumns,
      inferredDataType,
      action, // Use determined action
      newColumnProposal, // Include proposal if action is 'create'
      status: action === 'skip' ? 'suggested' : 'suggested', // Status might need refinement based on action/confidence
      reviewStatus: 'pending', // Add reviewStatus property
    };
  });

  return mappings;
}

/**
 * Maps an inferred ColumnType to a suitable SQL data type.
 * This is a basic mapping and may need refinement based on the target database system.
 */
function mapColumnTypeToSql(columnType: ColumnType | null): string {
    if (!columnType) {
        return 'TEXT';
    }
    switch (columnType) {
        case 'string': return 'TEXT'; // Or VARCHAR, depending on expected length
        case 'number': return 'NUMERIC'; // Use NUMERIC for general numbers, preserves precision
        case 'boolean': return 'BOOLEAN';
        case 'date': return 'TIMESTAMP WITH TIME ZONE'; // Or DATE, TIME depending on data
        default: return 'TEXT';
    }
}

/**
 * Basic check for type compatibility between inferred source type and DB type.
 * This needs refinement based on actual DB types and desired conversion logic.
 */
function checkTypeCompatibility(sourceType: ColumnType | null, dbType: string): boolean {
  if (!sourceType) return true; // If source type couldn't be inferred, allow any mapping initially

  const lowerDbType = dbType.toLowerCase();

  switch (sourceType) {
    case 'string':
      // Strings can potentially map to almost anything, but prioritize text types
      return true; // Or be more restrictive: ['text', 'varchar', 'char', 'uuid'].includes(lowerDbType);
    case 'number':
      return ['int', 'numeric', 'decimal', 'float', 'double', 'real', 'money', 'serial', 'bigint', 'smallint'].some(t => lowerDbType.includes(t));
    case 'boolean':
      return ['bool', 'bit'].some(t => lowerDbType.includes(t));
    case 'date':
      return ['date', 'time', 'timestamp'].some(t => lowerDbType.includes(t));
    default:
      return false;
  }
}


// Main worker logic
self.onmessage = (event: MessageEvent<WorkerTaskData>) => {
  // Destructure selectedTable from event data
  const { sheetName, headers, sampleData, schemaCache, selectedTable: preSelectedTable } = event.data;

  try {
    // Convert schemaCache tables to array for AnalysisEngine
    const availableTables = Object.values(schemaCache?.tables || {}); // Add null check for schemaCache

    // 1. Generate table suggestions (always useful for the dropdown)
    const { suggestions: tableSuggestions, confidenceScore: calculatedTableConfidence } =
      AnalysisEngine.generateTableSuggestions(sheetName, headers, availableTables);
    
    // 2. Determine the target table: Prioritize preSelectedTable if provided
    let targetTableName: string | null = null;
    let isCreatingTable = false;
    if (preSelectedTable) {
        if (preSelectedTable.startsWith('new:')) {
            targetTableName = preSelectedTable; // Keep the 'new:' prefix for identification
            isCreatingTable = true;
        } else {
            // Ensure the preSelectedTable actually exists in the cache
            if (schemaCache?.tables[preSelectedTable]) {
                targetTableName = preSelectedTable;
            } else {
                 // Clear preSelectedTable so we fall back in the next block
                 targetTableName = null; // Explicitly nullify here
            }
        }
    }

    // Fallback to top suggestion if no valid pre-selection or pre-selected table not found
    if (!targetTableName) {
        const topSuggestion = tableSuggestions.length > 0 ? tableSuggestions[0] : null;
        targetTableName = topSuggestion ? topSuggestion.tableName : null;
    }

    // Use the calculated confidence score if falling back to suggestion, otherwise it might be irrelevant if user selected manually
    // Recalculate preSelectedTable validity for confidence score logic
    const wasPreSelected = !!(preSelectedTable && (preSelectedTable.startsWith('new:') || schemaCache?.tables[preSelectedTable]));
    const finalTableConfidenceScore = wasPreSelected ? undefined : calculatedTableConfidence;

    // 3. Perform Column Mapping based on the determined target table
    let columnMappings: { [header: string]: BatchColumnMapping } = {};
    let sheetSchemaProposals: SchemaProposal[] = [];

    // Only generate mappings if a table is selected (either existing or new)
    if (targetTableName && !isCreatingTable) {
        // Generate mappings for an existing table
        columnMappings = AnalysisEngine.generateColumnMappings(
            headers,
            sampleData,
            targetTableName, // Use the determined target table name
            availableTables // Pass available tables to look up by name
        );
        // Generate schema proposals for unmapped columns against the existing table
        sheetSchemaProposals = AnalysisEngine.generateSchemaProposals(
            columnMappings,
            targetTableName,
            availableTables // Pass available tables to look up by name
        );
    } else if (isCreatingTable) {
        // For a new table, suggest creating all columns
        headers.forEach(header => {
            const inferredDataType = inferDataType(sampleData.map(row => row[header]), header);
            // Generate proposal for this single column using a temporary mapping structure
            // Create a correctly typed temporary mapping object for proposal generation
            const tempMappingForProposal: { [header: string]: BatchColumnMapping } = {
                [header]: {
                    header,
                    sampleValue: sampleData.length > 0 ? sampleData[0][header] : null,
                    mappedColumn: null,
                    suggestedColumns: [],
                    inferredDataType,
                    action: 'create', // Correct literal type
                    status: 'pending', // Correct literal type
                    // Add optional fields if needed by BatchColumnMapping, e.g., confidenceScore
                    confidenceScore: 0,
                    confidenceLevel: 'Low',
                    reviewStatus: 'pending', // Add reviewStatus property
                }
            };
            const proposalArray = AnalysisEngine.generateSchemaProposals(tempMappingForProposal, targetTableName!, availableTables);
            // Cast to NewColumnProposal if needed for the newColumnProposal property
            const proposal = proposalArray.length > 0 ? proposalArray[0] as NewColumnProposal : undefined;

            // Construct the final column mapping for the state
            columnMappings[header] = {
                header,
                sampleValue: sampleData.length > 0 ? sampleData[0][header] : null,
                mappedColumn: null, // No existing column to map to
                suggestedColumns: [],
                inferredDataType,
                action: 'create',
                newColumnProposal: proposal, // Attach the generated proposal
                status: 'suggested',
                reviewStatus: 'pending' // Add reviewStatus property
            };
            if (proposal) {
                // Only add if it's a NewColumnProposal (not a NewTableProposal)
                if ('columnName' in proposal && 'sqlType' in proposal) {
                    sheetSchemaProposals.push(proposal);
                }
            }
        });
    } else {
      // If no table selected or suggested, create empty mappings
      headers.forEach(header => {
        columnMappings[header] = {
          header,
          sampleValue: sampleData.length > 0 ? sampleData[0][header] : null,
          mappedColumn: null,
          suggestedColumns: [],
          inferredDataType: inferDataType(sampleData.map(row => row[header]), header),
          action: 'skip',
          status: 'pending',
          reviewStatus: 'pending' // Add reviewStatus property
        };
      });
    }

    // 4. Construct SheetProcessingState
    // Recalculate preSelectedTable validity for status logic
    const wasPreSelectedForStatus = !!(preSelectedTable && (preSelectedTable.startsWith('new:') || schemaCache?.tables[preSelectedTable]));
    const finalStatus = wasPreSelectedForStatus // If a table was explicitly passed from main thread (user selection/creation)
                         ? 'needsReview'
                         : (sheetSchemaProposals.length > 0 || Object.values(columnMappings).some(m => m.action === 'skip' || (m.action === 'map' && m.confidenceLevel !== 'High')))
                           ? 'needsReview'
                           : 'ready';

    const sheetProcessingState: SheetProcessingState = {
        sheetName,
        headers,
        sampleData,
        selectedTable: targetTableName, // Use the determined target table name (might include 'new:')
        tableConfidenceScore: finalTableConfidenceScore, // Use appropriate confidence score
        tableSuggestions, // Always include suggestions for the dropdown
        columnMappings,
        sheetSchemaProposals,
        status: finalStatus,
        rowCount: sampleData.length, // Worker doesn't know total row count, this needs to be set on main thread
        sheetReviewStatus: 'pending' // Add sheetReviewStatus property
    };

    // Ensure tableSuggestions is properly initialized
    if (!sheetProcessingState.tableSuggestions) {
      sheetProcessingState.tableSuggestions = [];
    }
    
    // Ensure each suggestion has a confidenceScore and confidenceLevel
    sheetProcessingState.tableSuggestions.forEach((suggestion, index) => {
      if (suggestion.confidenceScore === undefined) {
        suggestion.confidenceScore = 0;
      }
      if (!suggestion.confidenceLevel) {
        suggestion.confidenceLevel = AnalysisEngine.getConfidenceLevel(suggestion.confidenceScore);
      }
    });
    
    const result: WorkerResultData = {
      sheetProcessingState,
      status: 'processed',
    };
    self.postMessage(result);

  } catch (error: any) {
    const result: WorkerResultData = {
      status: 'error',
      error: error.message || 'Unknown worker error',
    };
    self.postMessage(result);
  }
};

// Ensure TypeScript knows this is a worker
export default null;