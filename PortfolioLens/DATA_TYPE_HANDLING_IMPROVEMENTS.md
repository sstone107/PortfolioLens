# Data Type Handling Improvements for Import System

## Issues Identified

Based on analysis of sample data from Greenway, we identified several data format challenges:

### 1. Columns Starting with Numbers
- Found columns like: `30 DPD Count`, `60 DPD Count`, `90 DPD Count`, `24 Month Pay History`
- Also numeric IDs used as column names: `187935:`, `214093:`, `283670015:`
- **Solution**: Automatically prefix with 'n_' (e.g., `30 DPD Count` → `n_30_dpd_count`)

### 2. Currency and Number Formatting
- Numbers with commas: `4,730,017,533`
- Currency values with dollar signs: `$443,500.00`
- **Solution**: Enhanced coerceValue function to strip currency symbols and commas before parsing

### 3. Date Formats
- Various date formats in the data
- Excel serial numbers (days since 1900-01-01)
- **Solution**: Added Excel date serial number detection and conversion

### 4. Quoted Values
- Some values contain quotes that need to be stripped
- **Solution**: Remove surrounding quotes during preprocessing

### 5. Special Characters in Column Names
- Columns with spaces, parentheses, and other special characters
- **Solution**: Replace with underscores in safeColumnName function

## Edge Function Enhancements

### 1. Enhanced Data Type Coercion

```typescript
// Handle string preprocessing
if (typeof value === 'string') {
  // Remove surrounding quotes if present
  value = value.replace(/^["']|["']$/g, '').trim()
}

// Handle currency/number formats
if (typeof value === 'string') {
  // Remove currency symbols, commas, and spaces
  const cleanValue = value.replace(/[$,\s]/g, '')
  const num = Number(cleanValue)
  if (isNaN(num)) {
    console.warn(`Cannot parse "${value}" as number for column ${columnName}`)
    return null
  }
  return num
}

// Handle Excel date serial numbers
if (typeof value === 'number' && value > 25569 && value < 100000) {
  // Excel date (days since 1900-01-01)
  const excelDate = new Date((value - 25569) * 86400 * 1000)
  return excelDate.toISOString().split('T')[0]
}
```

### 2. Comprehensive Logging

Added detailed logging to help diagnose import issues:

```typescript
// Data analysis at start of import
console.log('\n=== Data Analysis for Debugging ===')
console.log(`First row has ${Object.keys(firstRow).length} columns`)

// Check for problematic column names
const problematicCols = Object.keys(firstRow).filter(key => 
  /^\d/.test(key) || // Starts with number
  key.includes('$') || // Contains currency symbol
  key.includes(',') || // Contains comma
  key.includes('"') || // Contains quotes
  key.length > 63 // Too long
)

// Sample data values with types
console.log('\n=== Sample Data Values ===')
interestingCols.forEach(([key, value]) => {
  const valueType = value === null ? 'null' : typeof value
  console.log(`  ${key}: "${value}" (${valueType})`)
})

// Failed insert debugging
console.log('\n=== Failed Insert Data Sample ===')
console.log('First failed row:')
Object.entries(firstRow).slice(0, 10).forEach(([key, value]) => {
  const valueType = value === null ? 'null' : typeof value
  console.log(`  ${key}: "${value}" (${valueType})`)
})
```

### 3. Error Tracking Migration

Created migration for detailed error tracking:

```sql
CREATE TABLE IF NOT EXISTS public.import_error_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    column_name TEXT,
    original_value TEXT,
    target_type TEXT,
    error_type TEXT CHECK (error_type IN ('type_conversion', 'validation', 'constraint', 'unknown')),
    error_message TEXT,
    error_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Deployment Steps

1. Deploy the enhanced Edge Function:
```bash
supabase functions deploy process-import-sheet --no-verify-jwt
```

2. Run the error tracking migration (056_add_import_error_details.sql)

3. Enable detailed logging for specific imports by setting `enable_detailed_logging = true` on the import job

## Testing Recommendations

1. Test with the Greenway sample files that contain:
   - Columns starting with numbers
   - Currency values with commas and dollar signs
   - Various date formats
   - Long text fields

2. Monitor Edge Function logs during import to see:
   - Data type conversion warnings
   - Problematic column transformations
   - Failed insert details

3. Query the `import_error_details` table after imports to analyze patterns:
```sql
-- View error summary
SELECT * FROM import_error_summary WHERE job_id = 'your-job-id';

-- See specific errors
SELECT * FROM import_error_details 
WHERE job_id = 'your-job-id' 
ORDER BY row_number, column_name;
```

## Next Steps

1. Monitor imports with the enhanced logging to identify any remaining data type issues
2. Add more specific data type handlers as needed based on observed patterns
3. Consider adding data validation rules in the UI before sending to Edge Function
4. Implement retry logic for failed rows with data type corrections