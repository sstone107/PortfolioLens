# PortfolioLens Project Tasks

## Current Tasks (2025-05-07)
- [ ] [BUG] Supabase Edge Function `process-import-job` returns 404 on POST (2025-05-22)
  - **Description:** When executing a batch import, the frontend POSTs to `/functions/v1/process-import-job`, but receives a 404 Not Found. The OPTIONS preflight succeeds, but the POST fails. Supabase logs confirm the 404. Root cause is the Edge Function is not deployed or not accessible at the expected endpoint.
  - **Steps to Reproduce:**
    1. Upload a file in the batch import workflow.
    2. Proceed to execute the import.
    3. Observe network request to `/functions/v1/process-import-job` fails with 404.
  - **Expected:** The POST request should succeed and trigger the import job.
  - **Actual:** The POST request returns 404 Not Found.
  - **Acceptance Criteria:**
    - The Edge Function is deployed and accessible at the correct endpoint.
    - Import jobs can be triggered successfully from the frontend.
    - Add a regression test to verify Edge Function availability.
  - **Priority:** High (blocks import workflow)

- [x] Initialize project setup and create Task Master structure
- [ ] Work on Task ID: 2 - Authentication and Permission System
  - [x] Set Up Supabase Auth
  - [x] Define User Roles (Completed 2025-05-01)
  - [x] Implement Row-Level Security Policies (Completed 2025-05-01)
  - [ ] Develop Admin Capabilities
  - [ ] Add IP/Geography Limitations
  - [ ] Implement Export/Download Permissions
- [ ] Apply Supabase migration 010_loan_detail_view_tables.sql
- [x] Fix: Data type display issues - Ensure inferredDataType defaults to null, not 'string', throughout the column mapping process. (Investigate `ColumnMappingSuggestions` to `BatchColumnMapping` transformation, check `BatchImporterContext` or `BatchImporter.tsx` and `batchImportStore.ts` for `inferredDataType` handling. Confirmed fix in `batchImport.worker.ts`.)

## Upcoming Tasks
- [x] Parameter Type Handling and Connection Verification Fixes (Completed 2025-05-03)
  - [x] Fixed parameter type handling in SqlExecutionService.ts to ensure parameters are always objects
  - [x] Enhanced parameter validation in supabaseMcp.ts to convert any array parameters to empty objects
  - [x] Improved connection verification in DatabaseService.ts to be more resilient to different result formats
  - [x] Added better error logging in both services to help diagnose future issues
- [x] Supabase Integration Fixes for Enhanced Batch Import (Completed 2025-05-03)
  - [x] Fixed error suppression in supabaseMcp.ts to properly report schema cache errors
  - [x] Updated ImportService.ts to properly handle and report SQL execution errors
  - [x] Enhanced run-migrations.js with clearer schema cache refresh instructions
  - [x] Added SCHEMA_CACHE.md documentation for best practices
  - [x] Enhanced architectural documentation with diagrams and best practices (Completed 2025-05-03)
  - [x] Updated PLANNING.md to include schema cache management considerations
- [x] Implement Automated Schema Cache Refresh Mechanism (Completed 2025-05-03)
  - [x] Created schemaRefreshUtil.ts utility with multiple refresh methods
  - [x] Updated run-migrations.js to automatically refresh schema cache after migrations
  - [x] Added recovery mechanism in supabaseMcp.ts for PGRST202 errors
  - [x] Implemented back-off retry logic for schema refresh attempts
  - [x] Updated documentation with details about the automated refresh mechanism
- [x] Implement SQL Function Diagnostic Tool (Completed 2025-05-04)
  - [x] Created comprehensive diagnostic script `scripts/diagnose-sql-functions.js`
  - [x] Implemented function signature verification and parameter validation
  - [x] Added PostgREST schema cache checking and refresh capabilities
  - [x] Implemented permission validation for SQL functions
  - [x] Added compatibility wrapper creation for parameter name mismatches
  - [x] Created detailed error reporting with color-coded output
- [x] Implement Enhanced Excel Import System (Completed 2025-05-04)
  - [x] Created Analysis Engine for automated mapping with 99% accuracy
  - [x] Implemented combined scoring system (name similarity, type compatibility, content patterns)
  - [x] Built two-level review UI with high-level sheet-to-table and detailed column mapping views
  - [x] Added confidence indicators and batch approval functionality
  - [x] Implemented schema change proposals during analysis
- Data Ingestion System (In Progress)
- Data Transformation Engine
- Configuration Management UI
- Snapshot Management System
- Portfolio Analytics Dashboard
- Loan Drilldown and Search
- AI-Assisted Features

## Completed Tasks
- [x] Create initial project structure
- [x] Set up Task Master and parse PRD
- [x] Create planning documentation
- [x] Task ID: 1 - Project Setup and Infrastructure Configuration (2025-05-01)
  - [x] Initialize Refine.dev Frontend Project
  - [x] Configure Supabase Backend and Database
  - [x] Implement CI/CD Pipeline and Cloud Hosting
- [x] Task ID: 3 - Database Schema Design (2025-05-01)
  - [x] Created schema analyzer for Excel loan data files
  - [x] Implemented comprehensive database schema for loans, properties, borrowers, etc.
  - [x] Added indexes, triggers, and security policies
  - [x] Created database_schema.md documentation

## Discovered During Work
- Need to implement Investor components (list, create, edit, show)
- Need to implement Servicer components (list, create, edit, show)
- Need to implement Upload components (list, create, show)

## Notes
- Project following Refine.dev + Supabase + Postgres stack
- Focusing on modularity and clean TypeScript code standards
- All subtasks have been generated from PRD
