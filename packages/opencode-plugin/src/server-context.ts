/**
 * ServerContext Builder for OpenCode Plugin
 *
 * Creates a ServerContext compatible with MCP server handlers,
 * allowing the plugin to delegate to handler implementations.
 */

import type { ServerContext, HandlerResult } from '@codemcp/workflows-server';
import { PluginRegistry, BeadsPlugin } from '@codemcp/workflows-server';

// Re-export the ServerContext type for convenience
export type { ServerContext } from '@codemcp/workflows-server';
import {
  ConversationManager,
  TransitionEngine,
  WorkflowManager,
  FileStorage,
  type IPlanManager,
  type IInstructionGenerator,
  type LoggerFactory,
} from '@codemcp/workflows-core';
import * as path from 'node:path';

export interface ServerContextOptions {
  projectDir: string;
  planManager: IPlanManager;
  instructionGenerator: IInstructionGenerator;
  /** Optional logger factory - if provided, handlers will use this instead of global createLogger */
  loggerFactory?: LoggerFactory;
}

/**
 * Creates a ServerContext that can be passed to MCP server handlers.
 *
 * The handlers expect certain components to be initialized and wired together.
 * This function creates fresh instances for each request to ensure clean state.
 */
export function createServerContext(
  options: ServerContextOptions
): ServerContext {
  const { projectDir, planManager, instructionGenerator, loggerFactory } =
    options;

  // Create workflow manager and load project workflows
  const workflowManager = new WorkflowManager();
  workflowManager.loadProjectWorkflows(projectDir);

  // Create file storage and conversation manager
  const fileStorage = new FileStorage(
    path.join(projectDir, '.vibe', 'storage')
  );
  const conversationManager = new ConversationManager(
    fileStorage,
    workflowManager,
    projectDir
  );

  // Create transition engine
  const transitionEngine = new TransitionEngine(projectDir);
  transitionEngine.setConversationManager(conversationManager);

  // Initialize plugin registry and register BeadsPlugin
  // (PluginRegistry.registerPlugin checks isEnabled() internally)
  // Pass loggerFactory so BeadsPlugin logs go through OpenCode SDK
  const pluginRegistry = new PluginRegistry();
  pluginRegistry.registerPlugin(
    new BeadsPlugin({ projectPath: projectDir, loggerFactory })
  );

  return {
    conversationManager,
    transitionEngine,
    planManager,
    instructionGenerator,
    workflowManager,
    projectPath: projectDir,
    pluginRegistry,
    loggerFactory,
  };
}

/**
 * Initialize async components of a ServerContext.
 * Call this before using the context with handlers.
 *
 * Note: Workflow loading is done in createServerContext(), not here.
 */
export async function initializeServerContext(
  context: ServerContext
): Promise<void> {
  // Initialize file storage (ConversationManager needs this)
  const fileStorage = new FileStorage(
    path.join(context.projectPath, '.vibe', 'storage')
  );
  await fileStorage.initialize();
}

/**
 * Convert MCP handler errors to user-friendly instructions.
 * Returns null if the result is successful and has data.
 */
export function handleMcpError<T>(result: HandlerResult<T>): string | null {
  if (result.success && result.data) {
    return null;
  }

  const error = result.error || 'Unknown error';

  // Extract actionable message from known error patterns
  if (error.includes('CONVERSATION_NOT_FOUND')) {
    return 'No active workflow. Use `start_workflow` to begin.';
  }

  if (error.includes('Invalid workflow:')) {
    // Error already contains available workflows list
    return error.replace(/^.*?Invalid workflow:/, 'Invalid workflow:');
  }

  if (error.includes('Available workflows:')) {
    return error;
  }

  // Generic error - return as instruction
  return `Error: ${error}`;
}

/**
 * Unwrap MCP handler result data after error check.
 * Call this only after handleMcpError returns null.
 */
export function unwrapResult<T>(result: HandlerResult<T>): T {
  if (!result.data) {
    throw new Error('No data in result');
  }
  return result.data;
}
