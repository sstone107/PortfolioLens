# Automatic ln_ Prefix for Import Tables

## Changes Made

### 1. Default Table Naming
Changed from `in_` to `ln_` prefix for tables without templates:
```typescript
// Before: let targetTable = `in_${safeColumnName(sheetName)}`
// After:
let targetTable = `ln_${safeColumnName(sheetName)}`
```

### 2. Template Table Naming
Now automatically adds `ln_` prefix if not already present:
```typescript
if (sheetMapping.mappedName) {
  // If template already has ln_ prefix, use it as is
  if (sheetMapping.mappedName.startsWith('ln_')) {
    targetTable = sheetMapping.mappedName
  } else {
    // Otherwise, add ln_ prefix
    targetTable = `ln_${sheetMapping.mappedName}`
  }
}
```

## How It Works

1. **Without Template**: Sheet "Loan Activity" → `ln_loan_activity`
2. **With Template (no prefix)**: Template says `invoice_loan_activity` → `ln_invoice_loan_activity`
3. **With Template (has prefix)**: Template says `ln_custom_name` → `ln_custom_name` (no double prefix)

## Benefits

- Templates don't need to worry about the `ln_` prefix
- All imported tables will consistently have the `ln_` prefix
- Existing templates with `invoice_*` names will automatically become `ln_invoice_*`
- Templates that already have `ln_` prefix won't get doubled

## Example

For the Greenway billing report template:
- Sheet: "Loan Activity" 
- Template mappedName: "invoice_loan_activity"
- Final table name: "ln_invoice_loan_activity"

This ensures all imported tables follow the loan data convention with the `ln_` prefix.