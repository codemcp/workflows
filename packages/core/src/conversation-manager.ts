/**
 * Conversation Manager
 *
 * Handles conversation identification, state persistence, and coordination
 * between components. Generates unique conversation identifiers from
 * project path + git branch combination.
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createLogger } from './logger.js';
import { getPathBasename } from './path-validation-utils.js';
import type { IPersistence } from './persistence-interface.js';
import type {
  ConversationState,
  ConversationContext,
  SessionMetadata,
} from './types.js';
import { WorkflowManager } from './workflow-manager.js';
import { PlanManager } from './plan-manager.js';

const logger = createLogger('ConversationManager');

export class ConversationManager {
  private database: IPersistence;
  private projectPath: string;
  private workflowManager: WorkflowManager;
  private currentSessionMetadata: SessionMetadata | null = null;

  constructor(
    database: IPersistence,
    workflowManager: WorkflowManager,
    projectPath: string
  ) {
    this.database = database;
    this.workflowManager = workflowManager;
    this.projectPath = projectPath;
  }

  /**
   * Set session metadata for subsequent conversation state operations.
   * This links the workflow state to an external session context.
   *
   * @param sessionMetadata - Session metadata to store with conversation state
   */
  setSessionMetadata(sessionMetadata: SessionMetadata): void {
    this.currentSessionMetadata = sessionMetadata;
    logger.debug('Session metadata set', {
      referenceId: sessionMetadata.referenceId,
    });
  }

  /**
   * Get current session metadata
   */
  getSessionMetadata(): SessionMetadata | null {
    return this.currentSessionMetadata;
  }

  /**
   * Get conversation state by ID
   */
  async getConversationState(
    conversationId: string
  ): Promise<ConversationState | null> {
    return await this.database.getConversationState(conversationId);
  }

  /**
   * Get the current conversation context
   *
   * Detects the current project path and git branch, then retrieves an existing
   * conversation state for this context. Does NOT create a new conversation.
   *
   * @throws Error if no conversation exists for this context
   */
  async getConversationContext(): Promise<ConversationContext> {
    const projectPath = this.getProjectPath();
    const gitBranch = this.getGitBranch(projectPath);

    logger.debug('Getting conversation context', { projectPath, gitBranch });

    // Generate a unique conversation ID based on project path and git branch
    const conversationId = this.generateConversationId(projectPath, gitBranch);

    // Try to find existing conversation state
    const state = await this.database.getConversationState(conversationId);

    // If no existing state, throw an error - conversation must be created with start_development first
    if (!state) {
      logger.warn('No conversation found for context', {
        projectPath,
        gitBranch,
        conversationId,
      });
      throw new Error(
        'No development conversation exists for this project. Use the start_development tool first to initialize development with a workflow.'
      );
    }

    // Return the conversation context
    return {
      conversationId: state.conversationId,
      projectPath: state.projectPath,
      gitBranch: state.gitBranch,
      currentPhase: state.currentPhase,
      planFilePath: state.planFilePath,
      workflowName: state.workflowName,
    };
  }

  /**
   * Create a new conversation context
   *
   * This should only be called by the start_development tool to explicitly
   * create a new conversation with a selected workflow.
   *
   * @param workflowName - The workflow to use for this conversation
   * @param projectPathOverride - Optional project path override
   * @returns The newly created conversation context
   */
  async createConversationContext(
    workflowName: string,
    projectPathOverride?: string
  ): Promise<ConversationContext> {
    const projectPath = projectPathOverride || this.getProjectPath();
    const gitBranch = this.getGitBranch(projectPath);

    logger.debug('Creating conversation context', {
      projectPath,
      gitBranch,
      workflowName,
    });

    // Generate a unique conversation ID based on project path and git branch
    const conversationId = this.generateConversationId(projectPath, gitBranch);

    // Check if a conversation already exists
    const existingState =
      await this.database.getConversationState(conversationId);

    if (existingState) {
      // Check if user is trying to change workflow
      if (existingState.workflowName !== workflowName) {
        const errorMessage = `Development conversation already exists with workflow '${existingState.workflowName}'. Cannot change to '${workflowName}'. Use reset_development() first to start with a new workflow.`;
        logger.error(
          'Attempted workflow change on existing conversation',
          new Error(errorMessage),
          {
            existingWorkflow: existingState.workflowName,
            requestedWorkflow: workflowName,
            conversationId,
          }
        );
        throw new Error(errorMessage);
      }

      logger.debug('Conversation already exists, returning existing context', {
        conversationId,
      });
      return {
        conversationId: existingState.conversationId,
        projectPath: existingState.projectPath,
        gitBranch: existingState.gitBranch,
        currentPhase: existingState.currentPhase,
        planFilePath: existingState.planFilePath,
        workflowName: existingState.workflowName,
      };
    }

    // Create a new conversation state
    const state = await this.createNewConversationState(
      conversationId,
      projectPath,
      gitBranch,
      workflowName
    );

    // Return the conversation context
    return {
      conversationId: state.conversationId,
      projectPath: state.projectPath,
      gitBranch: state.gitBranch,
      currentPhase: state.currentPhase,
      planFilePath: state.planFilePath,
      workflowName: state.workflowName,
    };
  }

  /**
   * Update the conversation state
   *
   * @param conversationId - ID of the conversation to update
   * @param updates - Partial state updates to apply
   */
  async updateConversationState(
    conversationId: string,
    updates: Partial<
      Pick<
        ConversationState,
        | 'currentPhase'
        | 'planFilePath'
        | 'workflowName'
        | 'requireReviewsBeforePhaseTransition'
      >
    >
  ): Promise<void> {
    logger.debug('Updating conversation state', { conversationId, updates });

    // Get current state
    const currentState =
      await this.database.getConversationState(conversationId);

    if (!currentState) {
      throw new Error(`Conversation state not found for ID: ${conversationId}`);
    }

    // Apply updates
    const updatedState: ConversationState = {
      ...currentState,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Save updated state
    await this.database.saveConversationState(updatedState);

    logger.info('Conversation state updated', {
      conversationId,
      currentPhase: updatedState.currentPhase,
    });
  }

  /**
   * Create a new conversation state
   *
   * @param conversationId - ID for the new conversation
   * @param projectPath - Path to the project
   * @param gitBranch - Git branch name
   */
  private async createNewConversationState(
    conversationId: string,
    projectPath: string,
    gitBranch: string,
    workflowName: string = 'waterfall'
  ): Promise<ConversationState> {
    logger.info('Creating new conversation state', {
      conversationId,
      projectPath,
      gitBranch,
    });

    const timestamp = new Date().toISOString();

    // Generate a plan file path based on the branch name
    // Sanitize branch name by replacing slashes and other special characters
    const sanitizedBranch = gitBranch.replace(/[/\\]/g, '-');
    const planFileName =
      gitBranch === 'main' || gitBranch === 'master'
        ? 'development-plan.md'
        : `development-plan-${sanitizedBranch}.md`;

    const planFilePath = resolve(projectPath, '.vibe', planFileName);

    // Get initial state from the appropriate workflow
    const stateMachine = this.workflowManager.loadWorkflowForProject(
      projectPath,
      workflowName
    );
    const initialPhase = stateMachine.initial_state;
    const workflowPhases = Object.keys(stateMachine.states);

    // Create new state
    const newState: ConversationState = {
      conversationId,
      projectPath,
      gitBranch,
      currentPhase: initialPhase,
      planFilePath,
      workflowName,
      workflowPhases,
      requireReviewsBeforePhaseTransition: false, // Default to false for new conversations
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(this.currentSessionMetadata && {
        sessionMetadata: this.currentSessionMetadata,
      }),
    };

    // Save to database
    await this.database.saveConversationState(newState);

    logger.info('New conversation state created', {
      conversationId,
      planFilePath,
      initialPhase,
    });

    return newState;
  }

  /**
   * Generate a unique conversation ID based on project path and git branch
   *
   * @param projectPath - Path to the project
   * @param gitBranch - Git branch name
   */
  private generateConversationId(
    projectPath: string,
    gitBranch: string
  ): string {
    // Extract project name from path (cross-platform: handles both / and \)
    const projectName = getPathBasename(projectPath, 'unknown-project');

    // Clean branch name for use in ID
    const cleanBranch = gitBranch
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // For tests, use a deterministic ID
    if (process.env['NODE_ENV'] === 'test') {
      return `${projectName}-${cleanBranch}-p423k1`;
    }

    // Generate a deterministic ID based on project path and branch
    // This ensures the same project/branch combination always gets the same conversation ID
    let hash = 0;
    const str = `${projectPath}:${gitBranch}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    const hashStr = Math.abs(hash).toString(36).substring(0, 6);

    return `${projectName}-${cleanBranch}-${hashStr}`;
  }

  /**
   * Get the current project path
   */
  private getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Get the current git branch for a project
   *
   * @param projectPath - Path to the project
   */
  private getGitBranch(projectPath: string): string {
    try {
      // Check if this is a git repository
      if (!existsSync(`${projectPath}/.git`)) {
        logger.debug('Not a git repository, using "default" as branch name', {
          projectPath,
        });
        return 'default';
      }

      // Get current branch name
      // Use symbolic-ref which works even without commits (unlike rev-parse --abbrev-ref HEAD)
      const branch = execSync('git symbolic-ref --short HEAD', {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'], // Suppress stderr
      }).trim();

      logger.debug('Detected git branch', { projectPath, branch });

      return branch;
    } catch (_error) {
      logger.debug('Failed to get git branch, using "default" as branch name', {
        projectPath,
      });
      return 'default';
    }
  }

  /**
   * Check if a conversation has any previous interactions
   * Used to determine if this is the first interaction in a conversation
   */
  async hasInteractions(conversationId: string): Promise<boolean> {
    try {
      // Get all interactions for this conversation
      const interactions =
        await this.database.getInteractionsByConversationId(conversationId);
      const count = interactions.length;

      logger.debug('Checked interaction count for conversation', {
        conversationId,
        count,
      });

      return count > 0;
    } catch (error) {
      logger.error('Failed to check interaction count', error as Error, {
        conversationId,
      });
      // If we can't check, assume this is the first interaction to be safe
      return false;
    }
  }

  /**
   * Reset conversation data (hybrid approach)
   */
  async resetConversation(
    confirm: boolean,
    reason?: string
  ): Promise<{
    success: boolean;
    resetItems: string[];
    conversationId: string;
    message: string;
  }> {
    logger.info('Starting conversation reset', { confirm, reason });

    // Validate reset request
    this.validateResetRequest(confirm);

    const context = await this.getConversationContext();
    const resetItems: string[] = [];

    try {
      // Step 1: Soft delete interaction logs
      await this.database.softDeleteInteractionLogs(context.conversationId);
      resetItems.push('interaction_logs');
      logger.debug('Interaction logs soft deleted');

      // Step 2: Hard delete conversation state
      await this.database.deleteConversationState(context.conversationId);
      resetItems.push('conversation_state');
      logger.debug('Conversation state hard deleted');

      // Step 3: Hard delete plan file
      const planManager = new PlanManager();
      await planManager.deletePlanFile(context.planFilePath);
      resetItems.push('plan_file');
      logger.debug('Plan file deleted');

      // Verify cleanup
      await this.verifyResetCleanup(
        context.conversationId,
        context.planFilePath
      );

      const message = `Successfully reset conversation ${context.conversationId}. Reset items: ${resetItems.join(', ')}${reason ? `. Reason: ${reason}` : ''}`;

      logger.info('Conversation reset completed successfully', {
        conversationId: context.conversationId,
        resetItems,
        reason,
      });

      return {
        success: true,
        resetItems,
        conversationId: context.conversationId,
        message,
      };
    } catch (error) {
      logger.error('Failed to reset conversation', error as Error, {
        conversationId: context.conversationId,
        resetItems,
        reason,
      });

      throw new Error(
        `Reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Validate reset request parameters
   */
  private validateResetRequest(confirm: boolean): void {
    if (!confirm) {
      throw new Error(
        'Reset operation requires explicit confirmation. Set confirm parameter to true.'
      );
    }
  }

  /**
   * Verify that reset cleanup was successful
   */
  private async verifyResetCleanup(
    conversationId: string,
    planFilePath: string
  ): Promise<void> {
    logger.debug('Verifying reset cleanup', { conversationId, planFilePath });

    try {
      // Check that conversation state is deleted
      const state = await this.database.getConversationState(conversationId);
      if (state) {
        throw new Error('Conversation state was not properly deleted');
      }

      // Check that plan file is deleted
      const planManager = new PlanManager();
      const isDeleted = await planManager.ensurePlanFileDeleted(planFilePath);
      if (!isDeleted) {
        throw new Error('Plan file was not properly deleted');
      }

      logger.debug('Reset cleanup verification successful');
    } catch (error) {
      logger.error('Reset cleanup verification failed', error as Error);
      throw error;
    }
  }

  /**
   * Clean up conversation data (used internally)
   */
  async cleanupConversationData(conversationId: string): Promise<void> {
    logger.debug('Cleaning up conversation data', { conversationId });

    try {
      // This method can be used for additional cleanup if needed
      // Currently, the main cleanup is handled by resetConversation
      await this.database.softDeleteInteractionLogs(conversationId);
      await this.database.deleteConversationState(conversationId);

      logger.debug('Conversation data cleanup completed', { conversationId });
    } catch (error) {
      logger.error('Failed to cleanup conversation data', error as Error, {
        conversationId,
      });
      throw error;
    }
  }
}
