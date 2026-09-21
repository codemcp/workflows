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

  /**
   * Optional capability hint for this phase.
   * If absent, no capability routing is applied.
   * Free-form string; conventional values are `thinking`, `research`, `coding`.
   * See `.vibe/config.yaml` `capability_models` for optional model/agent mapping.
   */
  required_capability?: string;

  /**
   * Optional list of project documentation files to inject into the phase instructions.
   * When a listed file exists on disk, a contextual read-prompt is prepended to instructions.
   * When the file does not exist, the entry is silently ignored.
   *
   * Replaces the old pattern of `If \`$ARCHITECTURE_DOC\` exists: read it` in YAML bodies.
   */
  referred_docs?: ('requirements' | 'architecture' | 'design')[];
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
  };
}
