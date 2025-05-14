/**
 * Data type inference utilities for Excel imports
 * Provides functions for detecting data types from column headers and sample data
 */

import { normalizeString } from './utils/stringUtils';

// Available Supabase data types
export type SupabaseDataType =
  | 'text'
  | 'numeric'
  | 'integer'
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
    category: 'integer',
    terms: ['count', 'number', 'num', 'quantity', 'qty', 'frequency', 'occurrences', 'times', 'iterations'],
    weight: 85
  },
  integerSequence: {
    category: 'integer',
    terms: ['sequence', 'seq', 'order', 'rank', 'position', 'index', 'priority'],
    weight: 80
  },
  integerAge: {
    category: 'integer',
    terms: ['age', 'days', 'months', 'years', 'dpd', 'term', 'duration'],
    weight: 90
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
    terms: ['date', 'day', 'due_date', 'start_date', 'end_date', 'effective_date', 'maturity_date', 'close_date', 'sign_date'],
    weight: 95
  },
  dateLoan: {
    category: 'date',
    terms: ['origination_date', 'closing_date', 'maturity', 'funding_date', 'first_payment_date', 'last_payment_date', 'next_payment_date'],
    weight: 95
  },
  
  // Timestamp type patterns
  timestampFields: {
    category: 'timestamp',
    terms: ['created_at', 'updated_at', 'timestamp', 'datetime', 'time', 'modified_at', 'deleted_at', 'logged_at'],
    weight: 95
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
  // Basic date pattern check - will catch most standard formats
  const datePattern = /^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}$/;
  
  if (datePattern.test(value)) return true;
  
  // Try parsing as date and check if valid
  const parsedDate = new Date(value);
  return !isNaN(parsedDate.getTime());
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
 * Infer the data type from a column header name using fallback mapping
 */
export const inferTypeFromColumnHeader = (columnName: string): TypeInferenceResult[] => {
  if (!columnName) {
    return [{ type: 'text', confidence: 100 }];
  }
  
  const normalized = normalizeString(columnName);
  
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
  // Filter out nulls, undefined and empty strings
  const validSamples = samples.filter(s => s !== null && s !== undefined && s !== '');
  
  if (validSamples.length === 0) {
    return { type: 'text', confidence: 100 };
  }
  
  // Count types
  let uuidCount = 0;
  let dateCount = 0;
  let timestampCount = 0;
  let booleanCount = 0;
  let integerCount = 0;
  let numericCount = 0;
  let textCount = 0;
  
  // Sample validation log for debugging
  const sampleLog = validSamples.slice(0, 3).map(sample => String(sample));
  console.log(`Sample data examples [${sampleLog.join(', ')}]`);
  
  // Check each sample
  validSamples.forEach(sample => {
    const str = String(sample).trim();
    const originalValue = str;
    
    // Store diagnostics to log problematic cases
    let typeDetection = '';
    
    if (isLikelyUuid(str)) {
      uuidCount++;
      typeDetection = 'uuid';
    } else if (isLikelyTimestamp(str)) {
      timestampCount++;
      typeDetection = 'timestamp';
    } else if (isLikelyDate(str)) {
      dateCount++;
      typeDetection = 'date';
    } else if (isLikelyBoolean(str)) {
      booleanCount++;
      typeDetection = 'boolean';
    } else if (isLikelyInteger(str)) {
      integerCount++;
      typeDetection = 'integer';
    } else if (isLikelyNumeric(str)) {
      numericCount++;
      typeDetection = 'numeric';
    } else {
      textCount++;
      typeDetection = 'text';
    }
    
    // Log occasional samples for debugging type detection issues
    if (Math.random() < 0.1) { // Log ~10% of samples
      console.debug(`Sample value "${originalValue}" detected as ${typeDetection}`);
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
  
  // Log percentage breakdown
  console.log('Type detection breakdown:', 
    Object.entries(typePercentages)
      .filter(([_, pct]) => pct > 0)
      .map(([type, pct]) => `${type}: ${Math.round(pct)}%`)
      .join(', ')
  );
  
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
      console.log(`Detected currency/percentage pattern (${currencyCount}/${percentCount} out of ${total})`);
      return { 
        type: 'numeric', 
        confidence: 90,
        pattern: 'Currency or percentage detected'
      };
    }
  }
  
  // Handle leading zeros (like account numbers, zip codes, etc.)
  const hasLeadingZeros = validSamples.some(sample => {
    const str = String(sample);
    return str.startsWith('0') && str.length > 1 && !str.startsWith('0.');
  });
  
  if (hasLeadingZeros) {
    // Fields with leading zeros should ALWAYS be text to preserve data
    console.log('Leading zeros detected, using text type');
    return { 
      type: 'text', 
      confidence: 95,
      pattern: 'Leading zeros detected'
    };
  }
  
  // Prioritize inferences based on confidence threshold hierarchy
  
  // 1. Strong numeric/integer signals - check first to avoid misinterpreting numbers
  if (numericCount + integerCount > total * 0.75) {
    // If most values are numeric, check if they're all integers
    if (integerCount > numericCount * 2) {
      return { type: 'integer', confidence: 90 };
    } else {
      return { type: 'numeric', confidence: 90 };
    }
  }
  
  // 2. Strong date/timestamp signals
  if (dateCount + timestampCount > total * 0.7) {
    return { 
      type: timestampCount > dateCount ? 'timestamp' : 'date', 
      confidence: 95 
    };
  }
  
  // 3. Strong boolean signals
  if (booleanCount > total * 0.8) {
    return { type: 'boolean', confidence: 90 };
  }
  
  // 4. UUID special case - must be nearly 100% to be confident
  if (uuidCount > total * 0.9) {
    return { type: 'uuid', confidence: 90 };
  }
  
  // Now determine dominant type for remaining cases
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
    console.log(`Mixed data (${dominantType}/${Math.round(highestPercentage)}% with ${Math.round(typePercentages.text)}% text)`);
    
    // Lower confidence for mixed data
    return { 
      type: dominantType, 
      confidence: Math.min(75, highestPercentage),
      pattern: 'Mixed data with text component'
    };
  }
  
  // 2. Sample size too small for non-text types
  if (dominantType !== 'text' && validSamples.length < 3) {
    console.log(`Small sample size (${validSamples.length}) for non-text type ${dominantType}`);
    return { type: dominantType, confidence: Math.min(70, highestPercentage) };
  }
  
  // Adjust confidence based on percentage
  let confidence = Math.round(highestPercentage);
  
  // When confidence is low, default to text as the safest option
  if (confidence < 65 && dominantType !== 'text') {
    console.log(`Low confidence (${confidence}%) for ${dominantType}, defaulting to text`);
    return { type: 'text', confidence: 80 };
  }
  
  return { type: dominantType, confidence };
};

/**
 * Combined inference using both header name and sample data
 * Priority is given to sample data analysis over header name heuristics
 * @param headerName Column header name
 * @param samples Array of sample values
 * @returns The most likely type with confidence score
 */
export const inferColumnType = (
  headerName: string, 
  samples: unknown[] = []
): TypeInferenceResult => {
  // Get header-based inference
  const headerInference = inferTypeFromColumnHeader(headerName);
  
  // If no sample data available, rely on header-based inference
  if (!samples || samples.length === 0 || samples.every(s => s === null || s === undefined || s === '')) {
    console.log(`No samples for ${headerName}, using header inference: ${headerInference[0].type}`);
    return headerInference[0];
  }
  
  // Get sample-based inference - this is our primary inference method
  const sampleInference = inferTypeFromSamples(samples);
  
  // Log the inferences for comparison
  console.log(`Inference for ${headerName}: sample=${sampleInference.type}(${sampleInference.confidence}), header=${headerInference[0].type}(${headerInference[0].confidence})`);
  
  // CRITICAL TYPE CONFLICTS - special handling for known problematic cases
  
  // 1. Special handler for "Loan Age" and "Term" fields (often mistyped as date)
  if (headerName.match(/loan\s*age|term|months|years|frequency/i) && 
      sampleInference.type === 'date' && 
      headerInference[0].type === 'integer') {
    console.log(`Type conflict for '${headerName}': Header suggests integer, sample suggests date. Using integer.`);
    return { type: 'integer', confidence: 90, pattern: 'Age/Term field corrected from date' };
  }
  
  // 2. Special handler for "Number of Units" field
  if (headerName.match(/number\s*of\s*units|unit\s*count/i) && 
      sampleInference.type === 'date') {
    console.log(`Type conflict for '${headerName}': Sample incorrectly suggests date. Using integer.`);
    return { type: 'integer', confidence: 90, pattern: 'Number field corrected from date' };
  }
  
  // 3. Special handling for rate and percentage fields with text/string samples
  if (headerName.match(/rate|percentage|ratio|ltv|dti|cltv/i) && 
      sampleInference.type === 'text' && 
      (headerInference[0].type === 'numeric' || headerInference[0].type === 'integer')) {
    // Check if text samples have percentage or currency symbols
    const percentCheck = samples.some(s => String(s).includes('%') || String(s).match(/\d+(\.\d+)?%/));
    if (percentCheck) {
      console.log(`Type conflict for '${headerName}': Contains percentage symbols. Using numeric.`);
      return { type: 'numeric', confidence: 95, pattern: 'Rate field with percentage symbols' };
    }
  }
  
  // DATA-DRIVEN INFERENCE HIERARCHY
  
  // 1. Always use sample inference if leading zeros detected (crucial for account numbers)
  if (sampleInference.pattern === 'Leading zeros detected') {
    return sampleInference; // Always preserve leading zeros
  }
  
  // 2. PRIMARY: If sample data provides a confident type (75%+), always use it
  if (sampleInference.confidence >= 75) {
    return sampleInference;
  }
  
  // 3. Special case for currency and percentage patterns - force to numeric
  if (sampleInference.pattern === 'Currency or percentage detected') {
    return { ...sampleInference, confidence: 95 }; // Boost confidence
  }
  
  // 4. SPECIAL HANDLING: Reconcile header vs sample conflicts
  
  // If sample suggests text but header strongly suggests a specific type
  if (sampleInference.type === 'text' && 
      (headerInference[0].type !== 'text' && headerInference[0].confidence >= 90)) {
    
    // Check if this might be missing data
    const emptyRatio = samples.filter(s => !s || String(s).trim() === '').length / samples.length;
    
    if (emptyRatio > 0.5) {
      // Mostly empty - use header inference
      console.log(`Field '${headerName}' has ${Math.round(emptyRatio*100)}% empty values, using header inference`);
      return headerInference[0];
    }
  }
  
  // 5. FALLBACK: If samples don't provide confident type, 
  // use header inference if it's strong
  const strongHeaderInference = headerInference.find(h => h.confidence > 85);
  if (strongHeaderInference && sampleInference.confidence < 70) {
    return strongHeaderInference;
  }
  
  // 6. COMPROMISE: If both methods have low confidence but agree on the type,
  // boost the confidence
  if (headerInference[0].type === sampleInference.type) {
    return {
      type: headerInference[0].type,
      confidence: Math.min(95, Math.max(headerInference[0].confidence, sampleInference.confidence) + 10)
    };
  }
  
  // 7. LAST RESORT: Without other strong signals, prefer sample-based inference
  // even with low confidence, as it's based on actual data
  if (sampleInference.confidence > 50) {
    return sampleInference;
  }
  
  // If nothing else, fall back to header inference
  return headerInference[0];
};