/**
 * Beads Task Backend Client
 *
 * Implementation of ITaskBackendClient for beads task management system.
 * Handles CLI operations and task validation for beads backend.
 */

import {
  type ITaskBackendClient,
  type BackendTask,
  type TaskValidationResult,
  type ILogger,
} from '@codemcp/workflows-core';
import { execSync } from 'node:child_process';
import { createLogger } from '@codemcp/workflows-core';

const defaultLogger = createLogger('BeadsTaskBackendClient');

/**
 * Beads-specific implementation of task backend client
 */
export class BeadsTaskBackendClient implements ITaskBackendClient {
  private projectPath: string;
  private logger: ILogger;

  constructor(projectPath: string, logger?: ILogger) {
    this.projectPath = projectPath;
    this.logger = logger ?? defaultLogger;
  }

  /**
   * Execute a beads command safely
   */
  private async executeBeadsCommand(
    args: string[]
  ): Promise<{ success: boolean; stdout?: string; stderr?: string }> {
    try {
      const command = `bd ${args.join(' ')}`;
      this.logger.debug('Executing beads command', {
        command,
        projectPath: this.projectPath,
      });

      const stdout = execSync(`bd ${args.join(' ')}`, {
        cwd: this.projectPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      return { success: true, stdout };
    } catch (error: unknown) {
      const execError = error as {
        stderr?: string;
        stdout?: string;
        status?: number;
      };
      this.logger.warn('Beads command failed', {
        args,
        error: error instanceof Error ? error.message : String(error),
        stderr: execError.stderr,
        stdout: execError.stdout,
      });

      return {
        success: false,
        stderr:
          execError.stderr ||
          (error instanceof Error ? error.message : String(error)),
        stdout: execError.stdout,
      };
    }
  }

  /**
   * Check if beads backend is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.executeBeadsCommand(['--version']);
      return result.success;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Get all open tasks for a given parent task
   */
  async getOpenTasks(parentTaskId: string): Promise<BackendTask[]> {
    try {
      const result = await this.executeBeadsCommand([
        'list',
        '--parent',
        parentTaskId,
        '--status',
        'open',
      ]);

      if (!result.success || !result.stdout) {
        return [];
      }

      // Parse beads CLI text output
      const lines = result.stdout.trim().split('\n');
      const tasks: BackendTask[] = [];

      for (const line of lines) {
        if (
          line.trim() &&
          !line.startsWith('○') &&
          !line.startsWith('●') &&
          !line.includes('Tip:')
        ) {
          const match = line.match(/^○?\s*([^\s]+)\s+.*?\s+-\s+(.+)$/);
          if (match) {
            tasks.push({
              id: match[1] || '',
              title: match[2] || '',
              status: 'open',
              priority: 2,
              parent: parentTaskId,
            });
          }
        }
      }

      return tasks;
    } catch (_error) {
      return [];
    }
  }

  /**
   * Validate that all tasks under a parent are completed
   */
  async validateTasksCompleted(
    parentTaskId: string
  ): Promise<TaskValidationResult> {
    const openTasks = await this.getOpenTasks(parentTaskId);

    return {
      valid: openTasks.length === 0,
      openTasks,
      message:
        openTasks.length > 0
          ? `Found ${openTasks.length} incomplete task(s). All tasks must be completed before proceeding to the next phase.`
          : 'All tasks completed.',
    };
  }

  /**
   * Create a new task under a parent
   */
  async createTask(
    title: string,
    parentTaskId: string,
    priority = 2
  ): Promise<string> {
    const result = await this.executeBeadsCommand([
      'create',
      `"${title}"`,
      '--parent',
      parentTaskId,
      '-p',
      priority.toString(),
    ]);

    if (!result.success) {
      throw new Error(
        `Failed to create task: ${result.stderr || 'Unknown error'}`
      );
    }

    // Extract task ID from beads output
    // Based on beads CLI output format: "✓ Created issue: task-id"
    const match =
      result.stdout?.match(/✓ Created issue: ([\w\d.-]+)/) ||
      result.stdout?.match(/Created issue: ([\w\d.-]+)/) ||
      result.stdout?.match(/Created (bd-[\w\d.]+)/);

    if (!match) {
      throw new Error(
        `Failed to extract task ID from beads output: ${result.stdout || 'No output'}`
      );
    }

    return match[1] || '';
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  ): Promise<void> {
    const beadsStatus = this.mapStatusToBeads(status);

    const result = await this.executeBeadsCommand([
      'update',
      taskId,
      '--status',
      beadsStatus,
    ]);

    if (!result.success) {
      throw new Error(
        `Failed to update task status: ${result.stderr || 'Unknown error'}`
      );
    }
  }

  /**
   * Map our status enum to beads CLI status values
   */
  private mapStatusToBeads(
    status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  ): string {
    switch (status) {
      case 'open':
        return 'open';
      case 'in_progress':
        return 'in_progress';
      case 'completed':
        return 'completed';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'open';
    }
  }
}
