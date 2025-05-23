/**
 * Utilities for handling column names in the import system
 */

/**
 * Makes a column name safe for PostgreSQL
 * - Converts to lowercase
 * - Replaces non-alphanumeric characters with underscores
 * - Prefixes with 'n_' if it starts with a number
 * - Truncates to 63 characters (PostgreSQL limit)
 */
export function safeColumnName(name: string): string {
  if (!name) return '';
  
  let safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 63);
  
  // If the name starts with a number, prefix it with 'n_'
  if (/^\d/.test(safeName)) {
    safeName = 'n_' + safeName;
  }
  
  // Ensure it's not longer than 63 characters after prefix
  return safeName.substring(0, 63);
}

/**
 * Checks if a column name needs transformation
 */
export function needsColumnTransformation(name: string): boolean {
  const safeName = safeColumnName(name);
  return safeName !== name.toLowerCase();
}

/**
 * Gets a display-friendly version of the column name
 * Shows the original name with a note about transformation
 */
export function getColumnDisplayName(originalName: string): string {
  const safeName = safeColumnName(originalName);
  
  if (safeName !== originalName.toLowerCase()) {
    return `${originalName} → ${safeName}`;
  }
  
  return originalName;
}

/**
 * Transforms column mappings to ensure all mapped names are safe
 */
export function transformColumnMappings(mappings: Array<{
  originalName: string;
  mappedName: string;
  dataType?: string;
}>): Array<{
  originalName: string;
  mappedName: string;
  dataType?: string;
}> {
  return mappings.map(mapping => ({
    ...mapping,
    mappedName: safeColumnName(mapping.mappedName)
  }));
}

/**
 * Common problematic column names and their safe versions
 */
export const COMMON_COLUMN_TRANSFORMATIONS = {
  '30_dpd_count': 'n_30_dpd_count',
  '60_dpd_count': 'n_60_dpd_count',
  '90_dpd_count': 'n_90_dpd_count',
  '24_month_pay_history': 'n_24_month_pay_history',
  '120_dpd_count': 'n_120_dpd_count',
  '180_dpd_count': 'n_180_dpd_count',
  '1st_lien_position': 'n_1st_lien_position',
  '2nd_lien_position': 'n_2nd_lien_position',
  '3rd_party_fees': 'n_3rd_party_fees',
  '1099_interest': 'n_1099_interest',
  '1098_sent': 'n_1098_sent'
};