import { appendFileSync } from 'node:fs';
import {
  createLogger as coreCreateLogger,
  registerLogSink,
  type LogContext,
  type LogSink,
  type LoggerFactory,
  type ILogger,
} from '@codemcp/workflows-core';
import type { RuntimeLogger } from '../runtime/workflow-runtime.js';

/**
 * OpenCode 2 has no `client.app.log()`. Writing to stderr would corrupt the
 * TUI, so log output goes to a file, opt-in via WORKFLOW_LOG_FILE. Without it
 * the sink swallows everything (the core logger's stderr fallback is only used
 * when NO sink is registered).
 */
export function createV2Logging(): {
  logger: RuntimeLogger;
  loggerFactory: LoggerFactory;
} {
  const logFile = process.env['WORKFLOW_LOG_FILE']?.trim();

  const sink: LogSink = {
    log: async (level, component, message, context) => {
      if (!logFile) return;
      try {
        const ctx = context ? ` ${JSON.stringify(context)}` : '';
        appendFileSync(
          logFile,
          `[${new Date().toISOString()}] ${level.toUpperCase()} [${component}] ${message}${ctx}\n`
        );
      } catch {
        // logging must never break the host
      }
    },
  };
  registerLogSink(sink);

  const core = coreCreateLogger('plugin.workflows');
  const logger: RuntimeLogger = {
    debug: (m, e) => core.debug(m, e as LogContext),
    info: (m, e) => core.info(m, e as LogContext),
    warn: (m, e) => core.warn(m, e as LogContext),
    error: (m, e) => core.error(m, undefined, e as LogContext),
  };
  const loggerFactory: LoggerFactory = (component): ILogger =>
    coreCreateLogger(component);
  return { logger, loggerFactory };
}
