/**
 * Beads Plugin Implementation
 *
 * Plugin that integrates beads task management system with the workflows server.
 * Encapsulates ALL beads-specific functionality to maintain zero core application
 * coupling as specified in plugin architecture design.
 *
 * Core Principle: This plugin must be completely self-contained and the core
 * application must have ZERO knowledge of beads functionality.
 */

import type {
  IPlugin,
  PluginHooks,
  PluginHookContext,
  StartDevelopmentArgs,
  StartDevelopmentResult,
  GeneratedInstructions,
} from './plugin-interfaces.js';
import type {
  YamlState,
  ILogger,
  LoggerFactory,
} from '@codemcp/workflows-core';
import {
  BeadsStateManager,
  BeadsIntegration,
  createLogger,
  PlanManager,
  TaskBackendManager,
  getPathBasename,
} from '@codemcp/workflows-core';
import { BeadsTaskBackendClient } from '../components/beads/beads-task-backend-client.js';

/**
 * BeadsPlugin class implementing the IPlugin interface
 *
 * Activation: When beads backend is detected (either via TASK_BACKEND=beads env var
 *             or auto-detection when bd CLI is available)
 * Priority: Sequence 100 (middle priority)
 * Encapsulation: All beads functionality contained within this plugin
 */
export class BeadsPlugin implements IPlugin {
  private projectPath: string;
  private beadsStateManager: BeadsStateManager;
  private beadsTaskBackendClient: BeadsTaskBackendClient;
  private planManager: PlanManager;
  private logger: ILogger;
  private loggerFactory?: LoggerFactory;

  constructor(options: { projectPath: string; loggerFactory?: LoggerFactory }) {
    this.projectPath = options.projectPath;
    this.loggerFactory = options.loggerFactory;
    this.logger = options.loggerFactory
      ? options.loggerFactory('BeadsPlugin')
      : createLogger('BeadsPlugin');

    // Initialize internal beads components (pass logger to avoid stderr output)
    this.beadsStateManager = new BeadsStateManager(
      this.projectPath,
      options.loggerFactory
        ? options.loggerFactory('BeadsStateManager')
        : undefined
    );
    this.beadsTaskBackendClient = new BeadsTaskBackendClient(
      this.projectPath,
      options.loggerFactory
        ? options.loggerFactory('BeadsTaskBackendClient')
        : undefined
    );
    this.planManager = new PlanManager();

    this.logger.debug('BeadsPlugin initialized', {
      projectPath: this.projectPath,
    });
  }

  getName(): string {
    return 'BeadsPlugin';
  }

  getSequence(): number {
    return 100; // Middle priority as specified
  }

  isEnabled(): boolean {
    // Use TaskBackendManager to properly detect beads backend,
    // which supports both explicit TASK_BACKEND env var and auto-detection
    // Pass our logger so logs go to the right place
    const taskBackendConfig = TaskBackendManager.detectTaskBackend(this.logger);
    const enabled =
      taskBackendConfig.backend === 'beads' && taskBackendConfig.isAvailable;
    this.logger.debug('BeadsPlugin enablement check', {
      backend: taskBackendConfig.backend,
      isAvailable: taskBackendConfig.isAvailable,
      autoDetected: !process.env['TASK_BACKEND'],
      enabled,
    });
    return enabled;
  }

  getHooks(): PluginHooks {
    return {
      afterStartDevelopment: this.handleAfterStartDevelopment.bind(this),
      beforePhaseTransition: this.handleBeforePhaseTransition.bind(this),
      afterPlanFileCreated: this.handleAfterPlanFileCreated.bind(this),
      afterInstructionsGenerated:
        this.handleAfterInstructionsGenerated.bind(this),
    };
  }

  /**
   * Handle beforePhaseTransition hook
   * Replaces validateBeadsTaskCompletion() method from proceed-to-phase.ts
   */
  private async handleBeforePhaseTransition(
    context: PluginHookContext,
    currentPhase: string,
    targetPhase: string
  ): Promise<void> {
    this.logger.info(
      'BeadsPlugin: Validating task completion before phase transition',
      {
        conversationId: context.conversationId,
        currentPhase,
        targetPhase,
      }
    );

    try {
      await this.validateBeadsTaskCompletion(
        context.conversationId,
        currentPhase,
        targetPhase,
        context.projectPath
      );

      this.logger.info(
        'BeadsPlugin: Task validation passed, allowing phase transition',
        {
          conversationId: context.conversationId,
          currentPhase,
          targetPhase,
        }
      );
    } catch (error) {
      this.logger.info(
        'BeadsPlugin: Task validation failed, blocking phase transition',
        {
          conversationId: context.conversationId,
          currentPhase,
          targetPhase,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      // Re-throw validation errors to block transitions
      throw error;
    }
  }

  /**
   * Handle afterStartDevelopment hook
   * Replaces setupBeadsIntegration() method from start-development.ts
   * Implements graceful degradation: continues app operation even if beads operations fail
   */
  private async handleAfterStartDevelopment(
    context: PluginHookContext,
    args: StartDevelopmentArgs,
    _result: StartDevelopmentResult
  ): Promise<void> {
    this.logger.info('BeadsPlugin: Setting up beads integration', {
      conversationId: context.conversationId,
      workflow: args.workflow,
      projectPath: context.projectPath,
    });

    // Verify we have the required state machine information
    if (!context.stateMachine) {
      this.logger.error(
        'BeadsPlugin: State machine not provided in plugin context'
      );
      this.logger.warn(
        'BeadsPlugin: Beads integration disabled - continuing without beads'
      );
      return; // Graceful degradation: continue without beads
    }

    try {
      const beadsIntegration = new BeadsIntegration(
        context.projectPath,
        this.loggerFactory ? this.loggerFactory('BeadsIntegration') : undefined
      );
      const projectName = getPathBasename(
        context.projectPath,
        'Unknown Project'
      );

      // Extract goal from plan file if it exists and has meaningful content
      let goalDescription: string | undefined;
      try {
        const planFileContent = await this.planManager.getPlanFileContent(
          context.planFilePath
        );
        goalDescription = this.extractGoalFromPlan(planFileContent);
      } catch (error) {
        this.logger.warn('BeadsPlugin: Could not extract goal from plan file', {
          error: error instanceof Error ? error.message : String(error),
          planFilePath: context.planFilePath,
        });
        // Continue without goal - it's optional
      }

      // Extract plan filename for use in epic title
      const planFilename = getPathBasename(context.planFilePath);

      // Try to create project epic
      let epicId: string;
      try {
        epicId = await beadsIntegration.createProjectEpic(
          projectName,
          args.workflow,
          goalDescription,
          planFilename
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          'BeadsPlugin: Failed to create beads project epic - continuing without beads integration',
          {
            error: errorMsg,
            projectPath: context.projectPath,
          }
        );
        // Graceful degradation: continue app operation without beads
        return;
      }

      // Try to create phase tasks
      let phaseTasks: Array<{
        phaseId: string;
        phaseName: string;
        taskId: string;
      }>;
      try {
        phaseTasks = await beadsIntegration.createPhaseTasks(
          epicId,
          context.stateMachine.states as Record<string, YamlState>,
          args.workflow
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          'BeadsPlugin: Failed to create beads phase tasks - continuing without phase tracking',
          {
            error: errorMsg,
            epicId,
          }
        );
        // Graceful degradation: continue without phase tracking
        return;
      }

      // Try to create sequential dependencies between phases
      try {
        await beadsIntegration.createPhaseDependencies(phaseTasks);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          'BeadsPlugin: Failed to create phase dependencies - continuing without dependencies',
          {
            error: errorMsg,
            phaseCount: phaseTasks.length,
          }
        );
        // Graceful degradation: continue without dependencies
      }

      // Try to update plan file with phase task IDs
      try {
        await this.updatePlanFileWithPhaseTaskIds(
          context.planFilePath,
          phaseTasks
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          'BeadsPlugin: Failed to update plan file with beads task IDs - continuing without plan file updates',
          {
            error: errorMsg,
            planFilePath: context.planFilePath,
          }
        );
        // Graceful degradation: continue without plan file updates
      }

      // Try to create beads state for this conversation
      try {
        await this.beadsStateManager.createState(
          context.conversationId,
          epicId,
          phaseTasks
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          'BeadsPlugin: Failed to create beads state - continuing without state persistence',
          {
            error: errorMsg,
            conversationId: context.conversationId,
          }
        );
        // Graceful degradation: continue without state persistence
      }

      this.logger.info('BeadsPlugin: Beads integration setup complete', {
        conversationId: context.conversationId,
        epicId,
        phaseCount: phaseTasks?.length || 0,
        planFilePath: context.planFilePath,
      });
    } catch (error) {
      // Catch-all for unexpected errors: log and continue
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        'BeadsPlugin: Unexpected error during beads integration setup - continuing application without beads',
        {
          error: errorMsg,
          conversationId: context.conversationId,
        }
      );
      // Graceful degradation: never crash the app due to beads errors
    }
  }

  /**
   * Handle afterPlanFileCreated hook
   * Enhances the plan file with beads-specific templates and placeholders
   *
   * This hook is called after a plan file is created. For beads integration,
   * it ensures the plan file has TBD placeholders for phase task IDs that
   * will be filled in later by afterStartDevelopment.
   *
   * Note: Task IDs themselves are created in afterStartDevelopment, not here.
   * This hook ensures the plan has the proper structure to receive them.
   */
  private async handleAfterPlanFileCreated(
    context: PluginHookContext,
    planFilePath: string,
    content: string
  ): Promise<string> {
    this.logger.debug('BeadsPlugin: afterPlanFileCreated hook invoked', {
      planFilePath,
      contentLength: content.length,
    });

    // Build the set of phase headers from the state machine so we can
    // identify which `## Heading` lines are workflow phases (vs. sections
    // like "## Goal" or "## Key Decisions").
    const phaseHeaders = context.stateMachine
      ? new Set(
          Object.keys(context.stateMachine.states).map(
            phase => `## ${this.capitalizePhase(phase)}`
          )
        )
      : new Set<string>();

    if (phaseHeaders.size === 0) {
      this.logger.debug(
        'BeadsPlugin: No state machine phases available, skipping plan file transformation'
      );
      return content;
    }

    // Walk the file line by line.  After every phase header that is not
    // already followed by a beads-phase-id comment, inject the TBD
    // placeholder.  This is robust against LLM-modified plan files
    // (entrance-criteria sections, custom task lists, etc.) because it
    // does not depend on exact surrounding text.
    const lines = content.split('\n');
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]);

      if (phaseHeaders.has(lines[i].trim())) {
        // Only insert if the very next line is not already a beads comment.
        const nextLine = lines[i + 1] ?? '';
        if (!nextLine.includes('beads-phase-id:')) {
          result.push('<!-- beads-phase-id: TBD -->');
        }
      }
    }

    const transformed = result.join('\n');

    this.logger.debug('BeadsPlugin: Plan file transformed for beads', {
      planFilePath,
      originalLength: content.length,
      transformedLength: transformed.length,
      wasModified: content !== transformed,
    });

    return transformed;
  }

  /**
   * Handle afterInstructionsGenerated hook
   * Enriches instructions with beads-specific task management guidance
   */
  private async handleAfterInstructionsGenerated(
    context: PluginHookContext,
    instructions: GeneratedInstructions
  ): Promise<GeneratedInstructions> {
    this.logger.debug('BeadsPlugin: afterInstructionsGenerated hook invoked', {
      phase: instructions.phase,
      instructionSource: instructions.instructionSource,
      planFilePath: instructions.planFilePath,
    });

    // Generate beads-specific task management guidance
    const beadsGuidance = await this.generateBeadsGuidance(
      context,
      instructions
    );

    // Enhance instructions with beads guidance
    let enhanced = instructions.instructions;

    enhanced += `\n\nLog decisions in plan file. Use ONLY \`bd\` CLI for tasks (not your own todo tools).${beadsGuidance}`;

    // Add plan file creation note if needed
    if (context.planFileExists === false) {
      enhanced +=
        '\n\n**Note**: Plan file will be created when you first update it.';
    }

    // Add beads-specific reminders
    enhanced += '\n\nCall `whats_next()` after user messages.';

    this.logger.debug(
      'BeadsPlugin: Instructions enriched with beads guidance',
      {
        originalLength: instructions.instructions.length,
        enrichedLength: enhanced.length,
      }
    );

    return {
      ...instructions,
      instructions: enhanced,
    };
  }

  /**
   * Generate beads-specific task management guidance
   */
  private async generateBeadsGuidance(
    _context: PluginHookContext,
    instructions: GeneratedInstructions
  ): Promise<string> {
    // For whats_next and start_development, provide detailed guidance
    if (
      instructions.instructionSource === 'whats_next' ||
      instructions.instructionSource === 'start_development'
    ) {
      const phaseTaskId = await this.extractPhaseTaskIdFromPlanFile(
        instructions.planFilePath,
        instructions.phase
      );

      if (!phaseTaskId) {
        return `\n\n**Task Management (bd CLI):**
Create tasks as sub-tasks of phase task: \`bd create 'title' --parent <phase-task-id>\`
List open tasks: \`bd list --parent <phase-task-id> --status open\`
Complete tasks: \`bd close <id>\``;
      }

      return `\n\n**Task Management (bd CLI) - Phase: ${phaseTaskId}**
Create tasks as sub-tasks: \`bd create 'title' --parent ${phaseTaskId}\`
List open tasks: \`bd list --parent ${phaseTaskId} --status open\`
Complete tasks: \`bd close <id>\``;
    }

    return '';
  }

  /**
   * Extract phase task ID from plan file
   */
  private async extractPhaseTaskIdFromPlanFile(
    planFilePath: string,
    phase: string
  ): Promise<string | null> {
    try {
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(planFilePath, 'utf-8');

      const phaseName = this.capitalizePhase(phase);
      const phaseHeader = `## ${phaseName}`;

      // Look for the phase header followed by beads-phase-id comment
      const lines = content.split('\n');
      let foundPhaseHeader = false;

      for (const line of lines) {
        if (line.trim() === phaseHeader) {
          foundPhaseHeader = true;
          continue;
        }

        if (foundPhaseHeader && line.includes('beads-phase-id:')) {
          const match = line.match(/beads-phase-id:\s*([\w\d.-]+)/);
          if (match && match[1] && match[1] !== 'TBD') {
            return match[1];
          }
        }

        // Stop looking if we hit the next phase header
        if (foundPhaseHeader && line.startsWith('##') && line !== phaseHeader) {
          break;
        }
      }

      return null;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Capitalize phase name for display
   */
  private capitalizePhase(phase: string): string {
    return phase
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Validate beads task completion before phase transition
   * Implements graceful error handling: logs errors but continues on non-validation failures
   */
  private async validateBeadsTaskCompletion(
    conversationId: string,
    currentPhase: string,
    targetPhase: string,
    projectPath: string
  ): Promise<void> {
    try {
      // Check if beads backend client is available
      let isAvailable = false;
      try {
        isAvailable = await this.beadsTaskBackendClient.isAvailable();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn('BeadsPlugin: Failed to check beads availability', {
          error: errorMsg,
          conversationId,
        });
        // Graceful degradation: assume beads is unavailable and continue
        return;
      }

      if (!isAvailable) {
        // Not in beads mode or beads not available, skip validation
        this.logger.debug(
          'BeadsPlugin: Skipping beads task validation - beads CLI not available',
          {
            conversationId,
            currentPhase,
            targetPhase,
          }
        );
        return;
      }

      // Get beads state for this conversation
      let currentPhaseTaskId: string | null = null;
      try {
        currentPhaseTaskId = await this.beadsStateManager.getPhaseTaskId(
          conversationId,
          currentPhase
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn('BeadsPlugin: Failed to get beads phase task ID', {
          error: errorMsg,
          conversationId,
          currentPhase,
        });
        // Graceful degradation: continue without validation
        return;
      }

      if (!currentPhaseTaskId) {
        // No beads state found for this conversation - fallback to graceful handling
        this.logger.debug(
          'BeadsPlugin: No beads phase task ID found for current phase',
          {
            conversationId,
            currentPhase,
            targetPhase,
            projectPath,
          }
        );
        return;
      }

      this.logger.debug(
        'BeadsPlugin: Checking for incomplete beads tasks using task backend client',
        {
          conversationId,
          currentPhase,
          currentPhaseTaskId,
        }
      );

      // Use task backend client to validate task completion
      let validationResult;
      try {
        validationResult =
          await this.beadsTaskBackendClient.validateTasksCompleted(
            currentPhaseTaskId
          );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          'BeadsPlugin: Failed to validate tasks with beads backend',
          {
            error: errorMsg,
            conversationId,
            currentPhaseTaskId,
          }
        );
        // Graceful degradation: allow transition if validation fails
        return;
      }

      if (!validationResult.valid) {
        // Get the incomplete tasks from the validation result
        const incompleteTasks = validationResult.openTasks || [];
        const taskIds = incompleteTasks.map(t => t.id).join(', ');

        const errorMessage = `${incompleteTasks.length} incomplete task(s) in ${currentPhase}: ${taskIds}. Complete or defer (\`bd defer <id>\`) before proceeding.`;

        this.logger.info(
          'BeadsPlugin: Blocking phase transition due to incomplete beads tasks',
          {
            conversationId,
            currentPhase,
            targetPhase,
            currentPhaseTaskId,
            incompleteTaskCount: incompleteTasks.length,
            incompleteTaskIds: incompleteTasks.map(t => t.id),
          }
        );

        throw new Error(errorMessage);
      }

      this.logger.info(
        'BeadsPlugin: All beads tasks completed in current phase, allowing transition',
        {
          conversationId,
          currentPhase,
          targetPhase,
          currentPhaseTaskId,
        }
      );
    } catch (error) {
      // Re-throw validation errors (incomplete tasks)
      if (
        error instanceof Error &&
        error.message.includes('Cannot proceed to')
      ) {
        throw error;
      }

      // Log other errors but allow transition (graceful degradation)
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        'BeadsPlugin: Beads task validation failed, allowing transition to proceed',
        {
          error: errorMessage,
          conversationId,
          currentPhase,
          targetPhase,
          projectPath,
        }
      );
      // Graceful degradation: continue without beads state validation
    }
  }

  /**
   * Extract Goal section content from plan file
   * Returns the goal content if it exists and is meaningful, otherwise undefined
   */
  private extractGoalFromPlan(planContent: string): string | undefined {
    if (!planContent || typeof planContent !== 'string') {
      return undefined;
    }

    // Split content into lines for more reliable parsing
    const lines = planContent.split('\n');
    const goalIndex = lines.findIndex(line => line.trim() === '## Goal');

    if (goalIndex === -1) {
      return undefined;
    }

    // Find the next section (## anything) after the Goal section
    const nextSectionIndex = lines.findIndex(
      (line, index) => index > goalIndex && line.trim().startsWith('## ')
    );

    // Extract content between Goal and next section (or end of content)
    const contentLines =
      nextSectionIndex === -1
        ? lines.slice(goalIndex + 1)
        : lines.slice(goalIndex + 1, nextSectionIndex);

    const goalContent = contentLines.join('\n').trim();

    // Check if the goal content is meaningful (not just a placeholder or comment)
    const meaninglessPatterns = [
      /^\*.*\*$/, // Enclosed in asterisks like "*Define what you're building...*"
      /^To be defined/i,
      /^TBD$/i,
      /^TODO/i,
      /^Define what you're building/i,
      /^This will be updated/i,
    ];

    const isMeaningless = meaninglessPatterns.some(pattern =>
      pattern.test(goalContent)
    );

    if (isMeaningless || goalContent.length < 10) {
      return undefined;
    }

    return goalContent;
  }

  /**
   * Update plan file to include beads phase task IDs in comments
   * Implements graceful degradation: logs errors but continues app operation if update fails
   */
  private async updatePlanFileWithPhaseTaskIds(
    planFilePath: string,
    phaseTasks: Array<{ phaseId: string; phaseName: string; taskId: string }>
  ): Promise<void> {
    try {
      const { readFile, writeFile } = await import('node:fs/promises');

      // Try to read the plan file
      let content: string;
      try {
        content = await readFile(planFilePath, 'utf-8');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn('BeadsPlugin: Failed to read plan file for update', {
          error: errorMsg,
          planFilePath,
        });
        // Graceful degradation: continue without updating plan file
        return;
      }

      // Replace TBD placeholders with actual task IDs
      for (const phaseTask of phaseTasks) {
        const phaseHeader = `## ${phaseTask.phaseName}`;
        const placeholderPattern = new RegExp(
          `(${phaseHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\n)<!-- beads-phase-id: TBD -->`,
          'g'
        );
        content = content.replace(
          placeholderPattern,
          `$1<!-- beads-phase-id: ${phaseTask.taskId} -->`
        );
      }

      // Validate that all TBD placeholders were replaced
      const remainingTBDs = content.match(/<!-- beads-phase-id: TBD -->/g);
      if (remainingTBDs && remainingTBDs.length > 0) {
        this.logger.warn(
          'BeadsPlugin: Failed to replace all TBD placeholders in plan file',
          {
            planFilePath,
            unreplacedCount: remainingTBDs.length,
            reason:
              'Phase names in plan file may not match workflow phases or beads task creation may have failed for some phases',
          }
        );
        // Graceful degradation: continue without full update
        // But still try to write what we have
      }

      // Try to write the updated plan file
      try {
        await writeFile(planFilePath, content, 'utf-8');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn('BeadsPlugin: Failed to write updated plan file', {
          error: errorMsg,
          planFilePath,
        });
        // Graceful degradation: continue without writing to plan file
        return;
      }

      this.logger.info(
        'BeadsPlugin: Successfully updated plan file with beads phase task IDs',
        {
          planFilePath,
          phaseTaskCount: phaseTasks.length,
          replacedTasks: phaseTasks.map(
            task => `${task.phaseName}: ${task.taskId}`
          ),
        }
      );
    } catch (error) {
      // Catch-all for unexpected errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        'BeadsPlugin: Unexpected error while updating plan file with phase task IDs',
        {
          error: errorMsg,
          planFilePath,
        }
      );
      // Graceful degradation: never crash the app due to plan file updates
    }
  }
}
