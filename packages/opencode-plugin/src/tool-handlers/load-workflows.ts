import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import type { ServerContext } from '@codemcp/workflows-server';
import { tool } from './tool-helper.js';
import { createLogger, KNOWN_DOMAIN_NAMES } from '@codemcp/workflows-core';

const logger = createLogger('LoadWorkflowsHandler');

/**
 * Create the load_workflows tool for the OpenCode plugin.
 * Allows the LLM to dynamically load workflows from one or more domains.
 */
export function createLoadWorkflowsTool(
  getServerContext: () => Promise<ServerContext>
): ToolDefinition {
  return tool({
    description:
      'Load workflows from one or more domains. Replaces the current domain set with the specified domains. Use this tool when you need to access workflows from a domain that is not currently loaded. The tool will reload all workflows for the specified domains. Available domains: code, architecture, sdd, sdd-crowd, skilled, office, children.',
    args: {
      domains: z
        .array(z.enum(KNOWN_DOMAIN_NAMES))
        .describe(
          'Domain names to load. Available domains: code, architecture, sdd, sdd-crowd, skilled, office, children.'
        ),
    },
    execute: async args => {
      logger.info('Loading workflows from domains', {
        domains: args.domains,
      });

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
