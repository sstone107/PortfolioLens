/**
 * Data type inference utilities for Excel imports
 * Provides functions for detecting data types from column headers and sample data
 */

import { normalizeString } from './utils/stringUtils';

// Available Supabase data types
export type SupabaseDataType =
  | 'text'
  | 'numeric'
  | 'integer' // Kept for backwards compatibility but not used in new mappings
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'timestamp without time zone'
  | 'timestamp with time zone'
  | 'uuid';

// Type inference result
export interface TypeInferenceResult {
  type: SupabaseDataType;
  confidence: number;
  pattern?: string;
}

// Fallback column types by category
interface TypeCategories {
  [key: string]: {
    category: SupabaseDataType;
    terms: string[];
    weight: number;
  }
}

/**
 * Dictionary for header-based type inference fallbacks
 * Maps common column name patterns to Supabase data types
 */
export const TYPE_CATEGORIES: TypeCategories = {
  // Text type patterns
  textIdentifiers: {
    category: 'text',
    terms: ['id', 'code', 'key', 'abbr', 'abbreviation', 'reference', 'ref'],
    weight: 80
  },
  textDescriptions: {
    category: 'text',
    terms: ['name', 'description', 'desc', 'title', 'label', 'comment', 'note', 'notes', 'reason', 'type'],
    weight: 85
  },
  textStatus: {
    category: 'text',
    terms: ['status', 'state', 'category', 'classification', 'class', 'group'],
    weight: 85  
  },
  textAddresses: {
    category: 'text',
    terms: ['address', 'street', 'city', 'state', 'country', 'zip', 'postal', 'code'],
    weight: 90
  },
  
  // Numeric type patterns
  numericAmounts: {
    category: 'numeric',
    terms: ['amount', 'total', 'sum', 'balance', 'payment', 'price', 'cost', 'fee', 'rate', 'percent', 'percentage'],
    weight: 90
  },
  numericRatios: {
    category: 'numeric',
    terms: ['ratio', 'ltv', 'dti', 'cltv', 'margin', 'spread', 'multiplier'],
    weight: 85
  },
  numericMetrics: {
    category: 'numeric',
    terms: ['score', 'rating', 'grade', 'value', 'measure', 'weight', 'length', 'size', 'height', 'width', 'depth'],
    weight: 80
  },
  
  // Integer type patterns
  integerCounts: {
    category: 'numeric',
    terms: ['count', 'number', 'num', 'quantity', 'qty', 'frequency', 'occurrences', 'times', 'iterations', 'units', 'day', 'days', 'dpd', 'installments'],
    weight: 90  // Increased weight from 85 to 90 to match mortgage domain
  },
  integerSequence: {
    category: 'numeric',
    terms: ['sequence', 'seq', 'order', 'rank', 'position', 'index', 'priority'],
    weight: 80
  },
  integerAge: {
    category: 'numeric',
    terms: ['age', 'days', 'months', 'years', 'dpd', 'term', 'duration', 'frequency', 'periods', 'cycles'],
    weight: 95  // Increased from 90 to 95 to outweigh date detection
  },
  
  // Boolean type patterns
  booleanFlags: {
    category: 'boolean',
    terms: ['is_', 'has_', 'can_', 'flag', 'enabled', 'active', 'valid', 'eligible', 'required', 'verified', 'approved'],
    weight: 90
  },
  
  // Date type patterns
  dateFields: {
    category: 'date',
    terms: ['date', 'due_date', 'start_date', 'end_date', 'effective_date', 'maturity_date', 'close_date', 'sign_date'],
    weight: 85  // Reduced from 95 to 85 to prevent overriding integers
  },
  dateLoan: {
    category: 'date',
    terms: ['origination_date', 'closing_date', 'maturity', 'funding_date', 'first_payment_date', 'last_payment_date', 'next_payment_date'],
    weight: 85  // Reduced from 95 to 85 to prevent overriding integers
  },
  
  // Timestamp type patterns
  timestampFields: {
    category: 'timestamp',
    terms: ['created_at', 'updated_at', 'timestamp', 'datetime', 'time', 'modified_at', 'deleted_at', 'logged_at'],
    weight: 90  // Reduced from 95 to be more balanced
  },
  
  // UUID type patterns
  uuidFields: {
    category: 'uuid',
    terms: ['uuid', 'guid', 'id', 'sid', 'entity_id', 'unique_id'],
    weight: 70
  },
};

/**
 * Detect if a string value is likely a boolean
 */
export const isLikelyBoolean = (value: string): boolean => {
  const normalized = value.toLowerCase().trim();
  return ['true', 'false', 'yes', 'no', 'y', 'n', '0', '1', 't', 'f'].includes(normalized);
};

/**
 * Detect if a string value is likely a date
 */
export const isLikelyDate = (value: string): boolean => {
  // Skip small integers that might be misinterpreted as dates
  // Reject single and double-digit values as standalone dates (0-99)
  if (/^([0-9]|[1-9][0-9])$/.test(value.trim())) {
    return false; // Single or double digit numbers are not dates
  }
  
  // Check for ISO format date: YYYY-MM-DD
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (isoDatePattern.test(value)) {
    // Validate components are reasonable
    const parts = value.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const day = parseInt(parts[2]);
    
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return true;
    }
  }
  
  // Basic date pattern check for common formats WITH separators
  // Require date format separators (/, -, .) for positive detection
  const datePattern = /^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}$/;
  
  if (datePattern.test(value)) {
    // Additional validation for common date patterns
    const parts = value.split(/[-.\/]/);
    
    // Further validation for dates - check if this might be a loan term like "30/360" (day count convention)
    if (parts.length === 3) {
      // Check if this might be a loan term like "30/360" (day count convention)
      if (parts[0].length <= 2 && parts[1].length <= 3 && 
          parseInt(parts[0]) <= 31 && parseInt(parts[1]) >= 360) {
        return false; // This is likely a day count convention, not a date
      }
      
      // Further validate dates by checking for reasonable values
      const maxValues = [31, 12, 9999]; // Day, month, year max values
      
      // Check if any part exceeds maximum expected values for dates
      const isInvalidDate = parts.some((part, index) => {
        const value = parseInt(part);
        return value > maxValues[index % 3]; // Cycle through max values
      });
      
      if (isInvalidDate) {
        return false;
      }
    }
    
    return true;
  }
  
  // Try parsing as date with additional validation
  const parsedDate = new Date(value);
  if (!isNaN(parsedDate.getTime())) {
    // Additional check: if the value is numeric and small, it might be
    // misinterpreted as a timestamp (days since epoch) 
    if (/^\d+$/.test(value.trim()) && parseInt(value.trim()) < 10000) {
      return false; // Small integers shouldn't be treated as dates
    }
    
    // Only accept as date if it contains separators or has proper date format
    return /[-./]/.test(value) || /^\d{4}\d{2}\d{2}$/.test(value);
  }
  
  return false;
};

/**
 * Detect if a string value is likely a timestamp (date + time)
 */
export const isLikelyTimestamp = (value: string): boolean => {
  // Date + time component check
  const timestampPattern = /^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}[T ]\d{1,2}:\d{1,2}/;
  
  if (timestampPattern.test(value)) return true;
  
  // ISO timestamp check
  const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  
  return isoPattern.test(value);
};

/**
 * Detect if a string value is likely a UUID
 */
export const isLikelyUuid = (value: string): boolean => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(value);
};

/**
 * Detect if a string value is likely an integer
 */
export const isLikelyInteger = (value: string): boolean => {
  // Strip commas for thousands separators
  const normalized = value.replace(/,/g, '');
  const intPattern = /^-?\d+$/;
  
  // Check if the value might be a UUID (prevent false positives)
  if (isLikelyUuid(normalized)) {
    return false;
  }
  
  // Check if it might be an all-digit date like YYYYMMDD
  if (/^\d{8}$/.test(normalized)) {
    // Try to parse as a date in YYYYMMDD format
    const year = parseInt(normalized.substring(0, 4));
    const month = parseInt(normalized.substring(4, 6)) - 1; // JS months are 0-based
    const day = parseInt(normalized.substring(6, 8));
    
    const date = new Date(year, month, day);
    // If this parses to a valid date where components match the input, it's likely a date not an integer
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
      return false;
    }
  }
  
  return intPattern.test(normalized);
};

/**
 * Detect if a string value is likely a numeric (decimal) value
 */
export const isLikelyNumeric = (value: string): boolean => {
  // Handle both US and European number formats
  const usFormat = value.replace(/,/g, '');
  const euroFormat = value.replace(/\./g, '').replace(',', '.');
  
  const numericPattern = /^-?\d*\.?\d+$/;
  
  return numericPattern.test(usFormat) || numericPattern.test(euroFormat);
};

/**
 * Analyze field name patterns to help with data type inference
 * NEW: Improved pattern-based type detection for field names
 */
export const analyzeFieldNamePattern = (fieldName: string): TypeInferenceResult | null => {
  if (!fieldName) return null;
  
  const normalized = normalizeString(fieldName);
  
  // Patterns that strongly indicate numeric type (formerly integer)
  const numericPatterns = [
    /\bnumber\s*of\b/i,
    /\bcount\b/i,
    /\b(?:qty|quantity)\b/i,
    /\bunits?\b/i,
    /\bday[s]?\b/i,
    /\b(?:dpd|delinquent)\b/i,
    /\binstallment[s]?\b/i,
    /\bterm\b/i,
    /\b(?:month|year)s?\b/i,
    /\bage\b/i,
    /\bfreq(?:uency)?\b/i,
    /\bnum(?:ber)?\b/i,
    /\d+[\s_-]?dpd\b/i  // Match patterns like "30_dpd", "60 dpd", etc.
  ];
  
  // Patterns that suggest date type
  const datePatterns = [
    /\bdate\b/i,
    /\bstart(?:ed)?\b/i,
    /\bend(?:ed)?\b/i,
    /\bexpir(?:ation|ed|y)?\b/i,
    /\beffective\b/i,
    /\bcreated\b/i,
    /\bmodified\b/i,
    /\bmaturity\b/i,
    /\bclosing\b/i
  ];
  
  // Check for numeric pattern matches with specific confidence levels
  for (const pattern of numericPatterns) {
    if (pattern.test(normalized)) {
      return {
        type: 'numeric',
        confidence: 95,  // High confidence for numeric patterns
        pattern: `Field name matches numeric pattern: ${pattern}`
      };
    }
  }
  
  // Check for date pattern matches with lower confidence
  for (const pattern of datePatterns) {
    if (pattern.test(normalized)) {
      return {
        type: 'date',
        confidence: 85,  // Lower confidence for date patterns
        pattern: `Field name matches date pattern: ${pattern}`
      };
    }
  }
  
  return null;
};

/**
 * NEW: Detect value distribution patterns for better type inference
 * This is crucial for identifying fields with small integers that should never be dates
 */
export const detectValuePatterns = (samples: unknown[]): {
  allSingleDigits: boolean;
  allDoubleDigits: boolean;
  allDay1to31: boolean;
  allSmallIntegers: boolean;
  allNumericMix: boolean; // New pattern for mixed integer/decimal/null data
  hasNulls: boolean;
  hasMixedNumericTypes: boolean;
  uniformValues: boolean;
  uniqueValuesCount: number;
} => {
  // Store original samples for null checking
  const hasNulls = samples.some(s => s === null || s === undefined || s === '');
  
  // Filter out nulls for main analysis
  const validValues = samples
    .filter(s => s !== null && s !== undefined && s !== '')
    .map(s => String(s).trim());
  
  if (validValues.length === 0) {
    return {
      allSingleDigits: false,
      allDoubleDigits: false,
      allDay1to31: false,
      allSmallIntegers: false,
      allNumericMix: false,
      hasNulls: hasNulls,
      hasMixedNumericTypes: false,
      uniformValues: false,
      uniqueValuesCount: 0
    };
  }
  
  // Check various patterns
  const allSingleDigits = validValues.every(s => /^[0-9]$/.test(s));
  const allDoubleDigits = validValues.every(s => /^([0-9]|[1-9][0-9])$/.test(s));
  const allDay1to31 = validValues.every(s => {
    const num = parseInt(s);
    return !isNaN(num) && num >= 1 && num <= 31;
  });
  const allSmallIntegers = validValues.every(s => {
    const num = parseInt(s);
    return !isNaN(num) && num >= 0 && num < 1000;
  });
  
  // New pattern detection for mixed numeric values
  const allNumeric = validValues.every(s => {
    // Check for numeric patterns with or without decimal point
    return /^-?\d+(\.\d+)?$/.test(s);
  });
  
  // Check if we have a mix of integers and decimals
  const hasIntegers = validValues.some(s => /^-?\d+$/.test(s));
  const hasDecimals = validValues.some(s => /^-?\d+\.\d+$/.test(s));
  const hasMixedNumericTypes = hasIntegers && hasDecimals;
  
  // Combined check for a mix of numeric values (integers, decimals) with potential nulls
  const allNumericMix = allNumeric;
  
  const uniqueValues = new Set(validValues);
  const uniformValues = uniqueValues.size === 1;
  
  return {
    allSingleDigits,
    allDoubleDigits,
    allDay1to31,
    allSmallIntegers,
    allNumericMix,
    hasNulls,
    hasMixedNumericTypes,
    uniformValues,
    uniqueValuesCount: uniqueValues.size
  };
};

/**
 * Infer the data type from a column header name using fallback mapping
 */
export const inferTypeFromColumnHeader = (columnName: string): TypeInferenceResult[] => {
  if (!columnName) {
    return [{ type: 'text', confidence: 100 }];
  }
  
  const normalized = normalizeString(columnName);
  
  // First check the pattern-based analysis (faster and more accurate for known patterns)
  const patternMatch = analyzeFieldNamePattern(columnName);
  
  if (patternMatch && patternMatch.confidence >= 90) {
    // If we have a high-confidence pattern match, prioritize it
    return [patternMatch];
  }
  
  // Map to hold all potential matches with confidence scores
  const matches: { type: SupabaseDataType; confidence: number }[] = [];
  
  // Check column name against each category
  Object.values(TYPE_CATEGORIES).forEach(category => {
    let highestMatch = 0;
    
    // Check if any category term matches the column name
    category.terms.forEach(term => {
      // Exact match
      if (normalized === term) {
        highestMatch = 100;
      }
      // Contains term as a word
      else if (new RegExp(`\\b${term}\\b`).test(normalized)) {
        highestMatch = Math.max(highestMatch, category.weight + 10);
      }
      // Contains term as a substring
      else if (normalized.includes(term)) {
        highestMatch = Math.max(highestMatch, category.weight);
      }
      // Starts with term
      else if (normalized.startsWith(term)) {
        highestMatch = Math.max(highestMatch, category.weight + 5);
      }
      // Ends with term
      else if (normalized.endsWith(term)) {
        highestMatch = Math.max(highestMatch, category.weight + 3);
      }
    });
    
    // If there was a match, add it to results
    if (highestMatch > 0) {
      matches.push({
        type: category.category,
        confidence: highestMatch
      });
    }
  });
  
  // If we have a pattern match but it wasn't high confidence, add it to our results now
  if (patternMatch) {
    matches.push(patternMatch);
  }
  
  // UUID fields need special handling - only suggest for ID fields
  if (normalized.endsWith('_id') && matches.some(m => m.type === 'uuid')) {
    // Boost UUID confidence for fields ending with _id
    matches.forEach(match => {
      if (match.type === 'uuid') {
        match.confidence = Math.min(90, match.confidence + 15);
      }
    });
  }
  
  // Add text as a fallback with low confidence if no matches
  if (matches.length === 0) {
    matches.push({ type: 'text', confidence: 60 });
  }
  
  // Sort by confidence descending
  return matches.sort((a, b) => b.confidence - a.confidence);
};

/**
 * Infer data type from a sample of values
 * @param samples Array of sample values
 * @returns The inferred data type with confidence score
 */
export const inferTypeFromSamples = (samples: unknown[]): TypeInferenceResult => {
  // Check debug mode
  const isDebugMode = DEBUG_DATA_TYPES.enabled || (typeof window !== 'undefined' && window.__debugDataTypes);
  
  // Filter out nulls, undefined and empty strings
  const validSamples = samples.filter(s => s !== null && s !== undefined && s !== '');
  
  if (validSamples.length === 0) {
    return { type: 'text', confidence: 100 };
  }
  
  // Check value patterns - CRUCIAL for fixing date vs integer confusion
  const valuePatterns = detectValuePatterns(validSamples);
  
  // Early pattern detection for small integers - map them to numeric as requested
  if (valuePatterns.allSingleDigits) {
    return { 
      type: 'numeric', 
      confidence: 98,
      pattern: 'Single digit values (0-9)'
    };
  }
  
  if (valuePatterns.allDoubleDigits) {
    return { 
      type: 'numeric', 
      confidence: 95, 
      pattern: 'Small integer values (0-99)'
    };
  }
  
  if (valuePatterns.allDay1to31) {
    return { 
      type: 'numeric', 
      confidence: 92,
      pattern: 'Day number values (1-31)'
    };
  }
  
  // New pattern detection for mixed numeric values with nulls
  if (valuePatterns.allNumericMix) {
    // Higher confidence for mixed numeric values
    return { 
      type: 'numeric', 
      confidence: valuePatterns.hasMixedNumericTypes ? 98 : 95,
      pattern: valuePatterns.hasNulls 
        ? 'Mix of numeric values and nulls' 
        : (valuePatterns.hasMixedNumericTypes 
            ? 'Mix of integers and decimals' 
            : 'Numeric values')
    };
  }
  
  // Count types
  let uuidCount = 0;
  let dateCount = 0;
  let timestampCount = 0;
  let booleanCount = 0;
  let integerCount = 0;
  let numericCount = 0;
  let textCount = 0;
  
  
  // Track specific detection patterns for logging
  const detectionPatterns: {
    uuid: string[];
    timestamp: string[];
    date: string[];
    boolean: string[];
    integer: string[];
    numeric: string[];
    text: string[];
  } = {
    uuid: [],
    timestamp: [],
    date: [],
    boolean: [],
    integer: [],
    numeric: [],
    text: []
  };
  
  // Check each sample
  validSamples.forEach(sample => {
    const str = String(sample).trim();
    
    // Store diagnostics to log problematic cases
    let typeDetection = '';
    
    if (isLikelyUuid(str)) {
      uuidCount++;
      typeDetection = 'uuid';
      if (detectionPatterns.uuid.length < 2) detectionPatterns.uuid.push(str);
    } else if (isLikelyTimestamp(str)) {
      timestampCount++;
      typeDetection = 'timestamp';
      if (detectionPatterns.timestamp.length < 2) detectionPatterns.timestamp.push(str);
    } else if (isLikelyDate(str)) {
      dateCount++;
      typeDetection = 'date';
      if (detectionPatterns.date.length < 2) detectionPatterns.date.push(str);
    } else if (isLikelyBoolean(str)) {
      booleanCount++;
      typeDetection = 'boolean';
      if (detectionPatterns.boolean.length < 2) detectionPatterns.boolean.push(str);
    } else if (isLikelyInteger(str)) {
      integerCount++;
      typeDetection = 'integer';
      if (detectionPatterns.integer.length < 2) detectionPatterns.integer.push(str);
    } else if (isLikelyNumeric(str)) {
      numericCount++;
      typeDetection = 'numeric';
      if (detectionPatterns.numeric.length < 2) detectionPatterns.numeric.push(str);
    } else {
      textCount++;
      typeDetection = 'text';
      if (detectionPatterns.text.length < 2) detectionPatterns.text.push(str);
    }
    
  });
  
  
  const total = validSamples.length;
  
  // Calculate percentages
  const typePercentages: Record<SupabaseDataType, number> = {
    uuid: (uuidCount / total) * 100,
    timestamp: (timestampCount / total) * 100,
    date: (dateCount / total) * 100,
    boolean: (booleanCount / total) * 100,
    integer: (integerCount / total) * 100,
    numeric: (numericCount / total) * 100,
    text: (textCount / total) * 100
  };
  
  
  // Track which heuristic was used for final decision
  let heuristicUsed = '';
  let inferredResult: TypeInferenceResult;
  
  // Special case handling for specific patterns
  
  // Check for currency values with symbols (%, $, etc.) which should be numeric
  if (textCount > 0 && (numericCount > 0 || integerCount > 0)) {
    // Look for currency/percentage patterns in the strings identified as text
    const currencyRegex = /^\s*[$€£¥]\s*[\d,.]+\s*$/;
    const percentRegex = /^\s*[\d,.]+\s*[%]\s*$/;
    
    let currencyCount = 0;
    let percentCount = 0;
    
    validSamples.forEach(sample => {
      const str = String(sample).trim();
      if (currencyRegex.test(str)) {
        currencyCount++;
      } else if (percentRegex.test(str)) {
        percentCount++;
      }
    });
    
    // If a significant portion are currency or percentage, treat as numeric
    if ((currencyCount + percentCount) / total > 0.3) {
      
      heuristicUsed = "Values contain currency symbols or percentage signs";
      inferredResult = { 
        type: 'numeric', 
        confidence: 90,
        pattern: 'Currency or percentage detected'
      };
    }
  }
  
  // Handle leading zeros (like account numbers, zip codes, etc.)
  if (!inferredResult) {
    const hasLeadingZeros = validSamples.some(sample => {
      const str = String(sample);
      return str.startsWith('0') && str.length > 1 && !str.startsWith('0.');
    });
    
    if (hasLeadingZeros) {
      // Fields with leading zeros should ALWAYS be text to preserve data
      
      heuristicUsed = "Values contain leading zeros - preserving as text";
      inferredResult = { 
        type: 'text', 
        confidence: 95,
        pattern: 'Leading zeros detected'
      };
    }
  }
  
  // NEW PRIORITY HIERARCHY - Handle integer vs date confusion more effectively
  if (!inferredResult) {
    // 1. Check for small integers first (most common false positive case) - additional cases
    if (valuePatterns.allSmallIntegers && dateCount > 0) {
      // If all values are small integers (0-999) but some were detected as dates due to format,
      // override with numeric type (was 'integer')
      heuristicUsed = `All values are small integers (0-999) - overriding date classification`;
      inferredResult = { 
        type: 'numeric', 
        confidence: 90,
        pattern: 'Small integers detected as more likely than dates'
      };
    }
    
    // 2. Strong numeric/integer signals - check first to avoid misinterpreting numbers
    else if (numericCount + integerCount > total * 0.6) {
      // Always use numeric type even for integer values per requirement
      heuristicUsed = `${Math.round((numericCount+integerCount)/total*100)}% values are numeric`;
      inferredResult = { 
        type: 'numeric', 
        confidence: 90,
        pattern: 'Mixed integer and numeric values' 
      };
    }
    
    // 3. Strong boolean signals - check before dates
    else if (booleanCount > total * 0.8) {
      heuristicUsed = `${Math.round(booleanCount/total*100)}% values are boolean-like (true/false/yes/no)`;
      inferredResult = { type: 'boolean', confidence: 90 };
    }
    
    // 4. Strong date/timestamp signals
    else if (dateCount + timestampCount > total * 0.7) {
      if (timestampCount > dateCount) {
        heuristicUsed = `${Math.round(timestampCount/total*100)}% values are timestamps`;
        inferredResult = { type: 'timestamp', confidence: 90 };
      } else {
        heuristicUsed = `${Math.round(dateCount/total*100)}% values are dates`;
        inferredResult = { type: 'date', confidence: 90 };
      }
    }
    
    // 5. UUID special case - must be nearly 100% to be confident
    else if (uuidCount > total * 0.9) {
      heuristicUsed = `${Math.round(uuidCount/total*100)}% values match UUID pattern`;
      inferredResult = { type: 'uuid', confidence: 90 };
    }
    
    // General case: determine dominant type
    else {
      let dominantType: SupabaseDataType = 'text';
      let highestPercentage = 0;
      
      Object.entries(typePercentages).forEach(([type, percentage]) => {
        if (percentage > highestPercentage) {
          highestPercentage = percentage;
          dominantType = type as SupabaseDataType;
        }
      });
      
      // Final sanity checks for potentially problematic inferences
      
      // 1. Mixed data with text component - be more conservative
      if (dominantType !== 'text' && textCount > total * 0.2) {
        heuristicUsed = `Mixed data types - ${dominantType} (${Math.round(highestPercentage)}%) with ${Math.round(typePercentages.text)}% text`;
        
        // Lower confidence for mixed data
        inferredResult = { 
          type: dominantType, 
          confidence: Math.min(75, highestPercentage),
          pattern: 'Mixed data with text component'
        };
      }
      
      // 2. Sample size too small for non-text types
      else if (dominantType !== 'text' && validSamples.length < 3) {
        heuristicUsed = `Small sample size (${validSamples.length}) with ${dominantType} dominant type`;
        inferredResult = { 
          type: dominantType, 
          confidence: Math.min(70, highestPercentage)
        };
      }
      
      // 3. Low confidence fallback to text
      else if (highestPercentage < 65 && dominantType !== 'text') {
        heuristicUsed = `Low confidence (${Math.round(highestPercentage)}%) for ${dominantType}, defaulting to safer text type`;
        inferredResult = { type: 'text', confidence: 80 };
      }
      
      // Standard case: use dominant type with adjusted confidence
      else {
        const confidence = Math.round(highestPercentage);
        heuristicUsed = `${confidence}% of values match ${dominantType} pattern`;
        inferredResult = { type: dominantType, confidence };
      }
    }
  }
  
  
  return inferredResult;
};

/**
 * Debug mode toggle for data type inference logging
 * Set to true to enable detailed console logging
 */
export const DEBUG_DATA_TYPES = {
  enabled: false, // Default to false, can be overridden via window.__debugDataTypes
};

/**
 * Toggle data type inference debugging
 * @param enable Force enable/disable, or toggle if not provided
 * @returns Message indicating the new debug state
 */

/**
 * Toggle Data Type Inference Debugging
 * 
 * To enable detailed logging of data type inference:
 * 1. Open browser console
 * 2. Run: window.toggleDataTypeDebugging()
 * 
 * Or, set directly: window.__debugDataTypes = true
 */
export const toggleDataTypeDebugging = (enable?: boolean): string => {
  if (typeof window === 'undefined') {
    DEBUG_DATA_TYPES.enabled = enable !== undefined ? enable : !DEBUG_DATA_TYPES.enabled;
  } else {
    window.__debugDataTypes = enable !== undefined ? enable : !window.__debugDataTypes;
  }
  
  const isEnabled = typeof window === 'undefined' ? DEBUG_DATA_TYPES.enabled : window.__debugDataTypes;
  
  const message = `Data type inference debugging ${isEnabled ? 'ENABLED' : 'DISABLED'}`;
  return message;
};

// Initialize from window if available
if (typeof window !== 'undefined') {
  // Use global object to share the toggle across modules
  if (window.__debugDataTypes) {
    DEBUG_DATA_TYPES.enabled = true;
  } 
  
  // Add property descriptor to allow toggling from console
  if (!Object.getOwnPropertyDescriptor(window, '__debugDataTypes')) {
    Object.defineProperty(window, '__debugDataTypes', {
      get: function() { 
        return DEBUG_DATA_TYPES.enabled; 
      },
      set: function(value) { 
        DEBUG_DATA_TYPES.enabled = !!value;
      },
      enumerable: true,
      configurable: true
    });
    
    // Add helper function to toggle debugging
    window.toggleDataTypeDebugging = function() {
      return toggleDataTypeDebugging();
    };
    
  }
}

/**
 * Extended type inference result with reasoning
 */
export interface TypeInferenceResultWithReasoning extends TypeInferenceResult {
  reasoning: string[];
}

/**
 * Combined inference using both header name and sample data
 * Priority is given to sample data analysis over header name heuristics
 * @param headerName Column header name
 * @param samples Array of sample values
 * @returns The most likely type with confidence score and reasoning
 */
export const inferColumnType = (
  headerName: string, 
  samples: unknown[] = []
): TypeInferenceResult => {
  // Initialize reasoning array to track decision process
  const reasoning: string[] = [];
  
  // Check debug mode
  const isDebugMode = DEBUG_DATA_TYPES.enabled || (typeof window !== 'undefined' && window.__debugDataTypes);
  
  
  // Get header-based inference
  const headerInference = inferTypeFromColumnHeader(headerName);
  
  // NEW: Check for direct name-based overrides using improved pattern detection
  const fieldNamePattern = analyzeFieldNamePattern(headerName);
  
  // Add header-based reasoning
  if (headerInference[0].confidence > 70) {
    reasoning.push(`Field name "${headerName}" suggests ${headerInference[0].type} type (${headerInference[0].confidence}% confidence)`);
  }
  
  // Sanitize and format sample values for display in logs
  const sanitizedSamples = samples
    .filter(s => s !== null && s !== undefined && s !== '')
    .slice(0, 5)
    .map(s => {
      const str = String(s);
      // Truncate long strings for readability
      return str.length > 30 ? str.substring(0, 27) + '...' : str;
    });
  
  // Handle case with no sample data
  if (!samples || samples.length === 0 || samples.every(s => s === null || s === undefined || s === '')) {
    reasoning.push(`No valid sample data available, relying on column name heuristics`);
    
    
    return { 
      ...headerInference[0], 
      reasoning 
    };
  }
  
  // Get sample-based inference - this is our primary inference method
  const sampleInference = inferTypeFromSamples(samples);
  
  // Add sample-based reasoning
  if (sampleInference.confidence > 50) {
    reasoning.push(`Sample data analysis suggests ${sampleInference.type} type (${sampleInference.confidence}% confidence)`);
  }
  
  // Filter out nulls, undefined and empty strings for type counting
  const validSamples = samples.filter(s => s !== null && s !== undefined && s !== '');
  
  // Initialize counts for type detection
  let uuidCount = 0;
  let dateCount = 0;
  let timestampCount = 0;
  let booleanCount = 0;
  let integerCount = 0;
  let numericCount = 0;
  let textCount = 0;
  
  // Recount types from samples for reporting
  validSamples.forEach(sample => {
    const str = String(sample).trim();
    
    if (isLikelyUuid(str)) {
      uuidCount++;
    } else if (isLikelyTimestamp(str)) {
      timestampCount++;
    } else if (isLikelyDate(str)) {
      dateCount++;
    } else if (isLikelyBoolean(str)) {
      booleanCount++;
    } else if (isLikelyInteger(str)) {
      integerCount++;
    } else if (isLikelyNumeric(str)) {
      numericCount++;
    } else {
      textCount++;
    }
  });
  
  const total = validSamples.length;
  
  // Calculate percentages for reporting
  const typePercentages: Record<SupabaseDataType, number> = {
    uuid: (uuidCount / total) * 100,
    timestamp: (timestampCount / total) * 100,
    date: (dateCount / total) * 100,
    boolean: (booleanCount / total) * 100,
    integer: (integerCount / total) * 100,
    numeric: (numericCount / total) * 100,
    text: (textCount / total) * 100
  };
  
  // Add distribution analysis to reasoning
  Object.entries(typePercentages)
    .filter(([_, pct]) => pct > 15) // Only include significant percentages
    .forEach(([type, pct]) => {
      reasoning.push(`${Math.round(pct)}% of values match ${type} pattern`);
    });
  
  
  // Track the matched heuristic for logging
  let matchedHeuristic = "";
  let finalType: TypeInferenceResult;
  
  // Get value pattern detection for improved rules
  const valuePatterns = detectValuePatterns(validSamples);
  
  // CRITICAL TYPE CONFLICTS - special handling for known problematic cases
  
  // 1. Numeric indicator in field name + small integer values but detected as date
  if (fieldNamePattern?.type === 'numeric' && 
      sampleInference.type === 'date' && 
      (valuePatterns.allSingleDigits || valuePatterns.allDoubleDigits || valuePatterns.allDay1to31)) {
    // Field name pattern suggests numeric and samples look like numbers - override date detection
    matchedHeuristic = "Field name pattern indicates numeric, values are small numbers (0-99) - overriding date detection";
    reasoning.push(`Field name "${headerName}" pattern suggests numeric, samples are small numbers (0-99), correcting from date detection`);
    finalType = { 
      type: 'numeric', 
      confidence: 98, // Very high confidence for this case
      pattern: 'Numeric indicator in field name with small numbers'
    };
  }
  
  // 2. Special handler for "Loan Age", "Term", and numeric fields (often mistyped as date)
  else if ((headerName.match(/loan\s*age|term|months|years|frequency|count|number|payments|units|installments|dpd/i) && 
      sampleInference.type === 'date') || 
      (sampleInference.type === 'date' && headerInference[0].type === 'numeric')) {
    // Check sample values - if they're mostly small numbers, they're likely numeric
    const smallNumbersCount = samples.filter(s => {
      const str = String(s).trim();
      return /^\d{1,3}$/.test(str) && parseInt(str) < 1000;
    }).length;
    
    const sampleCount = samples.filter(s => s !== null && s !== undefined && s !== '').length;
    
    if (smallNumbersCount > 0 && (smallNumbersCount / sampleCount) > 0.3) {
      matchedHeuristic = "Special case: Numeric field corrected from date";
      reasoning.push(`Special case: Field appears to contain numeric values that look like dates`);
      finalType = { type: 'numeric', confidence: 95, pattern: 'Numeric field corrected from date' };
    } else {
      // Continue to next checks if not small numbers
      matchedHeuristic = null;
      finalType = null;
    }
  }
  
  // 3. Additional validation for date vs numeric confusion
  else if (sampleInference.type === 'date' && (integerCount > 0 || numericCount > 0)) {
    // Check if the "dates" are actually numbers in a format like "MM/YY" or "MM-YY"
    const potentialLoanTerms = samples.filter(s => {
      const str = String(s).trim();
      // Check for patterns like "30/360" or "30-360" which are day count conventions
      const parts = str.split(/[-.\/]/);
      return parts.length === 2 && 
             parseInt(parts[0]) <= 31 && 
             parseInt(parts[1]) <= 999 &&
             (parseInt(parts[0]) < 13 || parseInt(parts[1]) < 13); // At least one part should be a potential month
    }).length;
    
    if (potentialLoanTerms > 0 && (potentialLoanTerms / validSamples.length) > 0.5) {
      matchedHeuristic = "Special case: Number with separator corrected from date";
      reasoning.push(`Special case: Field contains values with separators that look like dates but are likely numeric terms`);
      
      // Determine if these have decimals
      const hasDecimals = samples.some(s => String(s).includes('.'));
      finalType = { 
        type: 'numeric', 
        confidence: 90, 
        pattern: 'Numeric with separator corrected from date' 
      };
    } else {
      // Continue to next checks
      matchedHeuristic = null;
      finalType = null;
    }
  }
  
  // 4. Special handling for rate and percentage fields with text/string samples
  else if (headerName.match(/rate|percentage|ratio|ltv|dti|cltv/i) && 
      sampleInference.type === 'text' && 
      (headerInference[0].type === 'numeric' || headerInference[0].type === 'integer')) {
    // Check if text samples have percentage or currency symbols
    const percentCheck = samples.some(s => String(s).includes('%') || String(s).match(/\d+(\.\d+)?%/));
    if (percentCheck) {
      matchedHeuristic = "Special case: Rate field with percentage symbols corrected to numeric";
      reasoning.push(`Special case: Field contains percentage/rate values with % symbols that should be numeric`);
      finalType = { type: 'numeric', confidence: 95, pattern: 'Rate field with percentage symbols' };
    }
    else {
      // Continue to next checks if percentage symbols not found
      matchedHeuristic = null;
      finalType = null;
    }
  }
  
  // 5. Small numbers incorrectly detected as dates override
  else if (sampleInference.type === 'date' && 
          (valuePatterns.allSingleDigits || valuePatterns.allDoubleDigits || valuePatterns.allDay1to31 || valuePatterns.allNumericMix)) {
    matchedHeuristic = "Numeric values detected - overriding date classification";
    reasoning.push(`Numeric values (${valuePatterns.uniqueValuesCount} unique values) ${valuePatterns.hasMixedNumericTypes ? 'including mix of integers and decimals' : ''}, correcting from date to numeric`);
    finalType = { 
      type: 'numeric', 
      confidence: 95, 
      pattern: valuePatterns.allNumericMix && valuePatterns.hasMixedNumericTypes 
        ? 'Mixed numeric values corrected from date' 
        : 'Small number values corrected from date'
    };
  }
  
  // DATA-DRIVEN INFERENCE HIERARCHY - only process if not already handled
  if (!finalType) {
    // 1. Always use sample inference if leading zeros detected (crucial for account numbers)
    if (sampleInference.pattern === 'Leading zeros detected') {
      matchedHeuristic = "100% values with leading zeros – preserve as text";
      reasoning.push(`Values contain leading zeros, must preserve as text (e.g., for account numbers, zip codes)`);
      finalType = sampleInference;
    }
    
    // 2. PRIMARY: If sample data provides a confident type (75%+), always use it
    else if (sampleInference.confidence >= 75) {
      matchedHeuristic = `${sampleInference.confidence}% of values match ${sampleInference.type} pattern`;
      reasoning.push(`Strong evidence from sample values (${sampleInference.confidence}% confidence)`);
      finalType = sampleInference;
    }
    
    // 3. Special case for currency and percentage patterns - force to numeric
    else if (sampleInference.pattern === 'Currency or percentage detected') {
      matchedHeuristic = "Values contain currency/percentage symbols – using numeric";
      reasoning.push(`Values contain currency or percentage symbols that indicate numeric type`);
      finalType = { ...sampleInference, confidence: 95 }; // Boost confidence
    }
    
    // 4. SPECIAL HANDLING: Reconcile header vs sample conflicts
    else if (sampleInference.type === 'text' && 
        (headerInference[0].type !== 'text' && headerInference[0].confidence >= 90)) {
      
      // Check if this might be missing data
      const emptyRatio = samples.filter(s => !s || String(s).trim() === '').length / samples.length;
      
      if (emptyRatio > 0.5) {
        // Mostly empty - use header inference
        matchedHeuristic = `Sparse values (${Math.round(emptyRatio*100)}% empty) – using header name inference`;
        reasoning.push(`Sparse data (${Math.round(emptyRatio*100)}% empty), using column name heuristics instead`);
        finalType = headerInference[0];
      }
      else {
        // Continue to next checks
        matchedHeuristic = null;
        finalType = null;
      }
    }
    
    // 5. FALLBACK: If samples don't provide confident type, use header inference if it's strong
    if (!finalType) {
      const strongHeaderInference = headerInference.find(h => h.confidence > 85);
      if (strongHeaderInference && sampleInference.confidence < 70) {
        matchedHeuristic = `Low sample confidence (${sampleInference.confidence}%) – using strong header name inference`;
        reasoning.push(`Low confidence from samples (${sampleInference.confidence}%), field name provides better signal`);
        finalType = strongHeaderInference;
      }
      
      // 6. COMPROMISE: If both methods have low confidence but agree on the type, boost the confidence
      else if (headerInference[0].type === sampleInference.type) {
        matchedHeuristic = `Header and sample analysis agree on ${headerInference[0].type} – confidence boosted`;
        reasoning.push(`Field name and sample values agree on ${headerInference[0].type} type, boosting confidence`);
        finalType = {
          type: headerInference[0].type,
          confidence: Math.min(95, Math.max(headerInference[0].confidence, sampleInference.confidence) + 10)
        };
      }
      
      // 7. LAST RESORT: Without other strong signals, prefer sample-based inference
      else if (sampleInference.confidence > 50) {
        matchedHeuristic = `Low confidence (${sampleInference.confidence}%) but using sample analysis as best guess`;
        reasoning.push(`Using weak sample evidence (${sampleInference.confidence}% confidence) as best available signal`);
        finalType = sampleInference;
      }
      
      // If nothing else, fall back to header inference
      else {
        matchedHeuristic = "Fallback to header name analysis – no strong signals from samples";
        reasoning.push(`No strong evidence from samples, defaulting to field name heuristics`);
        finalType = headerInference[0];
      }
    }
  }
  
  // Determine if fallback was used
  const usedFallback = finalType.confidence < 75 || 
                       !samples || 
                       samples.length === 0 || 
                       samples.every(s => s === null || s === undefined || s === '');
  
  // Format the heuristic match reason in a user-friendly way
  let heuristicMatchReason = matchedHeuristic;
  
  // Check for conflicting indicators
  const hasConflictingIndicators = (
    (numericCount > 0 && dateCount > 0) || 
    (integerCount > 0 && dateCount > 0) ||
    (finalType.pattern === 'Mixed data with text component')
  );
  
  if (hasConflictingIndicators) {
    reasoning.push(`⚠️ Warning: Conflicting type indicators detected in samples`);
  };
  
  
  // Create extended result with reasoning (but don't include in the returned object)
  const resultWithReasoning: TypeInferenceResultWithReasoning = {
    ...finalType,
    reasoning
  };
  
  // Return the basic result for backward compatibility
  return finalType;
};

/**
 * Gets type examples for each data type from a set of samples
 * Useful for showing examples of different types in UI elements
 * 
 * @param samples Array of sample values
 * @returns Object with arrays of examples for each data type
 */
export const getTypeExamples = (
  samples: unknown[] = []
): Record<SupabaseDataType, string[]> => {
  // Filter out nulls, undefined and empty strings
  const validSamples = samples.filter(s => s !== null && s !== undefined && s !== '');
  
  // Initialize example holders
  const examples: Record<SupabaseDataType, string[]> = {
    uuid: [],
    timestamp: [],
    date: [],
    boolean: [],
    integer: [],
    numeric: [],
    text: [],
    'timestamp without time zone': [],
    'timestamp with time zone': []
  };
  
  // Collect examples - maximum 3 per type for display
  validSamples.forEach(sample => {
    const str = String(sample).trim();
    
    if (isLikelyUuid(str) && examples.uuid.length < 3) {
      examples.uuid.push(str);
    } else if (isLikelyTimestamp(str) && examples.timestamp.length < 3) {
      examples.timestamp.push(str);
    } else if (isLikelyDate(str) && examples.date.length < 3) {
      examples.date.push(str);
    } else if (isLikelyBoolean(str) && examples.boolean.length < 3) {
      examples.boolean.push(str);
    } else if (isLikelyInteger(str) && examples.numeric.length < 3) {
      // Integer examples now go into numeric category
      examples.numeric.push(str);
    } else if (isLikelyNumeric(str) && examples.numeric.length < 3) {
      examples.numeric.push(str);
    } else if (examples.text.length < 3) {
      examples.text.push(str);
    }
  });
  
  return examples;
};

/**
 * Enhanced version of inferColumnType that includes reasoning information
 * Use this when you need to understand or display the inference decision process
 * 
 * @param headerName Column header name
 * @param samples Array of sample values 
 * @returns Enhanced type inference result with reasoning array
 */
export const inferColumnTypeWithReasoning = (
  headerName: string,
  samples: unknown[] = []
): TypeInferenceResultWithReasoning => {
  // Initialize reasoning array to track decision process
  const reasoning: string[] = [];
  
  // Get the basic inference result
  const result = inferColumnType(headerName, samples);
  
  // Reconstruct the detailed logs that were output to console
  // We'll capture detailed logs about this inference to build our reasoning
  
  // Check for empty samples
  if (!samples || samples.length === 0 || samples.every(s => s === null || s === undefined || s === '')) {
    reasoning.push(`No valid sample data available, relying on column name heuristics`);
    
    // Get header-based inference
    const headerInference = inferTypeFromColumnHeader(headerName);
    if (headerInference[0].confidence > 70) {
      reasoning.push(`Field name "${headerName}" suggests ${headerInference[0].type} type (${headerInference[0].confidence}% confidence)`);
    }
  } else {
    // Filter out nulls, undefined and empty strings for type counting
    const validSamples = samples.filter(s => s !== null && s !== undefined && s !== '');
    
    // Initialize counts for type detection
    let uuidCount = 0;
    let dateCount = 0;
    let timestampCount = 0;
    let booleanCount = 0;
    let integerCount = 0;
    let numericCount = 0;
    let textCount = 0;
    
    // Recount types from samples for reporting
    validSamples.forEach(sample => {
      const str = String(sample).trim();
      
      if (isLikelyUuid(str)) {
        uuidCount++;
      } else if (isLikelyTimestamp(str)) {
        timestampCount++;
      } else if (isLikelyDate(str)) {
        dateCount++;
      } else if (isLikelyBoolean(str)) {
        booleanCount++;
      } else if (isLikelyInteger(str)) {
        integerCount++;
      } else if (isLikelyNumeric(str)) {
        numericCount++;
      } else {
        textCount++;
      }
    });
    
    const total = validSamples.length;
    
    // Add sample-based reasoning
    reasoning.push(`Sample data analysis suggests ${result.type} type (${result.confidence}% confidence)`);
    
    // Add distribution analysis to reasoning
    if (total > 0) {
      const percentages = {
        uuid: (uuidCount / total) * 100,
        timestamp: (timestampCount / total) * 100,
        date: (dateCount / total) * 100,
        boolean: (booleanCount / total) * 100,
        integer: (integerCount / total) * 100,
        numeric: (numericCount / total) * 100,
        text: (textCount / total) * 100
      };
      
      Object.entries(percentages)
        .filter(([_, pct]) => pct > 15) // Only include significant percentages
        .forEach(([type, pct]) => {
          reasoning.push(`${Math.round(pct)}% of values match ${type} pattern`);
        });
      
      // Check for conflicting indicators
      const hasConflictingIndicators = (
        (numericCount > 0 && dateCount > 0) || 
        (integerCount > 0 && dateCount > 0)
      );
      
      if (hasConflictingIndicators) {
        reasoning.push(`⚠️ Warning: Conflicting type indicators detected in samples`);
      }
    }
    
    // Special case detection
    if (result.pattern) {
      reasoning.push(`Pattern detected: ${result.pattern}`);
    }
    
    // Add header-based reasoning
    const headerInference = inferTypeFromColumnHeader(headerName);
    if (headerInference[0].confidence > 70) {
      reasoning.push(`Field name "${headerName}" suggests ${headerInference[0].type} type (${headerInference[0].confidence}% confidence)`);
    }
  }
  
  // Return enhanced result
  return {
    ...result,
    reasoning
  };
};