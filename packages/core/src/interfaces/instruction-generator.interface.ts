/**
 * Instruction Generator Types
 *
 * Types for instruction generation. The IInstructionGenerator interface
 * has been removed; use InstructionGenerator directly.
 */

import type { ConversationContext } from '../types.js';
import type { CapabilityConfig } from '../capability-hint.js';

export interface InstructionContext {
  phase: string;
  conversationContext: ConversationContext;
  transitionReason: string;
  isModeled: boolean;
  /** Source of the instruction generation request - helps generators adapt output */
  instructionSource:
    | 'proceed_to_phase'
    | 'whats_next'
    | 'start_development'
    | 'plugin_hook';
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

  /**
   * Optional list of project doc types to conditionally inject as read-prompts
   * at the top of the instruction body. Sourced from `referred_docs` on the
   * YAML phase state. Each doc is checked for existence at runtime; missing
   * files are silently skipped.
   */
  referredDocs?: ('requirements' | 'architecture' | 'design')[];
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
