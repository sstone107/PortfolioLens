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
  // Always filter out null/empty values first to ensure we only look at actual data
  const nonNullValues = sampleValues ? 
    sampleValues.filter(val => val !== null && val !== undefined && val !== '') : 
    [];
  
  // Log non-null sample values (up to 5) for debugging
  if (nonNullValues && nonNullValues.length > 0) {
    const sampleToLog = nonNullValues.slice(0, 5).map(v =>
      typeof v === 'string' ? `"${v}"` :
      String(v)
    ).join(' | ');
  }

  // Check if we have enough sample data to make a good determination (at least 5 non-null samples)
  // Will be used later to determine whether to prioritize data patterns over field name
  
  // PRIORITY 1: Handle empty fields with field name
  if (nonNullValues.length === 0) {
    // For fields with no sample data, we must be more thorough in field name inference
    // This is critical to ensure emptdy data sets are still mappable
    if (fieldName) {
      console.log(`[INFO] No sample data for field: "${fieldName}", inferring type from name`);
      // First try specific rules, then fallback to generic inference
      // Perform more aggressive pattern matching for field names when no data exists
      
      // Use "lowerName" for all regexes to avoid repetition and improve consistency
      const lowerName = fieldName.toLowerCase();
      
      // SPECIFIC ID FIELDS: Always strings regardless of content
      if (
        // Loan identifiers are always strings
        /\b(loan[\s_-]?id|servicer[\s_-]?loan[\s_-]?id|investor[\s_-]?loan[\s_-]?id|valon[\s_-]?loan[\s_-]?id)\b/i.test(lowerName) ||
        // MERS ID is always a string
        /\b(mers[\s_-]?id|mers[\s_-]?number|mers[\s_-]?min)\b/i.test(lowerName) ||
        // Case numbers are strings
        /\b(case[\s_-]?number|fha[\s_-]?(case|number)|va[\s_-]?(case|number))\b/i.test(lowerName) ||
        // Payment history codes are strings
        /\b(pay[\s_-]?history|payment[\s_-]?history|delinquency[\s_-]?history)\b/i.test(lowerName) ||
        // Pool numbers are strings
        /\b(pool[\s_-]?number|pool[\s_-]?id)\b/i.test(lowerName) ||
        // Any field with "ID" should generally be a string
        /\b(id$|_id$|id_|identifier)\b/i.test(lowerName) ||
        // Phone, SSN, etc. are all strings
        /\b(phone|ssn|ein|tax|zip|postal|code|address|city|state|county)\b/i.test(lowerName)
      ) {
        console.log(`[INFO] Empty field "${fieldName}" detected as STRING based on name pattern`);
        return 'string';
      }
      
      // DATE FIELDS: Fields likely to contain dates
      if (
        /\b(date|dt|time|created|modified|updated|birth|dob|discharge|dismissal|filed|bankruptcy|maturity)\b/i.test(lowerName) &&
        !/\b(rating|ratio|update|mandate)\b/i.test(lowerName)
      ) {
        console.log(`[INFO] Empty field "${fieldName}" detected as DATE based on name pattern`);
        return 'date';
      }
      
      // NUMBER FIELDS: Fields likely to contain numeric values
      if (
        // Core financial metrics
        /\b(upb|dti|debt[\s_-]?to[\s_-]?income|p&i|principal[\s_-]?and[\s_-]?interest|rate|margin|apr|apy)\b/i.test(lowerName) ||
        // Time units as numbers
        /\b(month$|months$|time[\s_-]?unit)\b/i.test(lowerName) ||
        // Common numeric fields
        /\b(count|number|num|qty|amount|amt|balance|bal|price|fee|cost|percent|pct|ratio|score|fico|units|ltv)\b/i.test(lowerName) ||
        // Financial terms
        /\b(payment|principal|interest|term|credit|lien|limit|total|sum|avg|median|min|max)\b/i.test(lowerName)
      ) {
        console.log(`[INFO] Empty field "${fieldName}" detected as NUMBER based on name pattern`);
        return 'number';
      }
      
      // BOOLEAN FIELDS: Fields likely to contain true/false values
      if (
        /\b(flag|indicator|is[\s_-]|has[\s_-]|required|enabled|active|escrowed)\b/i.test(lowerName) ||
        /_flag$|_ind$|_indicator$|_yn$|_tf$/i.test(lowerName)
      ) {
        console.log(`[INFO] Empty field "${fieldName}" detected as BOOLEAN based on name pattern`);
        return 'boolean';
      }
    }
    
    // Fallback to the existing generic inference function
    const nameBasedType = inferTypeFromFieldName(fieldName);
    console.log(`[INFO] Empty field "${fieldName}" using generic name inference: ${nameBasedType}`);
    return nameBasedType;
  }
  
  // PRIORITY 1.5: Specific field names that ALWAYS override data content regardless of sample size
  // These critical rules apply regardless of the actual data, even when we have samples
  if (fieldName) {
    const lowerName = fieldName.toLowerCase();
    
    // SPECIFIC ID FIELDS - Always strings regardless of content
    if (
      // Loan identifiers are always strings
      /\b(loan[\s_-]?id|servicer[\s_-]?loan[\s_-]?id|investor[\s_-]?loan[\s_-]?id|valon[\s_-]?loan[\s_-]?id)\b/i.test(lowerName) ||
      // MERS ID is always a string
      /\b(mers[\s_-]?id|mers[\s_-]?number|mers[\s_-]?min)\b/i.test(lowerName) ||
      // Case numbers are strings
      /\b(case[\s_-]?number|fha[\s_-]?(case|number)|va[\s_-]?(case|number))\b/i.test(lowerName) ||
      // Payment history codes are strings
      /\b(pay[\s_-]?history|payment[\s_-]?history|delinquency[\s_-]?history)\b/i.test(lowerName) ||
      // Pool numbers are strings
      /\b(pool[\s_-]?number|pool[\s_-]?id)\b/i.test(lowerName)
    ) {
      return 'string';
    }
    
    // SPECIFIC NUMERIC FIELDS - Always numbers regardless of data
    if (
      // Core financial metrics
      /\b(upb|dti|debt[\s_-]?to[\s_-]?income|p&i|principal[\s_-]?and[\s_-]?interest|rate|margin|apr|apy)\b/i.test(lowerName) ||
      // Time units as numbers
      /\b(month$|months$|time[\s_-]?unit)\b/i.test(lowerName)
    ) {
      return 'number';
    }
  }

  // Define sufficient samples threshold (at least 5 non-null values)
  const hasSufficientSamples = nonNullValues.length >= 5;
  
  if (hasSufficientSamples) {
    // WITH SUFFICIENT SAMPLES: Prioritize data patterns over field names
    
    // PRIORITY 2: Check for special string formats first (ZIP, phone, etc.)
    if (hasSpecialStringFormat(nonNullValues)) {
      return 'string';
    }
    
    // PRIORITY 3: Check for boolean values
    if (allValuesAreBoolean(nonNullValues)) {
      return 'boolean';
    }
    
    // PRIORITY 4: Check for date values
    if (allValuesAreDates(nonNullValues)) {
      return 'date';
    }
    
    // PRIORITY 5: Check for numeric values (including currency, percentages)
    if (allValuesAreNumeric(nonNullValues)) {
      return 'number';
    }
    
    // PRIORITY 6: Check for predominantly numeric values
    let numericCount = 0;
    for (const val of nonNullValues) {
      // Count values that are likely numeric
      if (typeof val === 'number') {
        numericCount++;
      } else if (typeof val === 'string') {
        const cleaned = val.trim().replace(/[$,\s%()]/g, '');
        if (cleaned && !isNaN(Number(cleaned))) {
          numericCount++;
        }
      }
    }
    
    // If over 75% of values appear to be numeric, treat as number
    const numericRatio = numericCount / nonNullValues.length;
    if (numericRatio >= 0.75) {
      return 'number';
    }
    
    // Only use field name as a last resort with sufficient samples
    if (fieldName) {
      // Special case for score/FICO fields
      if (/\b(score|fico|rating)\b/i.test(fieldName)) {
        return 'number';
      }
      
      // Special case for ZIP codes
      if (/\b(zip|postal|zipcode)\b/i.test(fieldName)) {
        return 'string';
      }
    }
  } else {
    // WITH INSUFFICIENT SAMPLES: Use field name hints with data patterns
    
    // PRIORITY 2: Check for special string formats
    if (hasSpecialStringFormat(nonNullValues)) {
      return 'string';
    }
    
    // PRIORITY 3: Check for boolean values (TRUE/FALSE, Yes/No, etc.)
    if (allValuesAreBoolean(nonNullValues)) {
      return 'boolean';
    }
    
    // PRIORITY 4: Use field name for hints with low sample count
    if (fieldName) {
      // ZIP code field name detection
      if (/\b(zip|postal|zipcode)\b/i.test(fieldName)) {
        return 'string';
      }
      
      // Score/FICO field detection - these are numbers, not dates
      if (/\b(score|fico|rating)\b/i.test(fieldName)) {
        return 'number';
      }
      
      // Boolean fields - need clear boolean name indicators
      if (/\b(flag|indicator|is[\s_-]active|has[\s_-]permission)\b/i.test(fieldName)) {
        // Extra check: make sure 0/1 values are not treated as boolean
        const hasZeroOne = nonNullValues.some(val => val === 0 || val === 1 || val === '0' || val === '1');
        const hasTrueFalse = nonNullValues.some(val => 
          val === true || val === false || 
          (typeof val === 'string' && (val.toLowerCase() === 'true' || val.toLowerCase() === 'false'))
        );
        
        // Only return boolean if we have true/false values, not just 0/1
        if (hasTrueFalse || !hasZeroOne) {
          return 'boolean';
        }
      }
    }
    
    // PRIORITY 5: Check for date values
    if (allValuesAreDates(nonNullValues)) {
      return 'date';
    }
    
    // PRIORITY 6: Check for numeric values (including currency, percentages)
    if (allValuesAreNumeric(nonNullValues)) {
      return 'number';
    }
    
    // PRIORITY 7: Fall back to field name
    const nameBasedType = inferTypeFromFieldName(fieldName);
    if (nameBasedType !== 'string') {
      return nameBasedType;
    }
  }

  // PRIORITY 8: Default to string for anything else
 return 'string';
}

/**
 * Helper function to infer type from field name only
 */
function inferTypeFromFieldName(fieldName?: string): ColumnType {
  if (!fieldName) {
    return 'string';
  }
  
  // Convert to lowercase for case-insensitive matching
  const lowerName = fieldName.toLowerCase();

  // Fields that should always be strings regardless of content
  if (
    // Loan identifiers should always be strings
    /\b(loan[\s_-]?id|servicer[\s_-]?loan[\s_-]?id|investor[\s_-]?loan[\s_-]?id|valon[\s_-]?loan[\s_-]?id)\b/i.test(lowerName) ||
    // MERS ID should always be a string
    /\b(mers[\s_-]?id|mers[\s_-]?number|mers[\s_-]?min)\b/i.test(lowerName) ||
    // Case numbers should be strings
    /\b(case[\s_-]?number|fha[\s_-]?(case|number)|va[\s_-]?(case|number))\b/i.test(lowerName) ||
    // Payment history codes are strings
    /\b(pay[\s_-]?history|payment[\s_-]?history|delinquency[\s_-]?history)\b/i.test(lowerName) ||
    // Pool numbers are strings
    /\b(pool[\s_-]?number|pool[\s_-]?id)\b/i.test(lowerName) ||
    // Any field with "ID" in the name should generally be a string
    /\b(id$|_id$|id_|identifier)\b/i.test(lowerName)
  ) {
    return 'string';
  }

  // Date field detection - expanded to include more date-related terms
  if (/\b(date|dt|day|month|year|time|created|modified|updated|birth|dob|discharge|dismissal|filed|bankruptcy|mfr|maturity)\b/i.test(lowerName)) {
    // Exclude terms that contain "date" but aren't actually dates
    if (!/\b(rating|ratio|update|mandate)\b/i.test(lowerName)) {
      return 'date';
    }
  }
  
  // Fields that should always be numbers regardless of content
  if (
    // Specific financial fields that should always be numbers
    /\b(upb|dti|debt[\s_-]?to[\s_-]?income|p&i|principal[\s_-]?and[\s_-]?interest|rate|margin)\b/i.test(lowerName) ||
    // Time periods as numbers
    /\b(month$|months$|time[\s_-]?unit|duration[\s_-]?months)\b/i.test(lowerName)
  ) {
    return 'number';
  }
  
  // Enhanced number field detection with more financial and loan-specific terms
  if (
    // Common numeric field terms
    /\b(count|number|num|qty|amount|amt|balance|bal|price|fee|cost|percent|pct|ratio|score|fico|units|ltv)\b/i.test(lowerName) ||
    // Financial and loan-specific numeric fields that aren't IDs
    /\b(principal|interest|payment|pmt|term|age|credit|lien|limit|total|sum|avg|median|min|max)\b/i.test(lowerName) ||
    // Time periods that should be numeric (not dates)
    /\b(period|term|frequency|duration|interval|years|days|hours)\b/i.test(lowerName) ||
    // Common numeric suffixes
    /_pct$|_amt$|_num$|_count$|_score$|_rate$|_ratio$|_balance$|_payment$/i.test(lowerName) ||
    // APR and interest terms
    /\b(apr|apy|interest|rate|yield)\b/i.test(lowerName)
  ) {
    // Exclude date-specific "days" like "day of month" and ID fields
    if (!/\b(day of month|day of week|id$|_id$)\b/i.test(lowerName)) {
      return 'number';
    }
  }
  
  // Boolean field detection - Limit strictly to true/false fields
  // Don't treat 0/1 as boolean by default
  if (
    // Explicit boolean indicators
    /\b(flag|indicator|is[\s_-]|has[\s_-]|required|enabled|active|escrowed)\b/i.test(lowerName) ||
    // Common boolean field suffixes
    /_flag$|_ind$|_indicator$|_yn$|_tf$/i.test(lowerName)
  ) {
    return 'boolean';
  }

  // Default to string for anything else
  return 'string';
}

/**
 * Check if values have special string formats that should not be treated as other types
 */
function hasSpecialStringFormat(values: any[]): boolean {
  // Filter out null/empty values
  const validValues = values.filter(val => val !== null && val !== undefined && val !== '');
  if (validValues.length === 0) return false;
  
  // Check the first few valid values (up to 10)
  const sampleSize = Math.min(validValues.length, 10);
  const samples = validValues.slice(0, sampleSize);
  
  for (const val of samples) {
    if (typeof val !== 'string') continue;
    
    const trimmed = val.trim();
    if (trimmed === '') continue;
    
    // Check for ZIP codes
    if (/^\d{5}(-\d{4})?$/.test(trimmed)) {
      return true;
    }
    
    // Check for phone numbers
    if (/^(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(trimmed)) {
      return true;
    }
    
    // Check for IDs with leading zeros
    if (/^0\d+$/.test(trimmed)) {
      return true;
    }
    
    // Check for SSN format
    if (/^\d{3}-\d{2}-\d{4}$/.test(trimmed)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if all values are boolean or boolean-like
 */
function allValuesAreBoolean(values: any[]): boolean {
  // Filter out null/empty values first
  const validValues = values.filter(val => val !== null && val !== undefined && val !== '');
  if (validValues.length === 0) return false;
  
  // Expanded list of boolean values
  const booleanValues = ['true', 'false', 'yes', 'no', 'y', 'n', 't', 'f', 'on', 'off'];
  
  // Count how many values match boolean patterns
  let booleanCount = 0;
  const totalValues = validValues.length;
  
  for (const val of validValues) {
    let isBoolean = false;
    
    if (typeof val === 'boolean') {
      isBoolean = true;
    } else if (typeof val === 'string') {
      const normalizedVal = val.toLowerCase().trim();
      if (normalizedVal === '') continue;
      
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
    }
  }
  
  // Calculate what percentage of values are boolean
  const booleanRatio = booleanCount / totalValues;
  
  // Require at least 90% of values to be boolean-like, allowing for some outliers
  return booleanRatio >= 0.9;
}

/**
 * Check if all values are dates or date-like strings
 */
function allValuesAreDates(values: any[]): boolean {
  // Filter out null/empty values
  const validValues = values.filter(val => val !== null && val !== undefined && val !== '');
  if (validValues.length === 0) return false;
  
  // First check if any values look like scores, ratings, or FICO scores
  const possibleScores = validValues.filter(val => {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed === '') return false;
      
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
    return false;
  }
  
  // Check for ZIP codes in the values
  const possibleZipCodes = validValues.filter(val =>
    typeof val === 'string' && /^\d{5}(-\d{4})?$/.test(val.trim())
  );
  
  if (possibleZipCodes.length > 0) {
    return false;
  }
  
  // Count how many values match date patterns
  let dateCount = 0;
  const totalValues = validValues.length;
  
  for (const val of validValues) {
    let isDate = false;
    
    // Skip null/undefined/empty values 
    if (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) {
      continue;
    }
    
    // Check if it's a Date object
    if (val instanceof Date && !isNaN(val.getTime())) {
      isDate = true;
    // Check for potential Excel date serial numbers (numbers roughly between 1 and 100000 are common)
    // 2958465 corresponds to 9999-12-31 in Excel's 1900 date system
    } else if (typeof val === 'number' && val > 0 && val < 2958466) {
      // Check if it's likely a score/rating instead
      if (val >= 300 && val <= 850 && Number.isInteger(val)) {
        isDate = false;
      } else {
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
              isDate = true;
            } else {
              isDate = false;
            }
          } else {
            isDate = false;
          }
        } else {
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
              isDate = true;
            } else {
              isDate = false;
            }
          } else {
            isDate = false;
          }
        } else {
          // Could add more specific format checks here if needed (e.g., "Jan 1, 2023")
          isDate = false;
        }
      }
    }
    
    if (isDate) {
      dateCount++;
    }
  }
  
  // If at least 90% of non-null values are dates, consider it a date column
  const dateRatio = dateCount / totalValues;
  return dateRatio >= 0.9;
}

/**
 * Check if all values are numeric or numeric-like strings
 */
function allValuesAreNumeric(values: any[]): boolean {
  // If we have no values, we can't determine if they are numeric
  if (!values || values.length === 0) return false;
  
  // Skip null/empty values when checking
  const nonNullValues = values.filter(val => val !== null && val !== undefined && val !== '');
  if (nonNullValues.length === 0) return false;
  
  // First check if any values look like ZIP codes
  const possibleZipCodes = nonNullValues.filter(val =>
    typeof val === 'string' && /^\d{5}(-\d{4})?$/.test(val.trim())
  );
  
  if (possibleZipCodes.length > 0) {
    return false;
  }

  // Count how many values match numeric patterns
  let numericCount = 0;
  const totalValues = nonNullValues.length;
  
  for (const val of nonNullValues) {
    let isNumeric = false;
    
    if (typeof val === 'number' && isFinite(val)) { 
      // Actual numeric values are automatically considered numeric
      // Explicitly reject numbers that fall into the likely Excel date range, unless they are small integers
      if (val > 0 && val < 2958466 && !Number.isInteger(val)) {
        // Potential Excel date serial number
        isNumeric = false;
      } else {
        isNumeric = true;
      }
    } else if (typeof val === 'string') {
      const trimmed = val.trim();
      
      // Skip empty strings
      if (trimmed === '') continue;
      
      // Handle percentage values
      if (trimmed.endsWith('%')) {
        const numPart = trimmed.slice(0, -1).trim();
        if (!isNaN(Number(numPart))) {
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
          isNumeric = true;
        }
      } else {
        // Handle currency and number formats with symbols and separators
        // Allow leading/trailing spaces, currency symbols, commas, parentheses (for negative)
        let cleanedVal = trimmed;
        
        // Handle parentheses for negative numbers like (123.45)
        if (cleanedVal.startsWith('(') && cleanedVal.endsWith(')')) {
          cleanedVal = '-' + cleanedVal.substring(1, cleanedVal.length - 1);
        }
        
        // Replace commas, currency symbols, etc.
        cleanedVal = cleanedVal.replace(/^[$\s£€]+|[,\s%]+|[$\s£€%]+$/g, '');
        
        // Check if the cleaned value is a valid number and not empty
        if (cleanedVal.length > 0 && !isNaN(Number(cleanedVal))) {
          isNumeric = true;
        }
      }
    }
    
    if (isNumeric) {
      numericCount++;
    }
  }
  
  // Calculate what percentage of values are numeric
  const numericRatio = numericCount / totalValues;
  
  // If at least 90% of values are numeric, consider the column numeric
  // This allows for some outliers or errors in the data while still correctly
  // identifying predominantly numeric columns
  return numericRatio >= 0.9;
}