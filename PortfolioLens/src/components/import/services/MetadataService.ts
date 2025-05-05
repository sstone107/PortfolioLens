// PortfolioLens/src/components/import/services/MetadataService.ts
import { SchemaCacheService } from './SchemaCacheService';
import { calculateSimilarity, normalizeForMatching } from '../BatchImporterUtils';
import { RankedTableSuggestion, SchemaCache, CachedDbTable, ConfidenceLevel } from '../types'; // Added CachedDbTable, ConfidenceLevel

// Constants
const CREATE_NEW_TABLE_OPTION = 'Create new table...';
const CREATE_NEW_TABLE_SCORE = 0.1; // Assign a low score so it appears last unless no other matches

/**
 * Service focused on providing metadata suggestions, primarily using cached schema data.
 * Handles table name caching at startup and ranked suggestions based on similarity.
 * Delegates direct DB metadata fetching to TableMetadataService and RecordMetadataService.
 */
export class MetadataService {
  private schemaCacheService: SchemaCacheService;
  private cachedTableNames: string[] | null = null;
  private isInitialized: boolean = false;
  private initializePromise: Promise<void> | null = null;
  
  // Singleton instance
  private static instance: MetadataService | null = null;

  constructor(schemaCacheServiceInstance: SchemaCacheService) { // REQUIRE SchemaCacheService instance
    // If SchemaCacheService is not provided, throw an error.
    if (!schemaCacheServiceInstance) {
        throw new Error("[MetadataService] SchemaCacheService instance is required.");
    }
    this.schemaCacheService = schemaCacheServiceInstance; // Store required instance

    // Inject this MetadataService instance into the SchemaCacheService
    // Check if the method exists before calling, for safety
    if (typeof this.schemaCacheService.setMetadataService === 'function') {
        this.schemaCacheService.setMetadataService(this);
    } else {
        // Handle this error appropriately - maybe throw?
        throw new Error('[MetadataService] SchemaCacheService instance is missing the setMetadataService method!');
    }

    // Set the singleton instance if not already set
    if (!MetadataService.instance) {
        MetadataService.instance = this;
    }

    // Initialize asynchronously, don't block constructor
    this.initialize();
  }
  
  /**
   * Get the singleton instance of MetadataService
   * @returns The MetadataService instance or null if not initialized
   */
  static getInstance(): MetadataService | null {
    return MetadataService.instance;
  }

  /**
   * Initializes the service by fetching and caching table names from the schema cache.
   * Ensures initialization only runs once.
   * @returns Promise resolving when initialization is complete.
   */
  async initialize(): Promise<void> {
    // Prevent re-initialization if already done or in progress
    if (this.isInitialized) {
      return;
    }
    if (this.initializePromise) {
      return this.initializePromise;
    }

    // Create and store the promise to handle concurrent calls
    this.initializePromise = (async () => {
      try {
        // Use SchemaCacheService to get cached/fetched schema
        const schemaCache: SchemaCache | null = await this.schemaCacheService.getOrFetchSchema();
        if (schemaCache && schemaCache.tables) {
          // Extract table names from the cache keys
          this.cachedTableNames = Object.keys(schemaCache.tables);
        } else {
          // If cache is empty or fails, initialize with an empty array
          this.cachedTableNames = [];
        }
        this.isInitialized = true; // Mark as initialized successfully
      } catch (error) {
        this.cachedTableNames = []; // Ensure it's an empty array on error
        this.isInitialized = false; // Reset flag to allow retry on next call
        // Optionally re-throw or handle the error appropriately
        // throw error; // Re-throwing might break dependent components
      } finally {
          // Clear the promise once initialization attempt is complete (success or fail)
          this.initializePromise = null;
      }
    })();
    // Return the promise so callers can wait for initialization
    return this.initializePromise;
  }

  /**
   * Ensures the service is initialized before proceeding.
   * Waits for the initialization promise if it's in progress or retries if failed.
   * @private
   * @throws {Error} If initialization fails after retrying.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      // If initialization hasn't started or failed previously, try/wait again
      await this.initialize();
    }
    // After attempting/waiting, check the flag again
    if (!this.isInitialized) {
        // If still not initialized, throw an error
        throw new Error("[MetadataService] Failed to initialize and load table names.");
    }
  }

  /**
   * Retrieves the cached list of table names.
   * Ensures the service is initialized first.
   * @returns Promise resolving to an array of table names.
   * @throws {Error} If initialization fails.
   */
  async getCachedTableNames(): Promise<string[]> {
    await this.ensureInitialized(); // Wait for initialization
    // Return a copy of the array to prevent external modification
    return this.cachedTableNames ? [...this.cachedTableNames] : [];
  }
/**
   * Retrieves the cached details for a specific table.
   * Ensures the service is initialized first.
   * @param tableName - The name of the table to retrieve info for.
   * @returns Promise resolving to the CachedDbTable object or null if not found.
   * @throws {Error} If initialization fails.
   */
  async getCachedTableInfo(tableName: string): Promise<CachedDbTable | null> {
    await this.ensureInitialized(); // Wait for initialization
    const schemaCache = await this.schemaCacheService.getOrFetchSchema(); // Get the full cache
    
    // Get the table info from cache
    const tableInfo = schemaCache?.tables[tableName] ?? null;
    
    // Add debug logging
    
    // Validate the table info before returning
    if (tableInfo) {
      // Ensure columns array exists and has valid entries
      if (!tableInfo.columns || !Array.isArray(tableInfo.columns) || tableInfo.columns.length === 0) {
        console.warn(`[DEBUG MetadataService] Invalid or empty columns array for ${tableName}`);
        // Return a minimal valid structure instead of null
        return {
          tableName,
          columns: [{
            columnName: 'id',
            dataType: 'uuid',
            isNullable: false,
            columnDefault: 'uuid_generate_v4()',
            isPrimaryKey: true
          }],
          lastRefreshed: Date.now()
        };
      }
      
      // Validate each column has required properties
      const validColumns = tableInfo.columns.filter(col => {
        if (!col || typeof col.columnName !== 'string') {
          console.warn(`[DEBUG MetadataService] Invalid column data found in tableInfo for ${tableName}:`, JSON.stringify(col));
          return false;
        }
        return true;
      });
      
      // If no valid columns were found, return a default structure
      if (validColumns.length === 0) {
        console.warn(`[DEBUG MetadataService] No valid columns found for ${tableName}, returning default structure`);
        return {
          tableName,
          columns: [{
            columnName: 'id',
            dataType: 'uuid',
            isNullable: false,
            columnDefault: 'uuid_generate_v4()',
            isPrimaryKey: true
          }],
          lastRefreshed: Date.now()
        };
      }
      
      // Return the table info with validated columns
      return {
        ...tableInfo,
        columns: validColumns
      };
    }
    
    return tableInfo; // Return null if not found
  }
  
  /**
   * Get the DatabaseService instance
   * @returns The DatabaseService instance or null if not available
   */
  getDatabaseService(): import('./DatabaseService').DatabaseService | null {
    // Get the SchemaCacheService first
    const schemaCacheService = this.schemaCacheService;
    if (!schemaCacheService) {
      console.warn('[DEBUG MetadataService] SchemaCacheService not available');
      return null;
    }
    
    // Try to get the DatabaseService from SchemaCacheService
    try {
      // Use any to bypass TypeScript's strict checking
      const dbService = (schemaCacheService as any).dbService;
      if (!dbService) {
        console.warn('[DEBUG MetadataService] DatabaseService not available from SchemaCacheService');
        return null;
      }
      return dbService;
    } catch (error) {
      console.error('[DEBUG MetadataService] Error getting DatabaseService:', error);
      return null;
    }
  }

  /**
   * Generates ranked table suggestions for a given sheet name based on similarity
   * to cached table names. Includes a "Create new table..." option.
   *
   * @param sheetName - The name of the sheet to find suggestions for.
   * @param maxSuggestions - The maximum number of suggestions to return (excluding "Create new"). Defaults to 5.
   * @returns Promise resolving to an array of RankedTableSuggestion objects.
   * @throws {Error} If initialization fails.
   */
  async getRankedTableSuggestions(
    sheetName: string,
    maxSuggestions: number = 5
  ): Promise<RankedTableSuggestion[]> {
    await this.ensureInitialized(); // Wait for initialization

    // Handle case where cache might be empty even after initialization attempt
    if (!this.cachedTableNames || this.cachedTableNames.length === 0) {
      console.warn('[MetadataService] No cached table names available for suggestions.');
      // Return only the "Create new" option
      return [{
        tableName: CREATE_NEW_TABLE_OPTION,
        confidenceScore: CREATE_NEW_TABLE_SCORE,
        confidenceLevel: 'Low',
        matchType: 'new' // Explicitly mark as 'new'
      }];
    }

    const normalizedSheetName = normalizeForMatching(sheetName);
    // If sheet name is empty after normalization, return only "Create new"
    if (!normalizedSheetName) {
        return [{
          tableName: CREATE_NEW_TABLE_OPTION,
          confidenceScore: CREATE_NEW_TABLE_SCORE,
          confidenceLevel: 'Low',
          matchType: 'new' // Explicitly mark as 'new'
        }];
    }

    // Calculate similarity scores for all cached tables
    const suggestions: RankedTableSuggestion[] = this.cachedTableNames.map(tableName => {
      const normalizedTableName = normalizeForMatching(tableName);
      const confidenceScore = calculateSimilarity(normalizedSheetName, normalizedTableName);

      // Determine confidence level and match type based on score
      let confidenceLevel: ConfidenceLevel;
      let matchType: 'exact' | 'partial' | 'fuzzy' | 'none';
      if (confidenceScore > 0.95) { // High confidence, likely exact or near-exact
          confidenceLevel = 'High';
          matchType = 'exact';
      } else if (confidenceScore >= 0.8) {
          confidenceLevel = 'High';
          matchType = 'partial'; // High score, but maybe not exact
      } else if (confidenceScore >= 0.5) {
          confidenceLevel = 'Medium';
          matchType = 'fuzzy'; // Medium score, likely fuzzy match
      } else {
          confidenceLevel = 'Low';
          matchType = 'fuzzy'; // Low score, still treat as fuzzy for sorting purposes
      }

      return { tableName, confidenceScore, confidenceLevel, matchType };
    });

    // Sort suggestions by score in descending order
    suggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);

    // Filter out suggestions with very low scores (e.g., below 0.2)
    // Adjust this threshold based on desired sensitivity
    const filteredSuggestions = suggestions.filter(s => s.confidenceScore >= 0.2);

    // Limit the number of suggestions returned
    const topSuggestions = filteredSuggestions.slice(0, maxSuggestions);

    // Prepare the final list including the "Create new table..." option
    const finalSuggestions: RankedTableSuggestion[] = [
        ...topSuggestions,
        {
          tableName: CREATE_NEW_TABLE_OPTION,
          confidenceScore: CREATE_NEW_TABLE_SCORE,
          confidenceLevel: 'Low',
          matchType: 'new' // Explicitly mark as 'new'
        }
    ];

     // Ensure the list contains unique table names (especially "Create new table...")
     // This prevents duplicates if a table name somehow matches the constant
     const uniqueSuggestions = finalSuggestions.filter((suggestion, index, self) =>
        index === self.findIndex((s) => s.tableName === suggestion.tableName)
     );

     // Re-sort the final list to ensure correct order based on score
     uniqueSuggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);


    return uniqueSuggestions;
  }

  /**
   * Forces a refresh of the cached table names by triggering a schema cache refresh
   * and re-initializing this service.
   * @returns Promise resolving when the refresh is complete.
   */
  async refreshTableNameCache(): Promise<void> {
      // Force SchemaCacheService to fetch fresh data
      await this.schemaCacheService.forceRefreshSchema();
      // Reset initialization flag and re-initialize this service
      this.isInitialized = false;
      this.initializePromise = null; // Clear any existing promise
      await this.initialize(); // Re-run initialization
  }

  /**
   * Refreshes the schema cache for a specific table
   * @param tableName The name of the table to refresh
   * @returns Promise resolving to true if successful, false otherwise
   */
  async refreshTableSchema(tableName: string): Promise<boolean> {
    console.log(`[DEBUG MetadataService] Refreshing schema for table: ${tableName}`);
    try {
      // Use the SchemaCacheService to refresh the table schema
      if (this.schemaCacheService && typeof this.schemaCacheService.refreshTableSchema === 'function') {
        return await this.schemaCacheService.refreshTableSchema(tableName);
      } else {
        console.error(`[DEBUG MetadataService] SchemaCacheService missing refreshTableSchema method`);
        // Fallback to full schema refresh
        await this.refreshTableNameCache();
        return true;
      }
    } catch (error) {
      console.error(`[DEBUG MetadataService] Error refreshing table schema for ${tableName}:`, error);
      return false;
    }
  }
}

// Optional: Export a singleton instance for easy access across the application
// export const metadataService = new MetadataService();
