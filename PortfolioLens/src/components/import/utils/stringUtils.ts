/**
 * String utility functions for import mapping
 */

import levenshtein from 'fast-levenshtein';

/**
 * Normalize a string for comparison by:
 * - Converting to lowercase
 * - Removing special characters
 * - Removing punctuation
 * - Removing extra spaces
 */
export const normalizeString = (str: string): string => {
  if (!str) return '';

  return str
    .toLowerCase()
    .replace(/[%#$@&*()+=\[\]{}|\\;:"<>?/~`]/g, ' ') // Replace special chars with spaces
    .replace(/[.,!'-]/g, '')                         // Remove punctuation completely
    .replace(/\s+/g, ' ')                           // Replace multiple spaces with single space
    .trim();
};

/**
 * Normalize a column or table name for database use:
 * - Convert to lowercase
 * - Replace spaces/special chars with underscores
 * - Remove duplicate underscores
 * - Ensure it starts with a letter
 */
export const normalizeForDb = (str: string): string => {
  if (!str) return '';
  
  // First normalize the string
  let normalized = str
    .toLowerCase()
    .replace(/[^\w\s]/g, '_') // Replace special chars with underscore
    .replace(/\s+/g, '_')     // Replace spaces with underscore
    .replace(/_+/g, '_')      // Replace multiple underscores with single
    .trim()
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
  
  // If it starts with a digit, prefix with "col_"
  if (/^\d/.test(normalized)) {
    normalized = 'col_' + normalized;
  }
  
  return normalized;
};

/**
 * Normalize a sheet name to a valid PostgreSQL table name
 * Additional checks for PostgreSQL reserved words
 */
export const normalizeTableName = (str: string): string => {
  let tableName = normalizeForDb(str);

  // Check only for exact matches to reserved words or start of identifiers
  // For composite names like "trailing_payments", we only need to worry
  // about the complete name or prefix
  
  // 1. Is it an exact match to a reserved word?
  const reservedExactMatch = PG_RESERVED_WORDS.find(word => word === tableName);
  if (reservedExactMatch) {
    return `${tableName}_table`;
  }
  
  // 2. Does it start with a reserved word followed by underscore?
  // This is the only case we need to handle for PostgreSQL
  for (const reserved of PG_RESERVED_WORDS) {
    if (tableName.startsWith(`${reserved}_`)) {
      // For cases like "from_date" → "from_table_date"
      return tableName.replace(`${reserved}_`, `${reserved}_table_`);
    }
  }

  // Composite names like "trailing_payments" are fine as is
  // PostgreSQL only has issues when the reserved word is the complete
  // identifier or the first part before a dot (schema.table)
  return tableName;
};

/**
 * Extract unit from column headers like "Interest Rate (%)" -> { name: "interest_rate", unit: "%" }
 */
export const extractUnitFromHeader = (str: string): { name: string; unit: string | null } => {
  const unitRegex = /(.+)\s*\(([%$#]|[a-z]+)\)/i;
  const match = str.match(unitRegex);
  
  if (match) {
    return {
      name: normalizeForDb(match[1]),
      unit: match[2]
    };
  }
  
  return {
    name: normalizeForDb(str),
    unit: null
  };
};

/**
 * Enhanced string normalization for matching
 * Strips out all non-alphanumeric characters and converts to lowercase
 */
export const normalizeForMatching = (str: string): string => {
  if (!str) return '';
  
  // Convert to lowercase
  // Remove all non-alphanumeric characters
  // Remove all whitespace
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

/**
 * Calculate string similarity as a percentage (0-100)
 * Using enhanced normalization and Levenshtein distance
 */
export const calculateSimilarity = (str1: string, str2: string): number => {
  if (!str1 && !str2) return 100;
  if (!str1 || !str2) return 0;
  
  // Check for direct match after aggressive normalization first
  const strictNorm1 = normalizeForMatching(str1);
  const strictNorm2 = normalizeForMatching(str2);

  // If they're exactly the same after normalization, it's a 100% match
  if (strictNorm1 === strictNorm2) return 100;

  // Check for common Excel to DB name patterns
  // "Loan Information" → "loan_information"
  // "COVID-19" → "covid_19"
  // "Trailing Payments" → "trailing_payments"
  if (normalizeForDb(str1).replace(/_/g, '') === normalizeForDb(str2).replace(/_/g, '')) {
    return 100; // These are essentially the same in database context
  }
  
  // Common transformations that should be considered very high matches
  // Database column name conversions (e.g., "Loan Information" → "loan_information")
  const dbForm1 = normalizeForDb(str1).replace(/_/g, '');
  const dbForm2 = normalizeForDb(str2).replace(/_/g, '');
  
  if (dbForm1 === dbForm2) return 98; // Almost perfect match
  
  // Check for special cases:
  // 1. Pluralization differences
  if (
    (strictNorm1 + 's' === strictNorm2) || 
    (strictNorm2 + 's' === strictNorm1) ||
    (strictNorm1.endsWith('s') && strictNorm1.slice(0, -1) === strictNorm2) ||
    (strictNorm2.endsWith('s') && strictNorm2.slice(0, -1) === strictNorm1)
  ) {
    return 95; // Pluralization differences are high confidence
  }
  
  // 2. One string contains the other completely
  if (strictNorm1.includes(strictNorm2) || strictNorm2.includes(strictNorm1)) {
    const containmentRatio = Math.min(strictNorm1.length, strictNorm2.length) / 
                             Math.max(strictNorm1.length, strictNorm2.length);
    // Return a scaled value based on length ratio
    return Math.round(90 * containmentRatio);
  }
  
  // For all other cases, use Levenshtein distance on normalized strings
  const normStr1 = normalizeString(str1);
  const normStr2 = normalizeString(str2);
  
  const maxLength = Math.max(normStr1.length, normStr2.length);
  if (maxLength === 0) return 100;
  
  const distance = levenshtein.get(normStr1, normStr2);
  const similarity = Math.max(0, 100 - Math.floor((distance / maxLength) * 100));
  
  return similarity;
};

/**
 * Determine if two column names are exact matches after normalization
 */
export const isExactColumnMatch = (col1: string, col2: string): boolean => {
  return normalizeForDb(col1) === normalizeForDb(col2);
};

/**
 * PostgreSQL reserved words to check against
 */
export const PG_RESERVED_WORDS = [
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 
  'asymmetric', 'authorization', 'binary', 'both', 'case', 'cast', 
  'check', 'collate', 'collation', 'column', 'concurrently', 
  'constraint', 'create', 'cross', 'current_catalog', 'current_date', 
  'current_role', 'current_schema', 'current_time', 'current_timestamp', 
  'current_user', 'default', 'deferrable', 'desc', 'distinct', 'do', 
  'else', 'end', 'except', 'false', 'fetch', 'for', 'foreign', 'from', 
  'full', 'grant', 'group', 'having', 'ilike', 'in', 'initially', 'inner', 
  'intersect', 'into', 'is', 'isnull', 'join', 'lateral', 'leading', 
  'left', 'like', 'limit', 'localtime', 'localtimestamp', 'natural', 
  'not', 'notnull', 'null', 'offset', 'on', 'only', 'or', 'order', 
  'outer', 'overlaps', 'placing', 'primary', 'references', 'returning', 
  'right', 'select', 'session_user', 'similar', 'some', 'symmetric', 
  'table', 'tablesample', 'then', 'to', 'trailing', 'true', 'union', 
  'unique', 'user', 'using', 'variadic', 'verbose', 'when', 'where', 
  'window', 'with'
];