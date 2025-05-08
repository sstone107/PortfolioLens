/**
 * Creates a SQL-friendly name from a string.
 * Replaces spaces and common problematic characters with underscores,
 * ensures it doesn't start with a number, and truncates to a max length.
 * @param name The input string.
 * @returns A SQL-friendly version of the name.
 */
export const toSqlFriendlyName = (name: string): string => {
  if (!name) return '';
  // Replace spaces and common problematic characters with underscores
  let sqlName = name.replace(/[\s\/\\?%*:|"<>.-]+/g, '_');
  // Remove any leading/trailing underscores that might result
  sqlName = sqlName.replace(/^_+|_+$/g, '');
  // Ensure it doesn't start with a number (common SQL restriction)
  if (/^\d/.test(sqlName)) {
    sqlName = '_' + sqlName;
  }
  // Optional: Convert to lowercase, as many SQL dialects are case-insensitive or default to lowercase
  // sqlName = sqlName.toLowerCase();
  return sqlName.slice(0, 63); // Max length for some identifiers like in PostgreSQL
};
