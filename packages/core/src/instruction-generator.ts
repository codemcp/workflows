/**
 * Instruction Generator
 *
 * Creates phase-specific guidance for the LLM based on current conversation state.
 * Customizes instructions based on project context and development phase.
 * Supports custom state machine definitions for dynamic instruction generation.
 * Handles variable substitution for project artifact references.
 */

import { ProjectDocsManager } from './project-docs-manager.js';
import type { YamlStateMachine } from './state-machine-types.js';
import type { ILogger } from './logger.js';
import { createLogger } from './logger.js';
import { capitalizePhase } from './string-utils.js';
import type {
  IInstructionGenerator,
  InstructionContext,
  GeneratedInstructions,
} from './interfaces/instruction-generator.interface.js';

export class InstructionGenerator implements IInstructionGenerator {
  private projectDocsManager: ProjectDocsManager;

  constructor(logger: ILogger = createLogger('InstructionGenerator')) {
    this.projectDocsManager = new ProjectDocsManager(logger);
  }

  /**
   * No-op: all phase context is provided per-call via InstructionContext.
   */
  setStateMachine(_stateMachine: YamlStateMachine): void {
    return;
  }

  /**
   * Generate comprehensive instructions for the LLM
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

    // Enhance base instructions with context-specific guidance
    const enhancedInstructions = await this.enhanceInstructions(
      substitutedInstructions,
      context
    );

    return {
      instructions: enhancedInstructions,
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
   * Replaces project artifact variables with actual file paths
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
      // Use global replace to handle multiple occurrences
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
   * Enhance base instructions with context-specific information
   */
  private async enhanceInstructions(
    baseInstructions: string,
    context: InstructionContext
  ): Promise<string> {
    const { phase, conversationContext, allowedFilePatterns } = context;

    const phaseName = capitalizePhase(phase);

    // IMPORTANT: Directive markers to make instructions stand out from context
    let workflowSection = `---
### YOU MUST FOLLOW THESE INSTRUCTIONS:

**IMPORTANT: Read \`${conversationContext.planFilePath}\`** for context.

**ACTION REQUIRED: Focus on "${phaseName}" tasks** and log decisions in "Key Decisions"

**CRITICAL: Do NOT use other task/todo tools** - use only the plan file for task tracking`;

    // Add file restriction guidance if patterns are restricted
    if (
      allowedFilePatterns &&
      allowedFilePatterns.length > 0 &&
      !allowedFilePatterns.includes('**/*') &&
      !allowedFilePatterns.includes('*')
    ) {
      workflowSection += `\n- Files allowed: \`${allowedFilePatterns.join('`, `')}\``;
    }

    workflowSection += '\n\nCall `whats_next()` after user messages.';

    return `## ${phaseName} Phase\n\n${baseInstructions}\n\n${workflowSection}`;
  }
}
