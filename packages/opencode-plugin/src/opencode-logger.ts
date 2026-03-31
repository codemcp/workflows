import {
  createLogger as coreCreateLogger,
  registerLogSink,
  type LogSink,
  type LogContext,
  type ILogger,
  type LoggerFactory,
} from '@codemcp/workflows-core';
import type { PluginInput } from './types.js';

/**
 * Logger interface for structured logging
 */
export interface Logger {
  debug: (message: string, extra?: Record<string, unknown>) => void;
  info: (message: string, extra?: Record<string, unknown>) => void;
  warn: (message: string, extra?: Record<string, unknown>) => void;
  error: (message: string, extra?: Record<string, unknown>) => void;
}

/**
 * OpenCode SDK client interface for logging
 */
interface OpenCodeClient {
  app: {
    log: (params: {
      body: {
        service: string;
        level: 'debug' | 'info' | 'warn' | 'error';
        message: string;
        extra?: Record<string, unknown>;
      };
    }) => Promise<void>;
  };
}

/**
 * Create a logger factory that creates loggers which send output to OpenCode SDK.
 * This factory can be passed to ServerContext so handlers use OpenCode logging.
 */
export function createOpenCodeLoggerFactory(
  client: PluginInput['client']
): LoggerFactory {
  const openCodeClient = client as OpenCodeClient;

  return (component: string): ILogger => {
    return {
      debug: (message: string, context?: LogContext) => {
        openCodeClient.app
          .log({
            body: {
              service: component,
              level: 'debug',
              message,
              extra: context as Record<string, unknown> | undefined,
            },
          })
          .catch(() => {});
      },
      info: (message: string, context?: LogContext) => {
        openCodeClient.app
          .log({
            body: {
              service: component,
              level: 'info',
              message,
              extra: context as Record<string, unknown> | undefined,
            },
          })
          .catch(() => {});
      },
      warn: (message: string, context?: LogContext) => {
        openCodeClient.app
          .log({
            body: {
              service: component,
              level: 'warn',
              message,
              extra: context as Record<string, unknown> | undefined,
            },
          })
          .catch(() => {});
      },
      error: (message: string, error?: Error, context?: LogContext) => {
        const errorContext = error
          ? { ...context, error: error.message, stack: error.stack }
          : context;
        openCodeClient.app
          .log({
            body: {
              service: component,
              level: 'error',
              message,
              extra: errorContext as Record<string, unknown> | undefined,
            },
          })
          .catch(() => {});
      },
    };
  };
}

/**
 * Create a logger backed by core's createLogger + a LogSink that delegates
 * log output to the OpenCode SDK client.app.log() API.
 */
export function createOpenCodeLogger(client: PluginInput['client']): Logger {
  const openCodeClient = client as OpenCodeClient;
  const service = 'plugin.workflows';

  // Register a LogSink that forwards core log events to the OpenCode SDK.
  // The core LogSink interface uses 'warning' for warn-level; we map that
  // back to 'warn' for the OpenCode SDK which expects the shorter form.
  const sink: LogSink = {
    log: (
      level: 'debug' | 'info' | 'warning' | 'error',
      _logger: string,
      message: string,
      context?: LogContext
    ): Promise<void> => {
      const sdkLevel = level === 'warning' ? 'warn' : level;
      try {
        return openCodeClient.app.log({
          body: {
            service,
            level: sdkLevel as 'debug' | 'info' | 'warn' | 'error',
            message,
            extra: context as Record<string, unknown> | undefined,
          },
        });
      } catch {
        return Promise.resolve();
      }
    },
  };
  registerLogSink(sink);

  // Return a Logger that delegates to the core logger.
  // The core error() method has signature (message, error?, context?) so we
  // wrap it to match our simpler (message, extra?) interface.
  const coreLogger = coreCreateLogger('plugin.workflows');
  return {
    debug: (message, extra) => coreLogger.debug(message, extra as LogContext),
    info: (message, extra) => coreLogger.info(message, extra as LogContext),
    warn: (message, extra) => coreLogger.warn(message, extra as LogContext),
    error: (message, extra) =>
      coreLogger.error(message, undefined, extra as LogContext),
  };
}
