import { z } from 'zod';
import {
  StartDevelopmentHandler,
  type WhatsNextResult,
  type ServerContext,
} from '@codemcp/workflows-server';
import type { ToolDefinition } from '../types.js';
import { tool } from './tool-helper.js';
import { handleMcpError, unwrapResult } from '../server-context.js';
import { WorkflowManager, createLogger } from '@codemcp/workflows-core';
import { stripWhatsNextReferences } from '../utils.js';

export function createStartDevelopmentTool(
  projectDir: string,
  getServerContext: () => Promise<ServerContext>,
  updateCachedState: (result: WhatsNextResult, workflowName?: string) => void
): ToolDefinition {
  // Load available workflows for description
  // NOTE: Using getAvailableWorkflowsForProject() to respect:
  //   1. VIBE_WORKFLOW_DOMAINS configuration (domain filtering)
  //   2. Project-specific workflow configuration
  const workflowManager = new WorkflowManager();
  const availableWorkflows =
    workflowManager.getAvailableWorkflowsForProject(projectDir);
  const workflowNames = availableWorkflows.map(w => w.name);

  // Build tool description with workflow list
  const toolDescription =
    workflowNames.length > 0
      ? `Start a development workflow. Available: ${workflowNames.join(', ')}`
      : 'Start a development workflow (no workflows available - check VIBE_WORKFLOW_DOMAINS)';

  return tool({
    description: toolDescription,
    args: {
      workflow: z.string().describe('Workflow name'),
      require_reviews: z
        .boolean()
        .optional()
        .describe('Require reviews before phase transitions'),
    },
    execute: async args => {
      const serverContext = await getServerContext();
      const logger = serverContext.loggerFactory
        ? serverContext.loggerFactory('start_development')
        : createLogger('start_development');

      logger.debug('start_development called', { workflow: args.workflow });

      try {
        // Delegate to StartDevelopmentHandler
        const handler = new StartDevelopmentHandler();
        const result = await handler.handle(
          {
            workflow: args.workflow,
            require_reviews: args.require_reviews,
            project_path: projectDir,
          },
          serverContext
        );

        // Handle errors gracefully
        const errorMsg = handleMcpError(result);
        if (errorMsg) {
          return errorMsg;
        }

        const data = unwrapResult(result);

        logger.info('start_development: Successfully started workflow', {
          workflow: args.workflow,
          phase: data.phase,
        });

        // Update cached state with new workflow info
        updateCachedState(
          {
            phase: data.phase,
            instructions: data.instructions,
            plan_file_path: data.plan_file_path,
            allowed_file_patterns: data.allowed_file_patterns ?? ['**/*'],
          },
          args.workflow
        );

        // Return the instructions from the handler (strip whats_next references)
        return stripWhatsNextReferences(data.instructions);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
  });
}
