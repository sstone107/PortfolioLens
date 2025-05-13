/**
 * Utility functions for working with table names
 * Including prefixing, display names, and categorization
 */

/**
 * Table classification types
 */
export enum TableCategory {
  SYSTEM = 'system',     // Internal system tables hidden from users
  LOAN = 'loan',         // Loan-level data tables  
  USER = 'user',         // User-created tables
  IMPORT = 'import',     // Import system tables
  REPORTING = 'reporting', // Reporting/analytics tables
  PARTNER = 'partner'     // Partner/external entity tables
}

/**
 * Prefix configuration for different table categories
 */
export const TablePrefixes = {
  [TableCategory.SYSTEM]: 'sys_',
  [TableCategory.LOAN]: 'ln_',  // Using shortened 'ln_' prefix for loan tables
  [TableCategory.USER]: 'usr_',
  [TableCategory.IMPORT]: 'imp_',
  [TableCategory.REPORTING]: 'rpt_',
  [TableCategory.PARTNER]: 'prt_'
};

/**
 * Reserved table names that shouldn't be used directly
 * These tables should be prefixed with appropriate category prefix
 */
export const RESERVED_TABLE_NAMES = [
  // Loan-related tables
  'payments',
  'trailing_payments',
  'borrowers',
  'loan_information',
  'delinquency',
  'expenses',
  'properties',
  'loans',
  'bankruptcy',
  'foreclosure',
  'insurance',
  'loan_notes',
  'loan_documents',
  
  // System-related tables
  'users',
  'roles',
  'permissions',
  'settings',
  'migrations',
  'templates',
  'logs',
  'audit',
  'user',
  'order',
  'group',
  'table',
  'column',
  'function',
  'index',
  'view',
  'sequence',
  'type',
  'constraint',
  'trigger',
  'admin_audit_log',
  'audit_logs',
  'audit_trail',
  'sql_execution_log',
  'schema_cache',
  
  // Partner tables
  'investors',
  'servicers',
  'sellers',
  'doc_custodians',
  'portfolios',
  'prior_servicers',
  
  // Import tables
  'import_jobs',
  'import_mappings',
  'uploads',
  'mapping_templates',
  
  // Reserved words from PostgreSQL
  'user',
  'time',
  'timestamp',
  'date',
  'interval',
  'check',
  'default',
  'primary',
  'references',
  'collate',
  'language'
];

/**
 * Determines if a table name should be prefixed
 * @param tableName The raw table name
 * @returns boolean True if the table should be prefixed
 */
export const shouldPrefixTable = (tableName: string): boolean => {
  const normalized = tableName.toLowerCase().trim();
  
  // Don't prefix if it already has a prefix
  if (Object.values(TablePrefixes).some(prefix => normalized.startsWith(prefix))) {
    return false;
  }
  
  // Always prefix reserved names
  if (RESERVED_TABLE_NAMES.includes(normalized)) {
    return true;
  }
  
  // Prefix names that contain specific SQL keywords or are very generic
  const shouldPrefix = [
    'user', 'users', 'group', 'groups', 'role', 'roles', 'permission', 'permissions',
    'setting', 'settings', 'config', 'configuration', 'log', 'logs', 'audit', 'history',
    'meta', 'metadata', 'template', 'templates', 'version', 'backup', 'archive',
    'temp', 'tmp', 'cache', 'data', 'info', 'summary'
  ];
  
  return shouldPrefix.some(word => normalized.includes(word));
};

/**
 * Applies the appropriate prefix to a table name based on category
 * @param tableName The raw table name to prefix
 * @param category The category of table
 * @returns string The prefixed table name
 */
export const applyTablePrefix = (
  tableName: string, 
  category: TableCategory = TableCategory.LOAN
): string => {
  // Get the prefix for this category
  const prefix = TablePrefixes[category];
  
  // Already has the correct prefix
  if (tableName.startsWith(prefix)) {
    return tableName;
  }
  
  // Remove any existing prefixes
  const prefixes = Object.values(TablePrefixes);
  let cleanName = tableName;
  
  for (const p of prefixes) {
    if (cleanName.startsWith(p)) {
      cleanName = cleanName.substring(p.length);
      break;
    }
  }
  
  // Apply the new prefix
  return `${prefix}${cleanName}`;
};

/**
 * Gets a user-friendly display name by removing prefixes
 * @param tableName The prefixed database table name
 * @returns string The user-friendly display name
 */
export const getDisplayName = (tableName: string): string => {
  const prefixes = Object.values(TablePrefixes);
  let displayName = tableName;
  
  // Remove any prefixes
  for (const prefix of prefixes) {
    if (displayName.startsWith(prefix)) {
      displayName = displayName.substring(prefix.length);
      break;
    }
  }
  
  // Convert snake_case to "Title Case"
  return displayName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Detects the category of a table based on its name or prefix
 * @param tableName The table name to analyze
 * @returns TableCategory The detected category
 */
export const detectTableCategory = (tableName: string): TableCategory => {
  const normalizedName = tableName.toLowerCase().trim();
  
  // Check for known prefixes first
  for (const [category, prefix] of Object.entries(TablePrefixes)) {
    if (normalizedName.startsWith(prefix)) {
      return category as TableCategory;
    }
  }
  
  // Check for partner/external entity tables
  const partnerTerms = [
    'investor', 'servicer', 'seller', 'custodian', 'vendor', 
    'partner', 'portfolio', 'doc_custodian', 'prior_servicer'
  ];
  
  if (partnerTerms.some(term => normalizedName.includes(term))) {
    return TableCategory.PARTNER;
  }
  
  // Look for known system tables without standard prefixes
  const knownSystemTables = [
    'pg_', 'information_schema', 'auth', 'storage', 'supabase_functions',
    'schema_', 'extensions', 'realtime', 'audit', 'system', 'tenant',
    'templates', 'mapping_template', 'settings', 'logs', 'config', 'metadata',
    'user_role', 'role', 'permission', 'module', 'tag'
  ];
  
  if (knownSystemTables.some(term => normalizedName.includes(term))) {
    return TableCategory.SYSTEM;
  }
  
  // Check for import-related tables
  if (normalizedName.includes('import') || normalizedName.includes('batch') ||
      normalizedName.includes('staging') || normalizedName.includes('temp_') ||
      normalizedName.includes('upload') || normalizedName.includes('mapping')) {
    return TableCategory.IMPORT;
  }
  
  // Check for reporting tables
  if (normalizedName.includes('report') || normalizedName.includes('summary') ||
      normalizedName.includes('stats') || normalizedName.includes('metrics') ||
      normalizedName.includes('dashboard') || normalizedName.includes('analysis') ||
      normalizedName.includes('billing')) {
    return TableCategory.REPORTING;
  }
  
  // Tables with loan-related terms are categorized as LOAN
  const loanTerms = [
    'loan', 'borrower', 'payment', 'note', 'collateral', 
    'property', 'mortgage', 'amortization', 'lien', 'escrow', 
    'disburse', 'trailing', 'bankruptcy', 'foreclosure', 
    'delinquency', 'insurance', 'expense'
  ];
                     
  if (loanTerms.some(term => normalizedName.includes(term))) {
    return TableCategory.LOAN;
  }
  
  // If we've reached here with no match, assume it's a loan table as default
  return TableCategory.LOAN;
};