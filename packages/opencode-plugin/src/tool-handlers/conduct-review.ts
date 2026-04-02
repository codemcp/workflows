import { z } from 'zod';
import {
  ConductReviewHandler,
  type ServerContext,
} from '@codemcp/workflows-server';
import type { ToolDefinition } from '../types.js';
import { tool } from './tool-helper.js';
import { handleMcpError, unwrapResult } from '../server-context.js';
import { createLogger } from '@codemcp/workflows-core';
import { requirePrimaryAgent } from '../utils.js';

export function createConductReviewTool(
  getServerContext: () => Promise<ServerContext>
): ToolDefinition {
  return tool({
    description: 'Conduct a review before phase transition. Args: target_phase',
    args: {
      target_phase: z.string().describe('Target phase after review'),
    },
    execute: async (args, context) => {
      // Prevent subagents from using workflow state tools
      requirePrimaryAgent(context.agent);

      const { target_phase } = args;
      const serverContext = await getServerContext();
      const logger = serverContext.loggerFactory
        ? serverContext.loggerFactory('conduct_review')
        : createLogger('conduct_review');

      logger.debug('conduct_review called', { targetPhase: target_phase });

      // Request permission before conducting review
      if (context && typeof context.ask === 'function') {
        await context.ask({
          permission: 'conduct_review',
          patterns: ['*'],
          always: ['*'],
          metadata: { target_phase },
        });
      }

      try {
        // Delegate to ConductReviewHandler
        const handler = new ConductReviewHandler();
        const result = await handler.handle({ target_phase }, serverContext);

        // Handle errors gracefully
        const errorMsg = handleMcpError(result);
        if (errorMsg) {
          return errorMsg;
        }

        return unwrapResult(result).instructions;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
  });
}
