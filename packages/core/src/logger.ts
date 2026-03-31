/**
 * Logging utility for workflows-core
 *
 * Provides structured logging with pluggable sinks:
 * - Uses stderr for all local logging by default
 * - Supports external log sinks (e.g., MCP notifications) via LogSink interface
 * - Provides structured logging with proper levels:
 *   - debug: Tracing and detailed execution flow
 *   - info: Success operations and important milestones
 *   - warn: Expected errors and recoverable issues
 *   - error: Caught but unexpected errors
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4, // Suppress all logging
}

export interface LogContext {
  component?: string;
  conversationId?: string;
  phase?: string;
  operation?: string;
  [key: string]: unknown;
}

/**
 * Interface for external log sinks (e.g., MCP notifications, console, file)
 * Implementations can be registered to receive log messages
 */
export interface LogSink {
  /**
   * Called when a log message should be sent to the sink
   * @param level - Log level (debug, info, warning, error)
   * @param logger - Component name that generated the log
   * @param message - Log message
   * @param context - Optional structured context
   */
  log(
    level: 'debug' | 'info' | 'warning' | 'error',
    logger: string,
    message: string,
    context?: LogContext
  ): Promise<void>;
}

/**
 * Logger interface for dependency injection
 * Allows handlers to receive a logger without importing the global createLogger
 */
export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
}

/**
 * Factory function type for creating loggers
 * Can be injected to provide different logging implementations
 */
export type LoggerFactory = (component: string) => ILogger;

// Global log sink reference (e.g., MCP server, custom sink)
let logSinkInstance: LogSink | null = null;

// Unified logging level - can be set externally or via environment
let currentLoggingLevel: LogLevel | null = null;

// Test mode detection function to check at runtime
function isTestMode(): boolean {
  // Check explicit environment variables
  if (process.env['NODE_ENV'] === 'test' || process.env['VITEST'] === 'true') {
    return true;
  }

  // Check if LOG_LEVEL is explicitly set to ERROR
  if (process.env['LOG_LEVEL'] === 'ERROR') {
    return true;
  }

  return false;
}

/**
 * Register a log sink to receive log messages
 * Used by mcp-server to register MCP notification sink
 */
export function registerLogSink(sink: LogSink): void {
  logSinkInstance = sink;
}

/**
 * Clear the registered log sink
 */
export function clearLogSink(): void {
  logSinkInstance = null;
}

/**
 * Set the logging level programmatically
 */
export function setLoggingLevel(level: LogLevel): void {
  currentLoggingLevel = level;
}

/**
 * Set the logging level from a string (e.g., from MCP client request)
 */
export function setLoggingLevelFromString(level: string): void {
  // Map string levels to our internal levels
  const levelMap: Record<string, LogLevel> = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    notice: LogLevel.INFO,
    warning: LogLevel.WARN,
    error: LogLevel.ERROR,
    critical: LogLevel.ERROR,
    alert: LogLevel.ERROR,
    emergency: LogLevel.ERROR,
  };

  currentLoggingLevel = levelMap[level] ?? LogLevel.INFO;
}

class Logger {
  private component: string;
  private explicitLogLevel: LogLevel | undefined;

  constructor(component: string, logLevel?: LogLevel) {
    this.component = component;
    this.explicitLogLevel = logLevel;
  }

  private getCurrentLogLevel(): LogLevel {
    // Check environment variable first (allows SILENT to override test mode)
    const envLevel = this.getLogLevelFromEnv();
    if (envLevel === LogLevel.SILENT) {
      return LogLevel.SILENT;
    }

    // Force ERROR level in test environments (unless SILENT)
    if (isTestMode()) {
      return LogLevel.ERROR;
    }

    // Use externally-set level if available (takes precedence)
    if (currentLoggingLevel !== null) {
      return currentLoggingLevel;
    }

    // Use environment variable level
    if (envLevel !== null) {
      return envLevel;
    }

    // If explicit log level was provided, use it
    if (this.explicitLogLevel !== undefined) {
      return this.explicitLogLevel;
    }

    // Default to INFO
    return LogLevel.INFO;
  }

  private getLogLevelFromEnv(): LogLevel | null {
    const envLevel = process.env['LOG_LEVEL']?.toUpperCase();
    switch (envLevel) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      case 'SILENT':
        return LogLevel.SILENT;
      default:
        return null;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.getCurrentLogLevel();
  }

  private formatMessage(
    level: string,
    message: string,
    context?: LogContext
  ): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} [${this.component}] ${message}${contextStr}`;
  }

  /**
   * Send log message to registered sink if available
   */
  private async sendToSink(
    level: 'debug' | 'info' | 'warning' | 'error',
    message: string,
    context?: LogContext
  ): Promise<void> {
    if (logSinkInstance) {
      try {
        await logSinkInstance.log(level, this.component, message, context);
      } catch (error) {
        // Fallback to stderr if sink fails
        if (!isTestMode()) {
          process.stderr.write(
            `[LOG-SINK-ERROR] Failed to send log to sink: ${error}\n`
          );
        }
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      // Avoid duplicate output when a sink is active (sink owns its own output channel)
      if (!logSinkInstance) {
        const formattedMessage = this.formatMessage('debug', message, context);
        process.stderr.write(formattedMessage + '\n');
      }
      this.sendToSink('debug', message, context).catch(() => {
        // Sink errors are non-fatal for debug messages
      });
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      // Avoid duplicate output when a sink is active (sink owns its own output channel)
      if (!logSinkInstance) {
        const formattedMessage = this.formatMessage('info', message, context);
        process.stderr.write(formattedMessage + '\n');
      }
      this.sendToSink('info', message, context).catch(() => {
        // Sink errors are non-fatal for info messages
      });
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      // Avoid duplicate output when a sink is active (sink owns its own output channel)
      if (!logSinkInstance) {
        const formattedMessage = this.formatMessage('warn', message, context);
        process.stderr.write(formattedMessage + '\n');
      }
      this.sendToSink('warning', message, context).catch(() => {
        // Sink errors are non-fatal for warn messages
      });
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorContext = error
        ? { ...context, error: error.message, stack: error.stack }
        : context;
      // Avoid duplicate output when a sink is active (sink owns its own output channel)
      if (!logSinkInstance) {
        const formattedMessage = this.formatMessage(
          'error',
          message,
          errorContext
        );
        process.stderr.write(formattedMessage + '\n');
      }
      this.sendToSink('error', message, errorContext).catch(() => {
        // Sink errors are non-fatal — error already written to stderr above
      });
    }
  }

  child(childComponent: string): Logger {
    return new Logger(
      `${this.component}:${childComponent}`,
      this.explicitLogLevel
    );
  }
}

// Factory function to create loggers
export function createLogger(component: string, logLevel?: LogLevel): Logger {
  return new Logger(component, logLevel);
}

// Default logger for the main application
export const logger = createLogger('workflows-core');
