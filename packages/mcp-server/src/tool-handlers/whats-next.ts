/**
 * WhatsNext Tool Handler
 *
 * Handles the whats_next tool which analyzes conversation context and
 * determines the next development phase with specific instructions for the LLM.
 */

import { ConversationRequiredToolHandler } from './base-tool-handler.js';
import {
  ConfigManager,
  type ConversationContext,
  type InstructionContext,
} from '@codemcp/workflows-core';
import { ServerContext } from '../types.js';

/**
 * Arguments for the whats_next tool
 */
export interface WhatsNextArgs {
  context?: string;
  user_input?: string;
  conversation_summary?: string;
  recent_messages?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  /**
   * Optional override for the instruction source. Defaults to 'whats_next'.
   * Pass 'plugin_hook' when calling from a plugin context to suppress
   * the whats_next() call reminder from generated instructions.
   */
  _instructionSource?: InstructionContext['instructionSource'];
  /**
   * Optional project path override. When provided, overrides the server's
   * default project path for this call.
   */
  project_path?: string;
}

/**
 * Response from the whats_next tool
 */
export interface WhatsNextResult {
  phase: string;
  instructions: string;
  plan_file_path: string;
  /**
   * Glob patterns for files allowed to be edited in this phase.
   * Defaults to ['**\/*'] (all files) if not restricted.
   */
  allowed_file_patterns: string[];
}

/**
 * WhatsNext tool handler implementation
 */
export class WhatsNextHandler extends ConversationRequiredToolHandler<
  WhatsNextArgs,
  WhatsNextResult
> {
  protected override getProjectPathOverride(
    args: WhatsNextArgs
  ): string | undefined {
    return args.project_path;
  }

  protected async executeWithConversation(
    args: WhatsNextArgs,
    context: ServerContext,
    conversationContext: ConversationContext
  ): Promise<WhatsNextResult> {
    const {
      context: requestContext = '',
      user_input = '',
      conversation_summary = '',
      recent_messages = [],
      _instructionSource,
    } = args;

    const conversationId = conversationContext.conversationId;
    const currentPhase = conversationContext.currentPhase;

    this.logger.debug('Processing whats_next request', {
      conversationId,
      currentPhase,
      hasContext: !!requestContext,
      hasUserInput: !!user_input,
    });

    // Ensure state machine is loaded for this project
    this.ensureStateMachineForProject(
      context,
      conversationContext.projectPath,
      conversationContext.workflowName
    );

    // Ensure plan file exists
    await context.planManager.ensurePlanFile(
      conversationContext.planFilePath,
      conversationContext.projectPath,
      conversationContext.gitBranch
    );

    // Analyze phase transition
    const transitionResult =
      await context.transitionEngine.analyzePhaseTransition({
        currentPhase,
        projectPath: conversationContext.projectPath,
        userInput: user_input,
        context: requestContext,
        conversationSummary: conversation_summary,
        recentMessages: recent_messages,
        conversationId: conversationContext.conversationId,
      });

    // Update conversation state if phase changed
    if (transitionResult.newPhase !== currentPhase) {
      await context.conversationManager.updateConversationState(
        conversationId,
        { currentPhase: transitionResult.newPhase }
      );

      // If this was a first-call auto-transition, regenerate the plan file
      if (
        transitionResult.transitionReason.includes(
          'Starting development - defining criteria'
        )
      ) {
        this.logger.info(
          'Regenerating plan file after first-call auto-transition',
          {
            from: currentPhase,
            to: transitionResult.newPhase,
            planFilePath: conversationContext.planFilePath,
          }
        );

        await context.planManager.ensurePlanFile(
          conversationContext.planFilePath,
          conversationContext.projectPath,
          conversationContext.gitBranch
        );
      }

      this.logger.info('Phase transition completed', {
        from: currentPhase,
        to: transitionResult.newPhase,
        reason: transitionResult.transitionReason,
      });
    }

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
          instructionSource: _instructionSource ?? 'whats_next',
          allowedFilePatterns,
          requiredCapability,
          capabilityConfig,
          referredDocs,
        }
      );

    // Prepare response
    const response: WhatsNextResult = {
      phase: transitionResult.newPhase,
      instructions: instructions.instructions,
      plan_file_path: conversationContext.planFilePath,
      allowed_file_patterns: allowedFilePatterns,
    };

    // Log interaction
    await this.logInteraction(
      context,
      conversationId,
      'whats_next',
      args,
      response,
      transitionResult.newPhase
    );

    return response;
  }
}
