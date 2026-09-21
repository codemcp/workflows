/**
 * Instruction Generator
 *
 * Creates phase-specific guidance for the LLM based on current conversation state.
 * Customizes instructions based on project context and development phase.
 * Supports custom state machine definitions for dynamic instruction generation.
 * Handles variable substitution for project artifact references.
 */

import { access } from 'node:fs/promises';
import { ProjectDocsManager } from './project-docs-manager.js';
import type { ILogger } from './logger.js';
import { createLogger } from './logger.js';
import { capitalizePhase } from './string-utils.js';
import { formatCapabilityHint } from './capability-hint.js';
import type {
  InstructionContext,
  GeneratedInstructions,
} from './interfaces/instruction-generator.interface.js';

export class InstructionGenerator {
  private projectDocsManager: ProjectDocsManager;

  constructor(logger: ILogger = createLogger('InstructionGenerator')) {
    this.projectDocsManager = new ProjectDocsManager(logger);
  }

  /**
   * Generate comprehensive instructions for the LLM
   */
  async generateInstructions(
    baseInstructions: string,
    context: InstructionContext
  ): Promise<GeneratedInstructions> {
    const { projectPath, gitBranch } = context.conversationContext;

    // Apply literal variable substitution to base instructions (paths, not sentences)
    const substitutedInstructions = this.applyVariableSubstitution(
      baseInstructions,
      projectPath,
      gitBranch
    );

    // Inject referred_docs sentences at the top of the instructions
    const withDocInjection = await this.injectReferredDocs(
      substitutedInstructions,
      projectPath,
      context.referredDocs
    );

    // Enhance base instructions with context-specific guidance
    const enhancedInstructions = await this.enhanceInstructions(
      withDocInjection,
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
   * Apply variable substitution to instructions using literal paths.
   * Replaces $ARCHITECTURE_DOC, $REQUIREMENTS_DOC, $DESIGN_DOC etc.
   * with their absolute file paths — unconditionally, regardless of whether
   * the files exist. Conditional reading is handled separately via referred_docs.
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
   * Inject contextual read-prompt sentences for each entry in referred_docs.
   * Each doc is checked for existence; if the file exists, the sentence is
   * prepended to the instructions. Missing files are silently skipped.
   */
  private async injectReferredDocs(
    instructions: string,
    projectPath: string,
    referredDocs?: ('requirements' | 'architecture' | 'design')[]
  ): Promise<string> {
    if (!referredDocs || referredDocs.length === 0) {
      return instructions;
    }

    const paths = this.projectDocsManager.getDocumentPaths(projectPath);

    const sentences: Record<
      'requirements' | 'architecture' | 'design',
      { path: string; sentence: (p: string) => string }
    > = {
      requirements: {
        path: paths.requirements,
        sentence: p =>
          `Read \`${p}\` for all requirements to understand how and whether the requirements fit the total scope.`,
      },
      architecture: {
        path: paths.architecture,
        sentence: p =>
          `Read \`${p}\` when you need to make changes that affect the structure of this software.`,
      },
      design: {
        path: paths.design,
        sentence: p =>
          `Read \`${p}\` before implementing something to make sure you meet the conventions.`,
      },
    };

    const injectedLines: string[] = [];

    for (const docType of referredDocs) {
      const entry = sentences[docType];
      if (!entry) continue;

      try {
        await access(entry.path);
        // File exists — inject the sentence
        injectedLines.push(entry.sentence(entry.path));
      } catch {
        // File does not exist — silently skip
      }
    }

    if (injectedLines.length === 0) {
      return instructions;
    }

    return `${injectedLines.join('\n')}\n\n${instructions}`;
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
    const {
      phase,
      conversationContext,
      allowedFilePatterns,
      requiredCapability,
      capabilityConfig,
    } = context;

    const phaseName = capitalizePhase(phase);

    // IMPORTANT: Directive markers to make instructions stand out from context
    let workflowSection = `---
### YOU MUST FOLLOW THESE INSTRUCTIONS:

**IMPORTANT: Read \`${conversationContext.planFilePath}\`** for context.

**ACTION REQUIRED: Focus on "${phaseName}" tasks** and log decisions in "Key Decisions"

**When all tasks are completed**: Make sure that all insights and decisions are captured in \`${conversationContext.planFilePath}\`. Then call proceed_to_phase to move to the next phase.

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

    // Append optional capability hint. Opt-in: empty hint ⇒ skip entirely.
    const capabilityHint = formatCapabilityHint(
      requiredCapability,
      capabilityConfig
    );
    if (capabilityHint) {
      workflowSection += `\n\n${capabilityHint}`;
    }

    // Only remind to call whats_next() when not in a plugin hook context.
    // In plugin_hook context the hook itself injects instructions after each message,
    // so the reminder would be redundant noise.
    if (context.instructionSource !== 'plugin_hook') {
      workflowSection += '\n\nCall `whats_next()` after user messages.';
    }

    return `## ${phaseName} Phase\n\n${baseInstructions}\n\n${workflowSection}`;
  }
}
