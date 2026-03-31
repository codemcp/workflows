/**
 * MCP Log Sink
 *
 * Implements the LogSink interface from workflows-core to send
 * log messages as MCP notifications to the connected client.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LogSink, LogContext } from '@codemcp/workflows-core';

/**
 * Helper to capitalize phase names for display
 */
function capitalizePhase(phase: string): string {
  return phase
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Creates an MCP log sink that sends notifications to the MCP client
 */
export function createMcpLogSink(mcpServer: McpServer): LogSink {
  return {
    async log(
      level: 'debug' | 'info' | 'warning' | 'error',
      logger: string,
      message: string,
      context?: LogContext
    ): Promise<void> {
      try {
        let enhancedMessage = message;
        let notificationLevel = level;

        // Enhance phase transition messages
        if (
          context &&
          (context['from'] || context['to']) &&
          message.includes('transition')
        ) {
          const from = context['from']
            ? capitalizePhase(context['from'] as string)
            : '';
          const to = context['to']
            ? capitalizePhase(context['to'] as string)
            : '';
          if (from && to) {
            enhancedMessage = `Phase Transition: ${from} → ${to}`;
            notificationLevel = 'info';
          }
        }

        // Enhance initialization messages
        if (message.includes('initialized successfully')) {
          enhancedMessage = '🚀 Vibe Feature MCP Server Ready';
          notificationLevel = 'info';
        }

        // Safely serialize context to avoid JSON issues
        let logData = enhancedMessage;
        if (context) {
          try {
            const contextStr = JSON.stringify(context, null, 0);
            logData = `${enhancedMessage} ${contextStr}`;
          } catch (_error) {
            logData = `${enhancedMessage} [context serialization failed]`;
          }
        }

        await mcpServer.server.notification({
          method: 'notifications/message',
          params: {
            level: notificationLevel,
            logger,
            data: logData,
          },
        });
      } catch (_error) {
        // Silently ignore notification failures
        // The logger already writes to stderr as a fallback
      }
    },
  };
}
