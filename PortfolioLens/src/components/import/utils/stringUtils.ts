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

// Keep track of existing table columns for lookup (to be set externally)
let existingDbColumns: Set<string> = new Set();

/**
 * Set the existing DB columns for lookup during normalization
 * This allows normalizeForDb to avoid prefixing existing numeric fields
 */
export const setExistingColumns = (columns: string[]) => {
  existingDbColumns = new Set(columns.map(name => name.toLowerCase()));
};

/**
 * Normalize a column or table name for database use:
 * - Convert to lowercase
 * - Replace spaces/special chars with underscores
 * - Remove duplicate underscores
 * - Ensure it starts with a letter (only if not already in database)
 *
 * @param str The string to normalize
 * @param checkExisting Whether to check against existing DB columns
 */
export const normalizeForDb = (str: string, checkExisting: boolean = true): string => {
  if (!str) return '';

  // First normalize the string
  let normalized = str
    .toLowerCase()
    .replace(/[^\w\s]/g, '_') // Replace special chars with underscore
    .replace(/\s+/g, '_')     // Replace spaces with underscore
    .replace(/_+/g, '_')      // Replace multiple underscores with single
    .trim()
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

  // Check if the normalized string starts with a digit
  if (/^\d/.test(normalized)) {
    // Check if this exact column name already exists in the database
    // If it does, don't add the col_ prefix - respect the existing name
    if (checkExisting && existingDbColumns.has(normalized)) {
      return normalized; // Keep existing name even if it starts with a digit
    }

    // Otherwise follow standard SQL naming conventions - prefix with col_
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
 * This is the strict normalization that ignores spaces, special chars, and underscores
 */
export const normalizeForMatching = (str: string): string => {
  if (!str) return '';

  // Convert to lowercase
  // Remove all non-alphanumeric characters (spaces, underscores, special chars, etc.)
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

/**
 * Calculate string similarity as a percentage (0-100)
 * Using enhanced normalization and specialized heuristics for column matching
 */
export const calculateSimilarity = (str1: string, str2: string): number => {
  if (!str1 && !str2) return 100;
  if (!str1 || !str2) return 0;

  // Check for direct match after aggressive normalization first (ignoring all non-alphanumeric chars)
  // This handles cases like "P & I Payment" matching "PIPayment" or "P_I_Payment"
  const strictNorm1 = normalizeForMatching(str1);
  const strictNorm2 = normalizeForMatching(str2);

  // If they're exactly the same after stripping all non-alphanumeric chars, it's a 100% match
  if (strictNorm1 === strictNorm2 && strictNorm1.length > 0) {
    return 100;
  }

  // Case where both are normalized to empty strings but weren't originally empty
  if (strictNorm1 === '' && strictNorm2 === '' && str1 !== '' && str2 !== '') {
    return 90; // High match for special character only names
  }

  // Check for common Excel to DB name patterns
  // "Loan Information" → "loan_information"
  // "COVID-19" → "covid_19"
  // "Trailing Payments" → "trailing_payments"
  if (normalizeForDb(str1).replace(/_/g, '') === normalizeForDb(str2).replace(/_/g, '')) {
    return 100; // These are essentially the same in database context
  }

  // Handle pluralization (loans vs loan)
  if (
    (strictNorm1 + 's' === strictNorm2) ||
    (strictNorm2 + 's' === strictNorm1) ||
    (strictNorm1.endsWith('s') && strictNorm1.slice(0, -1) === strictNorm2) ||
    (strictNorm2.endsWith('s') && strictNorm2.slice(0, -1) === strictNorm1)
  ) {
    return 95; // Pluralization differences are high confidence
  }

  // Handle substring containment (loanAmount vs amount)
  // Calculate containment score - weight by length ratio
  if (strictNorm1.includes(strictNorm2) || strictNorm2.includes(strictNorm1)) {
    // Calculate containment ratio based on length
    const containedStr = strictNorm1.length < strictNorm2.length ? strictNorm1 : strictNorm2;
    const containerStr = strictNorm1.length < strictNorm2.length ? strictNorm2 : strictNorm1;

    // Simple cases: one is fully contained in the other
    if (containerStr.startsWith(containedStr) || containerStr.endsWith(containedStr)) {
      // Beginning or end is a stronger match
      const ratio = containedStr.length / containerStr.length;
      return Math.min(90, Math.round(85 + (ratio * 10)));
    } else {
      // Middle containment is a bit weaker
      const ratio = containedStr.length / containerStr.length;
      return Math.min(85, Math.round(75 + (ratio * 15)));
    }
  }

  // For all other cases, use Levenshtein distance on normalized strings
  const normStr1 = normalizeString(str1);
  const normStr2 = normalizeString(str2);

  const maxLength = Math.max(normStr1.length, normStr2.length);
  if (maxLength === 0) return 100;

  const distance = levenshtein.get(normStr1, normStr2);
  const similarity = Math.max(0, 100 - Math.floor((distance / maxLength) * 100));

  // Cap at 100%
  return Math.min(100, similarity);
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