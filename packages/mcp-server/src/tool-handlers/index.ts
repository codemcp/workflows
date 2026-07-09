/**
 * Tool Handler Registry
 *
 * Central registry for all tool handlers. Provides registration and lookup
 * functionality for tool handlers used by the MCP server.
 */

import { createLogger } from '@codemcp/workflows-core';
import { WhatsNextHandler } from './whats-next.js';
import { ProceedToPhaseHandler } from './proceed-to-phase.js';
import { ConductReviewHandler } from './conduct-review.js';
import { StartDevelopmentHandler } from './start-development.js';
import { ResumeWorkflowHandler } from './resume-workflow.js';
import { ResetDevelopmentHandler } from './reset-development.js';

import { ListWorkflowsHandler } from './list-workflows.js';
import { GetToolInfoHandler } from './get-tool-info.js';
import { SetupProjectDocsHandler } from './setup-project-docs.js';
import { NoIdeaHandler } from './no-idea.js';
import { LoadWorkflowsHandler } from './load-workflows.js';
import { ToolHandler, ToolRegistry } from '../types.js';

const logger = createLogger('ToolRegistry');

/**
 * Default implementation of ToolRegistry
 */
export class DefaultToolRegistry implements ToolRegistry {
  private handlers = new Map<string, ToolHandler>();

  register<T extends ToolHandler>(name: string, handler: T): void {
    logger.debug('Registering tool handler', {
      name,
      handlerType: handler.constructor.name,
    });
    this.handlers.set(name, handler);
  }

  get(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  list(): string[] {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Create and configure the default tool registry with all standard handlers
 */
export function createToolRegistry(): ToolRegistry {
  const registry = new DefaultToolRegistry();

  // Register all standard tool handlers
  registry.register('whats_next', new WhatsNextHandler());
  registry.register('proceed_to_phase', new ProceedToPhaseHandler());
  registry.register('conduct_review', new ConductReviewHandler());
  registry.register('start_development', new StartDevelopmentHandler());
  registry.register('resume_workflow', new ResumeWorkflowHandler());
  registry.register('reset_development', new ResetDevelopmentHandler());
  registry.register('list_workflows', new ListWorkflowsHandler());
  registry.register('load_workflows', new LoadWorkflowsHandler());
  registry.register('get_tool_info', new GetToolInfoHandler());
  registry.register('setup_project_docs', new SetupProjectDocsHandler());
  registry.register('no_idea', new NoIdeaHandler());

  logger.info('Tool registry created with handlers', {
    handlers: registry.list(),
  });

  return registry;
}

// Export all handler types for external use
export { WhatsNextHandler } from './whats-next.js';
export { ProceedToPhaseHandler } from './proceed-to-phase.js';
export { ConductReviewHandler } from './conduct-review.js';
export { StartDevelopmentHandler } from './start-development.js';
export { ResumeWorkflowHandler } from './resume-workflow.js';
export { ResetDevelopmentHandler } from './reset-development.js';
export { ListWorkflowsHandler } from './list-workflows.js';
export { LoadWorkflowsHandler } from './load-workflows.js';
export { GetToolInfoHandler } from './get-tool-info.js';
export { SetupProjectDocsHandler } from './setup-project-docs.js';
export { NoIdeaHandler } from './no-idea.js';
export {
  BaseToolHandler,
  ConversationRequiredToolHandler,
} from './base-tool-handler.js';

// Export argument and result types
export type { WhatsNextArgs, WhatsNextResult } from './whats-next.js';
export type {
  ProceedToPhaseArgs,
  ProceedToPhaseResult,
} from './proceed-to-phase.js';
export type {
  ConductReviewArgs,
  ConductReviewResult,
} from './conduct-review.js';
export type {
  StartDevelopmentArgs,
  StartDevelopmentResult,
} from './start-development.js';
export type {
  ResumeWorkflowArgs,
  ResumeWorkflowResult,
} from './resume-workflow.js';
export type {
  ResetDevelopmentArgs,
  ResetDevelopmentResult,
} from './reset-development.js';
export type { GetToolInfoArgs, GetToolInfoResponse } from './get-tool-info.js';
export type {
  SetupProjectDocsArgs,
  SetupProjectDocsResult,
} from './setup-project-docs.js';
export type { NoIdeaArgs, NoIdeaResponse } from './no-idea.js';
