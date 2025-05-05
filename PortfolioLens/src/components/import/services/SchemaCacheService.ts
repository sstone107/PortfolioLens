import { openDB, IDBPDatabase } from 'idb';
import { SchemaCache, CachedDbTable, DbColumnInfo } from '../types'; // Assuming DbColumnInfo exists or defining basic structure
import { DatabaseService } from './DatabaseService'; // Import DatabaseService
// Removed MetadataService import from here to avoid circular dependency in constructor
// It will be typed where needed (e.g., setMetadataService)

const DB_NAME = 'PortfolioLensCache';
const DB_VERSION = 1;
const SCHEMA_STORE_NAME = 'schemaCache';
const CACHE_KEY = 'fullSchema';
const STALE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Service for managing the client-side IndexedDB cache of database schema information.
 */
export class SchemaCacheService {
  private dbPromise: Promise<IDBPDatabase | null> | null = null;
  private metadataService: import('./MetadataService').MetadataService | null = null; // Type imported inline, initialized to null
  public dbService: DatabaseService; // Make dbService public for access by MetadataService

  constructor(dbServiceInstance: DatabaseService) { // REQUIRE DatabaseService instance
    if (!dbServiceInstance) {
        throw new Error("[SchemaCacheService] DatabaseService instance is required.");
    }
    this.dbService = dbServiceInstance; // Store required instance
    this.initDB();
  }

  /**
   * Injects the MetadataService instance. Called by MetadataService constructor.
   * @param service - The MetadataService instance.
   */
  setMetadataService(service: import('./MetadataService').MetadataService): void {
    if (!this.metadataService) { // Prevent overwriting if already set
        this.metadataService = service;
    }
    // Silently ignore if already set
  }

  /**
   * Initializes the IndexedDB database connection.
   */
  private async initDB(): Promise<IDBPDatabase | null> {
    if (!this.dbPromise) {
      if (typeof window !== 'undefined' && window.indexedDB) {
        this.dbPromise = openDB(DB_NAME, DB_VERSION, {
          upgrade(db: IDBPDatabase) { // Add explicit type IDBPDatabase
            if (!db.objectStoreNames.contains(SCHEMA_STORE_NAME)) {
              db.createObjectStore(SCHEMA_STORE_NAME);
            }
          },
        }).catch((error: any) => { // Add explicit type any (or Error)
          return null; // Return null if DB opening fails
        });
      } else {
        this.dbPromise = Promise.resolve(null); // Resolve with null if IndexedDB is not available
      }
    }
    return this.dbPromise;
  }

  /**
   * Retrieves the schema cache from IndexedDB.
   * Returns null if the cache doesn't exist or is stale.
   * @param checkStaleness - Whether to check if the cache is older than STALE_TIMEOUT_MS. Defaults to true.
   * @returns Promise resolving to the SchemaCache or null.
   */
  async getCache(checkStaleness: boolean = true): Promise<SchemaCache | null> {
    const db = await this.initDB();
    if (!db) {
      return null;
    }

    try {
      const cache = await db.get(SCHEMA_STORE_NAME, CACHE_KEY);
      if (cache) {
        if (checkStaleness && Date.now() - cache.lastRefreshed > STALE_TIMEOUT_MS) {
          return null;
        }
        return cache as SchemaCache;
      }
      return null;
    } catch (error) {
      // Log error but don't expose details
      return null;
    }
  }

  /**
   * Stores the schema cache into IndexedDB.
   * @param schemaCache - The SchemaCache object to store.
   * @returns Promise resolving to true on success, false on failure.
   */
  async setCache(schemaCache: SchemaCache): Promise<boolean> {
    const db = await this.initDB();
    if (!db) {
      return false;
    }

    try {
      await db.put(SCHEMA_STORE_NAME, schemaCache, CACHE_KEY);
      return true;
    } catch (error) {
      // Error handling without logging
      return false;
    }
  }

  /**
   * Clears the schema cache from IndexedDB.
   * @returns Promise resolving to true on success, false on failure.
   */
  async clearCache(): Promise<boolean> {
     const db = await this.initDB();
     if (!db) {
       return false;
     }

     try {
       await db.delete(SCHEMA_STORE_NAME, CACHE_KEY);
       return true;
     } catch (error) {
       // Error handling without logging
       return false;
     }
  }


  /**
   * Fetches the full schema from the database using MetadataService
   * and stores it in the cache.
   * @returns Promise resolving to the fetched SchemaCache or null on failure.
   */
  async fetchAndCacheSchema(): Promise<SchemaCache | null> {
    // Ensure MetadataService has been injected before proceeding
    if (!this.metadataService) {
      return null;
    }

    try {
      // Use the injected DatabaseService
      const tableNames = await this.dbService.getTables();
      if (!tableNames || tableNames.length === 0) {
        return null;
      }

      const tables: { [tableName: string]: CachedDbTable } = {};
      // Consider fetching columns in parallel if performance is an issue
      for (const tableName of tableNames) {
        // Use the injected DatabaseService
        const columns = await this.dbService.getColumns(tableName);
        // TODO: Enhance getColumns to fetch primary key info if needed
        tables[tableName] = {
          tableName,
          // Add type DbColumnInfo (or similar) to 'col' parameter
          columns: columns.map((col: DbColumnInfo) => ({
            columnName: col.columnName,
            dataType: col.dataType,
            isNullable: col.isNullable,
            columnDefault: col.columnDefault,
            isPrimaryKey: col.isPrimaryKey // Assuming getColumns provides this
          })),
          lastRefreshed: Date.now() // Add refresh time per table if needed
        };
      }

      const newCache: SchemaCache = {
        tables,
        lastRefreshed: Date.now(),
        // schemaVersion: 'fetch_from_somewhere' // Optional: Add versioning later
      };

      const success = await this.setCache(newCache);
      if (success) {
        return newCache;
      } else {
        return null;
      }
    } catch (error) {
      // Error handling without logging
      return null;
    }
  }

  /**
   * Gets the schema cache, fetching it if it's missing or stale.
   * This is the primary method components should use to get schema info.
   * @returns Promise resolving to the SchemaCache or null on failure.
   */
  async getOrFetchSchema(): Promise<SchemaCache | null> {
    let cache = await this.getCache(); // Checks staleness by default

    if (!cache) {
      console.log('[DEBUG SchemaCacheService] Cache not found or stale, fetching fresh schema');
      cache = await this.fetchAndCacheSchema();
    } else {
    }
    return cache;
  }

  /**
   * Forces a refresh of the schema cache by fetching from the database
   * and overwriting the existing cache.
   * @returns Promise resolving to the refreshed SchemaCache or null on failure.
   */
  async forceRefreshSchema(): Promise<SchemaCache | null> {
    console.log('[DEBUG SchemaCacheService] Forcing schema cache refresh');
    // First clear the existing cache
    await this.clearCache();
    // Then fetch and cache fresh schema
    return await this.fetchAndCacheSchema();
  }

  /**
   * Refreshes the schema cache for a specific table
   * @param tableName The name of the table to refresh
   * @returns Promise resolving to true if successful, false otherwise
   */
  async refreshTableSchema(tableName: string): Promise<boolean> {
    console.log(`[DEBUG SchemaCacheService] Refreshing schema for table: ${tableName}`);
    try {
      // Get the current cache
      const cache = await this.getCache(false); // Don't check staleness
      if (!cache) {
        console.log(`[DEBUG SchemaCacheService] No cache found, fetching full schema`);
        await this.fetchAndCacheSchema();
        return true;
      }

      // Fetch fresh column data for this table
      if (!this.dbService) {
        console.error(`[DEBUG SchemaCacheService] Database service not available`);
        return false;
      }

      // Force bypass of any caching when refreshing schema
      const columns = await this.dbService.getColumns(tableName, true);
      if (!columns || columns.length === 0) {
        console.warn(`[DEBUG SchemaCacheService] No columns returned for ${tableName}`);
        return false;
      }

      // Update just this table in the cache
      cache.tables[tableName] = {
        tableName,
        columns,
        lastRefreshed: Date.now()
      };

      // Update the overall cache refresh time
      cache.lastRefreshed = Date.now();

      // Save the updated cache
      const success = await this.setCache(cache);
      return success;
    } catch (error) {
      console.error(`[DEBUG SchemaCacheService] Error refreshing table schema for ${tableName}:`, error);
      return false;
    }
  }
}

// Optional: Export a singleton instance if desired for easier use across the app
// export const schemaCacheService = new SchemaCacheService();