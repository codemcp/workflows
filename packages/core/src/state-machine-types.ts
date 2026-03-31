/**
 * State Machine Types
 *
 * Type definitions for YAML-based state machine
 */

/**
 * Transition between states
 */
export interface YamlTransition {
  /** Event that triggers this transition */
  trigger: string;

  /** Target state after transition */
  to: string;

  /** Instructions to provide when this transition occurs (optional - uses target state default if not provided) */
  instructions?: string;

  /** Additional instructions to combine with target state's default instructions (optional) */
  additional_instructions?: string;

  /** Reason for this transition */
  transition_reason: string;

  /** Optional review perspectives for this transition */
  review_perspectives?: Array<{
    perspective: string;
    prompt: string;
  }>;

  /** Optional role targeting for crowd workflows (e.g., 'business-analyst', 'architect', 'developer') */
  role?: string;
}

/**
 * State definition
 */
export interface YamlState {
  /** Description of this state */
  description: string;

  /** Default instructions when entering this state */
  default_instructions: string;

  /** Transitions from this state */
  transitions: YamlTransition[];

  /**
   * Optional glob patterns for files that can be modified in this phase.
   * Supports glob syntax (*, **, ?).
   * If omitted, all files are allowed.
   * @example ["*.md", "*.yaml", ".vibe/**"]
   * @example ["*"] // Allow all files (same as omitting)
   */
  allowed_file_patterns?: string[];
}

/**
 * Complete state machine definition
 */
export interface YamlStateMachine {
  /** Name of the state machine */
  name: string;

  /** Description of the state machine's purpose */
  description: string;

  /** The starting state of the machine */
  initial_state: string;

  /** Map of states in the state machine */
  states: Record<string, YamlState>;

  /** Optional metadata for enhanced discoverability */
  metadata?: {
    complexity?: 'low' | 'medium' | 'high';
    domain: string;
    bestFor?: string[];
    useCases?: string[];
    examples?: string[];
    requiresDocumentation?: boolean;
    /** Indicates this workflow supports multi-agent collaboration */
    collaboration?: boolean;
    /** Required agent roles for this collaborative workflow */
    requiredRoles?: string[];
  };
}
