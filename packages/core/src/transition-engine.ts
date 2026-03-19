/**
 * Transition Engine
 *
 * Manages the development state machine and determines appropriate phase transitions.
 * Analyzes conversation context and user input to make intelligent phase decisions.
 */

import { createLogger } from './logger.js';
import { StateMachineLoader } from './state-machine-loader.js';
import { WorkflowManager } from './workflow-manager.js';
import type { ConversationState } from './types.js';

const logger = createLogger('TransitionEngine');

export interface TransitionContext {
  currentPhase: string;
  projectPath: string;
  conversationId: string;
  userInput?: string;
  context?: string;
  conversationSummary?: string;
  recentMessages?: Array<{ role: string; content: string }>;
}

export interface TransitionResult {
  newPhase: string;
  instructions: string;
  transitionReason: string;
  isModeled: boolean;
}

export class TransitionEngine {
  private stateMachineLoader: StateMachineLoader;
  private workflowManager: WorkflowManager;
  private conversationManager?: {
    hasInteractions: (conversationId: string) => Promise<boolean>;
    getConversationState: (
      conversationId: string
    ) => Promise<ConversationState | null>;
  };

  constructor(projectPath: string) {
    this.stateMachineLoader = new StateMachineLoader();
    this.workflowManager = new WorkflowManager();

    logger.info('TransitionEngine initialized', { projectPath });
  }

  /**
   * Set the conversation manager (dependency injection)
   */
  setConversationManager(conversationManager: {
    hasInteractions: (conversationId: string) => Promise<boolean>;
    getConversationState: (
      conversationId: string
    ) => Promise<ConversationState | null>;
  }) {
    this.conversationManager = conversationManager;
  }

  /**
   * Get the loaded state machine for the current project
   */
  getStateMachine(projectPath: string, workflowName?: string) {
    // Use WorkflowManager to load the appropriate workflow
    return this.workflowManager.loadWorkflowForProject(
      projectPath,
      workflowName
    );
  }

  /**
   * Check if this is the first call from initial state based on database interactions
   */
  private async isFirstCallFromInitialState(
    context: TransitionContext
  ): Promise<boolean> {
    // Check database for any previous interactions in this conversation
    if (!this.conversationManager) {
      logger.warn('ConversationManager not set, assuming first call');
      return true;
    }

    const hasInteractions = await this.conversationManager.hasInteractions(
      context.conversationId
    );

    logger.debug('Checking first call from initial state', {
      hasInteractions,
      conversationId: context.conversationId,
      currentPhase: context.currentPhase,
    });

    return !hasInteractions;
  }

  /**
   * Generate instructions for defining phase entrance criteria
   */
  private async generateCriteriaDefinitionInstructions(
    projectPath: string,
    conversationId: string
  ): Promise<string> {
    // Get workflow name from conversation state
    const conversationState =
      await this.conversationManager?.getConversationState(conversationId);
    const workflowName = conversationState?.workflowName;

    const stateMachine = this.workflowManager.loadWorkflowForProject(
      projectPath,
      workflowName
    );
    const phases = Object.keys(stateMachine.states);

    let instructions = `Welcome to ${stateMachine.name}!

Before we begin development, let's establish clear entrance criteria for each phase. This will help us make informed decisions about when to transition between phases throughout the development process.

Please update the plan file with a "Phase Entrance Criteria" section that defines specific, measurable criteria for entering each phase:

## Phase Entrance Criteria

`;

    // Generate criteria template for each phase (except initial state)
    for (const phase of phases) {
      if (phase === stateMachine.initial_state) continue; // Skip initial state

      const phaseDefinition = stateMachine.states[phase];
      const capitalizedPhase = this.capitalizePhase(phase);

      instructions += `### ${capitalizedPhase} Phase
*${phaseDefinition.description}*

**Enter when:**
- [ ] [Define specific criteria for entering ${phase} phase]
- [ ] [Add measurable conditions that must be met]
- [ ] [Include any deliverables or milestones required]

`;
    }

    instructions += `
Once you've defined these criteria, we can begin development. Throughout the process, consult these criteria when considering phase transitions.

**Remember**: These criteria should be specific and measurable so we can clearly determine when each phase is ready to begin.`;

    return instructions;
  }

  /**
   * Get phase-specific instructions for continuing work in current phase
   */
  private async getContinuePhaseInstructions(
    phase: string,
    projectPath: string,
    conversationId: string
  ): Promise<string> {
    // Get workflow name from conversation state
    const conversationState =
      await this.conversationManager?.getConversationState(conversationId);
    const workflowName = conversationState?.workflowName;

    const stateMachine = this.workflowManager.loadWorkflowForProject(
      projectPath,
      workflowName
    );

    const stateDefinition = stateMachine.states[phase];
    if (!stateDefinition) {
      logger.error('Unknown phase', new Error(`Unknown phase: ${phase}`));
      throw new Error(`Unknown phase: ${phase}`);
    }

    const continueTransition = stateDefinition.transitions.find(
      t => t.to === phase
    );

    if (continueTransition) {
      // Use the transition instructions if available, otherwise use default + additional
      if (continueTransition.instructions) {
        return continueTransition.instructions;
      } else {
        let composedInstructions = stateDefinition.default_instructions;
        if (continueTransition.additional_instructions) {
          composedInstructions = `${composedInstructions}\n\n**Additional Context:**\n${continueTransition.additional_instructions}`;
        }
        return composedInstructions;
      }
    }

    // Fall back to default instructions for the phase
    return stateDefinition.default_instructions;
  }
  /**
   * Get the first development phase from the state machine
   */
  private async getFirstDevelopmentPhase(
    projectPath: string,
    conversationId: string
  ): Promise<string> {
    // Get workflow name from conversation state
    const conversationState =
      await this.conversationManager?.getConversationState(conversationId);
    const workflowName = conversationState?.workflowName;

    const stateMachine = this.workflowManager.loadWorkflowForProject(
      projectPath,
      workflowName
    );
    const initialState = stateMachine.initial_state;

    // The first development phase IS the initial state - we should stay there
    // Don't automatically transition to the first transition target
    return initialState;
  }

  /**
   * Analyze context and determine appropriate phase transition
   */
  async analyzePhaseTransition(
    context: TransitionContext
  ): Promise<TransitionResult> {
    const {
      currentPhase,
      projectPath,
      conversationId,
      userInput,
      context: additionalContext,
      conversationSummary,
    } = context;

    // Load the appropriate workflow for this project/conversation

    logger.debug('Analyzing phase transition', {
      currentPhase,
      projectPath,
      hasUserInput: !!userInput,
      hasContext: !!additionalContext,
      hasSummary: !!conversationSummary,
      userInput: userInput
        ? userInput.substring(0, 50) + (userInput.length > 50 ? '...' : '')
        : undefined,
    });

    // Check if this is the first call from initial state - transition to first development phase
    if (await this.isFirstCallFromInitialState(context)) {
      const firstDevelopmentPhase = await this.getFirstDevelopmentPhase(
        projectPath,
        conversationId
      );

      logger.info(
        'First call from initial state - transitioning to first development phase with criteria',
        {
          currentPhase,
          firstDevelopmentPhase,
          projectPath,
        }
      );

      // Combine criteria definition with first phase instructions
      const criteriaInstructions =
        await this.generateCriteriaDefinitionInstructions(
          projectPath,
          conversationId
        );
      const phaseInstructions = await this.getContinuePhaseInstructions(
        firstDevelopmentPhase,
        projectPath,
        conversationId
      );

      return {
        newPhase: firstDevelopmentPhase, // Transition to first development phase
        instructions: criteriaInstructions + '\n\n---\n\n' + phaseInstructions,
        transitionReason:
          'Starting development - defining criteria and beginning first phase',
        isModeled: true,
      };
    }

    // For all other cases, stay in current phase and let LLM decide based on plan file criteria
    // The LLM will consult the entrance criteria in the plan file and use proceed_to_phase when ready
    const continueInstructions = await this.getContinuePhaseInstructions(
      currentPhase,
      projectPath,
      conversationId
    );

    logger.debug(
      'Continuing in current phase - LLM will evaluate transition criteria',
      {
        currentPhase,
        projectPath,
      }
    );

    return {
      newPhase: currentPhase,
      instructions: continueInstructions,
      transitionReason:
        'Continue current phase - LLM will evaluate transition criteria from plan file',
      isModeled: false,
    };
  }

  /**
   * Handle explicit phase transition request
   */
  handleExplicitTransition(
    currentPhase: string,
    targetPhase: string,
    projectPath: string,
    reason?: string,
    workflowName?: string
  ): TransitionResult {
    // Load the appropriate state machine for this project/workflow
    const stateMachine = this.getStateMachine(projectPath, workflowName);

    logger.debug('Handling explicit phase transition', {
      currentPhase,
      targetPhase,
      projectPath,
      workflowName,
      reason,
    });

    // Normalize targetPhase to lowercase for case-insensitive matching
    const normalizedTargetPhase = targetPhase.toLowerCase();

    // Validate that the target phase exists in the state machine
    if (!stateMachine.states[normalizedTargetPhase]) {
      const validPhases = Object.keys(stateMachine.states);
      const errorMsg = `Invalid target phase: "${targetPhase}". Valid phases are: ${validPhases.join(', ')}`;
      logger.error('Invalid target phase', new Error(errorMsg));
      throw new Error(errorMsg);
    }

    // Get default instructions from the target state
    const targetState = stateMachine.states[normalizedTargetPhase];
    const instructions = targetState.default_instructions;
    const transitionInfo = {
      instructions: instructions,
      transitionReason: reason || `Moving to ${targetPhase}`,
      isModeled: false, // Direct phase transitions are not modeled
    };

    logger.info('Explicit phase transition processed', {
      fromPhase: currentPhase,
      toPhase: normalizedTargetPhase,
      reason: transitionInfo.transitionReason,
      isModeled: transitionInfo.isModeled,
    });

    return {
      newPhase: normalizedTargetPhase,
      instructions: transitionInfo.instructions,
      transitionReason: reason || transitionInfo.transitionReason,
      isModeled: transitionInfo.isModeled,
    };
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
   * Filter transitions based on agent role (for crowd workflows)
   * Returns transitions applicable to the current agent
   */
  filterTransitionsByRole<T extends { role?: string }>(
    transitions: T[],
    agentRole?: string
  ): T[] {
    // If no role specified, return all transitions (single-agent mode)
    if (!agentRole) {
      return transitions;
    }

    // Filter transitions: include if no role specified OR role matches
    return transitions.filter(t => !t.role || t.role === agentRole);
  }
}
