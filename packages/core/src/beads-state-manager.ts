/**
 * BeadsStateManager
 *
 * Manages beads-specific conversation state including phase task mappings
 * and epic information. Provides persistent storage for beads integration
 * data with proper separation of concerns from conversation management.
 */

import { writeFile, readFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createLogger, type ILogger } from './logger.js';
import type { BeadsPhaseTask } from './beads-integration.js';

const defaultLogger = createLogger('BeadsStateManager');

/**
 * Beads-specific conversation state
 */
export interface BeadsConversationState {
  conversationId: string;
  projectPath: string;
  epicId: string;
  phaseTasks: BeadsPhaseTask[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Manager for beads conversation state persistence
 */
export class BeadsStateManager {
  private projectPath: string;
  private logger: ILogger;

  constructor(projectPath: string, logger: ILogger = defaultLogger) {
    this.projectPath = projectPath;
    this.logger = logger;
  }

  /**
   * Get the path to the beads state file for a conversation
   */
  private getBeadsStatePath(conversationId: string): string {
    return join(
      this.projectPath,
      '.vibe',
      `beads-state-${conversationId}.json`
    );
  }

  /**
   * Create beads state for a conversation
   */
  async createState(
    conversationId: string,
    epicId: string,
    phaseTasks: BeadsPhaseTask[]
  ): Promise<BeadsConversationState> {
    const state: BeadsConversationState = {
      conversationId,
      projectPath: this.projectPath,
      epicId,
      phaseTasks,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.saveState(state);

    this.logger.info('Created beads conversation state', {
      conversationId,
      epicId,
      phaseCount: phaseTasks.length,
      projectPath: this.projectPath,
    });

    return state;
  }

  /**
   * Get beads state for a conversation
   */
  async getState(
    conversationId: string
  ): Promise<BeadsConversationState | null> {
    const statePath = this.getBeadsStatePath(conversationId);

    try {
      // Check if file exists
      await access(statePath);

      const content = await readFile(statePath, 'utf-8');
      const state: BeadsConversationState = JSON.parse(content);

      this.logger.debug('Retrieved beads conversation state', {
        conversationId,
        epicId: state.epicId,
        phaseCount: state.phaseTasks.length,
        projectPath: this.projectPath,
      });

      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist - this is normal for conversations without beads
        this.logger.debug('No beads state found for conversation', {
          conversationId,
          projectPath: this.projectPath,
        });
        return null;
      }

      // Other errors (permission, invalid JSON, etc.)
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to read beads state file', {
        error: errorMessage,
        conversationId,
        statePath,
        projectPath: this.projectPath,
      });

      return null;
    }
  }

  /**
   * Get phase task ID for a specific phase
   */
  async getPhaseTaskId(
    conversationId: string,
    phase: string
  ): Promise<string | null> {
    const state = await this.getState(conversationId);

    if (!state) {
      return null;
    }

    const phaseTask = state.phaseTasks.find(task => task.phaseId === phase);

    if (phaseTask) {
      this.logger.debug('Found phase task ID', {
        conversationId,
        phase,
        taskId: phaseTask.taskId,
        projectPath: this.projectPath,
      });
      return phaseTask.taskId;
    }

    this.logger.debug('No task ID found for phase', {
      conversationId,
      phase,
      availablePhases: state.phaseTasks.map(t => t.phaseId),
      projectPath: this.projectPath,
    });

    return null;
  }

  /**
   * Update beads state for a conversation
   */
  async updateState(
    conversationId: string,
    updates: Partial<
      Omit<BeadsConversationState, 'conversationId' | 'createdAt'>
    >
  ): Promise<BeadsConversationState | null> {
    const existingState = await this.getState(conversationId);

    if (!existingState) {
      this.logger.warn('Cannot update non-existent beads state', {
        conversationId,
        projectPath: this.projectPath,
      });
      return null;
    }

    const updatedState: BeadsConversationState = {
      ...existingState,
      ...updates,
      conversationId, // Ensure conversationId doesn't change
      updatedAt: new Date().toISOString(),
    };

    await this.saveState(updatedState);

    this.logger.info('Updated beads conversation state', {
      conversationId,
      updatedFields: Object.keys(updates),
      projectPath: this.projectPath,
    });

    return updatedState;
  }

  /**
   * Clean up beads state for a conversation
   */
  async cleanup(conversationId: string): Promise<void> {
    const statePath = this.getBeadsStatePath(conversationId);

    try {
      await access(statePath);
      await writeFile(statePath + '.backup', await readFile(statePath));

      this.logger.info('Cleaned up beads conversation state', {
        conversationId,
        statePath,
        projectPath: this.projectPath,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist - nothing to clean up
        this.logger.debug('No beads state to clean up', {
          conversationId,
          projectPath: this.projectPath,
        });
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to clean up beads state', {
        error: errorMessage,
        conversationId,
        statePath,
        projectPath: this.projectPath,
      });
    }
  }

  /**
   * Check if beads state exists for a conversation
   */
  async hasState(conversationId: string): Promise<boolean> {
    const statePath = this.getBeadsStatePath(conversationId);

    try {
      await access(statePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save beads state to file
   */
  private async saveState(state: BeadsConversationState): Promise<void> {
    const statePath = this.getBeadsStatePath(state.conversationId);
    const stateDir = dirname(statePath);

    try {
      // Ensure .vibe directory exists
      await mkdir(stateDir, { recursive: true });

      // Write state with pretty formatting for readability
      const content = JSON.stringify(state, null, 2);
      await writeFile(statePath, content, 'utf-8');

      this.logger.debug('Saved beads state to file', {
        conversationId: state.conversationId,
        statePath,
        fileSize: content.length,
        projectPath: this.projectPath,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to save beads state',
        error instanceof Error ? error : new Error(errorMessage),
        {
          conversationId: state.conversationId,
          statePath,
          projectPath: this.projectPath,
        }
      );
      throw error;
    }
  }
}
