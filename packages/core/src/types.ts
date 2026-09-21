/**
 * Common types used across the application
 */

/**
 * Session metadata linking workflow state to an external session/context
 */
export interface SessionMetadata {
  referenceId: string;
  createdAt: string;
}

/**
 * Interface for interaction log entries
 */
export interface InteractionLog {
  id?: number;
  conversationId: string;
  toolName: string;
  inputParams: string;
  responseData: string;
  currentPhase: string;
  timestamp: string;
  isReset?: boolean;
  resetAt?: string;
}

export interface ConversationState {
  conversationId: string;
  projectPath: string;
  gitBranch: string;
  currentPhase: string;
  planFilePath: string;
  workflowName: string;
  requireReviewsBeforePhaseTransition: boolean;
  createdAt: string;
  updatedAt: string;
  sessionMetadata?: SessionMetadata;
}

/**
 * Interface for conversation context
 */
export interface ConversationContext {
  conversationId: string;
  projectPath: string;
  gitBranch: string;
  currentPhase: string;
  planFilePath: string;
  workflowName: string;
  requireReviewsBeforePhaseTransition?: boolean;
}
