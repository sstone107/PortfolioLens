/**
 * Error Suppression Utilities
 * 
 * This module provides utilities to suppress specific console errors and warnings
 * that are known and expected in the application.
 */

/**
 * Suppress specific MUI error messages related to Select components
 * which occur during rendering due to dynamic data loading
 */
export const suppressMuiSelectErrors = (): () => void => {
  // Store original console methods
  const originalError = console.error;
  const originalWarn = console.warn;
  
  // Replace error with filtered version
  console.error = (...args: any[]) => {
    // Don't log MUI out-of-range value warnings
    if (args[0] && typeof args[0] === 'string') {
      // Filter out specific MUI Select errors that occur during rendering
      if (args[0].includes('MUI: You have provided an out-of-range value') ||
          args[0].includes('Consider providing a value that matches one of the available options') ||
          args[0].includes('The available values are')) {
        return; // Suppress this specific error
      }
    }
    
    // Log all other errors normally
    originalError.apply(console, args);
  };
  
  // Also suppress related warnings
  console.warn = (...args: any[]) => {
    // Don't log warnings about mapped columns not found
    if (args[0] && typeof args[0] === 'string' &&
        (args[0].includes('Mapped column') && 
        args[0].includes('not found in available options'))) {
      return; // Suppress this warning
    }
    
    // Log all other warnings normally
    originalWarn.apply(console, args);
  };
  
  // Return a function to restore the original console methods
  return () => {
    console.error = originalError;
    console.warn = originalWarn;
  };
};

/**
 * General-purpose MUI warning suppression for components
 * This can be used directly in components to suppress MUI warnings
 */
export const suppressMuiWarnings = (): void => {
  // Store original console methods
  const originalError = console.error;
  const originalWarn = console.warn;
  
  // Replace error with filtered version
  console.error = (...args: any[]) => {
    // Don't log MUI out-of-range value warnings
    if (args[0] && typeof args[0] === 'string') {
      // Filter out common MUI errors
      if (args[0].includes('MUI:') ||
          args[0].includes('Material-UI:') ||
          args[0].includes('findDOMNode is deprecated')) {
        return; // Suppress these errors
      }
    }
    
    // Log all other errors normally
    originalError.apply(console, args);
  };
  
  // Also suppress related warnings
  console.warn = (...args: any[]) => {
    // Don't log MUI-related warnings
    if (args[0] && typeof args[0] === 'string' &&
        (args[0].includes('MUI:') ||
         args[0].includes('Material-UI:'))) {
      return; // Suppress these warnings
    }
    
    // Log all other warnings normally
    originalWarn.apply(console, args);
  };
  
  // Restore console methods after component unmounts
  setTimeout(() => {
    console.error = originalError;
    console.warn = originalWarn;
  }, 0);
};

/**
 * Initialize error suppression for the entire application.
 * This function should be called early in the application lifecycle.
 */
export const initializeErrorSuppression = (): void => {
  suppressMuiSelectErrors();
  
  // Add other error suppression initializations here if needed
};

// Automatically initialize error suppression when this module is imported
// initializeErrorSuppression(); // Commented out to disable automatic suppression

// Log that error suppression has been initialized
// console.info('MUI error suppression initialized'); // Also comment out the log message