/**
 * Beads Instruction Generator
 *
 * Beads-specific implementation of IInstructionGenerator.
 * Generates instructions optimized for beads task management workflow.
 */

import {
  type IInstructionGenerator,
  type InstructionContext,
  type GeneratedInstructions,
  type YamlStateMachine,
  ProjectDocsManager,
} from '@codemcp/workflows-core';

/**
 * Beads-specific instruction generator
 */
export class BeadsInstructionGenerator implements IInstructionGenerator {
  private projectDocsManager: ProjectDocsManager;

  constructor() {
    this.projectDocsManager = new ProjectDocsManager();
  }

  /**
   * Set the state machine definition (interface requirement)
   */
  setStateMachine(_stateMachine: YamlStateMachine): void {
    // No-op: beads uses CLI for state management
  }

  /**
   * Generate comprehensive instructions optimized for beads workflow
   */
  async generateInstructions(
    baseInstructions: string,
    context: InstructionContext
  ): Promise<GeneratedInstructions> {
    // Apply variable substitution to base instructions
    const substitutedInstructions = this.applyVariableSubstitution(
      baseInstructions,
      context.conversationContext.projectPath,
      context.conversationContext.gitBranch
    );

    // Enhance base instructions with beads-specific guidance
    const enhancedInstructions = await this.enhanceBeadsInstructions(
      substitutedInstructions,
      context
    );

    return {
      instructions: enhancedInstructions,
      planFileGuidance:
        'Using beads CLI for task management - plan file serves as context only',
      metadata: {
        phase: context.phase,
        planFilePath: context.conversationContext.planFilePath,
        transitionReason: context.transitionReason,
        isModeled: context.isModeled,
      },
    };
  }

  /**
   * Apply variable substitution to instructions
   */
  private applyVariableSubstitution(
    instructions: string,
    projectPath: string,
    gitBranch?: string
  ): string {
    const substitutions = this.projectDocsManager.getVariableSubstitutions(
      projectPath,
      gitBranch
    );

    let result = instructions;
    for (const [variable, value] of Object.entries(substitutions)) {
      result = result.replace(
        new RegExp(this.escapeRegExp(variable), 'g'),
        value
      );
    }

    return result;
  }

  /**
   * Escape special regex characters in variable names
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Enhance instructions with beads-specific guidance
   */
  private async enhanceBeadsInstructions(
    baseInstructions: string,
    context: InstructionContext
  ): Promise<string> {
    const { planFileExists } = context;

    // Generate beads-specific task management guidance
    const beadsTaskGuidance = await this.generateBeadsCLIGuidance(context);

    // Beads-optimized instruction structure
    let enhanced = `${baseInstructions}

**Plan File Guidance:**
Use the plan file as memory for the current objective
- Update the "Key Decisions" section with important choices made
- Add relevant notes to help maintain context
- Do NOT enter tasks in the plan file, use beads CLI exclusively for task management

${beadsTaskGuidance}`;

    // Add plan file creation note if needed
    if (!planFileExists) {
      enhanced +=
        '\n\n**Note**: Plan file will be created when you first update it.';
    }

    // Add beads-specific reminders
    enhanced += `\n\n**Important Reminders:**
- Use ONLY bd CLI tool for task management - do not use your own task management tools
- Call whats_next() after the next user message to maintain the development workflow`;

    return enhanced;
  }

  /**
   * Generate beads-specific task management guidance
   */
  private async generateBeadsCLIGuidance(
    context: InstructionContext
  ): Promise<string> {
    const { instructionSource } = context;

    // For whats_next, provide detailed guidance
    if (instructionSource === 'whats_next') {
      let additionalInstructions = `**bd Task Management:**
      `;

      const phaseTaskId = await this.extractPhaseTaskId(context);

      if (!phaseTaskId) {
        return (
          additionalInstructions +
          `- Use bd CLI tool exclusively
- **Start by listing ready tasks**: \`bd list --parent <phase-task-id> --status open\`
- **Create new tasks**: \`bd create 'Task title' --parent <phase-task-id> -p <priority>\`
- **Update status when working**: \`bd update <task-id> --status in_progress\`
- **Complete tasks**: \`bd close <task-id>\`
- **Focus on ready tasks first** - let beads handle dependencies
- Add new tasks as they are identified during your work with the user`
        );
      }

      return (
        additionalInstructions +
        `
**Focus on subtasks of \`${phaseTaskId}\`**:
• \`bd list --parent ${phaseTaskId} --status open\` - List ready work items
• \`bd update <task-id> --status in_progress\` - Start working on a specific task
• \`bd close <task-id>\` - Mark task complete when finished

**New Tasks for Current Phase**:
• \`bd create 'Task description' --parent ${phaseTaskId} -p <priority>\` - Create work item under current phase
• \`bd dep add <task-id> <depends-on-id>\` - Define dependencies for a task:`
      );
    }

    return '';
  }

  private async extractPhaseTaskId(
    context: InstructionContext
  ): Promise<string | null> {
    try {
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(
        context.conversationContext.planFilePath,
        'utf-8'
      );

      const phaseName = this.capitalizePhase(context.phase);
      const phaseHeader = `## ${phaseName}`;

      // Look for the phase header followed by beads-phase-id comment
      const phaseSection = content.split('\n');
      let foundPhaseHeader = false;

      for (const line of phaseSection) {
        if (line.trim() === phaseHeader) {
          foundPhaseHeader = true;
          continue;
        }

        if (foundPhaseHeader && line.includes('beads-phase-id:')) {
          const match = line.match(/beads-phase-id:\s*([\w\d.-]+)/);
          if (match) {
            return match[1] || null;
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
}
