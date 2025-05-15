/**
 * Logger Utility for PortfolioLens
 * 
 * Provides centralized, configurable logging that can be toggled on/off
 * based on environment or user preference.
 * 
 * Usage:
 * - Import: import { Logger } from '../utility/logger';
 * - Log:    Logger.debug('My debug message');
 * - Enable: Logger.setLevel('debug', true);
 * - Toggle: Logger.enableAll() or Logger.disableAll()
 */

interface LogLevels {
  error: boolean;
  warn: boolean;
  info: boolean;
  debug: boolean;
  trace: boolean;
}

interface LoggerInterface {
  levels: LogLevels;
  setLevel(level: keyof LogLevels, enabled?: boolean): void;
  enableAll(): void;
  disableAll(): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
  info(...args: any[]): void;
  debug(...args: any[]): void;
  trace(...args: any[]): void;
}

// Check for development environment
const isDevelopment = typeof process !== 'undefined' && 
  process.env && 
  process.env.NODE_ENV === 'development';

// Export the Logger singleton
export const Logger: LoggerInterface = {
  // Default logging levels - errors and warnings always on
  // Debug and trace off unless in development
  levels: {
    error: true,                 // Always show errors
    warn: true,                  // Always show warnings
    info: isDevelopment,         // Show info in development
    debug: false,                // Hide debug by default
    trace: false                 // Hide trace by default
  },
  
  // Enable or disable specific log level
  setLevel(level: keyof LogLevels, enabled = true) {
    if (Object.prototype.hasOwnProperty.call(this.levels, level)) {
      this.levels[level] = enabled;
    }
  },
  
  // Enable all logging levels
  enableAll() {
    Object.keys(this.levels).forEach(level => {
      this.levels[level as keyof LogLevels] = true;
    });
    console.info('All logging levels enabled');
  },
  
  // Disable all logging except errors
  disableAll() {
    Object.keys(this.levels).forEach(level => {
      this.levels[level as keyof LogLevels] = level === 'error';
    });
    console.info('All logging levels disabled (except errors)');
  },
  
  // Logging methods with level checks
  error(...args: any[]) {
    if (this.levels.error) console.error(...args);
  },
  
  warn(...args: any[]) {
    if (this.levels.warn) console.warn(...args);
  },
  
  info(...args: any[]) {
    if (this.levels.info) console.info(...args);
  },
  
  debug(...args: any[]) {
    if (this.levels.debug) console.debug(...args);
  },
  
  trace(...args: any[]) {
    if (this.levels.trace) console.log(...args);
  }
};

// Add browser console access
declare global {
  interface Window {
    PortfolioLogger: LoggerInterface;
  }
}

// Make logger accessible in browser console
if (typeof window !== 'undefined') {
  window.PortfolioLogger = Logger;
  
  // Only show hint in development
  if (isDevelopment) {
    console.info(
      'Logger available. Use window.PortfolioLogger.enableAll() or ' +
      'window.PortfolioLogger.disableAll() to toggle logging.'
    );
  }
}