/**
 * Plugin system interfaces for extending the workflows server
 *
 * Core Principle: Plugins receive only read-only context data and cannot
 * directly manipulate core server components. They extend behavior through
 * semantic lifecycle hooks only.
 */

import type { YamlState } from '@codemcp/workflows-core';

/**
 * Plugin interface - all plugins must implement this
 */
export interface IPlugin {
  /** Unique plugin name */
  getName(): string;

  /** Execution sequence (lower numbers execute first) */
  getSequence(): number;

  /** Whether plugin is enabled (typically based on environment) */
  isEnabled(): boolean;

  /** Lifecycle hooks this plugin provides */
  getHooks(): PluginHooks;
}

/**
 * Lifecycle hooks that plugins can implement
 * All hooks receive standardized PluginHookContext as first parameter
 */
export interface PluginHooks {
  /** Called before development workflow starts */
  beforeStartDevelopment?: (
    context: PluginHookContext,
    args: StartDevelopmentArgs
  ) => Promise<void>;

  /** Called after development workflow has started */
  afterStartDevelopment?: (
    context: PluginHookContext,
    args: StartDevelopmentArgs,
    result: StartDevelopmentResult
  ) => Promise<void>;

  /** Called after plan file is created - can modify content */
  afterPlanFileCreated?: (
    context: PluginHookContext,
    planFilePath: string,
    content: string
  ) => Promise<string>;

  /** Called before phase transition (can block by throwing) */
  beforePhaseTransition?: (
    context: PluginHookContext,
    currentPhase: string,
    targetPhase: string
  ) => Promise<void>;

  /** Called after instructions are generated - can modify them */
  afterInstructionsGenerated?: (
    context: PluginHookContext,
    instructions: GeneratedInstructions
  ) => Promise<GeneratedInstructions>;
}

/**
 * Standardized context provided to all plugin hooks
 * Contains ONLY read-only data - no server components
 */
export interface PluginHookContext {
  /** Current conversation ID */
  conversationId: string;

  /** Path to the plan file */
  planFilePath: string;

  /** Current development phase */
  currentPhase: string;

  /** Active workflow name */
  workflow: string;

  /** Project directory path */
  projectPath: string;

  /** Git branch name */
  gitBranch: string;

  /** Whether the plan file exists at the time of instruction generation */
  planFileExists: boolean;

  /** Target phase (only available in phase transitions) */
  targetPhase?: string;

  /** Workflow state machine definition (read-only) - available in afterStartDevelopment */
  stateMachine?: {
    readonly name: string;
    readonly description: string;
    readonly initial_state: string;
    readonly states: Record<string, YamlState>;
  };

  // EXPLICITLY EXCLUDED: No access to core server components like:
  // - conversationManager (could manipulate conversations)
  // - transitionEngine (could force transitions)
  // - planManager (could bypass hook system)
  // - instructionGenerator (could generate instructions outside flow)
}

/**
 * Plugin registry interface for managing and executing plugins
 */
export interface IPluginRegistry {
  /** Register a plugin */
  registerPlugin(plugin: IPlugin): void;

  /** Get all enabled plugins sorted by sequence */
  getEnabledPlugins(): IPlugin[];

  /** Execute a specific hook on all plugins that implement it */
  executeHook<T extends keyof PluginHooks>(
    hookName: T,
    ...args: Parameters<NonNullable<PluginHooks[T]>>
  ): Promise<unknown>;

  /** Check if any plugin has a specific hook */
  hasHook(hookName: keyof PluginHooks): boolean;

  /** Get names of all registered plugins */
  getPluginNames(): string[];

  /** Clear all plugins (mainly for testing) */
  clear(): void;
}

// Supporting interfaces for hook parameters

export interface StartDevelopmentArgs {
  workflow: string;
  require_reviews?: boolean;
  project_path?: string;
}

export interface StartDevelopmentResult {
  conversationId: string;
  planFilePath: string;
  phase: string;
  workflow: string;
}

export interface GeneratedInstructions {
  instructions: string;
  planFilePath: string;
  phase: string;
  /** Source of the instruction generation */
  instructionSource?: 'whats_next' | 'proceed_to_phase' | 'start_development';
}
