/**
 * ProceedToPhase Tool Handler
 *
 * Handles explicit transitions to specific development phases when the current
 * phase is complete or when a direct phase change is needed.
 */

import { ConversationRequiredToolHandler } from './base-tool-handler.js';
import { validateRequiredArgs } from '../server-helpers.js';
import {
  ConfigManager,
  type ConversationContext,
} from '@codemcp/workflows-core';
import { ServerContext } from '../types.js';

/**
 * Arguments for the proceed_to_phase tool
 */
export interface ProceedToPhaseArgs {
  target_phase: string;
  reason?: string;
  review_state: 'not-required' | 'pending' | 'performed';
  /**
   * Optional project path override. When provided, overrides the server's
   * default project path for this call.
   */
  project_path?: string;
}

/**
 * Response from the proceed_to_phase tool
 */
export interface ProceedToPhaseResult {
  phase: string;
  instructions: string;
  plan_file_path: string;
  transition_reason: string;
  /**
   * Glob patterns for files allowed to be edited in this phase.
   * Defaults to ['**\/*'] (all files) if not restricted.
   */
  allowed_file_patterns: string[];
}

/**
 * ProceedToPhase tool handler implementation
 */
export class ProceedToPhaseHandler extends ConversationRequiredToolHandler<
  ProceedToPhaseArgs,
  ProceedToPhaseResult
> {
  protected override getProjectPathOverride(
    args: ProceedToPhaseArgs
  ): string | undefined {
    return args.project_path;
  }

  protected async executeWithConversation(
    args: ProceedToPhaseArgs,
    context: ServerContext,
    conversationContext: ConversationContext
  ): Promise<ProceedToPhaseResult> {
    // Validate required arguments
    validateRequiredArgs(args, ['target_phase', 'review_state']);

    const { reason = '' } = args;
    const target_phase = args.target_phase.toLowerCase();
    const conversationId = conversationContext.conversationId;
    const currentPhase = conversationContext.currentPhase;

    this.logger.debug('Processing proceed_to_phase request', {
      conversationId,
      currentPhase,
      targetPhase: target_phase,
      reason,
    });

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

    // Get allowed file patterns for the new phase
    const stateMachine = context.workflowManager.loadWorkflowForProject(
      conversationContext.projectPath,
      conversationContext.workflowName
    );
    const phaseState = stateMachine.states[transitionResult.newPhase];
    const allowedFilePatterns = phaseState?.allowed_file_patterns ?? ['**/*'];

    // Null project config ⇒ no capabilityConfig ⇒ label-only hint.
    const requiredCapability = phaseState?.required_capability;
    const projectConfig = ConfigManager.loadProjectConfig(
      conversationContext.projectPath
    );
    const capabilityConfig = requiredCapability
      ? projectConfig?.capability_models?.[requiredCapability]
      : undefined;

    const referredDocs = phaseState?.referred_docs;

    // Generate enhanced instructions (includes file restriction info)
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
          instructionSource: 'proceed_to_phase',
          allowedFilePatterns,
          requiredCapability,
          capabilityConfig,
          referredDocs,
        }
      );

    let finalInstructions = instructions.instructions;

    finalInstructions += ` Review tasks for ${transitionResult.newPhase} phase, add missing ones based on key decisions.`;

    // Prepare response (commit behavior now handled by CommitPlugin)
    const response: ProceedToPhaseResult = {
      phase: transitionResult.newPhase,
      instructions: finalInstructions,
      plan_file_path: conversationContext.planFilePath,
      transition_reason: transitionResult.transitionReason,
      allowed_file_patterns: allowedFilePatterns,
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
}
