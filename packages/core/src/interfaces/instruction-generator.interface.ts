/**
 * Instruction Generator Interface
 *
 * Defines the contract for instruction generation functionality.
 * Enables strategy pattern implementation for different task backends.
 */

import type { ConversationContext } from '../types.js';
import type { YamlStateMachine } from '../state-machine-types.js';
import type { CapabilityConfig } from '../capability-hint.js';

export interface InstructionContext {
  phase: string;
  conversationContext: ConversationContext;
  transitionReason: string;
  isModeled: boolean;
  /** Source of the instruction generation request - helps generators adapt output */
  instructionSource: 'proceed_to_phase' | 'whats_next' | 'start_development';
  /** Glob patterns for files allowed to be edited in this phase (optional) */
  allowedFilePatterns?: string[];
  /**
   * Optional capability hint declared on the phase (`required_capability` in
   * the YAML state machine). When set, the instruction generator embeds a
   * "Capability hint:" sentence into the phase instructions so the LLM picks
   * a suitable model/agent for subagent work. Absent ⇒ no hint (opt-in).
   */
  requiredCapability?: string;
  /**
   * Optional model/agent routing configuration for the capability hint's
   * subagent clause. Populated from `.vibe/config.yaml` `capability_models`
   * when present.
   */
  capabilityConfig?: CapabilityConfig;
}

export interface GeneratedInstructions {
  instructions: string;
  metadata: {
    phase: string;
    planFilePath: string;
    transitionReason: string;
    isModeled: boolean;
  };
}

/**
 * Interface for enriching generated instructions with additional guidance.
 * Implementations can append, prepend, or transform instruction content.
 */
export interface InstructionEnricher {
  enrichInstructions(
    instructions: GeneratedInstructions,
    context: InstructionContext
  ): Promise<GeneratedInstructions>;
}

/**
 * Interface for instruction generation operations
 * All instruction generators must implement this interface
 */
export interface IInstructionGenerator {
  /**
   * Set the state machine definition for dynamic instruction generation.
   * Implementations that derive all phase context from InstructionContext per-call
   * may treat this as a no-op.
   */
  setStateMachine(stateMachine: YamlStateMachine): void;

  /**
   * Generate comprehensive instructions for the LLM
   */
  generateInstructions(
    baseInstructions: string,
    context: InstructionContext
  ): Promise<GeneratedInstructions>;
}
