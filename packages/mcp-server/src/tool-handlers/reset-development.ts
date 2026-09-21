/**
 * ResetDevelopment Tool Handler
 *
 * Handles resetting conversation state and development progress.
 * This permanently deletes conversation state and plan file, while
 * soft-deleting interaction logs for audit trail.
 */

import { BaseToolHandler } from './base-tool-handler.js';
import { validateRequiredArgs } from '../server-helpers.js';
import { ServerContext } from '../types.js';

/**
 * Arguments for the reset_development tool
 */
export interface ResetDevelopmentArgs {
  confirm: boolean;
  reason?: string;
  /**
   * Optional project path override. When provided, overrides the server's
   * default project path for this call.
   */
  project_path?: string;
}

/**
 * Response from the reset_development tool
 */
export interface ResetDevelopmentResult {
  success: boolean;
  resetItems: string[];
  message: string;
}

/**
 * ResetDevelopment tool handler implementation
 */
export class ResetDevelopmentHandler extends BaseToolHandler<
  ResetDevelopmentArgs,
  ResetDevelopmentResult
> {
  protected async executeHandler(
    args: ResetDevelopmentArgs,
    context: ServerContext
  ): Promise<ResetDevelopmentResult> {
    // Validate required arguments
    validateRequiredArgs(args, ['confirm']);

    const { confirm, reason } = args;
    const projectPathOverride = args.project_path
      ? args.project_path.endsWith('/.vibe')
        ? args.project_path.slice(0, -6)
        : args.project_path
      : undefined;

    this.logger.debug('Processing reset_development request', {
      confirm,
      hasReason: !!reason,
      projectPathOverride,
    });

    // Validate parameters
    if (typeof confirm !== 'boolean') {
      throw new Error('confirm parameter must be a boolean');
    }

    if (!confirm) {
      throw new Error(
        'Reset operation requires explicit confirmation. Set confirm parameter to true.'
      );
    }

    // Ensure state machine is loaded for current project
    this.ensureStateMachineForProject(
      context,
      projectPathOverride ?? context.projectPath
    );

    // Perform the reset
    const resetResult = await context.conversationManager.resetConversation(
      confirm,
      reason,
      projectPathOverride
    );

    // Transform to match our interface
    const result: ResetDevelopmentResult = {
      success: resetResult.success,
      resetItems: resetResult.resetItems,
      message: resetResult.message,
    };

    // Add conversationId for backward compatibility with tests
    (
      result as ResetDevelopmentResult & { conversationId: string }
    ).conversationId = resetResult.conversationId;

    this.logger.info('Reset development completed successfully', {
      resetItems: result.resetItems,
      reason,
    });

    return result;
  }
}
