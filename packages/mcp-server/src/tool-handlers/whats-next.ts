/**
 * WhatsNext Tool Handler
 *
 * Handles the whats_next tool which analyzes conversation context and
 * determines the next development phase with specific instructions for the LLM.
 */

import { ConversationRequiredToolHandler } from './base-tool-handler.js';
import type { ConversationContext } from '@codemcp/workflows-core';
// TaskBackendManager and BeadsIntegration functionality now handled by injected components
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
  protected override async executeHandler(
    args: WhatsNextArgs,
    context: ServerContext
  ): Promise<WhatsNextResult> {
    let conversationContext;

    try {
      conversationContext = await this.getConversationContext(context);
    } catch (_error) {
      // Use standard CONVERSATION_NOT_FOUND error
      throw new Error('CONVERSATION_NOT_FOUND');
    }

    return this.executeWithConversation(args, context, conversationContext);
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
      const shouldUpdateState = await this.shouldUpdateConversationState(
        currentPhase,
        transitionResult.newPhase,
        conversationContext,
        context
      );

      if (shouldUpdateState) {
        await context.conversationManager.updateConversationState(
          conversationId,
          { currentPhase: transitionResult.newPhase }
        );
      }

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

    // Check if plan file exists
    const planInfo = await context.planManager.getPlanFileInfo(
      conversationContext.planFilePath
    );

    // Get allowed file patterns for the new phase
    const stateMachine = context.workflowManager.loadWorkflowForProject(
      conversationContext.projectPath,
      conversationContext.workflowName
    );
    const phaseState = stateMachine.states[transitionResult.newPhase];
    const allowedFilePatterns = phaseState?.allowed_file_patterns ?? ['**/*'];

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
          instructionSource: 'whats_next',
          allowedFilePatterns,
        }
      );

    // Execute afterInstructionsGenerated hook for plugin enrichment
    let finalInstructions = instructions.instructions;
    if (context.pluginRegistry?.hasHook('afterInstructionsGenerated')) {
      const hookContext = {
        conversationId,
        planFilePath: conversationContext.planFilePath,
        currentPhase: transitionResult.newPhase,
        workflow: conversationContext.workflowName,
        projectPath: conversationContext.projectPath,
        gitBranch: conversationContext.gitBranch,
        planFileExists: planInfo.exists,
      };
      const enriched = await context.pluginRegistry.executeHook(
        'afterInstructionsGenerated',
        hookContext,
        {
          instructions: instructions.instructions,
          planFilePath: conversationContext.planFilePath,
          phase: transitionResult.newPhase,
          instructionSource: 'whats_next',
        }
      );
      if (
        enriched &&
        typeof enriched === 'object' &&
        'instructions' in enriched
      ) {
        finalInstructions = (enriched as { instructions: string }).instructions;
      }
    }

    // Prepare response
    const response: WhatsNextResult = {
      phase: transitionResult.newPhase,
      instructions: finalInstructions,
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

  /**
   * Determines whether conversation state should be updated for a phase transition
   */
  private async shouldUpdateConversationState(
    currentPhase: string,
    newPhase: string,
    conversationContext: ConversationContext,
    context: ServerContext
  ): Promise<boolean> {
    if (!conversationContext.requireReviewsBeforePhaseTransition) {
      return true;
    }

    const stateMachine = context.workflowManager.loadWorkflowForProject(
      conversationContext.projectPath,
      conversationContext.workflowName
    );

    const currentState = stateMachine.states[currentPhase];
    if (!currentState) {
      return true;
    }

    const transition = currentState.transitions.find(t => t.to === newPhase);
    if (!transition) {
      return true;
    }

    const hasReviewPerspectives =
      transition.review_perspectives &&
      transition.review_perspectives.length > 0;

    if (hasReviewPerspectives) {
      this.logger.debug(
        'Preventing state update - review required for transition',
        {
          from: currentPhase,
          to: newPhase,
          reviewPerspectives: transition.review_perspectives?.length || 0,
        }
      );
      return false;
    }

    return true;
  }
}
