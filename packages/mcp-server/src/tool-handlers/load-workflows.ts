/**
 * Load Workflows Tool Handler
 *
 * Allows the LLM to dynamically load workflows from one or more domains
 * at runtime. This is essential for long-lived processes (MCP server,
 * OpenCode plugin) where the initial domain configuration may not include
 * all needed workflows.
 */

import { z } from 'zod';
import { BaseToolHandler } from './base-tool-handler.js';
import { createLogger, DOMAIN_DESCRIPTIONS } from '@codemcp/workflows-core';
import { ServerContext } from '../types.js';

const logger = createLogger('LoadWorkflowsHandler');

/**
 * Domain descriptions for tool parameter metadata.
 * Exposed to the LLM via the tool's parameter description.
 */
const DOMAIN_DESCRIPTION_TEXT = Object.entries(DOMAIN_DESCRIPTIONS)
  .map(([domain, description]) => `  - ${domain}: ${description}`)
  .join('\n');

/**
 * Schema for load_workflows tool arguments
 */
const LoadWorkflowsArgsSchema = z.object({
  domains: z.string().describe(
    `Comma-separated domain names to load. Replaces the current domain set.

Available domains:
${DOMAIN_DESCRIPTION_TEXT}

Examples: "code", "code,architecture", "architecture,office"
`
  ),
});

type LoadWorkflowsArgs = z.infer<typeof LoadWorkflowsArgsSchema>;

/**
 * Response format for load_workflows tool
 */
interface LoadWorkflowsResponse {
  success: boolean;
  domains: string[];
  totalWorkflows: number;
  message: string;
}

/**
 * Tool handler for loading workflows from specified domains
 */
export class LoadWorkflowsHandler extends BaseToolHandler<
  LoadWorkflowsArgs,
  LoadWorkflowsResponse
> {
  protected readonly argsSchema = LoadWorkflowsArgsSchema;

  async executeHandler(
    args: LoadWorkflowsArgs,
    context: ServerContext
  ): Promise<LoadWorkflowsResponse> {
    logger.info('Loading workflows from domains', {
      domains: args.domains,
      projectPath: context.projectPath,
    });

    try {
      context.workflowManager.setDomains(args.domains);

      const totalWorkflows =
        context.workflowManager.getAvailableWorkflows().length;

      const domains = args.domains
        .split(',')
        .map(d => d.trim())
        .filter(d => d);

      logger.info('Workflows loaded successfully', {
        domains,
        totalWorkflows,
      });

      return {
        success: true,
        domains,
        totalWorkflows,
        message: `Loaded workflows from domains: ${domains.join(', ')}. Total workflows available: ${totalWorkflows}.`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to load workflows', error as Error, {
        domains: args.domains,
      });

      return {
        success: false,
        domains: [],
        totalWorkflows: 0,
        message: `Failed to load workflows: ${errorMessage}`,
      };
    }
  }
}
