/**
 * Calculates the Levenshtein distance between two strings.
 * @param s1 The first string.
 * @param s2 The second string.
 * @returns The Levenshtein distance.
 */
function levenshteinDistance(s1: string, s2: string): number {
  if (s1.length < s2.length) {
    return levenshteinDistance(s2, s1);
  }

  if (s2.length === 0) {
    return s1.length;
  }

  const previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);

  for (let i = 0; i < s1.length; i++) {
    let currentRow = [i + 1];
    for (let j = 0; j < s2.length; j++) {
      const insertions = previousRow[j + 1] + 1;
      const deletions = currentRow[j] + 1;
      const substitutions = previousRow[j] + (s1[i] === s2[j] ? 0 : 1);
      currentRow.push(Math.min(insertions, deletions, substitutions));
    }
    previousRow.splice(0, previousRow.length, ...currentRow);
  }

  return previousRow[s2.length];
}

/**
 * Calculates the similarity between two strings based on Levenshtein distance.
 * @param s1 The first string.
 * @param s2 The second string.
 * @returns A similarity score between 0 (completely different) and 1 (identical).
 */
export function calculateSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  const longerLength = Math.max(s1.length, s2.length);
  if (longerLength === 0) return 1; // Both are empty

  const distance = levenshteinDistance(s1.toLowerCase(), s2.toLowerCase());
  return (longerLength - distance) / longerLength;
}

// Helper for normalizing names for DB (from ColumnMappingStep, might be better here)
// Keep track of existing column names to avoid prefixing with underscore if already numeric
let existingDbColumnNames: Set<string> = new Set();

export function setExistingColumns(columnNames: string[]): void {
  existingDbColumnNames = new Set(columnNames.map(name => name.toLowerCase()));
}

/**
 * Normalizes a string to be a SQL-friendly column name.
 * - Converts to lowercase
 * - Replaces spaces and non-alphanumeric characters (except underscore) with underscores
 * - Ensures it starts with a letter or underscore (prepends '_' if starts with a digit and not an existing numeric-like column)
 * - Removes leading/trailing underscores
 * - Collapses multiple consecutive underscores
 * @param input The string to normalize.
 * @returns A SQL-friendly version of the string.
 */
export function normalizeForDb(input: string): string {
  if (!input) return '';

  let normalized = input.toLowerCase();

  // Replace problematic characters (anything not a-z, 0-9, or _) with underscore
  normalized = normalized.replace(/[^a-z0-9_]/g, '_');

  // Ensure it starts with a letter or underscore
  // If it starts with a digit, and the original input (converted to underscore format) is not in existingDbColumnNames, prepend '_'
  if (/^[0-9]/.test(normalized)) {
    const prospectiveName = normalized.replace(/ /g, '_').toLowerCase(); // Simulate simple normalization
    if (!existingDbColumnNames.has(prospectiveName)) {
      normalized = '_' + normalized;
    }
  }
  
  // Collapse multiple underscores to a single underscore
  normalized = normalized.replace(/__+/g, '_');

  // Remove leading underscores (if not the only character)
  if (normalized.length > 1 && normalized.startsWith('_')) {
    // normalized = normalized.substring(1);
  }
  // Remove trailing underscores (if not the only character)
  if (normalized.length > 1 && normalized.endsWith('_')) {
    normalized = normalized.substring(0, normalized.length - 1);
  }

  // Ensure it's not empty if the input wasn't, default to 'new_field'
  if (!normalized && input) {
    return 'new_field';
  }
  
  return normalized;
}
