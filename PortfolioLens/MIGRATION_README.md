# Table Prefixing & Migration System

This document outlines the table prefixing system and migration strategy implemented in the PortfolioLens application.

## Table Prefixing System

Tables in the database are now categorized and prefixed for better organization:

| Category  | Prefix | Description                          | Examples                         |
|-----------|--------|--------------------------------------|----------------------------------|
| LOAN      | loan_  | Loan-related business data tables    | loan_payments, loan_borrowers    |
| SYSTEM    | sys_   | System tables for internal functions | sys_settings, sys_audit_log      |
| IMPORT    | imp_   | Import-related tables               | imp_batch_history, imp_templates |
| USER      | usr_   | User-related tables                 | usr_preferences, usr_profiles    |
| REPORTING | rpt_   | Reporting/analytics tables          | rpt_summary, rpt_dashboard       |

## Benefits of Table Prefixing

1. Improved organization and visual separation of tables by purpose
2. Clear distinction between system tables and business data tables
3. Simplified security policy management
4. Better clarity in SQL queries and debugging
5. Consistent naming convention across the application
6. Easier to implement role-based access control

## Migration Strategy

A comprehensive migration strategy has been implemented that:

1. Analyzes existing tables and categorizes them based on naming patterns
2. Generates SQL scripts to rename tables with appropriate prefixes
3. Creates compatibility views for backward compatibility
4. Updates RLS policies to reference the new table names
5. Preserves all permissions and security settings

## Running the Migration

To prepare for migration:

```bash
node scripts/migrate-table-prefixes.js plan
```

This will create a `table-migration-plan.json` file for review.

To generate SQL migration files:

```bash
node scripts/migrate-table-prefixes.js generate
```

This creates SQL files in the `scripts/table-migrations` directory organized by category.

## Backward Compatibility

The migration system automatically creates views that match the original table names but reference the new tables. This ensures that any existing code or queries that use the old table names will continue to work without modification.

## Table Detection in Import System

The import system has been enhanced to use the new table prefixing system:

1. Tables are automatically categorized during import
2. Only loan tables are shown by default in the dropdown
3. Detection logic has been improved to identify table types more accurately
4. The UI will now suggest appropriate table names with the correct prefix

## Future Considerations

1. Over time, direct references to old table names should be updated to use the new prefixed names
2. New tables should always be created with the appropriate prefix
3. Compatibility views may be removed in a future version once all code has been updated