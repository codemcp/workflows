/**
 * Beads Integration Utilities
 *
 * Provides utilities for integrating with beads distributed issue tracker:
 * - Project epic creation
 * - Phase task management
 * - Task hierarchy setup
 */

import { execSync } from 'node:child_process';
import { createLogger, type ILogger } from './logger.js';
import { capitalizePhase } from './string-utils.js';
import { YamlState } from './state-machine-types.js';

const defaultLogger = createLogger('BeadsIntegration');

export interface BeadsPhaseTask {
  phaseId: string;
  phaseName: string;
  taskId: string;
}

/**
 * Beads integration manager for the workflows server
 */
export class BeadsIntegration {
  private projectPath: string;
  private logger: ILogger;

  constructor(projectPath: string, logger: ILogger = defaultLogger) {
    this.projectPath = projectPath;
    this.logger = logger;
  }

  /**
   * Ensure beads is initialized in the project directory
   */
  private async ensureBeadsInitialized(): Promise<void> {
    try {
      // Check if beads is already initialized by running a simple command
      execSync('bd list --limit 1', {
        cwd: this.projectPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // If we get here, beads is already initialized
      return;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check if the error suggests beads is not initialized
      if (
        errorMessage.includes('not initialized') ||
        errorMessage.includes('no database') ||
        errorMessage.includes('init')
      ) {
        this.logger.info('Beads not initialized, running bd init --no-db', {
          projectPath: this.projectPath,
        });

        try {
          // Initialize beads without database
          execSync('bd init --no-db', {
            cwd: this.projectPath,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });

          this.logger.info('Successfully initialized beads in project', {
            projectPath: this.projectPath,
          });
        } catch (initError) {
          const initErrorMessage =
            initError instanceof Error ? initError.message : String(initError);
          this.logger.error(
            'Failed to initialize beads',
            initError instanceof Error
              ? initError
              : new Error(initErrorMessage),
            { projectPath: this.projectPath }
          );
          throw new Error(`Failed to initialize beads: ${initErrorMessage}`);
        }
      } else {
        // Some other beads error, re-throw
        throw error;
      }
    }
  }

  /**
   * Create a project epic in beads for the development session
   */
  async createProjectEpic(
    projectName: string,
    workflowName: string,
    description?: string,
    planFilename?: string
  ): Promise<string> {
    // Validate parameters first
    this.validateCreateEpicParameters(
      projectName,
      workflowName,
      description,
      planFilename
    );

    // Ensure beads is initialized
    await this.ensureBeadsInitialized();

    const epicTitle = planFilename
      ? `${projectName}: ${workflowName} (${planFilename})`
      : `${projectName}: ${workflowName}`;
    const epicDescription =
      description ||
      `Responsible vibe engineering session using ${workflowName} workflow for ${projectName}`;
    const priority = 2;

    const command = `bd create "${epicTitle}" --description "${epicDescription}" --priority ${priority}`;

    this.logger.debug('Creating beads project epic', {
      command,
      projectName,
      workflowName,
      projectPath: this.projectPath,
    });

    try {
      const output = execSync(command, {
        cwd: this.projectPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Extract task ID from beads output
      // Support both new format (v0.47.1+): "✓ Created issue: project-name-123"
      // and legacy format: "Created bd-a1b2c3"
      const match =
        output.match(/✓ Created issue: ([\w\d.-]+)/) ||
        output.match(/Created issue: ([\w\d.-]+)/) ||
        output.match(/Created (bd-[\w\d.]+)/);
      if (!match) {
        this.logger.warn('Failed to extract task ID from beads output', {
          command: `bd create "${epicTitle}" --description "${epicDescription}" --priority 2`,
          output: output.slice(0, 200), // Truncated for logging
        });
        throw new Error(
          `Failed to extract task ID from beads output: ${output.slice(0, 100)}...`
        );
      }

      const epicId = match[1] || '';
      this.logger.info('Created beads project epic', {
        epicId,
        epicTitle,
        projectPath: this.projectPath,
      });
      return epicId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const commandInfo = {
        command,
        projectName,
        workflowName,
        projectPath: this.projectPath,
      };

      this.logger.error(
        'Failed to create beads project epic',
        error instanceof Error ? error : new Error(errorMessage),
        commandInfo
      );

      // Include stderr if available for better debugging
      const execError = error as unknown as { stderr?: string };
      if (execError?.stderr) {
        this.logger.error(
          'Beads command stderr output',
          new Error('Command stderr'),
          {
            stderr: execError.stderr.toString(),
            ...commandInfo,
          }
        );
      }

      throw new Error(`Failed to create beads project epic: ${errorMessage}`);
    }
  }

  /**
   * Create phase tasks for all workflow phases under the project epic
   */
  async createPhaseTasks(
    epicId: string,
    phases: Record<string, YamlState>,
    workflowName: string
  ): Promise<BeadsPhaseTask[]> {
    // Validate parameters
    this.validateCreatePhaseParameters(epicId, phases, workflowName);

    const phaseTasks: BeadsPhaseTask[] = [];
    const phaseNames = Object.keys(phases);

    for (const phase of phaseNames) {
      const phaseTitle = capitalizePhase(phase);
      const priority = 3;
      const stateDefinition = phases[phase];

      // Escape the description to prevent shell injection and handle special characters
      const description = (
        stateDefinition?.default_instructions ||
        `${workflowName} workflow ${phase} phase tasks`
      )
        .replace(/"/g, '\\"') // Escape double quotes
        .replace(/\n/g, ' ') // Replace newlines with spaces
        .replace(/\r/g, '') // Remove carriage returns
        .trim();

      const command = `bd create "${phaseTitle}" --description "${description}" --parent ${epicId} --priority ${priority}`;

      this.logger.debug('Creating beads phase task', {
        command,
        phase,
        epicId,
        projectPath: this.projectPath,
      });

      try {
        const output = execSync(command, {
          cwd: this.projectPath,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        // Extract task ID from beads output
        // Support both new format (v0.47.1+): "✓ Created issue: project-name-123"
        // and legacy format: "Created bd-a1b2c3"
        const match =
          output.match(/✓ Created issue: ([\w\d.-]+)/) ||
          output.match(/Created issue: ([\w\d.-]+)/) ||
          output.match(/Created (bd-[\w\d.]+)/);
        if (!match) {
          this.logger.warn(
            'Failed to extract phase task ID from beads output',
            {
              command,
              output: output.slice(0, 200), // Truncated for logging
            }
          );
          throw new Error(
            `Failed to extract task ID from beads output: ${output.slice(0, 100)}...`
          );
        }

        const phaseTaskId = match[1] || '';
        phaseTasks.push({
          phaseId: phase,
          phaseName: phaseTitle,
          taskId: phaseTaskId,
        });

        this.logger.debug('Created beads phase task', {
          phase,
          phaseTaskId,
          epicId,
          projectPath: this.projectPath,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const commandInfo = {
          command,
          phase,
          epicId,
          projectPath: this.projectPath,
        };

        this.logger.error(
          'Failed to create beads phase task',
          error instanceof Error ? error : new Error(errorMessage),
          commandInfo
        );

        // Include stderr if available for better debugging
        const execError = error as unknown as { stderr?: string };
        if (execError?.stderr) {
          this.logger.error(
            'Beads phase command stderr output',
            new Error('Command stderr'),
            {
              stderr: execError.stderr.toString(),
              ...commandInfo,
            }
          );
        }

        throw new Error(
          `Failed to create beads phase task for ${phase}: ${errorMessage}`
        );
      }
    }

    this.logger.info('Created all beads phase tasks', {
      count: phaseTasks.length,
      epicId,
      projectPath: this.projectPath,
    });
    return phaseTasks;
  }

  /**
   * Create sequential dependencies between workflow phase tasks
   * Implements graceful error handling: logs warnings for failed dependencies but continues
   */
  async createPhaseDependencies(phaseTasks: BeadsPhaseTask[]): Promise<void> {
    if (phaseTasks.length < 2) {
      this.logger.debug('Skipping phase dependencies - less than 2 phases', {
        phaseCount: phaseTasks.length,
        projectPath: this.projectPath,
      });
      return;
    }

    this.logger.info('Creating sequential phase dependencies', {
      phaseCount: phaseTasks.length,
      projectPath: this.projectPath,
    });

    // Track failed dependencies for logging
    const failedDependencies: Array<{
      from: string;
      to: string;
      error: string;
    }> = [];

    // Create dependencies in sequence: each phase blocks the next one
    for (let i = 0; i < phaseTasks.length - 1; i++) {
      const currentPhase = phaseTasks[i];
      const nextPhase = phaseTasks[i + 1];

      if (!currentPhase || !nextPhase) {
        this.logger.warn('Skipping phase dependency - missing phase data', {
          currentPhaseIndex: i,
          nextPhaseIndex: i + 1,
          totalPhases: phaseTasks.length,
          projectPath: this.projectPath,
        });
        failedDependencies.push({
          from: `Phase ${i}`,
          to: `Phase ${i + 1}`,
          error: 'Missing phase data',
        });
        continue;
      }

      const command = `bd dep ${currentPhase.taskId} --blocks ${nextPhase.taskId}`;

      this.logger.debug('Creating phase dependency', {
        command,
        currentPhase: currentPhase.phaseName,
        nextPhase: nextPhase.phaseName,
        currentTaskId: currentPhase.taskId,
        nextTaskId: nextPhase.taskId,
        projectPath: this.projectPath,
      });

      try {
        execSync(command, {
          cwd: this.projectPath,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        this.logger.debug('Successfully created phase dependency', {
          currentPhase: currentPhase.phaseName,
          nextPhase: nextPhase.phaseName,
          projectPath: this.projectPath,
        });
      } catch (error) {
        // Log as warning but don't fail the entire setup
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          'Failed to create phase dependency - continuing anyway',
          {
            error: errorMessage,
            command,
            currentPhase: currentPhase.phaseName,
            nextPhase: nextPhase.phaseName,
            projectPath: this.projectPath,
          }
        );

        // Include stderr if available for better debugging
        const execError = error as unknown as { stderr?: string };
        if (execError?.stderr) {
          this.logger.debug('Beads dependency command stderr', {
            stderr: execError.stderr.toString(),
            command,
            projectPath: this.projectPath,
          });
        }

        // Track failed dependency but continue
        failedDependencies.push({
          from: currentPhase.phaseName,
          to: nextPhase.phaseName,
          error: errorMessage,
        });
      }
    }

    if (failedDependencies.length > 0) {
      this.logger.warn(
        'Some phase dependencies could not be created - app continues without these dependencies',
        {
          failedCount: failedDependencies.length,
          failedDependencies,
          projectPath: this.projectPath,
        }
      );
    }

    this.logger.info('Completed phase dependency creation', {
      dependencyCount: phaseTasks.length - 1,
      successCount: phaseTasks.length - 1 - failedDependencies.length,
      failedCount: failedDependencies.length,
      projectPath: this.projectPath,
    });
  }

  /**
   * Validate parameters for epic creation
   */
  private validateCreateEpicParameters(
    projectName: string,
    workflowName: string,
    description?: string,
    planFilename?: string
  ): void {
    if (
      !projectName ||
      typeof projectName !== 'string' ||
      projectName.trim() === ''
    ) {
      throw new Error('Project name is required and cannot be empty');
    }

    if (
      !workflowName ||
      typeof workflowName !== 'string' ||
      workflowName.trim() === ''
    ) {
      throw new Error('Workflow name is required and cannot be empty');
    }

    // Optional description validation - if provided, must be a valid string
    if (
      description !== undefined &&
      (typeof description !== 'string' || description.trim() === '')
    ) {
      throw new Error('Description, if provided, must be a non-empty string');
    }

    // Optional plan filename validation - if provided, must be a valid string
    if (
      planFilename !== undefined &&
      (typeof planFilename !== 'string' || planFilename.trim() === '')
    ) {
      throw new Error('Plan filename, if provided, must be a non-empty string');
    }
  }

  /**
   * Validate parameters for phase task creation
   */
  private validateCreatePhaseParameters(
    epicId: string,
    phases: Record<string, YamlState>,
    workflowName: string
  ): void {
    if (!epicId || typeof epicId !== 'string' || epicId.trim() === '') {
      throw new Error('Epic ID is required and cannot be empty');
    }

    if (
      !phases ||
      typeof phases !== 'object' ||
      Object.keys(phases).length === 0
    ) {
      throw new Error('Phases object is required and cannot be empty');
    }

    if (
      !workflowName ||
      typeof workflowName !== 'string' ||
      workflowName.trim() === ''
    ) {
      throw new Error('Workflow name is required and cannot be empty');
    }

    // Validate each phase
    for (const [phaseName, phaseState] of Object.entries(phases)) {
      if (
        !phaseName ||
        typeof phaseName !== 'string' ||
        phaseName.trim() === ''
      ) {
        throw new Error(
          `Invalid phase name: "${phaseName}" - phase names must be non-empty strings`
        );
      }

      if (!phaseState || typeof phaseState !== 'object') {
        throw new Error(
          `Invalid phase state for "${phaseName}" - phase states must be objects`
        );
      }

      if (
        !phaseState.default_instructions ||
        typeof phaseState.default_instructions !== 'string'
      ) {
        throw new Error(
          `Invalid phase state for "${phaseName}" - default_instructions must be a non-empty string`
        );
      }
    }
  }
}
