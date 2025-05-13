# Table Prefixing System

This document outlines the table naming and categorization system implemented in PortfolioLens to enhance organization and maintainability.

## Table Categories

Tables in the database are now organized into categories with standardized prefixes:

| Category  | Prefix | Description                          | Examples                          |
|-----------|--------|--------------------------------------|-----------------------------------|
| LOAN      | loan_  | Loan-related business data tables    | loan_payments, loan_borrowers     |
| SYSTEM    | sys_   | System tables for internal functions | sys_settings, sys_audit_log       |
| IMPORT    | imp_   | Import-related tables                | imp_batch_history, imp_templates  |
| USER      | usr_   | User-related tables                  | usr_preferences, usr_profiles     |
| REPORTING | rpt_   | Reporting/analytics tables           | rpt_summary, rpt_dashboard        |
| PARTNER   | prt_   | Partner/external entity tables       | prt_investors, prt_servicers      |

## Benefits of Table Prefixing

1. **Visual Organization**: Tables are visually grouped by type in database tools
2. **Clear Separation**: System tables are clearly separated from business data tables
3. **Easier Security Management**: Security policies can be applied by category
4. **Query Clarity**: SQL queries are more self-documenting
5. **Consistency**: Promotes consistent naming patterns
6. **Access Control**: Makes it easier to implement role-based access control

## Table Detection in Import System

The import system leverages the table prefixing system in the following ways:

1. Tables are automatically categorized during import
2. Only loan tables are shown by default in table mapping dropdowns
3. Table detection logic identifies the appropriate category based on table name and contents
4. New tables are created with the appropriate prefix automatically
5. The UI suggests SQL-safe names with the correct prefix during table creation

## Table Naming Conventions

1. **Standard Prefixes**: All tables should use the prefix that matches their category
2. **Singular Names**: Use singular form for table names (e.g., loan_borrower not loan_borrowers)
3. **Snake Case**: Use snake_case for table names (e.g., loan_payment_transaction)
4. **No Abbreviations**: Prefer full words over abbreviations (e.g., loan_insurance not loan_ins)
5. **Descriptive Names**: Table names should clearly indicate their contents

## Migration Strategy

When migrating existing tables to use the new prefixing system:

1. A database migration is created for each table category
2. Each old table is renamed with the appropriate prefix
3. A view with the original name is created to maintain backward compatibility
4. RLS policies and permissions are updated automatically
5. Foreign key constraints are preserved throughout the migration

## Implementation Details

The table prefixing system is implemented in two key locations:

1. **utils/tableNameUtils.ts**: Contains functions for:
   - Detecting table categories
   - Generating SQL-safe names with prefixes
   - Converting between display names and database names

2. **scripts/migrate-table-prefixes.js**: Provides migration capabilities:
   - Analyzes existing tables
   - Categorizes tables based on naming patterns
   - Generates migration scripts
   - Creates compatibility views

## Usage in Table Mapping

When using the Table Mapping system during import:

1. Tables are filtered by default to only show loan tables (can be toggled)
2. When creating a new table, the name is automatically prefixed based on its detected category
3. Match confidence scores are calculated based on normalized table names
4. Only matches with ≥95% confidence are auto-approved
5. The system identifies existing tables with matching patterns for potential mapping