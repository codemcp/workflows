/**
 * Conversation State Resource Handler
 *
 * Handles the conversation-state resource which provides access to current
 * conversation state and phase information including conversation ID, project context,
 * current development phase, and plan file location.
 */

import { createLogger, type ILogger } from '@codemcp/workflows-core';
import {
  ResourceHandler,
  ServerContext,
  HandlerResult,
  ResourceContent,
} from '../types.js';
import { safeExecute } from '../server-helpers.js';

// Default logger for standalone use (MCP server mode)
const defaultLogger = createLogger('ConversationStateResourceHandler');

/**
 * Conversation State resource handler implementation
 */
export class ConversationStateResourceHandler implements ResourceHandler {
  private logger: ILogger;

  constructor(logger?: ILogger) {
    this.logger = logger ?? defaultLogger;
  }

  async handle(
    uri: URL,
    context: ServerContext
  ): Promise<HandlerResult<ResourceContent>> {
    // Use context's loggerFactory if available
    if (context.loggerFactory) {
      this.logger = context.loggerFactory('ConversationStateResourceHandler');
    }

    this.logger.debug('Processing conversation state resource request', {
      uri: uri.href,
    });

    return safeExecute(async () => {
      // Get conversation context
      const conversationContext =
        await context.conversationManager.getConversationContext();

      // Build state information
      const stateInfo = {
        conversationId: conversationContext.conversationId,
        projectPath: conversationContext.projectPath,
        gitBranch: conversationContext.gitBranch,
        currentPhase: conversationContext.currentPhase,
        planFilePath: conversationContext.planFilePath,
        timestamp: new Date().toISOString(),
        description: 'Current state of the development workflow conversation',
      };

      return {
        uri: uri.href,
        text: JSON.stringify(stateInfo, null, 2),
        mimeType: 'application/json',
      };
    }, 'Failed to retrieve conversation state resource');
  }
}
