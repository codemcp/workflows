/**
 * ResumeWorkflow Tool Handler
 *
 * Handles resuming development workflow after conversation compression.
 * Returns comprehensive project context, current state, system prompt instructions,
 * and next steps to seamlessly continue development.
 */

import { ConversationRequiredToolHandler } from './base-tool-handler.js';
import { generateSystemPrompt } from '@codemcp/workflows-core';
import type { YamlStateMachine, YamlState } from '@codemcp/workflows-core';
import type { ConversationContext } from '@codemcp/workflows-core';
import { ServerContext } from '../types.js';

/**
 * Arguments for the resume_workflow tool
 */
export interface ResumeWorkflowArgs {
  include_system_prompt?: boolean;
  /**
   * Optional project path override. When provided, overrides the server's
   * default project path for this call.
   */
  project_path?: string;
}

/**
 * Plan file analysis result
 */
interface PlanAnalysis {
  sections: string[];
  tasks_completed: number;
  tasks_total: number;
  key_decisions: string[];
  recent_updates: string[];
  active_tasks?: string[];
  completed_tasks?: string[];
}

/**
 * Recommendations for resuming workflow
 */
interface WorkflowRecommendations {
  immediate_actions: string[];
  phase_guidance: string;
  potential_issues: string[];
}

/**
 * Response from the resume_workflow tool
 */
export interface ResumeWorkflowResult {
  workflow_status: {
    current_phase: string;
    project_path: string;
    git_branch: string;
    state_machine: YamlStateMachine;
  };
  plan_status: {
    exists: boolean;
    path: string;
    analysis?: PlanAnalysis | null;
  };
  system_prompt?: string | null;
  recommendations: {
    immediate_actions: string[];
    phase_guidance: string;
    potential_issues: string[];
  };
  generated_at: string;
  tool_version: string;
}

/**
 * ResumeWorkflow tool handler implementation
 */
export class ResumeWorkflowHandler extends ConversationRequiredToolHandler<
  ResumeWorkflowArgs,
  ResumeWorkflowResult
> {
  protected override getProjectPathOverride(
    args: ResumeWorkflowArgs
  ): string | undefined {
    return args.project_path;
  }

  protected async executeWithConversation(
    args: ResumeWorkflowArgs,
    context: ServerContext,
    conversationContext: ConversationContext
  ): Promise<ResumeWorkflowResult> {
    const includeSystemPrompt = args.include_system_prompt !== false; // Default to true

    this.logger.debug('Processing resume_workflow request', {
      conversationId: conversationContext.conversationId,
      includeSystemPrompt,
    });

    // Get plan file information
    const planInfo = await context.planManager.getPlanFileInfo(
      conversationContext.planFilePath
    );

    // Analyze plan file content for key information
    const planAnalysis =
      planInfo.exists && planInfo.content
        ? this.analyzePlanFile(planInfo.content)
        : null;

    // Get current state machine information
    const stateMachineInfo = await this.getStateMachineInfo(
      context,
      conversationContext.projectPath,
      conversationContext.workflowName
    );
    const stateMachine = context.transitionEngine.getStateMachine(
      conversationContext.projectPath,
      conversationContext.workflowName
    );

    // Generate system prompt if requested
    const systemPrompt = includeSystemPrompt
      ? generateSystemPrompt(stateMachine)
      : null;

    // Build comprehensive response
    const response: ResumeWorkflowResult = {
      // Core workflow resumption info
      workflow_status: {
        current_phase: conversationContext.currentPhase,
        project_path: conversationContext.projectPath,
        git_branch: conversationContext.gitBranch,
        state_machine: stateMachineInfo as YamlStateMachine,
      },

      // Plan file analysis
      plan_status: {
        exists: planInfo.exists,
        path: conversationContext.planFilePath,
        analysis: planAnalysis,
      },

      // System prompt (if requested)
      system_prompt: systemPrompt,

      // Next steps and recommendations
      recommendations: this.generateRecommendations(
        conversationContext,
        planAnalysis,
        context
      ),

      // Metadata
      generated_at: new Date().toISOString(),
      tool_version: '1.0.0',
    };

    this.logger.debug('resume_workflow response generated', {
      conversationId: conversationContext.conversationId,
      phase: conversationContext.currentPhase,
      planExists: planInfo.exists,
      includeSystemPrompt,
    });

    return response;
  }

  /**
   * Analyze plan file content to extract key information
   */
  private analyzePlanFile(content: string): PlanAnalysis {
    const analysis = {
      active_tasks: [] as string[],
      completed_tasks: [] as string[],
      recent_decisions: [] as string[],
      next_steps: [] as string[],
    };

    const lines = content.split('\n');
    let inTaskSection = false;
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect sections
      if (trimmed.startsWith('##')) {
        currentSection = trimmed.toLowerCase();
        inTaskSection =
          currentSection.includes('task') || currentSection.includes('todo');
      }

      // Extract tasks
      if (inTaskSection) {
        if (trimmed.startsWith('- [x]')) {
          analysis.completed_tasks.push(trimmed.substring(5).trim());
        } else if (trimmed.startsWith('- [ ]')) {
          analysis.active_tasks.push(trimmed.substring(5).trim());
        }
      }

      // Extract decisions (look for decision log sections)
      if (currentSection.includes('decision') && trimmed.startsWith('- ')) {
        analysis.recent_decisions.push(trimmed.substring(2).trim());
      }
    }

    return {
      sections: [currentSection],
      tasks_completed: analysis.completed_tasks.length,
      tasks_total:
        analysis.active_tasks.length + analysis.completed_tasks.length,
      key_decisions: analysis.recent_decisions,
      recent_updates: analysis.next_steps,
      active_tasks: analysis.active_tasks,
      completed_tasks: analysis.completed_tasks,
    };
  }

  /**
   * Get state machine information
   */
  private async getStateMachineInfo(
    context: ServerContext,
    projectPath: string,
    workflowName?: string
  ): Promise<unknown> {
    try {
      // Get the actual state machine for this project
      const stateMachine = context.transitionEngine.getStateMachine(
        projectPath,
        workflowName
      );

      return {
        name: stateMachine.name,
        description: stateMachine.description,
        initial_state: stateMachine.initial_state,
        phases: Object.keys(stateMachine.states),
        phase_descriptions: Object.fromEntries(
          Object.entries(stateMachine.states).map(([phase, definition]) => [
            phase,
            (definition as YamlState).description,
          ])
        ),
      };
    } catch (error) {
      const err = error as Error;
      this.logger.warn('Could not determine state machine info', {
        error: err.message,
      });
      return {
        name: 'unknown',
        description: 'Could not load workflow',
        initial_state: 'unknown',
        phases: [],
        phase_descriptions: {},
      };
    }
  }

  /**
   * Generate recommendations for next steps based on state machine transitions
   */
  private generateRecommendations(
    conversationContext: ConversationContext,
    planAnalysis: PlanAnalysis | null,
    context: ServerContext
  ): WorkflowRecommendations {
    const recommendations = {
      immediate_actions: [] as string[],
      phase_guidance: '',
      potential_issues: [] as string[],
    };

    try {
      // Get the state machine for this project
      const stateMachine = context.transitionEngine.getStateMachine(
        conversationContext.projectPath,
        conversationContext.workflowName
      );
      const currentPhase = conversationContext.currentPhase;
      const phaseDefinition = stateMachine.states[currentPhase];

      if (phaseDefinition) {
        // Set phase guidance from state machine description
        recommendations.phase_guidance = `Current phase: ${(phaseDefinition as YamlState).description}`;

        // Generate transition-based recommendations
        if (
          (phaseDefinition as YamlState).transitions &&
          (phaseDefinition as YamlState).transitions.length > 0
        ) {
          recommendations.immediate_actions.push(
            'From here, you can transition to:'
          );

          for (const transition of phaseDefinition.transitions) {
            const targetPhase = stateMachine.states[transition.to];
            const targetDescription = targetPhase
              ? targetPhase.description
              : transition.to;
            recommendations.immediate_actions.push(
              `• ${transition.to}: ${targetDescription}`
            );
          }

          // Add instruction on how to transition
          recommendations.immediate_actions.push(
            'Use proceed_to_phase() tool when ready to transition'
          );
        } else {
          recommendations.immediate_actions.push(
            'Continue working in current phase'
          );
        }

        // Add current phase specific guidance
        recommendations.immediate_actions.push(
          `Focus on: ${(phaseDefinition as YamlState).description}`
        );
      } else {
        // Fallback if phase not found in state machine
        recommendations.phase_guidance = `Current phase: ${currentPhase}`;
        recommendations.immediate_actions.push(
          'Continue working in current phase'
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.warn('Could not generate state machine recommendations', {
        error: err.message,
      });
      // Basic fallback
      recommendations.phase_guidance = `Current phase: ${conversationContext.currentPhase}`;
      recommendations.immediate_actions.push(
        'Continue working in current phase'
      );
    }

    // Plan-based recommendations
    if (planAnalysis) {
      if (planAnalysis.active_tasks && planAnalysis.active_tasks.length > 0) {
        recommendations.immediate_actions.push(
          `Continue working on active tasks: ${planAnalysis.active_tasks.slice(0, 2).join(', ')}`
        );
      }

      if (
        (!planAnalysis.active_tasks ||
          planAnalysis.active_tasks.length === 0) &&
        planAnalysis.completed_tasks &&
        planAnalysis.completed_tasks.length > 0
      ) {
        recommendations.potential_issues.push(
          'No active tasks found - may be ready to transition to next phase'
        );
      }
    }

    // Always recommend calling whats_next
    if (
      !recommendations.immediate_actions.some(action =>
        action.includes('whats_next')
      )
    ) {
      recommendations.immediate_actions.unshift(
        'Call whats_next() to get current phase-specific guidance'
      );
    }

    return recommendations;
  }
}
