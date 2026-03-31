/**
 * Base Tool Handler
 *
 * Provides common functionality for all tool handlers including
 * error handling, logging, and conversation state management.
 */

import { createLogger, type ILogger } from '@codemcp/workflows-core';
import { ToolHandler, ServerContext, HandlerResult } from '../types.js';
import type { ConversationContext } from '@codemcp/workflows-core';
import {
  safeExecute,
  logHandlerExecution,
  logHandlerCompletion,
  createConversationNotFoundResult,
} from '../server-helpers.js';

/**
 * Abstract base class for tool handlers
 * Provides common functionality and enforces consistent patterns
 */
export abstract class BaseToolHandler<
  TArgs = unknown,
  TResult = unknown,
> implements ToolHandler<TArgs, TResult> {
  protected logger: ILogger;

  constructor() {
    this.logger = createLogger(this.constructor.name);
  }

  /**
   * Main handler method - implements consistent error handling and logging
   */
  async handle(
    args: TArgs,
    context: ServerContext
  ): Promise<HandlerResult<TResult>> {
    const handlerName = this.constructor.name;

    // Use context's loggerFactory if available (e.g., OpenCode plugin provides this)
    if (context.loggerFactory) {
      this.logger = context.loggerFactory(handlerName);
    }

    logHandlerExecution(handlerName, args, this.logger);

    const result = await safeExecute(
      () => this.executeHandler(args, context),
      `${handlerName} execution failed`,
      this.logger
    );

    // Check if this is a CONVERSATION_NOT_FOUND error and provide helpful guidance
    if (!result.success && result.error?.includes('CONVERSATION_NOT_FOUND')) {
      const availableWorkflows = context.workflowManager.getWorkflowNames();
      const helpfulError = createConversationNotFoundResult(availableWorkflows);
      logHandlerCompletion(handlerName, helpfulError, this.logger);
      return helpfulError as HandlerResult<TResult>;
    }

    logHandlerCompletion(handlerName, result, this.logger);
    return result;
  }

  /**
   * Abstract method that subclasses must implement
   * Contains the actual business logic for the tool
   */
  protected abstract executeHandler(
    args: TArgs,
    context: ServerContext
  ): Promise<TResult>;

  /**
   * Helper method to get conversation context with proper error handling
   */
  protected async getConversationContext(context: ServerContext) {
    try {
      return await context.conversationManager.getConversationContext();
    } catch (error) {
      this.logger.info('Conversation not found', { error });
      throw new Error('CONVERSATION_NOT_FOUND');
    }
  }

  /**
   * Helper method to ensure state machine is loaded for a project
   */
  protected ensureStateMachineForProject(
    context: ServerContext,
    projectPath: string,
    workflowName?: string
  ): void {
    const stateMachine = context.transitionEngine.getStateMachine(
      projectPath,
      workflowName
    );
    context.planManager.setStateMachine(stateMachine);
    context.instructionGenerator.setStateMachine(stateMachine);
  }

  /**
   * Helper method to log interactions if logger is available
   */
  protected async logInteraction(
    context: ServerContext,
    conversationId: string,
    toolName: string,
    args: unknown,
    response: unknown,
    phase: string
  ): Promise<void> {
    if (context.interactionLogger) {
      await context.interactionLogger.logInteraction(
        conversationId,
        toolName,
        args,
        response,
        phase
      );
    }
  }
}

/**
 * Base class for tool handlers that require an existing conversation
 * Automatically handles the conversation-not-found case
 */
export abstract class ConversationRequiredToolHandler<
  TArgs = unknown,
  TResult = unknown,
> extends BaseToolHandler<TArgs, TResult> {
  protected async executeHandler(
    args: TArgs,
    context: ServerContext
  ): Promise<TResult> {
    let conversationContext;

    try {
      conversationContext = await this.getConversationContext(context);
    } catch (_error) {
      // Return a special error result that the response renderer can handle
      throw new Error('CONVERSATION_NOT_FOUND');
    }

    return this.executeWithConversation(args, context, conversationContext);
  }

  /**
   * Abstract method for handlers that need conversation context
   */
  protected abstract executeWithConversation(
    args: TArgs,
    context: ServerContext,
    conversationContext: ConversationContext
  ): Promise<TResult>;
}
