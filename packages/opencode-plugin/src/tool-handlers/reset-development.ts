import { z } from 'zod';
import * as path from 'node:path';
import {
  ResetDevelopmentHandler,
  type ServerContext,
} from '@codemcp/workflows-server';
import {
  FileStorage,
  ConversationManager,
  WorkflowManager,
  createLogger,
} from '@codemcp/workflows-core';
import type { ToolDefinition } from '../types.js';
import { tool } from './tool-helper.js';
import { handleMcpError } from '../server-context.js';

export function createResetDevelopmentTool(
  projectDir: string,
  getServerContext: () => Promise<ServerContext>
): ToolDefinition {
  return tool({
    description:
      'Reset workflow state. Args: confirm (required: true), reason (optional), delete_plan (optional: also delete plan file)',
    args: {
      confirm: z.boolean().describe('Must be true'),
      reason: z.string().optional().describe('Reason for reset'),
      delete_plan: z.boolean().optional().describe('Also delete plan file'),
    },
    execute: async args => {
      const { confirm, reason, delete_plan } = args;
      const serverContext = await getServerContext();
      const logger = serverContext.loggerFactory
        ? serverContext.loggerFactory('reset_development')
        : createLogger('reset_development');

      logger.debug('reset_development called', { confirm, delete_plan });

      if (!confirm) {
        return `Reset requires confirm: true. Will delete conversation state${delete_plan ? ' and plan file' : ''}.`;
      }

      try {
        if (delete_plan) {
          // Full reset: delegate to ResetDevelopmentHandler
          const handler = new ResetDevelopmentHandler();
          const result = await handler.handle(
            { confirm, reason },
            serverContext
          );

          const errorMsg = handleMcpError(result);
          if (errorMsg) {
            return errorMsg;
          }

          const deleted =
            result.data?.resetItems?.join(', ') || 'workflow state';
          return `Reset complete. Deleted: ${deleted}. Use \`start_workflow\` to begin.`;
        } else {
          // Partial reset: delete conversation state only, preserve plan file
          const storageDir = path.join(projectDir, '.vibe', 'storage');
          const fileStorage = new FileStorage(storageDir);
          await fileStorage.initialize();
          const conversationManager = new ConversationManager(
            fileStorage,
            new WorkflowManager(),
            projectDir
          );

          let context;
          try {
            context = await conversationManager.getConversationContext();
          } catch (_err) {
            return 'No active workflow. Use `start_workflow` to begin.';
          }

          if (context) {
            await conversationManager.cleanupConversationData(
              context.conversationId
            );
          }

          return `Reset complete. Use \`start_workflow\` to begin.`;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return `Error: ${errorMessage}`;
      }
    },
  });
}
