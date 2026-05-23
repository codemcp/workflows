import { z } from 'zod';
import type { ToolDefinition, ServerContext } from '../types.js';
import { tool } from './tool-helper.js';
import { createLogger } from '@codemcp/workflows-core';

const logger = createLogger('LoadWorkflowsHandler');

/**
 * Domain descriptions for tool parameter metadata.
 * Exposed to the LLM via the tool's parameter description.
 * Short summaries for inline tool parameter use.
 */
const SHORT_DOMAIN_DESCRIPTIONS: Record<string, string> = {
  code: 'Day-to-day software engineering (features, TDD, bugfixes, greenfield, code reviews)',
  architecture:
    'System understanding and planning (architectural decisions, legacy modernization, capability modeling)',
  sdd: 'Specification-driven development — write detailed specs before coding',
  'sdd-crowd':
    'Multi-agent collaborative SDD with role-based handoffs (analyst, architect, developer)',
  skilled:
    'Skill-augmented development — explicit prompts to apply expertise (architecture, coding, testing)',
  office:
    'Content creation and communication (blog posts, slide presentations)',
  children: 'Educational game development for ages 8-12',
};

/**
 * Create the load_workflows tool for the OpenCode plugin.
 * Allows the LLM to dynamically load workflows from one or more domains.
 */
export function createLoadWorkflowsTool(
  getServerContext: () => Promise<ServerContext>
): ToolDefinition {
  const domainText = Object.entries(SHORT_DOMAIN_DESCRIPTIONS)
    .map(([domain, description]) => `  - ${domain}: ${description}`)
    .join('\n');

  return tool({
    description:
      'Load workflows from one or more domains. Replaces the current domain set with the specified domains. Use this tool when you need to access workflows from a domain that is not currently loaded. The tool will reload all workflows for the specified domains.',
    args: {
      domains: z
        .string()
        .describe(
          `Comma-separated domain names to load. Replaces the current domain set.\n\n` +
            `Available domains:\n` +
            `${domainText}\n\n` +
            `Examples: "code", "code,architecture", "architecture,office"`
        ),
    },
    execute: async args => {
      logger.info('Loading workflows from domains', {
        domains: args.domains,
      });

      try {
        const serverContext = await getServerContext();
        serverContext.workflowManager.setDomains(args.domains);

        const domains = args.domains
          .split(',')
          .map(d => d.trim())
          .filter(d => d);

        const totalWorkflows =
          serverContext.workflowManager.getAvailableWorkflows().length;

        logger.info('Workflows loaded successfully', {
          domains,
          totalWorkflows,
        });

        return JSON.stringify({
          success: true,
          domains,
          totalWorkflows,
          message: `Loaded workflows from domains: ${domains.join(', ')}. Total workflows available: ${totalWorkflows}.`,
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
