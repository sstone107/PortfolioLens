/**
 * Format a number as currency
 * @param value - The number to format
 * @param currency - The currency code (default: USD)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string
 */
export const formatCurrency = (
  value: number | string | undefined | null,
  currency = 'USD',
  decimals = 2
): string => {
  if (value === undefined || value === null) return 'N/A';
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) return 'N/A';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue);
};

/**
 * Format a number as percentage
 * @param value - The number to format (0.05 = 5%)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string
 */
export const formatPercent = (
  value: number | string | undefined | null,
  decimals = 3
): string => {
  if (value === undefined || value === null) return 'N/A';
  
  let numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) return 'N/A';
  
  // If the value is already in percentage form (e.g., 5 instead of 0.05)
  if (numValue > 1) {
    numValue = numValue / 100;
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue);
};

/**
 * Format a date string to a readable format
 * @param dateString - The date string to format
 * @param format - The format to use (default: MM/DD/YYYY)
 * @returns Formatted date string
 */
export const formatDate = (
  dateString: string | Date | undefined | null,
  format = 'MM/DD/YYYY'
): string => {
  if (!dateString) return 'N/A';
  
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  
  if (isNaN(date.getTime())) return 'N/A';
  
  // Use Intl.DateTimeFormat for localization
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  };
  
  return new Intl.DateTimeFormat('en-US', options).format(date);
};

/**
 * Truncate text to a maximum length
 * @param text - The text to truncate
 * @param maxLength - Maximum length (default: 100)
 * @returns Truncated text with ellipsis if needed
 */
export const truncateText = (
  text: string | undefined | null,
  maxLength = 100
): string => {
  if (!text) return '';
  
  if (text.length <= maxLength) return text;
  
  return `${text.substring(0, maxLength)}...`;
};

/**
 * Format a number with commas as thousands separators
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted number string
 */
export const formatNumber = (
  value: number | string | undefined | null,
  decimals = 0
): string => {
  if (value === undefined || value === null) return 'N/A';
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) return 'N/A';
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue);
};

/**
 * Format a phone number to standard US format
 * @param phone - The phone number to format
 * @returns Formatted phone number
 */
export const formatPhoneNumber = (
  phone: string | undefined | null
): string => {
  if (!phone) return 'N/A';
  
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Check if the input is valid
  if (cleaned.length < 10) return phone;
  
  // Format: (XXX) XXX-XXXX
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  
  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }
  
  return phone;
};

/**
 * Format a SSN with only the last 4 digits visible
 * @param ssn - Full SSN
 * @returns Masked SSN
 */
export const maskSSN = (
  ssn: string | undefined | null
): string => {
  if (!ssn) return 'N/A';
  
  // Remove all non-numeric characters
  const cleaned = ssn.replace(/\D/g, '');
  
  // Check if the input is valid
  if (cleaned.length !== 9) return ssn;
  
  // Mask all but the last 4 digits
  return `xxx-xx-${cleaned.slice(-4)}`;
};