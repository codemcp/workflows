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
import { PlanManager, InstructionGenerator } from '@codemcp/workflows-core';
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
 * Buffered instructions from proceed_to_phase or start_development tools.
 * Consumed (and cleared) by the next chat.message hook invocation.
 * Falls back to WhatsNextHandler when null.
 */
interface BufferedInstructions {
  phase: string;
  instructions: string;
  planFilePath: string;
  allowedFilePatterns: string[];
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

  // Initialize workflows enabled state from environment variable
  const envWorkflows = process.env.WORKFLOWS?.toLowerCase();
  let workflowsEnabled = envWorkflows === 'off' ? false : true; // default: enabled
  logger.info('Workflows state initialized', { workflowsEnabled });

  // Initialize instruction generator
  const planManager = new PlanManager();
  const instructionGenerator = new InstructionGenerator();

  // Cached ServerContext - created once, reused for all requests
  // This avoids creating new WorkflowManager/PluginRegistry instances per request
  let cachedServerContext: Awaited<
    ReturnType<typeof createServerContext>
  > | null = null;
  let serverContextInitialized = false;
  let currentSessionId: string | null = null;

  // Buffered instructions from tools (proceed_to_phase, start_development).
  // Consumed and cleared by the next chat.message hook call.
  let bufferedInstructions: BufferedInstructions | null = null;

  /**
   * Set buffered instructions from a tool result.
   * The next chat.message hook will use these instead of calling WhatsNextHandler.
   */
  function setBufferedInstructions(result: WhatsNextResult) {
    bufferedInstructions = {
      phase: result.phase,
      instructions: result.instructions,
      planFilePath: result.plan_file_path,
      allowedFilePatterns: result.allowed_file_patterns,
    };
  }

  // Helper to get an initialized ServerContext for handler delegation
  // Creates once, reuses for all subsequent calls
  async function getServerContext() {
    if (!cachedServerContext) {
      const sessionMetadata = currentSessionId
        ? {
            referenceId: currentSessionId,
            createdAt: new Date().toISOString(),
          }
        : undefined;

      cachedServerContext = createServerContext({
        projectDir: input.directory,
        planManager,
        instructionGenerator,
        loggerFactory,
        sessionMetadata,
      });

      // Set session metadata in the conversation manager for new conversations
      if (sessionMetadata) {
        cachedServerContext.conversationManager.setSessionMetadata(
          sessionMetadata
        );
      }
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

  /**
   * Read current workflow state from ConversationManager via shared ServerContext.
   * Returns null if no active conversation exists.
   */
  async function getWorkflowState(): Promise<{
    phase: string;
    phaseDescription: string | null;
    allowedFilePatterns: string[];
    workflowName: string;
  } | null> {
    try {
      const serverContext = await getServerContext();
      const context =
        await serverContext.conversationManager.getConversationContext();
      const stateMachine = serverContext.workflowManager.loadWorkflowForProject(
        context.projectPath,
        context.workflowName
      );
      const phaseState = stateMachine.states[context.currentPhase];
      return {
        phase: context.currentPhase,
        phaseDescription: phaseState?.description ?? null,
        allowedFilePatterns: phaseState?.allowed_file_patterns ?? ['**/*'],
        workflowName: context.workflowName,
      };
    } catch (_error) {
      return null;
    }
  }

  return {
    /**
     * Hook 1: chat.message
     * Fires after user message is created but before LLM processes it.
     * We add a synthetic part with phase instructions.
     */
    'chat.message': async (hookInput, output) => {
      // Capture session ID from the first hook that has it
      if (hookInput.sessionID && !currentSessionId) {
        currentSessionId = hookInput.sessionID;
        logger.debug('Captured session ID', { sessionId: currentSessionId });
      }

      // Skip if workflows are disabled
      if (!workflowsEnabled) {
        logger.debug('chat.message: Workflows disabled, skipping hook');
        return;
      }

      let result: WhatsNextResult | null = null;

      // If a tool (proceed_to_phase / start_development) buffered instructions,
      // use those — they are authoritative and avoid potential staleness from
      // re-querying WhatsNextHandler.
      if (bufferedInstructions) {
        logger.debug(
          'chat.message: Using buffered instructions from tool call',
          { phase: bufferedInstructions.phase }
        );
        result = {
          phase: bufferedInstructions.phase,
          instructions: bufferedInstructions.instructions,
          plan_file_path: bufferedInstructions.planFilePath,
          allowed_file_patterns: bufferedInstructions.allowedFilePatterns,
        };
        // Consume the buffer — next call will fall through to WhatsNextHandler
        bufferedInstructions = null;
      } else {
        // No buffered instructions — query WhatsNextHandler (reads from disk)
        try {
          const serverContext = await getServerContext();
          const handler = new WhatsNextHandler();
          const handlerResult = await handler.handle({}, serverContext);

          if (!handlerResult.success || !handlerResult.data) {
            logger.info(
              'chat.message: No active workflow, injecting start prompt'
            );
            output.parts.push({
              id: `prt_workflows_${Date.now()}`,
              sessionID: hookInput.sessionID,
              messageID: hookInput.messageID || output.message.id,
              type: 'text' as const,
              text: `No Active Workflow Use the \`start_development\` tool to begin.`,
            } as (typeof output.parts)[0]);
            return;
          }

          result = handlerResult.data;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('CONVERSATION_NOT_FOUND')) {
            logger.info(
              'chat.message: No active workflow, injecting start prompt'
            );
            output.parts.push({
              id: `prt_workflows_${Date.now()}`,
              sessionID: hookInput.sessionID,
              messageID: hookInput.messageID || output.message.id,
              type: 'text' as const,
              text: `No Active Workflow Use the \`start_development\` tool to begin.`,
            } as (typeof output.parts)[0]);
            return;
          }
          logger.error('chat.message: Error delegating to WhatsNextHandler', {
            error: errorMessage,
          });
          return;
        }
      }

      logger.info('chat.message hook fired', {
        sessionID: hookInput.sessionID,
        phase: result.phase,
      });

      // Strip whats_next() references — plugin auto-injects instructions
      const instructionText = stripWhatsNextReferences(result.instructions);

      if (!instructionText.trim()) {
        logger.info('chat.message: No instructions to inject');
        return;
      }

      output.parts.push({
        id: `prt_workflows_${Date.now()}`,
        sessionID: hookInput.sessionID,
        messageID: hookInput.messageID || output.message.id,
        type: 'text' as const,
        text: instructionText,
      } as (typeof output.parts)[0]);

      logger.info('chat.message: injected phase instructions', {
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
      // Skip if workflows are disabled
      if (!workflowsEnabled) {
        logger.debug('tool.execute.before: Workflows disabled, skipping hook');
        return;
      }

      const editTools = ['edit', 'write', 'patch', 'apply_patch', 'multiedit'];
      if (!editTools.includes(hookInput.tool)) {
        return;
      }

      // Read current workflow state from ConversationManager
      const state = await getWorkflowState();
      if (!state) {
        // No active workflow — allow all edits
        return;
      }

      logger.debug('tool.execute.before', {
        tool: hookInput.tool,
        phase: state.phase,
      });

      // Extract file path from tool args
      const args = output.args as Record<string, unknown>;
      const filePath = String(args?.filePath || args?.path || '');

      if (!filePath) {
        logger.warn('Edit tool called without filePath', {
          tool: hookInput.tool,
        });
        return;
      }

      if (!isFileAllowed(filePath, state.allowedFilePatterns)) {
        const allowedList = state.allowedFilePatterns
          .map(p => `  • ${p}`)
          .join('\n');

        const error = `BLOCKED: Cannot edit "${filePath}" in ${state.phase} phase.

Current phase "${state.phase}" only allows editing:
${allowedList}

ACTION REQUIRED: Use transition_phase tool to move to a phase that allows editing this file type, OR focus on files matching the allowed patterns above.`;

        logger.error('BLOCKING edit', {
          filePath,
          phase: state.phase,
          allowedPatterns: state.allowedFilePatterns,
        });
        throw new Error(error);
      }
    },

    /**
     * Hook 3: experimental.session.compacting
     * Fires when session is being compacted. We provide minimal guidance on what
     * to preserve and instruct the summary to end with phase continuation.
     */
    'experimental.session.compacting': async (hookInput, output) => {
      // Skip if workflows are disabled
      if (!workflowsEnabled) {
        logger.debug(
          'experimental.session.compacting: Workflows disabled, skipping hook'
        );
        return;
      }

      logger.debug('experimental.session.compacting hook fired', {
        sessionID: hookInput.sessionID,
      });

      const state = await getWorkflowState();
      if (!state) {
        logger.debug('No active workflow - skipping compaction guidance');
        return;
      }

      output.context.push(
        'Preserve: user intents, key decisions, significant changes and the reasoning why they were made. Remove tool calls, intermediate thoughts, and minor details.'
      );
      output.context.push(
        `End summary with: "Continue ${state.phase} phase. ${state.phaseDescription || ''}"`
      );

      logger.info('Injected compaction guidance', { phase: state.phase });
    },

    /**
     * Hook 4: command.execute.before
     * Intercept /workflow and /wf commands to toggle workflows enabled state
     */
    'command.execute.before': async (hookInput, output) => {
      const cmd = hookInput.command.toLowerCase();
      const args = (hookInput.arguments || '').toLowerCase().trim();

      if (cmd === 'workflow' || cmd === 'wf') {
        if (args === 'on') {
          workflowsEnabled = true;
          output.parts.push({
            id: `prt_workflows_toggle_${Date.now()}`,
            type: 'text' as const,
            text: 'Workflows enabled for this session.',
          });
          logger.info('Workflows toggled via command', { workflowsEnabled });
        } else if (args === 'off') {
          workflowsEnabled = false;
          output.parts.push({
            id: `prt_workflows_toggle_${Date.now()}`,
            type: 'text' as const,
            text: 'Workflows disabled for this session. Plugin will not inject instructions or enforce file restrictions.',
          });
          logger.info('Workflows toggled via command', { workflowsEnabled });
        } else {
          output.parts.push({
            id: `prt_workflows_toggle_${Date.now()}`,
            type: 'text' as const,
            text: `Usage: /workflow on|off or /wf on|off\nCurrent state: ${workflowsEnabled ? 'enabled' : 'disabled'}`,
          });
        }
      }
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
        setBufferedInstructions
      ),

      /**
       * Tool: proceed_to_phase
       * Transitions to a new workflow phase
       */
      proceed_to_phase: createProceedToPhaseTool(
        getServerContext,
        setBufferedInstructions
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
