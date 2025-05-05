# Architectural Documentation Plan: Supabase Schema Cache Management

This plan outlines the steps to create comprehensive architectural documentation regarding Supabase PostgREST schema cache management within the PortfolioLens project.

## 1. Integrate Concepts

*   Enhance `SCHEMA_CACHE.md` to explicitly state its relationship with the `SQL_EXECUTION_FRAMEWORK.md`. Explain that the SQL Execution Framework relies on PostgREST's API layer, which in turn depends on an up-to-date schema cache to find and execute the underlying database functions.
*   Clarify that the "fallback" mechanism for schema cache errors is primarily the documented error handling (detecting PGRST202) combined with the manual refresh process, rather than alternative execution paths within the SQL framework itself.

## 2. Enhance `SCHEMA_CACHE.md`

*   **Add Architectural Diagram:** Include a Mermaid diagram illustrating the interaction flow:
    ```mermaid
    sequenceDiagram
        participant AppCode as Application Code (e.g., ImportService)
        participant SqlExec as SQL Execution Service / DatabaseService
        participant PostgREST as Supabase PostgREST API
        participant DbCache as PostgREST Schema Cache
        participant DbFunc as PostgreSQL Database Function
        participant Migration as Migration Process
        participant DevAdmin as Developer/Admin (Manual Refresh)

        AppCode->>SqlExec: Call function (e.g., executeSQL)
        SqlExec->>PostgREST: Make RPC call to endpoint
        PostgREST->>DbCache: Lookup function for endpoint
        alt Function Found in Cache
            DbCache-->>PostgREST: Return function info
            PostgREST->>DbFunc: Execute Database Function
            DbFunc-->>PostgREST: Return result
            PostgREST-->>SqlExec: Return result
            SqlExec-->>AppCode: Return result
        else Function NOT Found in Cache (Stale Cache)
            DbCache-->>PostgREST: Function not found
            PostgREST-->>SqlExec: Return PGRST202 Error
            SqlExec-->>AppCode: Propagate Schema Cache Error
        end

        Note over Migration, DbFunc: Migration adds/modifies DB Function
        Migration-->>DbFunc: Apply changes

        Note over DevAdmin, DbCache: Manual Refresh Needed Post-Migration
        DevAdmin->>PostgREST: Trigger Schema Reload (via Supabase UI)
        PostgREST->>DbFunc: Scan DB for functions
        PostgREST->>DbCache: Update Schema Cache
    ```
*   **Expand Best Practices:** Augment the existing list with architectural considerations:
    *   Integrate schema cache refresh into deployment checklists.
    *   Consider adding automated post-migration smoke tests that specifically call recently modified/added RPC endpoints to verify cache state.
    *   Emphasize clear documentation within function definitions or related code regarding their reliance on RPC and potential cache issues.
*   **Add Architectural Resilience Recommendations:**
    *   Document the current error detection (PGRST202) and user notification strategy as the primary resilience mechanism.
    *   Suggest monitoring PostgREST logs or application logs for frequent PGRST202 errors as an operational health check.
    *   Recommend periodic review of Supabase/PostgREST updates for potential improvements in automatic cache invalidation.
    *   Briefly mention (and discourage unless absolutely necessary) direct DB connections as a potential bypass, noting the loss of PostgREST features.

## 3. Update `PLANNING.md`

*   Add a bullet point under the "Development Approach" or create a small "Operational Considerations" section mentioning the need to manage platform-specific behaviors like Supabase schema caching during development, migration, and deployment processes.

## 4. Add Future Architectural Recommendations Section to `SCHEMA_CACHE.md`

*   Investigate Supabase CLI commands or Management API endpoints for programmatic schema cache refresh possibilities to potentially automate the manual step.
*   Evaluate building more robust automated post-migration/deployment health checks that target RPC endpoints.
*   Explore architectural patterns that minimize the frequency of changes to function signatures exposed via RPC, if practical.