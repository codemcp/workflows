import { z } from 'zod';
import {
  ProceedToPhaseHandler,
  type ServerContext,
  type WhatsNextResult,
} from '@codemcp/workflows-server';
import type { ToolDefinition } from '../types.js';
import { tool } from './tool-helper.js';
import { handleMcpError, unwrapResult } from '../server-context.js';
import { createLogger } from '@codemcp/workflows-core';
import { stripWhatsNextReferences } from '../utils.js';

export function createProceedToPhaseTool(
  getServerContext: () => Promise<ServerContext>,
  updateCachedState: (result: WhatsNextResult, workflowName?: string) => void
): ToolDefinition {
  return tool({
    description:
      'Move to a development phase. Args: target_phase (from plan file), reason (optional), review_state (not-required|pending|performed)',
    args: {
      target_phase: z.string().describe('Phase name from plan file'),
      reason: z.string().optional().describe('Why transitioning now'),
      review_state: z
        .enum(['not-required', 'pending', 'performed'])
        .optional()
        .describe('Review state'),
    },
    execute: async args => {
      const { target_phase, reason, review_state } = args;
      const serverContext = await getServerContext();
      const logger = serverContext.loggerFactory
        ? serverContext.loggerFactory('proceed_to_phase')
        : createLogger('proceed_to_phase');

      logger.debug('proceed_to_phase called', { to: target_phase, reason });

      try {
        // Delegate to ProceedToPhaseHandler
        const handler = new ProceedToPhaseHandler();
        const result = await handler.handle(
          {
            target_phase,
            reason,
            review_state: review_state ?? 'not-required',
          },
          serverContext
        );

        // Handle errors gracefully
        const errorMsg = handleMcpError(result);
        if (errorMsg) {
          return errorMsg;
        }

        const data = unwrapResult(result);

        // Update cached state with new phase info
        updateCachedState({
          phase: data.phase,
          instructions: data.instructions,
          plan_file_path: data.plan_file_path,
          allowed_file_patterns: data.allowed_file_patterns,
        });

        // Build response with instructions (strip whats_next references)
        const lines: string[] = [];
        lines.push(`Transitioned to: ${data.phase}`);

        if (data.transition_reason) {
          lines.push(`Reason: ${data.transition_reason}`);
        }

        if (data.instructions) {
          lines.push('');
          lines.push(stripWhatsNextReferences(data.instructions));
        }

        // File restrictions
        const patterns = data.allowed_file_patterns;
        if (patterns.includes('*') || patterns.includes('**/*')) {
          lines.push('Files: All allowed');
        } else {
          lines.push(`Allowed: ${patterns.join(', ')}`);
        }

        return lines.join('\n');
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
  });
}
