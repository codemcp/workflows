/**
 * Plan Manager
 *
 * Handles the creation, updating, and maintenance of project development plan files.
 * Manages markdown plan files that serve as long-term project memory.
 * Supports custom state machine definitions for dynamic plan file generation.
 */

import { writeFile, readFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createLogger } from './logger.js';
import { getPathBasename } from './path-validation-utils.js';
import { capitalizePhase } from './string-utils.js';

import type { YamlStateMachine } from './state-machine-types.js';
import type { TaskBackendConfig } from './task-backend.js';
import type {
  IPlanManager,
  PlanFileInfo,
} from './interfaces/plan-manager.interface.js';

const logger = createLogger('PlanManager');

export class PlanManager implements IPlanManager {
  private stateMachine: YamlStateMachine | null = null;

  /**
   * Set the state machine definition for dynamic plan generation
   */
  setStateMachine(stateMachine: YamlStateMachine): void {
    this.stateMachine = stateMachine;
    logger.debug('State machine set for plan manager', {
      name: stateMachine.name,
      phases: Object.keys(stateMachine.states),
    });
  }

  /**
   * Set the task backend configuration
   */
  setTaskBackend(taskBackend: TaskBackendConfig): void {
    // PlanManager only handles the markdown backend. BeadsPlanManager overrides
    // this method to use the beads-specific task backend configuration.
    logger.debug('Task backend set for plan manager (markdown mode)', {
      backend: taskBackend.backend,
      available: taskBackend.isAvailable,
    });
  }

  /**
   * Get plan file information
   */
  async getPlanFileInfo(planFilePath: string): Promise<PlanFileInfo> {
    try {
      await access(planFilePath);
      const content = await readFile(planFilePath, 'utf-8');
      return {
        path: planFilePath,
        exists: true,
        content,
      };
    } catch (_error) {
      return {
        path: planFilePath,
        exists: false,
      };
    }
  }

  /**
   * Create initial plan file if it doesn't exist
   */
  async ensurePlanFile(
    planFilePath: string,
    projectPath: string,
    gitBranch: string
  ): Promise<void> {
    logger.debug('Ensuring plan file exists', {
      planFilePath,
      projectPath,
      gitBranch,
    });

    const planInfo = await this.getPlanFileInfo(planFilePath);

    if (!planInfo.exists) {
      logger.info('Plan file not found, creating initial plan', {
        planFilePath,
      });
      await this.createInitialPlanFile(planFilePath, projectPath, gitBranch);
      logger.info('Initial plan file created successfully', { planFilePath });
    } else {
      logger.debug('Plan file already exists', { planFilePath });
    }
  }

  /**
   * Create initial plan file with template content
   */
  private async createInitialPlanFile(
    planFilePath: string,
    projectPath: string,
    gitBranch: string
  ): Promise<void> {
    logger.debug('Creating initial plan file', { planFilePath });

    try {
      // Ensure directory exists
      await mkdir(dirname(planFilePath), { recursive: true });
      logger.debug('Plan file directory ensured', {
        directory: dirname(planFilePath),
      });

      const projectName = getPathBasename(projectPath, 'Unknown Project');
      const branchInfo = gitBranch !== 'no-git' ? ` (${gitBranch} branch)` : '';

      const initialContent = this.generateInitialPlanContent(
        projectName,
        branchInfo
      );

      await writeFile(planFilePath, initialContent, 'utf-8');
      logger.info('Initial plan file written successfully', {
        planFilePath,
        contentLength: initialContent.length,
        projectName,
      });
    } catch (error) {
      logger.error('Failed to create initial plan file', error as Error, {
        planFilePath,
      });
      throw error;
    }
  }

  /**
   * Generate initial plan file content based on state machine definition
   */
  private generateInitialPlanContent(
    projectName: string,
    branchInfo: string
  ): string {
    const timestamp = new Date().toISOString().split('T')[0];

    if (!this.stateMachine) {
      throw new Error(
        'State machine not set. This should not happen as state machine is always loaded.'
      );
    }

    const phases = Object.keys(this.stateMachine.states);
    const initialPhase = this.stateMachine.initial_state;

    const documentationUrl = this.generateWorkflowDocumentationUrl(
      this.stateMachine.name
    );

    let content = `# Development Plan: ${projectName}${branchInfo}

*Generated on ${timestamp} by Vibe Feature MCP*
*Workflow: ${
      documentationUrl
        ? '[' + this.stateMachine.name + ']' + '(' + documentationUrl + ')'
        : this.stateMachine.name
    }*

## Goal
*Define what you're building or fixing - this will be updated as requirements are gathered*
`;

    content += `## Key Decisions
*Important decisions will be documented here as they are made*

## Notes
*Additional context and observations*

`;

    content += `## ${capitalizePhase(initialPhase)}
### Tasks
- [ ] *Tasks will be added as they are identified*

### Completed
- [x] Created development plan file

`;

    // Generate simple sections for each phase
    for (const phase of phases) {
      if (phase !== initialPhase) {
        content += `## ${capitalizePhase(phase)}
### Tasks
- [ ] *To be added when this phase becomes active*

### Completed
*None yet*

`;
      }
    }

    content += `

---
*This plan is maintained by the LLM. Tool responses provide guidance on which section to focus on and what tasks to work on.*
`;

    return content;
  }

  /**
   * Update plan file with new content (this is typically done by the LLM)
   */
  async updatePlanFile(planFilePath: string, content: string): Promise<void> {
    // Ensure directory exists
    await mkdir(dirname(planFilePath), { recursive: true });

    await writeFile(planFilePath, content, 'utf-8');
  }

  /**
   * Get plan file content for LLM context
   */
  async getPlanFileContent(planFilePath: string): Promise<string> {
    const planInfo = await this.getPlanFileInfo(planFilePath);

    if (!planInfo.exists) {
      return 'Plan file does not exist yet. It will be created when the LLM updates it.';
    }

    return planInfo.content || '';
  }

  /**
   * Generate phase-specific plan file guidance based on state machine
   */
  generatePlanFileGuidance(phase: string): string {
    if (phase === null || phase === undefined) {
      throw new Error('Phase parameter cannot be null or undefined');
    }

    if (typeof phase !== 'string') {
      throw new Error('Phase parameter must be a string');
    }

    if (phase.trim() === '') {
      throw new Error('Phase parameter cannot be empty');
    }

    if (!this.stateMachine) {
      throw new Error(
        'State machine not set. This should not happen as state machine is always loaded.'
      );
    }

    const phaseDefinition = this.stateMachine.states[phase];
    if (!phaseDefinition) {
      logger.warn('Unknown phase for plan file guidance', { phase });
      return `Update the ${capitalizePhase(phase)} section with current progress and mark completed tasks.`;
    }

    const capitalizedPhase = capitalizePhase(phase);

    return `Update the ${capitalizedPhase} section with progress. Mark completed tasks with [x] and add new tasks as they are identified.`;
  }

  /**
   * Delete plan file
   */
  async deletePlanFile(planFilePath: string): Promise<boolean> {
    logger.debug('Deleting plan file', { planFilePath });

    try {
      // Check if file exists first
      await access(planFilePath);

      // Import unlink dynamically to avoid issues
      const { unlink } = await import('node:fs/promises');
      await unlink(planFilePath);

      logger.info('Plan file deleted successfully', { planFilePath });
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug('Plan file does not exist, nothing to delete', {
          planFilePath,
        });
        return true; // Consider it successful if file doesn't exist
      }

      logger.error('Failed to delete plan file', error as Error, {
        planFilePath,
      });
      throw error;
    }
  }

  /**
   * Ensure plan file is deleted (verify deletion)
   */
  async ensurePlanFileDeleted(planFilePath: string): Promise<boolean> {
    logger.debug('Ensuring plan file is deleted', { planFilePath });

    try {
      await access(planFilePath);
      // If we reach here, file still exists
      logger.warn('Plan file still exists after deletion attempt', {
        planFilePath,
      });
      return false;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug('Plan file successfully deleted (does not exist)', {
          planFilePath,
        });
        return true;
      }

      // Some other error occurred
      logger.error('Error checking plan file deletion', error as Error, {
        planFilePath,
      });
      throw error;
    }
  }

  /**
   * Generate workflow documentation URL for predefined workflows
   * Returns undefined for custom workflows
   */
  private generateWorkflowDocumentationUrl(
    workflowName: string
  ): string | undefined {
    // Don't generate URL for custom workflows
    if (workflowName === 'custom') {
      return undefined;
    }

    // Generate URL for predefined workflows
    return `https://codemcp.github.io/workflows/workflows/${workflowName}`;
  }

  /**
   * Generate base instructions for the LLM after a workflow is started.
   * Instructs the LLM to populate the Goal section and define phase entrance
   * criteria in the freshly created plan file.
   */
  getInitialPlanGuidance(
    planFilePath: string,
    workflowDocUrl?: string
  ): string {
    const docInfo = workflowDocUrl
      ? `\n\nInform the user about the chosen workflow. They can visit: ${workflowDocUrl} to get detailed information.`
      : '';

    const i18nNote = `\n\nNOTE: If the user is communicating in a non-English language, translate plan file content to that language while keeping markdown headers (##, ###) in English to maintain structure parsing. Continue all interactions in the user's language.`;

    return `**Read ${planFilePath}** to understand the workflow structure. Add entrance criteria for each phase (what must be true to enter), then call \`whats_next()\`.${docInfo}${i18nNote}`;
  }
}
