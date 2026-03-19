/**
 * ProceedToPhase Tool Handler
 *
 * Handles explicit transitions to specific development phases when the current
 * phase is complete or when a direct phase change is needed.
 */

import { ConversationRequiredToolHandler } from './base-tool-handler.js';
import { validateRequiredArgs } from '../server-helpers.js';
import type { ConversationContext } from '@codemcp/workflows-core';
import { ServerContext } from '../types.js';

/**
 * Arguments for the proceed_to_phase tool
 */
export interface ProceedToPhaseArgs {
  target_phase: string;
  reason?: string;
  review_state: 'not-required' | 'pending' | 'performed';
}

/**
 * Response from the proceed_to_phase tool
 */
export interface ProceedToPhaseResult {
  phase: string;
  instructions: string;
  plan_file_path: string;
  transition_reason: string;
}

/**
 * ProceedToPhase tool handler implementation
 */
export class ProceedToPhaseHandler extends ConversationRequiredToolHandler<
  ProceedToPhaseArgs,
  ProceedToPhaseResult
> {
  protected async executeWithConversation(
    args: ProceedToPhaseArgs,
    context: ServerContext,
    conversationContext: ConversationContext
  ): Promise<ProceedToPhaseResult> {
    // Validate required arguments
    validateRequiredArgs(args, ['target_phase', 'review_state']);

    const { reason = '', review_state } = args;
    const target_phase = args.target_phase.toLowerCase();
    const conversationId = conversationContext.conversationId;
    const currentPhase = conversationContext.currentPhase;

    this.logger.debug('Processing proceed_to_phase request', {
      conversationId,
      currentPhase,
      targetPhase: target_phase,
      reason,
      reviewState: review_state,
    });

    // Validate review state if reviews are required
    if (conversationContext.requireReviewsBeforePhaseTransition) {
      await this.validateReviewState(
        review_state,
        currentPhase,
        target_phase,
        conversationContext.workflowName,
        context
      );
    }

    // Validate agent role for crowd workflows
    await this.validateAgentRole(
      currentPhase,
      target_phase,
      conversationContext.workflowName,
      conversationContext.projectPath,
      context
    );

    // Execute plugin hooks before phase transition (replaces if-statement pattern)
    const pluginContext = {
      conversationId,
      planFilePath: conversationContext.planFilePath,
      currentPhase,
      workflow: conversationContext.workflowName,
      projectPath: conversationContext.projectPath,
      gitBranch: conversationContext.gitBranch,
      targetPhase: target_phase,
    };

    // Execute plugin hooks safely - guard against missing plugin registry
    if (context.pluginRegistry) {
      await context.pluginRegistry.executeHook(
        'beforePhaseTransition',
        pluginContext,
        currentPhase,
        target_phase
      );
    }

    // Ensure state machine is loaded for this project
    this.ensureStateMachineForProject(context, conversationContext.projectPath);

    // Perform explicit transition
    const transitionResult = context.transitionEngine.handleExplicitTransition(
      currentPhase,
      target_phase,
      conversationContext.projectPath,
      reason,
      conversationContext.workflowName
    );

    // Update conversation state
    await context.conversationManager.updateConversationState(conversationId, {
      currentPhase: transitionResult.newPhase,
    });

    this.logger.info('Explicit phase transition completed', {
      from: currentPhase,
      to: transitionResult.newPhase,
      reason: transitionResult.transitionReason,
    });

    // Ensure plan file exists - or create it
    await context.planManager.ensurePlanFile(
      conversationContext.planFilePath,
      conversationContext.projectPath,
      conversationContext.gitBranch
    );

    // Check if plan file exists
    const planInfo = await context.planManager.getPlanFileInfo(
      conversationContext.planFilePath
    );

    // Generate enhanced instructions
    const instructions =
      await context.instructionGenerator.generateInstructions(
        transitionResult.instructions,
        {
          phase: transitionResult.newPhase,
          conversationContext: {
            ...conversationContext,
            currentPhase: transitionResult.newPhase,
          },
          transitionReason: transitionResult.transitionReason,
          isModeled: transitionResult.isModeled,
          planFileExists: planInfo.exists,
          instructionSource: 'proceed_to_phase',
        }
      );

    instructions.instructions += `

    After transitioning to the ${transitionResult.newPhase} phase, check the already created tasks and add those that are missing based on the key decisions noted in the plan file.
    While doing this, also denote dependencies for each task.
    `;

    // Prepare response (commit behavior now handled by CommitPlugin)
    const response: ProceedToPhaseResult = {
      phase: transitionResult.newPhase,
      instructions: instructions.instructions,
      plan_file_path: conversationContext.planFilePath,
      transition_reason: transitionResult.transitionReason,
    };

    // Log interaction
    await this.logInteraction(
      context,
      conversationId,
      'proceed_to_phase',
      args,
      response,
      transitionResult.newPhase
    );

    return response;
  }

  /**
   * Validate review state for transitions that require reviews
   */
  private async validateReviewState(
    reviewState: string,
    currentPhase: string,
    targetPhase: string,
    workflowName: string,
    context: ServerContext
  ): Promise<void> {
    // Get transition configuration from workflow
    const stateMachine = context.workflowManager.loadWorkflowForProject(
      context.projectPath,
      workflowName
    );
    const currentState = stateMachine.states[currentPhase];

    if (!currentState) {
      throw new Error(`Invalid current phase: ${currentPhase}`);
    }

    const transition = currentState.transitions.find(t => t.to === targetPhase);
    if (!transition) {
      throw new Error(
        `No transition found from ${currentPhase} to ${targetPhase}`
      );
    }

    const hasReviewPerspectives =
      transition.review_perspectives &&
      transition.review_perspectives.length > 0;

    if (hasReviewPerspectives) {
      // This transition has review perspectives defined
      if (reviewState === 'pending') {
        throw new Error(
          `Review is required before proceeding to ${targetPhase}. Please use the conduct_review tool first.`
        );
      }
      if (reviewState === 'not-required') {
        throw new Error(
          `This transition requires review, but review_state is 'not-required'. Use 'pending' or 'performed'.`
        );
      }
    } else {
      // No review perspectives defined - transition proceeds normally
      // Note: No error thrown when hasReviewPerspectives is false, as per user feedback
    }
  }

  /**
   * Validate that the agent's role allows this phase transition (for crowd workflows)
   */
  private async validateAgentRole(
    currentPhase: string,
    targetPhase: string,
    workflowName: string,
    projectPath: string,
    context: ServerContext
  ): Promise<void> {
    // Get agent role from environment
    const agentRole = process.env['VIBE_ROLE'];

    // If no role specified, skip validation (single-agent mode)
    if (!agentRole) {
      return;
    }

    // Load workflow to check if it's a collaborative workflow
    const stateMachine = context.workflowManager.loadWorkflowForProject(
      projectPath,
      workflowName
    );

    // If workflow doesn't have collaboration enabled, skip validation
    if (!stateMachine.metadata?.collaboration) {
      return;
    }

    // Get current state definition
    const currentState = stateMachine.states[currentPhase];
    if (!currentState) {
      throw new Error(`Invalid current phase: ${currentPhase}`);
    }

    // Find the transition for this agent's role
    const agentTransition = currentState.transitions.find(
      t => t.to === targetPhase && (t.role === agentRole || !t.role)
    );

    if (!agentTransition) {
      throw new Error(
        `Agent with role '${agentRole}' cannot proceed from ${currentPhase} to ${targetPhase}. ` +
          `No transition available for this role.`
      );
    }

    // Check if agent will be responsible in target phase
    // Look at target state's outgoing transitions to determine responsibility
    const targetState = stateMachine.states[targetPhase];
    if (targetState) {
      const isResponsibleInTarget = targetState.transitions.some(
        t =>
          t.role === agentRole &&
          t.additional_instructions?.includes('RESPONSIBLE')
      );

      if (!isResponsibleInTarget) {
        // Agent is not responsible in target phase
        // This is allowed (agent can transition to consultation mode)
        this.logger.debug('Agent transitioning to consultative role', {
          agentRole,
          phase: targetPhase,
        });
      }
    }
  }
}
