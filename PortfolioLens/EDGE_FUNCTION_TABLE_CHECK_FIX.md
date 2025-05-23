# Edge Function Table Check Fix

## Issue
The Edge Function is incorrectly detecting that tables exist when they don't, causing inserts to fail with empty error messages.

## Root Cause
The table existence check using Supabase client doesn't properly handle non-existent tables:

```typescript
// This doesn't throw an error for non-existent tables as expected
const { count } = await supabaseAdmin
  .from(tableName)
  .select('*', { count: 'exact', head: true })
```

## Solution
Replace the table existence check with a proper SQL query:

```typescript
// Check if table exists using information_schema
const { data: tableExists } = await supabaseAdmin.rpc('table_exists', {
  p_table_name: tableName
})

if (!tableExists) {
  // Create table
  const { data: createResult, error: createError } = await supabaseAdmin.rpc('create_import_table', {
    p_table_name: tableName
  })
  
  if (createError || !createResult?.success) {
    console.error('Failed to create table:', createError || createResult?.error)
    return { success: false, error: createError?.message || createResult?.error }
  }
}
```

## Migration Required
First, create the `table_exists` function:

```sql
CREATE OR REPLACE FUNCTION public.table_exists(p_table_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = p_table_name
  );
$$;

GRANT EXECUTE ON FUNCTION public.table_exists TO authenticated;
```

## Alternative Quick Fix
If you can't deploy a new function, modify the Edge Function to use a try-catch with a specific query:

```typescript
try {
  // Try to query the table structure
  const { data, error } = await supabaseAdmin
    .from(tableName)
    .select()
    .limit(0)
  
  if (error && error.code === '42P01') { // undefined_table error
    // Table doesn't exist, create it
    console.log(`Table ${tableName} does not exist, creating...`)
    // ... create table logic
  } else {
    console.log(`Table ${tableName} exists`)
  }
} catch (error) {
  // Handle other errors
}
```