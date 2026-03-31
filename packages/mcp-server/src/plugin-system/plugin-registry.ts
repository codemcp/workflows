/**
 * Core PluginRegistry implementation for managing plugins and executing lifecycle hooks
 */

import type {
  IPlugin,
  IPluginRegistry,
  PluginHooks,
} from './plugin-interfaces.js';

export class PluginRegistry implements IPluginRegistry {
  private plugins: Map<string, IPlugin> = new Map();

  /**
   * Register a plugin.
   *
   * Note: Plugins are always registered regardless of isEnabled() state.
   * The isEnabled() check happens at hook execution time in getEnabledPlugins().
   * This allows plugins to activate/deactivate dynamically based on conditions
   * that may change after registration (e.g., backend availability).
   */
  registerPlugin(plugin: IPlugin): void {
    const name = plugin.getName();
    if (this.plugins.has(name)) {
      throw new Error(`Plugin with name '${name}' is already registered`);
    }

    this.plugins.set(name, plugin);
  }

  /**
   * Get all enabled plugins sorted by execution sequence
   */
  getEnabledPlugins(): IPlugin[] {
    return Array.from(this.plugins.values())
      .filter(plugin => plugin.isEnabled())
      .sort((a, b) => a.getSequence() - b.getSequence());
  }

  /**
   * Execute a specific hook on all plugins that implement it
   * Plugins are executed in sequence order
   *
   * Error Handling Strategy:
   * - Validation hooks (beforePhaseTransition): Always re-throw to block invalid transitions
   * - Critical startup hooks: Re-throw to fail fast and show critical errors
   * - Non-critical hooks: Log error and continue execution to enable graceful degradation
   * - Multiple plugins: If one plugin fails on non-critical hook, continue with next plugin
   */
  async executeHook<T extends keyof PluginHooks>(
    hookName: T,
    ...args: Parameters<NonNullable<PluginHooks[T]>>
  ): Promise<unknown> {
    const enabledPlugins = this.getEnabledPlugins();
    let result: unknown = undefined;

    for (const plugin of enabledPlugins) {
      const hooks = plugin.getHooks();
      const hook = hooks[hookName];

      if (hook) {
        try {
          // Type-safe hook execution using dispatch pattern
          result = await this.executeTypedHook(hookName, hook, args, result);
        } catch (error) {
          const pluginName = plugin.getName();
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          // Validation hooks (beforePhaseTransition) should ALWAYS re-throw
          // These are intentional blocking errors, not graceful degradation
          if (hookName === 'beforePhaseTransition') {
            console.error(
              `Plugin '${pluginName}' validation failed for hook '${hookName}':`,
              errorMessage
            );
            throw error;
          }

          // For non-critical hooks, log the error but continue execution
          // This enables graceful degradation: the app continues even if a plugin hook fails
          console.warn(
            `Plugin '${pluginName}' hook '${hookName}' failed with non-critical error:`,
            errorMessage
          );
          console.warn(
            `Continuing with remaining plugins for hook '${hookName}' (graceful degradation enabled)`
          );

          // Continue to next plugin for non-critical errors
          // This allows multiple plugins to execute even if one fails
        }
      }
    }

    return result;
  }

  /**
   * Type-safe hook execution dispatcher
   * Handles the differences in hook signatures without type coercion
   */
  private async executeTypedHook<T extends keyof PluginHooks>(
    hookName: T,
    hook: NonNullable<PluginHooks[T]>,
    args: Parameters<NonNullable<PluginHooks[T]>>,
    previousResult: unknown
  ): Promise<unknown> {
    if (hookName === 'afterPlanFileCreated') {
      // Content-chaining hook: replaces the content parameter with previous result
      const typedHook = hook as NonNullable<
        PluginHooks['afterPlanFileCreated']
      >;
      const [context, planFilePath, content] = args as Parameters<
        typeof typedHook
      >;
      const contentToUse = ((previousResult as string | undefined) ??
        content) as string;
      return typedHook(context, planFilePath, contentToUse);
    }

    if (hookName === 'afterInstructionsGenerated') {
      // Content-chaining hook: replaces the instructions parameter with previous result
      const typedHook = hook as NonNullable<
        PluginHooks['afterInstructionsGenerated']
      >;
      const [context, instructions] = args as Parameters<typeof typedHook>;
      const instructionsToUse = (
        previousResult !== undefined
          ? (previousResult as Parameters<typeof typedHook>[1])
          : instructions
      ) as Parameters<typeof typedHook>[1];
      return typedHook(context, instructionsToUse);
    }

    if (hookName === 'beforeStartDevelopment') {
      const typedHook = hook as NonNullable<
        PluginHooks['beforeStartDevelopment']
      >;
      const [context, startArgs] = args as Parameters<typeof typedHook>;
      return typedHook(context, startArgs);
    }

    if (hookName === 'afterStartDevelopment') {
      const typedHook = hook as NonNullable<
        PluginHooks['afterStartDevelopment']
      >;
      const [context, startArgs, result] = args as Parameters<typeof typedHook>;
      return typedHook(context, startArgs, result);
    }

    if (hookName === 'beforePhaseTransition') {
      const typedHook = hook as NonNullable<
        PluginHooks['beforePhaseTransition']
      >;
      const [context, currentPhase, targetPhase] = args as Parameters<
        typeof typedHook
      >;
      return typedHook(context, currentPhase, targetPhase);
    }

    // This should never be reached due to type system, but ensures exhaustiveness
    const exhaustiveCheck: never = hookName;
    throw new Error(`Unknown hook: ${exhaustiveCheck}`);
  }

  /**
   * Check if any enabled plugin implements a specific hook
   */
  hasHook(hookName: keyof PluginHooks): boolean {
    const enabledPlugins = this.getEnabledPlugins();
    return enabledPlugins.some(plugin => {
      const hooks = plugin.getHooks();
      return hooks[hookName] !== undefined;
    });
  }

  /**
   * Get names of all registered plugins (for debugging)
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Clear all plugins (mainly for testing)
   */
  clear(): void {
    this.plugins.clear();
  }
}
