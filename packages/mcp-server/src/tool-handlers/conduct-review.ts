/**
 * ConductReview Tool Handler
 *
 * Handles review requests before phase transitions. Adapts to MCP environment
 * capabilities - returns automated review results if sampling available,
 * otherwise returns instructions for LLM to conduct guided review.
 */

import { ConversationRequiredToolHandler } from './base-tool-handler.js';
import { validateRequiredArgs } from '../server-helpers.js';
import type { ConversationContext } from '@codemcp/workflows-core';
import type { YamlTransition } from '@codemcp/workflows-core';
import { ServerContext } from '../types.js';

/**
 * Arguments for the conduct_review tool
 */
export interface ConductReviewArgs {
  target_phase: string;
}

/**
 * Response from the conduct_review tool
 */
export interface ConductReviewResult {
  instructions: string;
  perspectives: Array<{
    name: string;
    prompt: string;
  }>;
}

/**
 * ConductReview tool handler implementation
 */
export class ConductReviewHandler extends ConversationRequiredToolHandler<
  ConductReviewArgs,
  ConductReviewResult
> {
  protected async executeWithConversation(
    args: ConductReviewArgs,
    context: ServerContext,
    conversationContext: ConversationContext
  ): Promise<ConductReviewResult> {
    // Validate required arguments
    validateRequiredArgs(args, ['target_phase']);

    const { target_phase } = args;
    const currentPhase = conversationContext.currentPhase;
    const conversationId = conversationContext.conversationId;

    this.logger.debug('Processing conduct_review request', {
      conversationId,
      currentPhase,
      targetPhase: target_phase,
    });

    // Ensure state machine is loaded for this project
    this.ensureStateMachineForProject(context, conversationContext.projectPath);

    // Get transition configuration from workflow
    const transition = this.getTransitionConfig(
      currentPhase,
      target_phase,
      conversationContext.workflowName,
      context
    );

    if (
      !transition.review_perspectives ||
      transition.review_perspectives.length === 0
    ) {
      throw new Error(
        `No review perspectives defined for transition from ${currentPhase} to ${target_phase}`
      );
    }

    // Check if MCP environment supports sampling (LLM interaction tools)
    const hasSamplingCapability = await this.checkSamplingCapability(context);

    if (hasSamplingCapability) {
      // Conduct automated review using available LLM tools
      return await this.conductAutomatedReview(
        transition.review_perspectives,
        conversationContext
      );
    } else {
      // Generate instructions for LLM to conduct review
      return await this.generateReviewInstructions(
        transition.review_perspectives,
        currentPhase,
        target_phase
      );
    }
  }

  /**
   * Get transition configuration from workflow
   */
  private getTransitionConfig(
    currentPhase: string,
    targetPhase: string,
    workflowName: string,
    context: ServerContext
  ) {
    const stateMachine = context.workflowManager.loadWorkflowForProject(
      context.projectPath,
      workflowName
    );
    const currentState = stateMachine.states[currentPhase];

    if (!currentState) {
      throw new Error(`Invalid current phase: ${currentPhase}`);
    }

    const transition = currentState.transitions.find(
      (t: YamlTransition) => t.to === targetPhase
    );
    if (!transition) {
      throw new Error(
        `No transition found from ${currentPhase} to ${targetPhase}`
      );
    }

    return transition;
  }

  /**
   * Check if MCP environment supports sampling capabilities
   */
  private async checkSamplingCapability(
    _context: ServerContext
  ): Promise<boolean> {
    // For now, assume non-sampling (most common case)
    // In the future, this could check for specific LLM interaction tools
    return false;
  }

  /**
   * Conduct automated review using LLM tools (when sampling is available)
   */
  private async conductAutomatedReview(
    perspectives: Array<{ perspective: string; prompt: string }>,
    conversationContext: ConversationContext
  ): Promise<ConductReviewResult> {
    // Falls back to guided instructions until automated review is implemented
    return this.generateReviewInstructions(
      perspectives,
      conversationContext.currentPhase,
      'target'
    );
  }

  /**
   * Generate instructions for LLM to conduct guided review
   */
  private async generateReviewInstructions(
    perspectives: Array<{ perspective: string; prompt: string }>,
    currentPhase: string,
    targetPhase: string
  ): Promise<ConductReviewResult> {
    const perspectiveDetails = perspectives
      .map(
        (p, i) => `${i + 1}. **${p.perspective.toUpperCase()}**: ${p.prompt}`
      )
      .join('\n');

    const instructions = `Review ${currentPhase} phase before proceeding to ${targetPhase}.

**Check:** plan file (tasks/decisions), git diff (changes), conversation history.

**Perspectives:**
${perspectiveDetails}

Summarize findings and ask user if ready to proceed.`;

    return {
      instructions,
      perspectives: perspectives.map(p => ({
        name: p.perspective,
        prompt: p.prompt,
      })),
    };
  }
}
