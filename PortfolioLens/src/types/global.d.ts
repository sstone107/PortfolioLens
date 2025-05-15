// Global type declarations for the application

interface Window {
  /**
   * Debug flag for data type inference logging
   * Set to true to enable detailed console.group logging of column type inference decisions
   */
  __debugDataTypes?: boolean;
  
  /**
   * Helper function to toggle data type debugging on/off
   * @returns A string with the current debug status
   */
  toggleDataTypeDebugging?: () => string;
}

// Declare global variables and types here