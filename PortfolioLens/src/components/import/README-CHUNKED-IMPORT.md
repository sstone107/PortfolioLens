# Chunked Import System

This module provides an improved approach to batch importing Excel data to database tables when dealing with large mappings or multiple sheets. It addresses the issue of mapping keys being truncated during RPC calls by storing mapping data in a staging table.

## Problem Solved

The original batch import system had the following limitations:

1. **RPC Parameter Size Limitations**: Large mapping data could be truncated during transmission between frontend and backend.
2. **Foreign Key Constraint Issues**: Issues with references to auth.users table.
3. **SQL String Escaping Problems**: Issues with special characters in field names, especially those with spaces.

## How It Works

The new approach works by:

1. Creating a staging table (`import_job_mappings`) to store mapping configurations
2. Processing one sheet at a time rather than all at once
3. Passing only minimal data through RPC calls
4. Using a chunked processing approach for better error isolation

## Usage

To use the chunked import system:

```typescript
// Import the chunked DatabaseService (instead of the original)
import { DatabaseService } from '../services/DatabaseService.chunked';

// Create an instance of the service
const databaseService = new DatabaseService();

// Use it just like the original
const results = await databaseService.processBatchImport(jobs, excelData, true);
```

## Implementation Details

### Database Components

1. **Staging Table**:
   - `import_job_mappings` stores mapping data linked to import jobs
   - Foreign key references ensure consistency with the import_jobs table

2. **New RPC Function**:
   - `process_individual_job` processes one job at a time
   - Retrieves mapping data from the staging table
   - Provides detailed logging for troubleshooting

3. **Cleanup Function**:
   - `cleanup_import_job_mappings` removes old mapping data (configurable retention period)

### Frontend Components

1. **Chunked ImportService**:
   - Stores mapping data in the staging table
   - Processes jobs one at a time
   - Handles schema cache refreshing

2. **Enhanced DatabaseService**:
   - Drop-in replacement for the original service
   - Same API, but uses the chunked approach internally

## Benefits

- **Handles Large Mappings**: No more truncation issues with complex mappings
- **Improved Error Isolation**: Each sheet is processed independently
- **Better Performance**: Reduced memory consumption by processing in chunks
- **Enhanced Logging**: More detailed diagnostics when issues occur

## Migration

A migration script is provided to set up the required database components:

```bash
node scripts/apply-chunked-import-migration.js
```

Alternatively, you can:

1. Run the SQL in `src/db/migrations/017_import_job_mappings_staging.sql` directly in your Supabase SQL Editor
2. Update your imports to use the new service: 
   ```typescript
   import { DatabaseService } from "../services/DatabaseService.chunked";
   ```

## Debugging

The chunked import system includes detailed logging that tracks:

- Mapping size in bytes for each job
- Which jobs contain potentially problematic fields
- Progress of each job as it's processed

If issues occur, check the browser console for logs with the prefix `[ImportService]`.

## Technical Details

### Size Limitations

The original RPC system was limited by:

1. PostgREST parameter limits (~1-2MB)
2. HTTP header size limits in some environments
3. PostgreSQL JSON processing capacity

The new approach:
- Uses database storage instead of HTTP parameters
- Breaks processing into smaller, more manageable operations
- Maintains transaction safety using database-side logic