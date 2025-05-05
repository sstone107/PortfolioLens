import { ColumnType } from './types';

/**
 * Infers the data type of a column based on field name and sample values
 * Handles common data formats including text-formatted numbers and dates
 * 
 * @param sampleValues - Sample values from the column
 * @param fieldName - Field name to use for inference when sample data is insufficient
 * @returns The inferred column type
 */
export function inferDataType(sampleValues: any[], fieldName?: string): ColumnType {
  console.log(`[TYPE INFERENCE] Analyzing field "${fieldName || 'unknown'}" with ${sampleValues?.length || 0} values`);
  
  // Log sample values (up to 5)
  if (sampleValues && sampleValues.length > 0) {
    const sampleToLog = sampleValues.slice(0, 5).map(v =>
      v === null || v === undefined ? 'null' :
      typeof v === 'string' ? `"${v}"` :
      String(v)
    ).join(' | ');
    console.log(`[TYPE INFERENCE] Sample values: ${sampleToLog}`);
  } else {
    console.log(`[TYPE INFERENCE] No sample values available`);
  }

  // PRIORITY 0: Field name analysis for debugging
  if (fieldName) {
    console.log(`[TYPE INFERENCE] Field name analysis for "${fieldName}": ${inferTypeFromFieldName(fieldName)}`);
  }

  // PRIORITY 1: Field name takes precedence for empty fields
  if (!sampleValues || sampleValues.length === 0 || sampleValues.every(v => v === null || v === undefined || v === '')) {
    const nameBasedType = inferTypeFromFieldName(fieldName);
    console.log(`[TYPE INFERENCE] No valid data, using field name inference: ${nameBasedType}`);
    return nameBasedType;
  }

  // Filter out null/empty values
  const nonNullValues = sampleValues.filter(val => val !== null && val !== undefined && val !== '');
  if (nonNullValues.length === 0) {
    const nameBasedType = inferTypeFromFieldName(fieldName);
    console.log(`[TYPE INFERENCE] All values are null/empty, using field name inference: ${nameBasedType}`);
    return nameBasedType;
  }
  
  // PRIORITY 1.5: Strong field name indicators for specific types
  // This is a higher priority than sample data analysis for certain field names
  if (fieldName) {
    // Date field name detection with very high confidence
    if (/\b(date|dt|dob|discharge|dismissal|filed|bankruptcy)\b/i.test(fieldName)) {
      console.log(`[TYPE INFERENCE] Field name "${fieldName}" strongly indicates date type, prioritizing over sample data`);
      return 'date';
    }
    
    // Score/FICO field detection - these are numbers, not dates
    if (/\b(score|fico|rating)\b/i.test(fieldName)) {
      console.log(`[TYPE INFERENCE] Field name "${fieldName}" strongly indicates score/number, prioritizing over sample data`);
      return 'number';
    }
    
    // Boolean field detection with very high confidence
    if (/\b(required|enabled|escrowed|forced|place|claim)\b/i.test(fieldName)) {
      console.log(`[TYPE INFERENCE] Field name "${fieldName}" strongly indicates boolean type, prioritizing over sample data`);
      return 'boolean';
    }
  }

  console.log(`[TYPE INFERENCE] Found ${nonNullValues.length} non-null values for analysis`);

  // PRIORITY 2: Check for ZIP codes, phone numbers, IDs with leading zeros
  // This check must come before date detection to prevent misclassification
  if (hasSpecialStringFormat(nonNullValues)) {
    console.log(`[TYPE INFERENCE] Detected special string format (ZIP, phone, ID with leading zeros)`);
    return 'string';
  }

  // PRIORITY 3: Check for boolean values (TRUE/FALSE, Yes/No, etc.)
  if (allValuesAreBoolean(nonNullValues)) {
    console.log(`[TYPE INFERENCE] All values are boolean-like`);
    return 'boolean';
  }

  // PRIORITY 4: Strong field name indicators for specific types
  if (fieldName) {
    // ZIP code field name detection
    if (/zip|postal|zipcode/i.test(fieldName)) {
      console.log(`[TYPE INFERENCE] Field name "${fieldName}" indicates ZIP code, forcing string type`);
      return 'string';
    }
    
    // Score/FICO field detection - these are numbers, not dates
    if (/score|fico|rating/i.test(fieldName)) {
      console.log(`[TYPE INFERENCE] Field name "${fieldName}" indicates score/number, forcing number type`);
      return 'number';
    }
  }

  // PRIORITY 5: Check for date values
  if (allValuesAreDates(nonNullValues)) {
    console.log(`[TYPE INFERENCE] All values are date-like`);
    return 'date';
  }

  // PRIORITY 6: Check for numeric values (including currency, percentages)
  if (allValuesAreNumeric(nonNullValues)) {
    console.log(`[TYPE INFERENCE] All values are numeric`);
    return 'number';
  }

  // PRIORITY 7: For mixed data, use field name as a strong hint
  const nameBasedType = inferTypeFromFieldName(fieldName);
  if (nameBasedType !== 'string') {
    console.log(`[TYPE INFERENCE] Mixed data types, using field name hint: ${nameBasedType}`);
    return nameBasedType;
  }

  // PRIORITY 8: Default to string for anything else
  console.log(`[TYPE INFERENCE] Defaulting to string type`);
  return 'string';
}

/**
 * Helper function to infer type from field name only
 */
function inferTypeFromFieldName(fieldName?: string): ColumnType {
  if (!fieldName) {
    console.log(`[TYPE INFERENCE] No field name provided, defaulting to string`);
    return 'string';
  }

  // Date field detection - expanded to include more date-related terms
  if (/date|dt|day|month|year|time|created|modified|updated|birth|dob|discharge|dismissal|filed|bankruptcy|mfr|maturity/i.test(fieldName)) {
    console.log(`[TYPE INFERENCE] Field name "${fieldName}" matches date pattern`);
    return 'date';
  }
  
  // Number field detection - expanded and refined
  // Added DTI, ensured Rate maps here, added Period/Days
  if (/\b(count|number|qty|amount|balance|price|fee|cost|rate|percent|ratio|score|fico|units|ltv|dti|credit|originating|current|period|days|term|age)\b/i.test(fieldName)) {
     // Exclude date-specific "days" like "day of month"
     if (!/\b(day of month|day of week)\b/i.test(fieldName)) {
        console.log(`[TYPE INFERENCE] Field name "${fieldName}" matches number pattern`);
        return 'number';
     }
  }
  
  // Boolean field detection - refined (removed 'status')
  if (/\b(flag|indicator|is|has|required|enabled|active|escrowed|forced|claim|mom|assumable|place)\b/i.test(fieldName)) {
     console.log(`[TYPE INFERENCE] Field name "${fieldName}" matches boolean pattern`);
     return 'boolean';
  }

  console.log(`[TYPE INFERENCE] Field name "${fieldName}" doesn't match any type pattern, defaulting to string`);
  return 'string';
}

/**
 * Check if values have special string formats that should not be treated as other types
 */
function hasSpecialStringFormat(values: any[]): boolean {
  // Check the first few values (up to 10)
  const sampleSize = Math.min(values.length, 10);
  const samples = values.slice(0, sampleSize);
  
  for (const val of samples) {
    if (typeof val !== 'string') continue;
    
    const trimmed = val.trim();
    
    // Check for ZIP codes
    if (/^\d{5}(-\d{4})?$/.test(trimmed)) {
      console.log(`[TYPE INFERENCE] Detected ZIP code format: "${trimmed}"`);
      return true;
    }
    
    // Check for phone numbers
    if (/^(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(trimmed)) {
      console.log(`[TYPE INFERENCE] Detected phone number format: "${trimmed}"`);
      return true;
    }
    
    // Check for IDs with leading zeros
    if (/^0\d+$/.test(trimmed)) {
      console.log(`[TYPE INFERENCE] Detected ID with leading zeros: "${trimmed}"`);
      return true;
    }
    
    // Check for SSN format
    if (/^\d{3}-\d{2}-\d{4}$/.test(trimmed)) {
      console.log(`[TYPE INFERENCE] Detected SSN format: "${trimmed}"`);
      return true;
    }
  }
  
  return false;
}

/**
 * Check if all values are boolean or boolean-like
 */
function allValuesAreBoolean(values: any[]): boolean {
  // Expanded list of boolean values
  const booleanValues = ['true', 'false', 'yes', 'no', 'y', 'n', 't', 'f', 'on', 'off'];
  
  // Count how many values match boolean patterns
  let booleanCount = 0;
  let totalNonNullValues = 0;
  
  for (const val of values) {
    if (val === null || val === undefined || val === '') {
      continue; // Skip null/empty values
    }
    
    totalNonNullValues++;
    let isBoolean = false;
    
    if (typeof val === 'boolean') {
      isBoolean = true;
    } else if (typeof val === 'string') {
      const normalizedVal = val.toLowerCase().trim();
      
      // Check for standard boolean values
      if (booleanValues.includes(normalizedVal)) {
        isBoolean = true;
      }
      // Check for uppercase TRUE/FALSE which are common in Excel exports
      else if (normalizedVal === 'true' || normalizedVal === 'false') {
        isBoolean = true;
      }
      // Check for pipe-separated boolean values (e.g., "TRUE | FALSE | TRUE")
      else if (/^(true|false)(\s*\|\s*(true|false))+$/i.test(normalizedVal)) {
        isBoolean = true;
      }
    } /* else if (typeof val === 'number' && (val === 1 || val === 0)) {
      // Removed: Don't treat 0/1 as boolean by default, causes issues with numeric fields.
      // isBoolean = true;
    } */
    
    if (isBoolean) {
      booleanCount++;
    } else {
      console.log(`[TYPE INFERENCE] Non-boolean value found: ${typeof val === 'string' ? `"${val}"` : val}`);
    }
  }
  
  // If we have no non-null values, we can't determine if it's boolean
  if (totalNonNullValues === 0) {
    return false;
  }
  
  // Require 100% of non-null values to be boolean-like
  const booleanRatio = booleanCount / totalNonNullValues;
  console.log(`[TYPE INFERENCE] Boolean ratio: ${booleanRatio.toFixed(2)} (${booleanCount}/${totalNonNullValues})`);
  
  return booleanRatio === 1.0;
}

/**
 * Check if all values are dates or date-like strings
 */
function allValuesAreDates(values: any[]): boolean {
  let allMatch = true;
  
  // First check if any values look like scores, ratings, or FICO scores
  const possibleScores = values.filter(val => {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      // Match 3-digit numbers (common scores)
      if (/^\d{3}$/.test(trimmed)) {
        return true;
      }
      // Match 3-digit numbers with pipe separator (e.g., "764 | 806 | 802 | 818")
      if (/\d{3}(\s*\|\s*\d{3})+/.test(trimmed)) {
        return true;
      }
      // Match numbers in typical FICO score range (300-850)
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 300 && num <= 850) {
        return true;
      }
    }
    return false;
  });
  
  if (possibleScores.length > 0) {
    console.log(`[TYPE INFERENCE] Found ${possibleScores.length} values that look like scores/FICO values, rejecting as dates`);
    return false;
  }
  
  // Check for ZIP codes in the values
  const possibleZipCodes = values.filter(val =>
    typeof val === 'string' && /^\d{5}(-\d{4})?$/.test(val.trim())
  );
  
  if (possibleZipCodes.length > 0) {
    console.log(`[TYPE INFERENCE] Found ${possibleZipCodes.length} values that look like ZIP codes, rejecting as dates`);
    return false;
  }
  
  for (const val of values) {
    let isDate = false;
    
    // Check if it's a Date object
    if (val instanceof Date && !isNaN(val.getTime())) {
        isDate = true;
    // Check for potential Excel date serial numbers (numbers roughly between 1 and 100000 are common)
    // 2958465 corresponds to 9999-12-31 in Excel's 1900 date system
    } else if (typeof val === 'number' && val > 0 && val < 2958466) {
        // Check if it's likely a score/rating instead
        if (val >= 300 && val <= 850 && Number.isInteger(val)) {
             console.log(`[TYPE INFERENCE] Numeric value ${val} looks like a score, not an Excel date.`);
             isDate = false;
        } else {
            console.log(`[TYPE INFERENCE] Potential Excel date serial number detected: ${val}`);
            isDate = true; // Treat as date for now, numeric check will refine later if needed
        }
    } else if (typeof val === 'string') {
      const trimmed = val.trim();
      
      // Skip checking numeric-only strings that could be confused with dates UNLESS they are YYYYMMDD
      if (/^\d+$/.test(trimmed)) {
        // Only accept 8-digit numbers as potential YYYYMMDD dates
        if (trimmed.length === 8) {
          // Try to parse as YYYYMMDD format
          const year = parseInt(trimmed.substring(0, 4));
          const month = parseInt(trimmed.substring(4, 6)) - 1; // 0-based month
          const day = parseInt(trimmed.substring(6, 8));
          
          // Basic sanity check for year range
          if (year >= 1900 && year <= 2100) {
              const parsedDate = new Date(Date.UTC(year, month, day)); // Use UTC to avoid timezone issues
              if (!isNaN(parsedDate.getTime()) &&
                  parsedDate.getUTCFullYear() === year &&
                  parsedDate.getUTCMonth() === month &&
                  parsedDate.getUTCDate() === day) {
                console.log(`[TYPE INFERENCE] Valid YYYYMMDD date detected: "${trimmed}"`);
                isDate = true;
              } else {
                console.log(`[TYPE INFERENCE] Invalid YYYYMMDD format: "${trimmed}"`);
                isDate = false;
              }
          } else {
              console.log(`[TYPE INFERENCE] Numeric string "${trimmed}" rejected as date (year out of range).`);
              isDate = false;
          }
        } else {
          console.log(`[TYPE INFERENCE] Rejecting numeric-only string as date (not YYYYMMDD): "${trimmed}"`);
          isDate = false;
        }
      } else {
        // Check for common date formats (YYYY-MM-DD, MM/DD/YYYY, MM-DD-YYYY)
        // Allow 1 or 2 digits for month/day, 2 or 4 for year in MM/DD/YYYY
        const isCommonFormat =
          /^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed) || // YYYY-MM-DD
          /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(trimmed); // MM/DD/YYYY or MM-DD-YYYY

        if (isCommonFormat) {
          // Further validate it's actually a valid date using Date.parse
          // Date.parse is generally more robust than `new Date(string)` for format variations
          if (!isNaN(Date.parse(trimmed))) {
             // Additional check: ensure it doesn't look like a version number like '1.0.0'
             if (!/^\d+\.\d+\.\d+$/.test(trimmed)) {
                console.log(`[TYPE INFERENCE] Valid common date format detected: "${trimmed}"`);
                isDate = true;
             } else {
                console.log(`[TYPE INFERENCE] String "${trimmed}" looks like version number, rejecting as date.`);
                isDate = false;
             }
          } else {
            console.log(`[TYPE INFERENCE] Invalid date string (Date.parse failed): "${trimmed}"`);
            isDate = false;
          }
        } else {
          // Could add more specific format checks here if needed (e.g., "Jan 1, 2023")
          isDate = false;
        }
      }
    }
    
    if (!isDate) {
      console.log(`[TYPE INFERENCE] Non-date value found: ${typeof val === 'string' ? `"${val}"` : val}`);
      allMatch = false;
      break;
    }
  }
  
  return allMatch;
}

/**
 * Check if all values are numeric or numeric-like strings
 */
function allValuesAreNumeric(values: any[]): boolean {
  let allMatch = true;
  
  // First check if any values look like ZIP codes
  const possibleZipCodes = values.filter(val =>
    typeof val === 'string' && /^\d{5}(-\d{4})?$/.test(val.trim())
  );
  
  if (possibleZipCodes.length > 0) {
    console.log(`[TYPE INFERENCE] Found ${possibleZipCodes.length} values that look like ZIP codes, rejecting as numbers`);
    return false;
  }

  // Check if values might be Excel date serial numbers
  const possibleExcelDates = values.filter(val =>
    typeof val === 'number' && val > 0 && val < 2958466 // Plausible Excel date range
  );

  // If a significant portion are potential Excel dates, reject as purely numeric
  // Adjust threshold as needed (e.g., 0.5 means 50% or more look like Excel dates)
  if (possibleExcelDates.length / values.length > 0.5) {
      console.log(`[TYPE INFERENCE] Found ${possibleExcelDates.length}/${values.length} values that look like Excel dates, rejecting as numbers`);
      return false;
  }
  
  for (const val of values) {
    let isNumeric = false;
    
    if (typeof val === 'number' && isFinite(val)) { // Ensure it's a finite number
      // Explicitly reject numbers that fall into the likely Excel date range, unless they are small integers (like counts)
      if (val > 0 && val < 2958466 && !Number.isInteger(val)) { // Check if it's a potential Excel date serial
         console.log(`[TYPE INFERENCE] Rejecting potential Excel date serial ${val} as purely numeric.`);
         isNumeric = false;
      } else {
         isNumeric = true;
      }
    } else if (typeof val === 'string') {
      const trimmed = val.trim();
      
      // Handle percentage values
      if (trimmed.endsWith('%')) {
        const numPart = trimmed.slice(0, -1).trim();
        if (!isNaN(Number(numPart))) {
          console.log(`[TYPE INFERENCE] Percentage value detected: "${trimmed}"`);
          isNumeric = true;
        }
      } else if (trimmed.includes('|')) {
        // Handle pipe-separated values (common in Excel exports)
        const parts = trimmed.split('|').map(p => p.trim());
        const allPartsNumeric = parts.every(part => {
          // Clean each part and check if it's numeric
          const cleanedPart = part.replace(/[$,€£\s%]/g, '');
          // Ensure it's not empty and is a number
          return cleanedPart.length > 0 && !isNaN(Number(cleanedPart));
        });
        
        if (allPartsNumeric) {
          console.log(`[TYPE INFERENCE] Pipe-separated numeric values detected: "${trimmed}"`);
          isNumeric = true;
        } else {
          isNumeric = false;
        }
      } else {
        // Handle currency and number formats with symbols and separators
        // Allow leading/trailing spaces, currency symbols, commas
        const cleanedVal = trimmed.replace(/^[$\s£€]+|[,\s%]+|[$\s£€%]+$/g, '');
        // Check if the cleaned value is a valid number and not empty
        if (cleanedVal.length > 0 && !isNaN(Number(cleanedVal))) {
          console.log(`[TYPE INFERENCE] Numeric value detected: "${trimmed}" -> "${cleanedVal}"`);
          isNumeric = true;
        }
      }
    }
    
    if (!isNumeric) {
      console.log(`[TYPE INFERENCE] Non-numeric value found: ${typeof val === 'string' ? `"${val}"` : val}`);
      allMatch = false;
      break;
    }
  }
  
  return allMatch;
}