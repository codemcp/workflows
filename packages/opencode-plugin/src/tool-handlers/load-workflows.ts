import { z } from 'zod';
import type { ServerContext } from '@codemcp/workflows-server';
import type { ToolDefinition } from '../types.js';
import { tool } from './tool-helper.js';
import {
  createLogger,
  KNOWN_DOMAIN_NAMES,
  DOMAIN_DESCRIPTIONS,
} from '@codemcp/workflows-core';

const logger = createLogger('LoadWorkflowsHandler');

const domainList = Object.entries(DOMAIN_DESCRIPTIONS)
  .map(([d, desc]) => `${d}: ${desc}`)
  .join(' | ');

export function createLoadWorkflowsTool(
  getServerContext: () => Promise<ServerContext>
): ToolDefinition {
  return tool({
    description: `Load workflows from one or more domains. Replaces the current domain set. Available domains — ${domainList}`,
    args: {
      domains: z
        .array(z.enum(KNOWN_DOMAIN_NAMES))
        .describe('Domain names to load.'),
    },
    execute: async args => {
      logger.info('Loading workflows from domains', { domains: args.domains });

      try {
        const serverContext = await getServerContext();
        serverContext.workflowManager.setDomains(args.domains);

        const totalWorkflows =
          serverContext.workflowManager.getAvailableWorkflows().length;

        logger.info('Workflows loaded successfully', {
          domains: args.domains,
          totalWorkflows,
        });

        return JSON.stringify({
          success: true,
          domains: args.domains,
          totalWorkflows,
          message: `Loaded workflows from domains: ${args.domains.join(', ')}. Total workflows available: ${totalWorkflows}.`,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to load workflows', error as Error, {
          domains: args.domains,
        });

        return JSON.stringify({
          success: false,
          domains: [],
          totalWorkflows: 0,
          message: `Failed to load workflows: ${errorMessage}`,
        });
      }
    },
  });
}
