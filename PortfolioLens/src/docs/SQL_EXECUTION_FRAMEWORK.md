# SQL Execution Framework

This document provides an overview of the secure, role-based SQL execution framework implemented in PortfolioLens.

## Overview

The SQL execution framework provides a secure way to execute SQL queries with:

- Role-based access controls
- Parameterized queries to prevent SQL injection
- Resource limits based on user roles
- Comprehensive audit logging
- Data lineage tracking for regulatory compliance

## Architecture

The framework consists of the following components:

1. **Database Functions**: PostgreSQL functions that execute SQL with security controls
2. **SQL Execution Service**: TypeScript service for interacting with the database functions
3. **Database Service Integration**: Enhanced DatabaseService with secure SQL execution methods
4. **Audit Logging**: Comprehensive logging of all SQL operations

## Database Functions

The framework provides three main database functions:

1. `exec_sql_secure(query_text, parameters, role_name)`: Main function for secure SQL execution
2. `exec_sql_with_params(query_text, parameters)`: Simplified interface for parameterized queries
3. `exec_sql(sql)`: Legacy function for backward compatibility

### Resource Limits

Resource limits are applied based on user roles:

- **Admin**: 5-minute execution time limit, 100,000 row limit
- **Accounting/Exec**: 2-minute execution time limit, 50,000 row limit
- **Other roles**: 1-minute execution time limit, 10,000 row limit

## SQL Execution Service

The `SqlExecutionService` class provides methods for executing SQL queries with security controls:

```typescript
// Execute a query with parameters
const result = await SqlExecutionService.executeQuery(
  'SELECT * FROM users WHERE role = $1',
  { $1: 'admin' }
);

// Execute a query with role-based permissions
const result = await SqlExecutionService.executeSecureQuery(
  'SELECT * FROM sensitive_data WHERE category = $1',
  { $1: 'financial' },
  [UserRoleType.Accounting, UserRoleType.Exec]
);

// Get SQL execution logs
const { logs, count } = await SqlExecutionService.getLogs(50, 0, {
  status: SqlExecutionStatus.ERROR
});

// Get data lineage for a table
const lineage = await SqlExecutionService.getDataLineage('table', 'users');
```

## React Hook

The framework provides a React hook for executing SQL queries in components:

```typescript
import { useSqlExecution } from '../services/SqlExecutionService';

function MyComponent() {
  const { executeQuery, hasQueryPermission } = useSqlExecution();
  
  const fetchData = async () => {
    // Check if user has permission
    if (hasQueryPermission([UserRoleType.Admin, UserRoleType.Accounting])) {
      const result = await executeQuery(
        'SELECT * FROM financial_data WHERE year = $1',
        { $1: 2025 }
      );
      
      if (result.error) {
        console.error('Query failed:', result.error);
      } else {
        // Use the data
        console.log('Query results:', result.data);
      }
    }
  };
  
  return (
    // Component JSX
  );
}
```

## DatabaseService Integration

The `DatabaseService` class has been enhanced with secure SQL execution methods:

```typescript
// Import the DatabaseService
import { DatabaseService } from '../components/import/services/DatabaseService';

// Create an instance
const dbService = new DatabaseService();

// Execute a secure SQL query
const results = await dbService.executeSQL(
  'SELECT * FROM users WHERE role = $1',
  { $1: 'admin' }
);

// Execute a query with role-based permissions
const results = await dbService.executeSecureSQL(
  'SELECT * FROM sensitive_data',
  {},
  [UserRoleType.Admin, UserRoleType.Accounting]
);

// Get SQL execution logs
const logs = await dbService.getSqlExecutionLogs(50, 0);
```

## Audit Logging

All SQL operations are logged in the `sql_execution_log` table, which includes:

- User ID and role
- Query text and parameters
- Execution time and row count
- Status and error messages
- Client information
- Resource usage
- Data lineage information

### Querying Audit Logs

```sql
-- Get all failed queries
SELECT * FROM sql_execution_log WHERE status = 'error';

-- Get queries by a specific user
SELECT * FROM sql_execution_log WHERE user_id = 'user-uuid';

-- Get queries that affected a specific table
SELECT * FROM sql_execution_log 
WHERE data_lineage->'affected_tables' ? 'table_name';

-- Get resource-intensive queries
SELECT * FROM sql_execution_log 
ORDER BY (resource_usage->>'execution_time_ms')::numeric DESC
LIMIT 10;
```

## Data Lineage

The framework tracks data lineage by recording:

- Source queries
- Parameters
- Affected tables
- Timestamps
- User information

This information can be used for regulatory compliance and data governance.

## Security Considerations

1. **SQL Injection Prevention**: Always use parameterized queries
2. **Role-Based Access**: Restrict sensitive operations to appropriate roles
3. **Audit Trail**: Review logs regularly for suspicious activity
4. **Resource Limits**: Prevent DoS attacks through query resource limits

## Best Practices

1. **Always use parameters** instead of string concatenation:

   ```typescript
   // GOOD
   const result = await SqlExecutionService.executeQuery(
     'SELECT * FROM users WHERE id = $1',
     { $1: userId }
   );
   
   // BAD - SQL injection risk
   const result = await SqlExecutionService.executeQuery(
     `SELECT * FROM users WHERE id = '${userId}'`
   );
   ```

2. **Specify required roles** for sensitive operations:

   ```typescript
   const result = await SqlExecutionService.executeSecureQuery(
     'SELECT * FROM financial_data',
     {},
     [UserRoleType.Accounting, UserRoleType.Exec]
   );
   ```

3. **Handle errors** appropriately:

   ```typescript
   const result = await SqlExecutionService.executeQuery(query, params);
   
   if (result.error) {
     // Handle error
     console.error('Query failed:', result.error);
     showErrorNotification(result.error.message);
   } else {
     // Use the data
     setData(result.data);
   }
   ```

4. **Limit result sets** for better performance:

   ```typescript
   const result = await SqlExecutionService.executeQuery(
     'SELECT * FROM large_table LIMIT $1 OFFSET $2',
     { $1: 50, $2: 0 }
   );
   ```

5. **Monitor execution logs** for performance issues and security concerns.

## Troubleshooting

### Common Errors

1. **Permission denied**: User does not have the required role
   - Solution: Check user roles and required roles for the query

2. **Resource limit exceeded**: Query exceeded time or row limits
   - Solution: Optimize the query or request higher limits

3. **SQL syntax error**: Invalid SQL syntax
   - Solution: Check the query syntax and parameters

### Debugging

1. Check the SQL execution logs for detailed error information
2. Use the `metadata` property in the query result for execution details
3. Monitor resource usage for performance bottlenecks

## Conclusion

The SQL execution framework provides a secure, auditable way to execute database operations with appropriate access controls and resource limits. By following the best practices outlined in this document, you can ensure that your application's database operations are secure, efficient, and compliant with regulatory requirements.