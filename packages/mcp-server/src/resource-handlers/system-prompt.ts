/**
 * System Prompt Resource Handler
 *
 * Handles the system-prompt resource which provides access to the complete
 * system prompt for LLM integration. This allows programmatic access to the
 * system prompt through the MCP protocol. The system prompt is workflow-independent.
 */

import { createLogger, type ILogger } from '@codemcp/workflows-core';
import {
  ResourceHandler,
  ServerContext,
  HandlerResult,
  ResourceContent,
} from '../types.js';
import { safeExecute } from '../server-helpers.js';
import { generateSystemPrompt } from '@codemcp/workflows-core';
import { StateMachineLoader } from '@codemcp/workflows-core';

// Default logger for standalone use (MCP server mode)
const defaultLogger = createLogger('SystemPromptResourceHandler');

/**
 * System Prompt resource handler implementation
 */
export class SystemPromptResourceHandler implements ResourceHandler {
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
      this.logger = context.loggerFactory('SystemPromptResourceHandler');
    }

    this.logger.debug('Processing system prompt resource request', {
      uri: uri.href,
    });

    return safeExecute(async () => {
      // Use the default waterfall workflow for system prompt generation
      // The system prompt is workflow-independent and uses a standard workflow
      const loader = new StateMachineLoader();
      const stateMachine = loader.loadStateMachine(process.cwd()); // Uses default waterfall workflow

      // Generate the system prompt
      const systemPrompt = generateSystemPrompt(stateMachine);

      this.logger.debug('Generated system prompt for resource', {
        promptLength: systemPrompt.length,
        workflowName: stateMachine.name,
      });

      return {
        uri: uri.href,
        text: systemPrompt,
        mimeType: 'text/plain',
      };
    }, 'Failed to retrieve system prompt resource');
  }
}
