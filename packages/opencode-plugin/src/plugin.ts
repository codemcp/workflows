/**
 * OpenCode Workflows Plugin
 *
 * Integrates workflows-core state management with OpenCode hooks to provide
 * phase-aware development guidance and file edit restrictions.
 *
 * Hooks implemented:
 * 1. chat.message - Add synthetic part with phase instructions after each user message
 * 2. tool.execute.before - Block editing of certain files based on phase
 * 3. experimental.session.compacting - Inject workflow state into compaction context
 *
 * Logs are sent via OpenCode SDK's client.app.log() API
 */

import * as path from 'node:path';
import type { Plugin, PluginInput, Hooks } from './types.js';
import { createProceedToPhaseTool } from './tool-handlers/proceed-to-phase.js';
import { createConductReviewTool } from './tool-handlers/conduct-review.js';
import { createResetDevelopmentTool } from './tool-handlers/reset-development.js';
import { createStartDevelopmentTool } from './tool-handlers/start-development.js';
import { createSetupProjectDocsTool } from './tool-handlers/setup-project-docs.js';
import {
  createOpenCodeLogger,
  createOpenCodeLoggerFactory,
} from './opencode-logger.js';
import {
  PlanManager,
  InstructionGenerator,
  FileStorage,
  ConversationManager,
  WorkflowManager,
} from '@codemcp/workflows-core';
import {
  WhatsNextHandler,
  type WhatsNextResult,
} from '@codemcp/workflows-server';
import {
  createServerContext,
  initializeServerContext,
} from './server-context.js';
import { stripWhatsNextReferences } from './utils.js';

/**
 * Cached workflow state from the last WhatsNextHandler call.
 * Used by tool.execute.before hook for file edit validation.
 */
interface CachedWorkflowState {
  active: boolean;
  phase: string | null;
  phaseDescription: string | null;
  allowedFilePatterns: string[];
  workflowName: string | null;
  planFilePath: string | null;
}

/**
 * Match a file path against a glob pattern.
 * Supports patterns like:
 *   - `**\/*`       → matches everything
 *   - `**\/*.md`    → matches any .md file in any directory
 *   - `**\/*.test.ts` → matches test files
 */
function matchGlobPattern(filePath: string, pattern: string): boolean {
  // Normalise to forward slashes
  const normalised = filePath.replace(/\\/g, '/');
  const baseName = normalised.split('/').pop() ?? '';

  // `**/*` means "allow everything"
  if (pattern === '**/*' || pattern === '*') {
    return true;
  }

  // Convert glob pattern to a regex:
  //   - Escape regex metacharacters except * and .
  //   - `**/` at the start → match any path prefix (or empty)
  //   - `**`  elsewhere    → match any sequence of characters incl. /
  //   - `*`               → match any sequence of characters excl. /
  //   - `.`               → literal dot
  const regexSource = pattern
    .replace(/\\/g, '/')
    // Escape regex special chars (except * which we handle separately)
    .replace(/[+?^${}()|[\]]/g, '\\$&')
    // Literal dot
    .replace(/\./g, '\\.')
    // `**/` at the start → optional path prefix
    .replace(/^\*\*\//, '(?:.+\\/)?')
    // remaining `**` → any chars including /
    .replace(/\*\*/g, '.*')
    // remaining `*` → any chars except /
    .replace(/\*/g, '[^/]*');

  const regex = new RegExp(`^${regexSource}$`);

  // Try matching against full normalised path and against basename
  return regex.test(normalised) || regex.test(baseName);
}

/**
 * Check if a file edit is allowed based on glob patterns
 */
function isFileAllowed(filePath: string, patterns: string[]): boolean {
  // If allowed patterns includes '**/*' or '*', all files are allowed
  if (patterns.includes('**/*') || patterns.includes('*')) {
    return true;
  }

  // Check if the file path matches any allowed glob pattern
  return patterns.some(pattern => matchGlobPattern(filePath, pattern));
}

/**
 * Main plugin export
 */
export const WorkflowsPlugin: Plugin = async (
  input: PluginInput
): Promise<Hooks> => {
  // Initialize logger using OpenCode SDK
  const logger = createOpenCodeLogger(input.client);
  const loggerFactory = createOpenCodeLoggerFactory(input.client);
  logger.info('Plugin initializing', {
    directory: input.directory,
    worktree: input.worktree,
  });

  // Initialize instruction generator
  const planManager = new PlanManager();
  const instructionGenerator = new InstructionGenerator();

  // Cached ServerContext - created once, reused for all requests
  // This avoids creating new WorkflowManager/PluginRegistry instances per request
  let cachedServerContext: Awaited<
    ReturnType<typeof createServerContext>
  > | null = null;
  let serverContextInitialized = false;

  // Cached workflow state - updated by chat.message hook, used by tool.execute.before
  let cachedState: CachedWorkflowState = {
    active: false,
    phase: null,
    phaseDescription: null,
    allowedFilePatterns: ['**/*'],
    workflowName: null,
    planFilePath: null,
  };

  // Helper to get an initialized ServerContext for handler delegation
  // Creates once, reuses for all subsequent calls
  async function getServerContext() {
    if (!cachedServerContext) {
      cachedServerContext = createServerContext({
        projectDir: input.directory,
        planManager,
        instructionGenerator,
        loggerFactory,
      });
    }

    if (!serverContextInitialized) {
      await initializeServerContext(cachedServerContext);
      serverContextInitialized = true;
    }

    return cachedServerContext;
  }

  // Log registered plugins at startup (once)
  getServerContext()
    .then(context => {
      const pluginNames = context.pluginRegistry?.getPluginNames() ?? [];
      if (pluginNames.length > 0) {
        logger.info('Registered plugins', { plugins: pluginNames });
      } else {
        logger.debug('No plugins registered');
      }
    })
    .catch(() => {
      // Ignore errors during startup plugin check
    });

  // Helper to update cached state from WhatsNextResult
  function updateCachedState(result: WhatsNextResult, workflowName?: string) {
    cachedState = {
      active: true,
      phase: result.phase,
      phaseDescription: null, // Not provided by WhatsNextResult, but not critical
      allowedFilePatterns: result.allowed_file_patterns,
      workflowName: workflowName ?? cachedState.workflowName,
      planFilePath: result.plan_file_path,
    };
  }

  /**
   * Load state directly from core without triggering transition analysis.
   * Used by tool.execute.before to get current phase restrictions.
   * Returns true if state was successfully loaded.
   */
  async function loadStateDirectly(): Promise<boolean> {
    try {
      const vibeDir = path.join(input.directory, '.vibe');
      const storageDir = path.join(vibeDir, 'storage');

      const fileStorage = new FileStorage(storageDir);
      await fileStorage.initialize();

      const workflowManager = new WorkflowManager();
      workflowManager.loadProjectWorkflows(input.directory);

      const conversationManager = new ConversationManager(
        fileStorage,
        workflowManager,
        input.directory
      );

      // Get conversation context (this doesn't trigger transitions)
      const context = await conversationManager.getConversationContext();

      // Load the workflow to get phase restrictions
      const stateMachine = workflowManager.loadWorkflowForProject(
        input.directory,
        context.workflowName
      );
      const phaseState = stateMachine.states[context.currentPhase];
      const allowedFilePatterns = phaseState?.allowed_file_patterns ?? ['**/*'];

      // Update cached state
      cachedState = {
        active: true,
        phase: context.currentPhase,
        phaseDescription: phaseState?.description ?? null,
        allowedFilePatterns,
        workflowName: context.workflowName,
        planFilePath: context.planFilePath,
      };

      return true;
    } catch (_error) {
      // No conversation found or other error
      return false;
    }
  }

  // Try to get initial state directly (without triggering transitions)
  loadStateDirectly()
    .then(loaded => {
      if (loaded) {
        logger.debug('Initial state loaded directly', {
          active: cachedState.active,
          phase: cachedState.phase,
          patterns: cachedState.allowedFilePatterns,
        });
      }
    })
    .catch(err => {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (!errorMessage.includes('CONVERSATION_NOT_FOUND')) {
        logger.error('Failed to load initial state', { error: errorMessage });
      }
    });

  return {
    /**
     * Hook 1: chat.message
     * Fires after user message is created but before LLM processes it.
     * We add a synthetic part with phase instructions.
     */
    'chat.message': async (hookInput, output) => {
      // Delegate to WhatsNextHandler for instruction generation
      let result: WhatsNextResult | null = null;
      try {
        const serverContext = await getServerContext();
        const handler = new WhatsNextHandler();
        const handlerResult = await handler.handle({}, serverContext);

        if (!handlerResult.success || !handlerResult.data) {
          // No active workflow - prompt user to start one
          logger.info(
            'chat.message: No active workflow, injecting start prompt'
          );

          const startPrompt = `No Active Workflow Use the \`start_development\` tool to begin.`;

          const syntheticPart = {
            id: `prt_workflows_${Date.now()}`,
            sessionID: hookInput.sessionID,
            messageID: hookInput.messageID || output.message.id,
            type: 'text' as const,
            text: startPrompt,
          };

          output.parts.push(syntheticPart as (typeof output.parts)[0]);
          logger.info('chat.message: injected start-workflow prompt', {
            sessionID: hookInput.sessionID,
            partPreview: startPrompt.slice(0, 200),
          });

          // Mark workflow as inactive
          cachedState = {
            active: false,
            phase: null,
            phaseDescription: null,
            allowedFilePatterns: ['**/*'],
            workflowName: null,
            planFilePath: null,
          };
          return;
        }

        result = handlerResult.data;

        // Update cached state for use by tool.execute.before
        updateCachedState(result);

        logger.info('chat.message hook fired', {
          sessionID: hookInput.sessionID,
          workflow: cachedState.workflowName,
          phase: result.phase,
        });
      } catch (error) {
        // Handle CONVERSATION_NOT_FOUND gracefully
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('CONVERSATION_NOT_FOUND')) {
          logger.info(
            'chat.message: No active workflow, injecting start prompt'
          );

          const startPrompt = `No Active Workflow Use the \`start_development\` tool to begin.`;

          const syntheticPart = {
            id: `prt_workflows_${Date.now()}`,
            sessionID: hookInput.sessionID,
            messageID: hookInput.messageID || output.message.id,
            type: 'text' as const,
            text: startPrompt,
          };

          output.parts.push(syntheticPart as (typeof output.parts)[0]);

          cachedState = {
            active: false,
            phase: null,
            phaseDescription: null,
            allowedFilePatterns: ['**/*'],
            workflowName: null,
            planFilePath: null,
          };
          return;
        }
        logger.error('chat.message: Error delegating to WhatsNextHandler', {
          error: errorMessage,
        });
        return;
      }

      // Strip whats_next() references - plugin auto-injects instructions
      const instructionText = stripWhatsNextReferences(result.instructions);

      if (!instructionText.trim()) {
        logger.info('chat.message: No instructions to inject');
        return;
      }

      // Add synthetic part with phase instructions
      const syntheticPart = {
        id: `prt_workflows_${Date.now()}`,
        sessionID: hookInput.sessionID,
        messageID: hookInput.messageID || output.message.id,
        type: 'text' as const,
        text: instructionText,
      };

      output.parts.push(syntheticPart as (typeof output.parts)[0]);
      logger.info('chat.message: injected phase instructions', {
        workflow: cachedState.workflowName,
        phase: result.phase,
        length: instructionText.length,
        preview: instructionText.slice(0, 300),
      });
    },

    /**
     * Hook 2: tool.execute.before
     * Fires before each tool execution. We block disallowed file edits based on phase.
     */
    'tool.execute.before': async (hookInput, output) => {
      // Log every tool execution to verify hook is being called
      logger.info('tool.execute.before hook called', {
        tool: hookInput.tool,
        sessionID: hookInput.sessionID,
        callID: hookInput.callID,
        cachedStateActive: cachedState.active,
        cachedPhase: cachedState.phase,
      });

      // If cached state is not populated, try to load it directly
      // This handles the case where tool.execute.before is called before chat.message
      if (!cachedState.active) {
        logger.debug('Cached state not active, loading directly');
        const loaded = await loadStateDirectly();
        if (!loaded) {
          // No active workflow - allow all edits
          logger.debug('No workflow loaded, allowing all edits');
          return;
        }
        logger.debug('Loaded state directly', {
          phase: cachedState.phase,
          patterns: cachedState.allowedFilePatterns,
        });
      }

      // If still not active, allow all edits
      if (!cachedState.active) {
        return;
      }

      const editTools = ['edit', 'write', 'patch', 'apply_patch', 'multiedit'];

      if (editTools.includes(hookInput.tool)) {
        // Extract file path from tool args (check both filePath and path properties)
        const args = output.args as Record<string, unknown>;
        const filePath = String(args?.filePath || args?.path || '');

        if (!filePath) {
          logger.warn('Edit tool called without filePath', {
            tool: hookInput.tool,
            args,
          });
          return;
        }

        logger.debug('tool.execute.before', { tool: hookInput.tool, filePath });

        // Check if file edit is allowed using cached patterns
        if (!isFileAllowed(filePath, cachedState.allowedFilePatterns)) {
          const phase = cachedState.phase || 'unknown';

          // Format error message to be actionable for the model
          const allowedList = cachedState.allowedFilePatterns
            .map(p => `  • ${p}`)
            .join('\n');

          const error = `BLOCKED: Cannot edit "${filePath}" in ${phase} phase.

Current phase "${phase}" only allows editing:
${allowedList}

ACTION REQUIRED: Use transition_phase tool to move to a phase that allows editing this file type, OR focus on files matching the allowed patterns above.`;

          logger.error('BLOCKING edit', {
            filePath,
            phase,
            allowedPatterns: cachedState.allowedFilePatterns,
          });
          throw new Error(error);
        }
      }
    },

    /**
     * Hook 3: experimental.session.compacting
     * Fires when session is being compacted. We provide minimal guidance on what
     * to preserve and instruct the summary to end with phase continuation.
     */
    'experimental.session.compacting': async (hookInput, output) => {
      logger.debug('experimental.session.compacting hook fired', {
        sessionID: hookInput.sessionID,
      });

      // If cached state is not populated, try to load it directly
      if (!cachedState.active) {
        await loadStateDirectly();
      }

      // Only inject if workflow is active
      if (!cachedState.active || !cachedState.phase) {
        logger.debug('No active workflow - skipping compaction guidance');
        return;
      }

      // Minimal guidance: what to preserve + continuation instructions
      output.context.push(
        'Preserve: user intents, key decisions, significant changes and the reasoning why they were made. Remove tool calls, intermediate thoughts, and minor details.'
      );
      output.context.push(
        `End summary with: "Continue ${cachedState.phase} phase. ${cachedState.phaseDescription || ''}"`
      );

      logger.info('Injected compaction guidance', {
        phase: cachedState.phase,
      });
    },

    /**
     * Custom tools - matching MCP server tool names for consistency
     */
    tool: {
      /**
       * Tool: start_development
       * Starts a new development workflow in the current project
       */
      start_development: createStartDevelopmentTool(
        input.directory,
        getServerContext,
        updateCachedState
      ),

      /**
       * Tool: proceed_to_phase
       * Transitions to a new workflow phase
       */
      proceed_to_phase: createProceedToPhaseTool(
        getServerContext,
        updateCachedState
      ),

      /**
       * Tool: conduct_review
       * Conducts a review before phase transition
       */
      conduct_review: createConductReviewTool(getServerContext),

      /**
       * Tool: reset_development
       * Resets the current workflow and starts fresh
       */
      reset_development: createResetDevelopmentTool(
        input.directory,
        getServerContext
      ),

      /**
       * Tool: setup_project_docs
       * Creates project documentation artifacts
       */
      setup_project_docs: await createSetupProjectDocsTool(
        input.directory,
        getServerContext
      ),
    },
  };
};

// Default export for opencode plugin loader
export default {
  id: 'workflows',
  server: WorkflowsPlugin,
} satisfies { id: string; server: Plugin };
