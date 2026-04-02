/**
 * Server Helper Functions
 *
 * Common utility functions used across the server implementation.
 * These are pure functions that don't depend on server state.
 */

import { homedir } from 'node:os';
import { createLogger, type ILogger } from '@codemcp/workflows-core';
import { HandlerResult } from './types.js';

// Default logger for standalone use (MCP server mode)
// When called from OpenCode plugin, pass logger parameter to avoid stderr pollution
const defaultLogger = createLogger('ServerHelpers');

/**
 * Normalize and validate project path
 * Ensures we have a valid project path, defaulting to home directory if needed
 */
export function normalizeProjectPath(
  projectPath?: string,
  logger?: ILogger
): string {
  const log = logger ?? defaultLogger;
  const path = projectPath || process.cwd();

  if (path === '/' || path === '') {
    const homePath = homedir();
    log.info('Invalid project path detected, using home directory', {
      originalPath: path,
      normalizedPath: homePath,
    });
    return homePath;
  }

  return path;
}

/**
 * Create a standardized success result
 */
export function createSuccessResult<T>(
  data: T,
  metadata?: Record<string, unknown>
): HandlerResult<T> {
  return {
    success: true,
    data,
    metadata,
  };
}

/**
 * Create a standardized error result
 */
export function createErrorResult(
  error: string | Error,
  metadata?: Record<string, unknown>
): HandlerResult<never> {
  const errorMessage = error instanceof Error ? error.message : error;

  return {
    success: false,
    error: errorMessage,
    metadata,
  };
}

/**
 * Safely execute an async operation and return a HandlerResult
 * This provides consistent error handling across all handlers
 */
export async function safeExecute<T>(
  operation: () => Promise<T>,
  errorContext?: string,
  logger?: ILogger
): Promise<HandlerResult<T>> {
  const log = logger ?? defaultLogger;
  try {
    const result = await operation();
    return createSuccessResult(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const contextualError = errorContext
      ? `${errorContext}: ${errorMessage}`
      : errorMessage;

    // These are expected user errors, not system failures - don't log as ERROR
    const isExpectedError =
      errorMessage.includes('CONVERSATION_NOT_FOUND') ||
      errorMessage.includes('Invalid workflow:');

    if (!isExpectedError) {
      log.error('Operation failed', error as Error, { errorContext });
    }
    return createErrorResult(contextualError);
  }
}

/**
 * Validate required arguments for tool handlers
 * Throws an error if any required arguments are missing
 */
export function validateRequiredArgs(
  args: unknown,
  requiredFields: string[]
): void {
  const missingFields = requiredFields.filter(
    field =>
      (args as Record<string, unknown>)[field] === undefined ||
      (args as Record<string, unknown>)[field] === null
  );

  if (missingFields.length > 0) {
    throw new Error(`Missing required arguments: ${missingFields.join(', ')}`);
  }
}

/**
 * Check if a conversation exists and provide helpful error if not
 */
export function createConversationNotFoundResult(
  availableWorkflows: string[] = []
): HandlerResult<never> {
  if (availableWorkflows.length === 0) {
    return createErrorResult(
      'No development conversation has been started for this project. Please call start_development() to begin. First, set up workflows by adjusting the WORKFLOW_DOMAINS environment variable or copying a workflow to .vibe/workflows/ directory.',
      {
        suggestion:
          'Set WORKFLOW_DOMAINS=code,architecture,office or copy a workflow file to .vibe/workflows/',
        availableWorkflows: [],
      }
    );
  }

  return createErrorResult(
    'No development conversation has been started for this project. Please call start_development() with a workflow parameter to begin development.',
    {
      suggestion: 'Call start_development() to begin',
      availableWorkflows,
    }
  );
}

/**
 * Extract workflow names for enum generation
 * Used by server configuration to build Zod schemas
 */
export function buildWorkflowEnum(
  workflowNames: string[]
): [string, ...string[]] {
  const allWorkflows = [...workflowNames, 'custom'];

  // Ensure we have at least one element for TypeScript
  if (allWorkflows.length === 0) {
    return ['waterfall'];
  }

  return allWorkflows as [string, ...string[]];
}

/**
 * Generate workflow description for tool schemas
 */
export function generateWorkflowDescription(
  workflows: Array<{
    name: string;
    displayName: string;
    description: string;
    metadata?: {
      complexity?: 'low' | 'medium' | 'high';
      bestFor?: string[];
      useCases?: string[];
      examples?: string[];
    };
  }>
): string {
  let description = 'Choose your development workflow:\n\n';

  for (const workflow of workflows) {
    description += `• **${workflow.name}**: ${workflow.displayName} - ${workflow.description}`;

    // Add enhanced metadata if available
    if (workflow.metadata) {
      const meta = workflow.metadata;

      // Add complexity
      if (meta.complexity) {
        description += `\n  Complexity: ${meta.complexity}`;
      }

      // Add best for information
      if (meta.bestFor && meta.bestFor.length > 0) {
        description += `\n  Best for: ${meta.bestFor.join(', ')}`;
      }

      // Add examples
      if (meta.examples && meta.examples.length > 0) {
        description += `\n  Examples: ${meta.examples.slice(0, 2).join(', ')}`;
        if (meta.examples.length > 2) {
          description += `, and ${meta.examples.length - 2} more`;
        }
      }
    }

    description += '\n';
  }

  description +=
    '• **custom**: Use custom workflow from .vibe/workflows in your project\n\n';

  return description;
}

/**
 * Log handler execution for debugging
 */
export function logHandlerExecution(
  handlerName: string,
  args: unknown,
  logger?: ILogger
): void {
  const log = logger ?? defaultLogger;
  log.debug(`Executing ${handlerName} handler`, {
    handlerName,
    argsKeys: Object.keys(args || {}),
  });
}

/**
 * Log handler completion for debugging
 */
export function logHandlerCompletion(
  handlerName: string,
  result: HandlerResult<unknown>,
  logger?: ILogger
): void {
  const log = logger ?? defaultLogger;
  log.debug(`Completed ${handlerName} handler`, {
    handlerName,
    success: result.success,
    hasData: !!result.data,
    hasError: !!result.error,
  });
}

/**
 * Strip /.vibe suffix from project path if present
 *
 * @param providedPath - Optional project path provided by user
 * @param defaultPath - Default project path from context
 * @returns Normalized project root path
 */
export function stripVibePathSuffix(
  providedPath: string | undefined,
  defaultPath: string
): string {
  if (!providedPath) {
    return defaultPath;
  }

  // Strip /.vibe suffix if present to get project root
  return providedPath.endsWith('/.vibe')
    ? providedPath.slice(0, -6) // Remove '/.vibe'
    : providedPath;
}
