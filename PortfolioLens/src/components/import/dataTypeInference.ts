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
  
  // Check each sample
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
  
  // Determine dominant type
  let dominantType: SupabaseDataType = 'text';
  let highestPercentage = 0;
  
  Object.entries(typePercentages).forEach(([type, percentage]) => {
    if (percentage > highestPercentage) {
      highestPercentage = percentage;
      dominantType = type as SupabaseDataType;
    }
  });
  
  // If more than 20% are text, but numeric/integer is still dominant,
  // check if there are leading zeros that would be lost
  if ((dominantType === 'numeric' || dominantType === 'integer') && 
      typePercentages.text > 20) {
    const hasLeadingZeros = validSamples.some(sample => {
      const str = String(sample);
      return str.startsWith('0') && str.length > 1 && !str.startsWith('0.');
    });
    
    if (hasLeadingZeros) {
      // If there are leading zeros, prefer text
      return { 
        type: 'text', 
        confidence: 85,
        pattern: 'Leading zeros detected'
      };
    }
  }
  
  // Special cases
  if (dominantType === 'uuid' && highestPercentage < 95) {
    // UUID must be nearly 100% to be confident
    return { type: 'text', confidence: 80 };
  }
  
  if (dominantType === 'boolean' && validSamples.length < 5) {
    // Need more samples for boolean confidence
    return { type: 'text', confidence: 75 };
  }
  
  // Adjust confidence based on percentage
  let confidence = Math.round(highestPercentage);
  
  // If confidence is low, default to text
  if (confidence < 70 && dominantType !== 'text') {
    return { type: 'text', confidence: 75 };
  }
  
  return { type: dominantType, confidence };
};

/**
 * Combined inference using both header name and sample data
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
  
  if (samples.length === 0) {
    // No samples, rely on header-based inference
    return headerInference[0];
  }
  
  // Get sample-based inference
  const sampleInference = inferTypeFromSamples(samples);
  
  // If header inference strongly suggests a type, use it
  const strongHeaderInference = headerInference.find(h => h.confidence > 90);
  if (strongHeaderInference) {
    return strongHeaderInference;
  }
  
  // If sample inference is very confident, use it
  if (sampleInference.confidence > 85) {
    return sampleInference;
  }
  
  // Combine the inferences - check if header and sample agree
  const headerSuggestion = headerInference[0];
  
  if (headerSuggestion.type === sampleInference.type) {
    // Both agree, boost confidence
    return {
      type: headerSuggestion.type,
      confidence: Math.min(95, Math.max(headerSuggestion.confidence, sampleInference.confidence) + 5)
    };
  }
  
  // Special case: if header suggests numeric/integer but samples show text with leading zeros
  if ((headerSuggestion.type === 'numeric' || headerSuggestion.type === 'integer') && 
      sampleInference.type === 'text' && 
      sampleInference.pattern === 'Leading zeros detected') {
    return sampleInference;
  }
  
  // They disagree - prefer sample inference if it's strong enough
  if (sampleInference.confidence > 75) {
    return sampleInference;
  }
  
  // Otherwise fall back to header inference
  return headerSuggestion;
};