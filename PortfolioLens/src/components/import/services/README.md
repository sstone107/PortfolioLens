# Import Services Architecture

## Overview

The import functionality in PortfolioLens follows the **Facade Design Pattern**, providing a simplified interface through the `DatabaseService` while delegating specialized functionality to dedicated services.

## Service Structure

### DatabaseService (Facade)

`DatabaseService` acts as a facade that coordinates operations between specialized services. It provides a simplified interface for consuming components while delegating the actual implementation to specialized services.

Key responsibilities:
- Coordinating operations between specialized services
- Providing a unified interface for client code
- Maintaining backward compatibility for existing code

### Specialized Services

#### MetadataService

Handles database metadata operations:
- Retrieving table information
- Detecting and creating missing columns
- Type inference and data structure analysis

#### MappingService

Handles mapping operations between Excel data and database tables:
- Suggesting column mappings based on data analysis
- Managing mapping templates
- Providing table mapping suggestions

#### ImportService

Handles data import operations:
- Processing batch imports
- Creating and tracking import jobs
- Transforming and inserting data

## Usage Guidelines

### For Existing Code

Existing code should continue to use the `DatabaseService` facade to maintain compatibility:

```typescript
import { DatabaseService } from './services/DatabaseService';

// Use the facade for all operations
const dbService = new DatabaseService();
const tables = await dbService.getTables();
```

### For New Code

New code can directly use the specialized services for more targeted operations:

```typescript
import { MetadataService } from './services/MetadataService';
import { MappingService } from './services/MappingService';
import { ImportService } from './services/ImportService';

// Direct use of specialized services
const metadataService = new MetadataService();
const tableInfo = await metadataService.getTableInfo('loans');

const mappingService = new MappingService();
const mappings = mappingService.suggestColumnMappings(sheetData, tableInfo);

const importService = new ImportService();
const results = await importService.processBatchImport(jobs, excelData, true);
```

## Error Handling

All services follow a consistent error handling approach:
- Explicit try/catch blocks for all async operations
- Detailed error logging with context information
- Standard return types for operations (e.g., `ImportResult`)
- Clear error messages that can be displayed to users

## Testing

Each service has unit tests to ensure individual functionality works correctly:
- `__tests__/MetadataService.test.ts` - Tests for metadata operations
- `__tests__/MappingService.test.ts` - Tests for mapping operations
- `__tests__/ImportService.test.ts` - Tests for import operations
- `__tests__/DatabaseService.test.ts` - Tests for facade coordination

Run tests with:
```
npm test -- --testPathPattern=services
```
