/**
 * PhotoCache Logger
 * 
 * Centralized logging for PhotoCacheService that respects dev mode settings.
 * Only logs when __DEV__ is true AND verbose logging is enabled.
 */

let verboseLoggingEnabled = false;

/**
 * Enable or disable verbose logging.
 * Should be called from SettingsScreen when dev mode is toggled.
 */
export function setVerboseLogging(enabled: boolean): void {
  verboseLoggingEnabled = enabled;
}

/**
 * Check if verbose logging is enabled.
 */
export function isVerboseLoggingEnabled(): boolean {
  return __DEV__ && verboseLoggingEnabled;
}

/**
 * Log a debug message (only in dev mode with verbose logging enabled).
 */
export function logDebug(...args: any[]): void {
  if (isVerboseLoggingEnabled()) {
    console.log(...args);
  }
}

/**
 * Log a warning (only in dev mode with verbose logging enabled).
 */
export function logWarn(...args: any[]): void {
  if (isVerboseLoggingEnabled()) {
    console.warn(...args);
  }
}

/**
 * Log an error (always logged, regardless of dev mode).
 */
export function logError(...args: any[]): void {
  console.error(...args);
}


