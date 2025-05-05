import { SheetInfo, TableInfo, ColumnMapping, WorkbookInfo, TableMappingSuggestion } from './types';
import { DatabaseService } from './services/DatabaseService';
import levenshtein from 'fast-levenshtein';

/**
 * Calculates a normalized similarity score between two strings using Levenshtein distance.
 * The score ranges from 0.0 (completely different) to 1.0 (identical).
 * Normalization considers the length of the longer string.
 *
 * @param str1 - The first string.
 * @param str2 - The second string.
 * @returns A similarity score between 0.0 and 1.0.
 */
/**
 * Calculates a normalized similarity score between two strings.
 * Enhanced to recognize direct matches that only differ by case or spacing as 100% matches.
 *
 * @param str1 - The first string.
 * @param str2 - The second string.
 * @returns A similarity score between 0.0 and 1.0.
 */
export const calculateSimilarity = (str1: string, str2: string): number => {
  if (!str1 || !str2) {
    return 0; // Handle empty strings
  }
  
  // First check if the normalized versions are identical
  const normalized1 = normalizeForMatching(str1);
  const normalized2 = normalizeForMatching(str2);
  
  if (normalized1 === normalized2 && normalized1 !== '') {
    return 1.0; // Perfect match after normalization
  }
  
  // If not a perfect normalized match, calculate Levenshtein distance
  const distance = levenshtein.get(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) {
    return 1; // Both strings are empty, considered identical
  }
  const score = 1.0 - distance / maxLength;
  return Math.max(0, score); // Ensure score doesn't go below 0 due to potential floating point issues
};

/**
 * Normalize a string by converting to lowercase and replacing spaces, hyphens, and underscores with
 * a consistent character (empty string), making these characters synonymous
 */
/**
 * Normalize a string for matching by:
 * 1. Converting to lowercase
 * 2. Removing spaces, hyphens, underscores, and other separators
 * 3. Removing any non-alphanumeric characters
 *
 * This ensures that strings like "Valon Loan ID" and "valon_loan_id"
 * will be normalized to the same value.
 */
export const normalizeForMatching = (input: string): string => {
  if (!input) return '';
  return input.toLowerCase().replace(/[\s\-_]/g, '').replace(/[^a-z0-9]/g, '');
};

/**
 * Find best matching table for a sheet name with improved matching algorithm
 * that treats spaces, hyphens, and underscores as synonymous
 * @returns The best matching table name or null if no good match found
 */
export const findBestTableMatch = (sheetName: string, tables: string[]): string | null => {
  const normalizedSheetName = normalizeForMatching(sheetName);
  
  // First try for exact matches
  const exactMatch = tables.find(table => 
    normalizeForMatching(table) === normalizedSheetName
  );
  
  if (exactMatch) return exactMatch;
  
  // Try plural/singular variations
  const singularSheetName = normalizedSheetName.endsWith('s') ? normalizedSheetName.slice(0, -1) : normalizedSheetName;
  const pluralSheetName = normalizedSheetName.endsWith('s') ? normalizedSheetName : normalizedSheetName + 's';
  
  const numberVariationMatch = tables.find(table => {
    const normalizedTable = normalizeForMatching(table);
    return normalizedTable === singularSheetName || normalizedTable === pluralSheetName;
  });
  
  if (numberVariationMatch) return numberVariationMatch;
  
  // Check for normalized forms with spaces/hyphens/underscores replaced
  const synonymMatch = tables.find(table => {
    // Get the original form with spaces/hyphens/underscores replaced with each other
    const tableWithSpaces = table.toLowerCase().replace(/[\-_]/g, ' ');
    const tableWithHyphens = table.toLowerCase().replace(/[\s_]/g, '-');
    const tableWithUnderscores = table.toLowerCase().replace(/[\s\-]/g, '_');
    
    const sheetWithSpaces = sheetName.toLowerCase().replace(/[\-_]/g, ' ');
    const sheetWithHyphens = sheetName.toLowerCase().replace(/[\s_]/g, '-');
    const sheetWithUnderscores = sheetName.toLowerCase().replace(/[\s\-]/g, '_');
    
    // Check if any combination matches
    return tableWithSpaces === sheetWithSpaces ||
           tableWithHyphens === sheetWithHyphens ||
           tableWithUnderscores === sheetWithUnderscores;
  });
  
  if (synonymMatch) return synonymMatch;
  
  // Then try for partial matches with improved scoring
  let bestMatch = '';
  let bestScore = 0;
  
  tables.forEach(table => {
    const normalizedTable = normalizeForMatching(table);
    
    // Check if one contains the other
    if (normalizedSheetName.includes(normalizedTable) || normalizedTable.includes(normalizedSheetName)) {
      // Calculate similarity score - improved to favor longer matches
      let score = Math.min(normalizedSheetName.length, normalizedTable.length) /
                  Math.max(normalizedSheetName.length, normalizedTable.length);
      
      // Boost score for common prefixes
      const commonPrefix = getCommonPrefix(normalizedSheetName, normalizedTable);
      if (commonPrefix.length > 3) {
        score += 0.1; // Boost score for meaningful prefixes
      }
      
      // Additional boost if only difference is spaces/hyphens/underscores
      const tableWithoutSpaces = table.replace(/[\s\-_]/g, '');
      const sheetWithoutSpaces = sheetName.replace(/[\s\-_]/g, '');
      if (tableWithoutSpaces.toLowerCase() === sheetWithoutSpaces.toLowerCase()) {
        score += 0.2; // Significant boost when only difference is space/hyphen/underscore
      }
      
      if (score > bestScore && score > 0.3) { // Lower threshold to 0.3 for more matches
        bestScore = score;
        bestMatch = table;
      }
    }
  });
  
  return bestScore > 0.3 ? bestMatch : null;
};

// Helper function to find common prefix
function getCommonPrefix(str1: string, str2: string): string {
  const minLength = Math.min(str1.length, str2.length);
  let i = 0;
  while (i < minLength && str1[i] === str2[i]) {
    i++;
  }
  return str1.substring(0, i);
}

/**
 * Map field names to their likely data types
 */
/**
 * Enhanced mapping of field name keywords to their likely data types
 * Expanded to handle more specific cases mentioned in the requirements
 */
export const dataTypeKeywords: Record<string, 'string' | 'number' | 'boolean' | 'date' | 'amount' | 'rate' | 'id'> = {
  // Date-related keywords - expanded with more specific cases
  "date": "date",
  "dob": "date",
  "as of": "date",
  "acquired": "date",
  "origination": "date",
  "paid": "date",
  "next due": "date",
  "last": "date",
  "effective": "date",
  "maturity": "date",
  "birth": "date",
  "start": "date",
  "end": "date",
  "due": "date",
  "created": "date",
  "modified": "date",
  "updated": "date",
  "closed": "date",
  "opened": "date",
  "dt": "date",
  "day": "date",
  "month": "date",
  "year": "date",
  "time": "date",
  "discharge": "date",      // For bankruptcy discharge date
  "dismissal": "date",      // For bankruptcy dismissal date
  "filed": "date",          // For bankruptcy filed date
  "filing": "date",         // For bankruptcy filing date
  "bankruptcy": "date",     // Often associated with dates
  "mfr": "date",            // Motion for Relief - legal date
  "foreclosure": "date",    // Foreclosure date
  "expiration": "date",     // Expiration date
  "expiry": "date",         // Expiry date
  "anniversary": "date",    // Anniversary date
  "inception": "date",      // Inception date
  "completion": "date",     // Completion date
  "settlement": "date",     // Settlement date
  "closing": "date",        // Closing date
  
  // Number-related keywords - expanded with more specific cases
  "term": "number",
  "period": "number",
  "count": "number",
  "times": "number",
  "days": "number",
  "months": "number",
  "years": "number",
  "age": "number",
  "quantity": "number",
  "qty": "number",
  "num": "number",
  "score": "number",
  "fico": "number",         // FICO score is always a number
  "credit score": "number", // Credit score is always a number
  "rating": "number",       // Rating is typically a number
  "points": "number",       // Points are numbers
  "grade": "number",        // Grade can be a number
  "level": "number",        // Level is typically a number
  "tier": "number",         // Tier is typically a number
  "rank": "number",         // Rank is a number
  "sequence": "number",     // Sequence is a number
  "order": "number",        // Order is a number
  "position": "number",     // Position is a number
  
  // Amount-related keywords
  "amount": "amount",
  "balance": "amount",
  "payment": "amount",
  "value": "amount",
  "price": "amount",
  "fee": "amount",
  "cost": "amount",
  "principal": "amount",
  "loan": "amount",
  "debt": "amount",
  "credit": "amount",
  "debit": "amount",
  "income": "amount",
  "expense": "amount",
  "revenue": "amount",
  "salary": "amount",
  "budget": "amount",
  "total": "amount",
  "sum": "amount",
  "amt": "amount",
  "bal": "amount",
  "pmt": "amount",
  "$": "amount",
  "dollar": "amount",
  "usd": "amount",
  "eur": "amount",
  "gbp": "amount",
  
  // Rate-related keywords
  "rate": "rate",
  "interest": "rate",
  "ltv": "rate",
  "dti": "rate",
  "percentage": "rate",
  "percent": "rate",
  "ratio": "rate",
  "apr": "rate",
  "apy": "rate",
  "yield": "rate",
  "discount": "rate",
  "margin": "rate",
  "pct": "rate",
  "%": "rate",
  
  // ID-related keywords
  "id": "id",
  "sid": "id",
  "number": "id",
  "key": "id",
  "identifier": "id",
  "reference": "id",
  "ref": "id",
  "account": "id",
  "acct": "id",
  "uuid": "id",
  "guid": "id",
  "ssn": "id",
  "ein": "id",
  "tin": "id",
  
  // String-related keywords
  "code": "string",
  "type": "string",
  "status": "string",
  "name": "string",
  "description": "string",
  "address": "string",
  "city": "string",
  "state": "string",
  "zip": "string",
  "occupancy": "string",
  "email": "string",
  "phone": "string",
  "url": "string",
  "comment": "string",
  "note": "string",
  "text": "string",
  "desc": "string",
  "title": "string",
  
  // Boolean-related keywords - expanded with more specific cases
  "flag": "boolean",
  "required": "boolean",
  "indicator": "boolean",
  "is": "boolean",
  "has": "boolean",
  "active": "boolean",
  "enabled": "boolean",
  "approved": "boolean",
  "verified": "boolean",
  "completed": "boolean",
  "eligible": "boolean",
  "qualified": "boolean",
  "valid": "boolean",
  "ind": "boolean",
  "yn": "boolean",
  "escrowed": "boolean",    // For P&C Escrowed Required
  "forced": "boolean",      // For P&C Forced Place Enabled
  "claim": "boolean",       // For P&C Prop Insurance Claim
  "allowed": "boolean",     // Allowed/not allowed
  "permitted": "boolean",   // Permitted/not permitted
  "authorized": "boolean",  // Authorized/not authorized
  "is_enabled": "boolean",  // Enabled/disabled
  "disabled": "boolean",    // Disabled/enabled
  "locked": "boolean",      // Locked/unlocked
  "unlocked": "boolean",    // Unlocked/locked
  "is_paid": "boolean",     // Paid/unpaid status
  "unpaid": "boolean",      // Unpaid/paid status
  "insured": "boolean",     // Insured/not insured
  "covered": "boolean"      // Covered/not covered
};

/**
 * Infer data type from field name
 */
/**
 * Enhanced field name type inference with improved pattern recognition
 * Addresses specific issues with date fields, boolean fields, and numeric fields
 *
 * @param fieldName - The field name to analyze
 * @returns The inferred data type
 */
export const inferTypeFromFieldName = (fieldName: string): 'string' | 'number' | 'boolean' | 'date' | 'amount' | 'rate' | 'id' => {
  // Convert field name to lowercase for case-insensitive matching
  const lowercaseField = fieldName.toLowerCase();
  
  // STEP 1: Check for exact keyword matches first (highest priority)
  for (const [keyword, type] of Object.entries(dataTypeKeywords)) {
    if (lowercaseField === keyword) {
      return type;
    }
  }
  
  // STEP 2: Check for specific patterns that strongly indicate a type
  
  // Date patterns - check for common date field patterns
  const datePatterns = [
    /date$/i, /^date/i, /dt$/i, /^dt/i,
    /timestamp/i, /time$/i, /^time/i,
    /birthday/i, /dob/i, /birth/i,
    /created/i, /modified/i, /updated/i,
    /start/i, /end/i, /begin/i, /finish/i,
    /due/i, /deadline/i, /expir/i,
    /schedule/i, /appointment/i,
    /discharge/i, /dismissal/i, /filed/i, /filing/i,
    /bankruptcy.*date/i, /mfr.*filed/i, /mfr.*date/i
  ];
  
  for (const pattern of datePatterns) {
    if (pattern.test(fieldName)) {
      return 'date';
    }
  }
  
  // Boolean patterns - check for common boolean field patterns
  const booleanPatterns = [
    /^is[A-Z]/i, /^has[A-Z]/i, /^can[A-Z]/i, /^should[A-Z]/i, /^will[A-Z]/i,
    /flag$/i, /indicator$/i, /enabled$/i, /active$/i,
    /required$/i, /eligible$/i, /qualified$/i,
    /escrowed.*required/i, /forced.*place/i, /insurance.*claim/i
  ];
  
  for (const pattern of booleanPatterns) {
    if (pattern.test(fieldName)) {
      return 'boolean';
    }
  }
  
  // Number/Score patterns - check for common number field patterns
  const numberPatterns = [
    /score$/i, /^score/i, /fico/i, /credit.*score/i,
    /rating$/i, /^rating/i, /grade$/i, /^grade/i,
    /points?$/i, /^points?/i, /level$/i, /^level/i
  ];
  
  for (const pattern of numberPatterns) {
    if (pattern.test(fieldName)) {
      return 'number';
    }
  }
  
  // STEP 3: Check for keywords within the field name with word boundary awareness
  for (const [keyword, type] of Object.entries(dataTypeKeywords)) {
    // Skip very short keywords (less than 3 chars) to avoid false positives
    if (keyword.length < 3) continue;
    
    // Check for word boundaries or beginning/end of string
    const keywordPattern = new RegExp(`(^|[^a-z])${keyword}([^a-z]|$)`, 'i');
    if (keywordPattern.test(lowercaseField)) {
      return type;
    }
    
    // Also check for keywords at the beginning or end of the field name
    if (lowercaseField.startsWith(keyword) || lowercaseField.endsWith(keyword)) {
      return type;
    }
  }
  
  // STEP 4: Check for common patterns in field names
  if (/^(dt|date)[A-Z]/.test(fieldName) || /[A-Z](dt|date)$/.test(fieldName)) {
    return 'date';
  }
  
  if (/^amt[A-Z]/.test(fieldName) || /[A-Z](amt|amount)$/.test(fieldName)) {
    return 'amount';
  }
  
  if (/^pct[A-Z]/.test(fieldName) || /[A-Z](pct|rate|percent)$/.test(fieldName)) {
    return 'rate';
  }
  
  if (/^id[A-Z]/.test(fieldName) || /[A-Z](id|key|num|number)$/.test(fieldName)) {
    return 'id';
  }

  // STEP 5: Check for keywords within the field name (fallback to simple includes)
  for (const [keyword, type] of Object.entries(dataTypeKeywords)) {
    // Check if field contains the keyword
    if (lowercaseField.includes(keyword)) {
      return type;
    }
  }

  // Default to string if no matches
  return 'string';
};

/**
 * Convert specialized types to base types
 */
export const normalizeFieldType = (type: 'string' | 'number' | 'boolean' | 'date' | 'amount' | 'rate' | 'id'): 'string' | 'number' | 'boolean' | 'date' => {
  // Map specialized types to base types
  switch (type) {
    case 'amount':
    case 'rate':
      return 'number';
    case 'id':
      // IDs could be strings or numbers, default to string
      return 'string';
    default:
      return type;
  }
};

/**
 * Check if a field contains values with leading zeros that should be preserved
 * This helps identify fields like ZIP codes, IDs, etc. that should be stored as strings
 */
export const hasLeadingZeros = (values: any[]): boolean => {
  if (!values || values.length === 0) return false;
  
  const numericWithLeadingZero = values.some(val => {
    // Check if the value is a string that looks numeric
    if (typeof val === 'string') {
      const trimmed = val.trim();
      // If it starts with '0' and contains only digits, it has leading zeros
      // Also check for formatted numbers with leading zeros (like '01,234')
      return (trimmed.match(/^0\d+$/) !== null) ||
             (trimmed.match(/^0\d[\d,\.]+$/) !== null);
    }
    return false;
  });
  
  return numericWithLeadingZero;
};

/**
 * Generate column mappings between a sheet and a table
 * Ensures all columns are added and implements field name-based type inference
 */
// Type conversion utilities
export const convertValue = (value: any, type: 'string' | 'number' | 'boolean' | 'date'): any => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  switch (type) {
    case 'number':
      // Handle thousand separators and percentages
      if (typeof value === 'string') {
        // Check if it's a percentage
        const isPercentage = value.trim().endsWith('%');
        // Remove commas and percentage signs
        value = value.replace(/,/g, '').replace(/%/g, '').trim();
        // Convert percentage to decimal if needed
        if (isPercentage) {
          const percentVal = Number(value);
          return isNaN(percentVal) ? null : percentVal / 100;
        }
      }
      const num = Number(value);
      return isNaN(num) ? null : num;
      
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') {
        const lowered = value.toLowerCase().trim();
        if (['true', 'yes', 'y', '1'].includes(lowered)) return true;
        if (['false', 'no', 'n', '0'].includes(lowered)) return false;
      }
      return null;
      
    case 'date':
      try {
        if (value instanceof Date) return value;
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
      } catch {
        return null;
      }
      
    case 'string':
    default:
      return String(value);
  }
};

// Check if a value might be a number (including percentage values)
export const isLikelyNumber = (value: any): boolean => {
  if (value === null || value === undefined || value === '') {
    return false;
  }
  
  const str = String(value).trim();
  
  // Handle percentage format
  if (str.endsWith('%')) {
    const percentVal = str.slice(0, -1).trim().replace(/,/g, '');
    return !isNaN(Number(percentVal));
  }
  
  // Handle currency formats that might have symbols
  const currencyRegEx = /^[\$\£\€\¥]?\s*[\-\+]?[\d,]+(\.\d+)?$/;
  if (currencyRegEx.test(str)) {
    const cleanValue = str.replace(/[^\-\+\d\.]/g, '');
    return !isNaN(Number(cleanValue));
  }
  
  // Handle general number formats including scientific
  return !isNaN(Number(str.replace(/,/g, '')));
};

/**
 * Result of mapping suggestion including confidence level
 */
export interface MappingSuggestionResult {
  mappings: Record<string, string>;
  confidence: Record<string, number>; // 0-1 confidence score for each mapping
  unmappedSheets: string[];
}

/**
 * Get suggested table mappings for sheet names with confidence scores
 */
export const getSuggestedMappings = async (
  sheets: SheetInfo[],
  dbService: DatabaseService,
  tables: string[]
): Promise<MappingSuggestionResult> => {
  const mappings: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  const unmappedSheets: string[] = [];
  
  try {
    // First try the database service for suggestions
    const sheetNames = sheets.map(sheet => sheet.name); // Revert to using sheetNames
    const suggestedMappings = await dbService.getSuggestedTableMappings(sheetNames); // Pass sheetNames
    
    // Process service-based suggestions
    suggestedMappings.forEach((suggestion: TableMappingSuggestion) => {
      // Use confidenceScore as reverted in types.ts
      if (suggestion.tableName && suggestion.confidenceScore > 0) {
        if (suggestion.confidenceScore >= 0.6) { // Revert threshold
          // High confidence match - auto-select
          mappings[suggestion.sheetName] = suggestion.tableName;
          confidence[suggestion.sheetName] = suggestion.confidenceScore;
        } else if (suggestion.confidenceScore >= 0.3) { // Revert threshold
          // Medium confidence match - still auto-select but mark as lower confidence
          mappings[suggestion.sheetName] = suggestion.tableName;
          confidence[suggestion.sheetName] = suggestion.confidenceScore;
        } else {
          // Low confidence, don't auto-map
          unmappedSheets.push(suggestion.sheetName);
        }
      } else {
        unmappedSheets.push(suggestion.sheetName);
      }
    });
  } catch (error) {
    console.error('Error getting suggested table mappings from service:', error);
    // Service failed, we'll use the fallback for all sheets
  }
  
  // For sheets without mappings, use the fallback algorithm
  sheets.forEach(sheet => {
    if (!mappings[sheet.name] && !unmappedSheets.includes(sheet.name)) {
      const matchingTable = findBestTableMatch(sheet.name, tables);
      if (matchingTable) {
        mappings[sheet.name] = matchingTable;
        // Local matches generally have good confidence if they pass our matching threshold
        confidence[sheet.name] = 0.7;
      } else {
        unmappedSheets.push(sheet.name);
      }
    }
  });
  
  return { mappings, confidence, unmappedSheets };
};


