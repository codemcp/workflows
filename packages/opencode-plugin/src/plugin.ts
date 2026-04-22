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

import type { Plugin, PluginInput, Hooks, ToolDefinition } from './types.js';
import { Effect } from 'effect';
import { createProceedToPhaseTool } from './tool-handlers/proceed-to-phase.js';
import { createConductReviewTool } from './tool-handlers/conduct-review.js';
import { createResetDevelopmentTool } from './tool-handlers/reset-development.js';
import { createStartDevelopmentTool } from './tool-handlers/start-development.js';
import { createSetupProjectDocsTool } from './tool-handlers/setup-project-docs.js';
import {
  createOpenCodeLogger,
  createOpenCodeLoggerFactory,
  type OpenCodeClient,
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

  // Parse WORKFLOW_AGENTS env var: comma-separated list of agent names.
  // When set, workflows only activate for agents in that list.
  // When not set (or empty), workflows activate for all agents (default).
  const envAgentFilter = process.env.WORKFLOW_AGENTS;
  const agentFilter: Set<string> | null =
    envAgentFilter && envAgentFilter.trim()
      ? new Set(
          envAgentFilter
            .split(',')
            .map(a => a.trim().toLowerCase())
            .filter(Boolean)
        )
      : null; // null = no filter, all agents active

  /**
   * Check if workflows should run for the given agent.
   * If WORKFLOW_AGENTS is set, only agents in that list are active.
   * If WORKFLOW_AGENTS is not set, all agents are active.
   */
  function isAgentEnabled(agent: string | undefined): boolean {
    if (agentFilter === null) return true; // no filter → all agents active
    return agentFilter.has((agent ?? '').toLowerCase());
  }

  logger.info('Workflows state initialized', {
    agentFilter: agentFilter ? [...agentFilter] : 'all (no filter)',
  });

  // Initialize instruction generator
  const planManager = new PlanManager();
  const instructionGenerator = new InstructionGenerator();

  // Cached ServerContext - created once, reused for all requests within a session
  // This avoids creating new WorkflowManager/PluginRegistry instances per request
  // When the OpenCode session changes, the context is invalidated to prevent
  // showing workflow state from a previous session
  let cachedServerContext: Awaited<
    ReturnType<typeof createServerContext>
  > | null = null;
  let serverContextInitialized = false;
  let currentSessionId: string | null = null;
  let lastKnownSessionId: string | null = null;

  // Buffered instructions from tools (proceed_to_phase, start_development).
  // Consumed and cleared by the next chat.message hook call.
  let bufferedInstructions: BufferedInstructions | null = null;

  // Tracks sessions that just completed compaction and need a phase-aware
  // continue message once the session becomes idle.
  let postCompactionSession: string | null = null;

  // When Hook 4 sends phase instructions via promptAsync after compaction,
  // this flag is set to true so Hook 1 (chat.message) can skip injecting a
  // duplicate synthetic part for that specific message.
  let postCompactionMessagePending = false;

  // Last-known model from chat.message hook. Cached so proceed_to_phase can
  // pass providerID + modelID to the summarize API (which requires them).
  let lastKnownModel: { providerID: string; modelID: string } | null = null;

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
  // Creates once per session, reuses for all subsequent calls within the same session.
  // If the session ID changes, the cached context is invalidated to prevent
  // showing workflow state from a previous OpenCode session.
  async function getServerContext() {
    // Invalidate cache if session ID has changed
    if (currentSessionId && currentSessionId !== lastKnownSessionId) {
      logger.debug('Session ID changed, invalidating cached ServerContext', {
        oldSessionId: lastKnownSessionId,
        newSessionId: currentSessionId,
      });
      cachedServerContext = null;
      serverContextInitialized = false;
      lastKnownSessionId = currentSessionId;
    }

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

  // Note: We don't call getServerContext() at startup because currentSessionId is not yet available.
  // The first call to getServerContext() will happen when the first hook is invoked, which ensures
  // that the ServerContext is created with the correct session metadata. This is critical for
  // properly linking workflow state to OpenCode sessions.
  //
  // The plugin registry logging that was previously done here was non-critical and can be removed
  // to ensure session metadata is properly set when workflows are started.

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
      // Capture session ID and detect session changes
      if (hookInput.sessionID) {
        if (!currentSessionId) {
          currentSessionId = hookInput.sessionID;
          lastKnownSessionId = hookInput.sessionID;
          logger.debug('Captured initial session ID', {
            sessionId: currentSessionId,
          });
        } else if (currentSessionId !== hookInput.sessionID) {
          // Session has changed - the getServerContext() function will handle invalidation
          currentSessionId = hookInput.sessionID;
          logger.info('Session ID changed', {
            oldSessionId: lastKnownSessionId,
            newSessionId: currentSessionId,
          });
        }
      }

      // Cache the model for use by tools (e.g. proceed_to_phase needs it for summarize API)
      if (hookInput.model) {
        lastKnownModel = hookInput.model;
      }

      // If this message was the post-compaction instructions prompt sent by Hook 4,
      // skip synthetic part injection — the message body IS the instructions.
      if (postCompactionMessagePending) {
        postCompactionMessagePending = false;
        logger.debug(
          'chat.message: skipping synthetic part for post-compaction instructions message'
        );
        return;
      }

      // If WORKFLOW_AGENTS is set and this agent is not in the allowlist, inject a
      // suppression instruction as a synthetic part so the LLM knows not to call the
      // workflow tools (which would only throw errors for non-enabled agents).
      // We use chat.message (not experimental.chat.system.transform) because:
      //   1. chat.message already has hookInput.agent directly — no stale-state risk.
      //   2. chat.message fires reliably for every user turn; transform may fire for
      //      intermediate tool-loop LLM calls without a preceding chat.message.
      if (!isAgentEnabled(hookInput.agent)) {
        logger.debug(
          'chat.message: Agent not enabled — injecting tool suppression',
          {
            agent: hookInput.agent,
          }
        );
        output.parts.push({
          id: `prt_workflows_suppress_${Date.now()}`,
          sessionID: hookInput.sessionID,
          messageID: hookInput.messageID || output.message.id,
          type: 'text' as const,
          synthetic: true,
          text:
            'IMPORTANT: The following workflow tools are NOT available in this session and must NOT be called under any circumstances: ' +
            'start_development, proceed_to_phase, conduct_review, reset_development, setup_project_docs. ' +
            'Calling them will result in an error. Ignore them entirely.',
        } as (typeof output.parts)[0]);
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
              synthetic: true,
              text: `No Active Workflow Detected. You MUST initiate a new development workflow before proceeding. Call the \`start_development\` tool to begin. Do NOT attempt any file edits or tool executions until a workflow is active.`,
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
              synthetic: true,
              text: `No Active Workflow Detected. You MUST initiate a new development workflow before proceeding. Call the \`start_development\` tool to begin. Do NOT attempt any file edits or tool executions until a workflow is active.`,
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
        synthetic: true,
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
     * Fires when session is being compacted. We provide full phase instructions
     * so the compaction summary is self-sufficient — the AI knows exactly what
     * to continue even if the chat.message hook doesn't fire for the synthetic
     * auto-compaction "continue" message.
     */
    'experimental.session.compacting': async (hookInput, output) => {
      logger.debug('experimental.session.compacting hook fired', {
        sessionID: hookInput.sessionID,
      });

      const state = await getWorkflowState();
      if (!state) {
        logger.debug('No active workflow - skipping compaction guidance');
        return;
      }

      // Get full phase instructions to embed in compaction context
      let phaseInstructions: string | null = null;
      try {
        const serverContext = await getServerContext();
        const handler = new WhatsNextHandler();
        const handlerResult = await handler.handle({}, serverContext);
        if (handlerResult.success && handlerResult.data) {
          phaseInstructions = stripWhatsNextReferences(
            handlerResult.data.instructions
          );
        }
      } catch (_err) {
        // Fall back to minimal guidance if instructions can't be fetched
      }

      output.context.push(
        'Preserve: user intents, key decisions, significant changes and the reasoning why they were made. Remove tool calls, intermediate thoughts, and minor details.'
      );

      if (phaseInstructions) {
        output.context.push(
          `Current workflow phase: ${state.phase}. After compaction, resume with full phase context:\n\n${phaseInstructions}`
        );
      } else {
        output.context.push(
          `End summary with: "Continue ${state.phase} phase. ${state.phaseDescription || ''}"`
        );
      }

      logger.info('Injected compaction guidance', {
        phase: state.phase,
        fullInstructions: phaseInstructions !== null,
      });
    },

    /**
     * Hook 4: event
     * Listens for bus events. When a session compaction completes we record it,
     * then when the session becomes idle we send a real user message so the
     * normal chat.message hook fires and injects phase instructions — giving the
     * AI full workflow context to continue after the compaction.
     *
     * We intentionally do NOT suppress the default synthetic "continue" message
     * (experimental.compaction.autocontinue). It may produce a first generic AI
     * response, but the idle trigger below ensures a proper phase-aware follow-up.
     */
    event: async ({ event }) => {
      logger.debug('event hook fired', { type: event.type });

      if (event.type === 'session.compacted') {
        postCompactionSession = event.properties.sessionID as string;
        logger.info('session.compacted: pending phase-aware continue', {
          sessionID: postCompactionSession,
        });
        return;
      }

      if (
        event.type === 'session.idle' &&
        postCompactionSession === (event.properties.sessionID as string)
      ) {
        const sessionID = postCompactionSession;
        postCompactionSession = null;
        logger.info(
          'session.idle after compaction: sending phase-aware continue',
          { sessionID }
        );

        // Wait a short time to allow the OpenCode runner state machine to
        // fully settle after compaction before we fire the follow-up prompt.
        await new Promise(resolve => setTimeout(resolve, 500));

        // Fetch the current phase instructions to use as the prompt text.
        // This way the AI receives its phase context directly as the user message,
        // and the chat.message hook skips injecting a duplicate synthetic part.
        let promptText = 'Continue with the current phase.';
        let usedPhaseInstructions = false;
        try {
          const serverContext = await getServerContext();
          const handler = new WhatsNextHandler();
          const handlerResult = await handler.handle({}, serverContext);
          if (handlerResult.success && handlerResult.data) {
            const instructions = stripWhatsNextReferences(
              handlerResult.data.instructions
            );
            if (instructions.trim()) {
              promptText = instructions;
              usedPhaseInstructions = true;
            }
          }
        } catch (_err) {
          // Fall back to hardcoded string
        }

        // Set flag so chat.message skips synthetic part for this message
        // only when we're sending actual instructions (not the fallback).
        if (usedPhaseInstructions) {
          postCompactionMessagePending = true;
        }

        try {
          const client = input.client as {
            session: {
              promptAsync(params: {
                path: { id: string };
                body: { parts: Array<{ type: string; text: string }> };
              }): Promise<unknown>;
            };
          };
          await client.session.promptAsync({
            path: { id: sessionID },
            body: {
              parts: [{ type: 'text', text: promptText }],
            },
          });
          logger.info('session.idle: phase-aware continue sent (async)', {
            sessionID,
          });
        } catch (err) {
          logger.error('session.idle: failed to send phase-aware continue', {
            sessionID,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },

    /**
     * Custom tools - always registered to allow clear error messages.
     * Each tool's execute method checks the agent filter at call time and throws
     * an error if the agent is not allowed to use workflows.
     */
    tool: await (async (): Promise<{ [key: string]: ToolDefinition }> => {
      const wrap = (toolName: string, def: ToolDefinition): ToolDefinition => ({
        ...def,
        execute: async (args, ctx) => {
          const agent = ctx.agent;

          if (!isAgentEnabled(agent)) {
            throw new Error(
              `Workflows are not enabled for this agent (${agent}). Set WORKFLOW_AGENTS environment variable to include this agent, or use a different agent.`
            );
          }

          await Effect.runPromise(
            ctx.ask({
              permission: toolName,
              patterns: ['*'],
              always: ['*'],
              metadata: {},
            })
          );

          return def.execute(args, ctx);
        },
      });

      return {
        start_development: wrap(
          'start_development',
          createStartDevelopmentTool(
            input.directory,
            getServerContext,
            setBufferedInstructions
          )
        ),
        proceed_to_phase: wrap(
          'proceed_to_phase',
          createProceedToPhaseTool(
            getServerContext,
            setBufferedInstructions,
            input.client as OpenCodeClient,
            () => lastKnownModel
          )
        ),
        conduct_review: wrap(
          'conduct_review',
          createConductReviewTool(getServerContext)
        ),
        reset_development: wrap(
          'reset_development',
          createResetDevelopmentTool(input.directory, getServerContext)
        ),
        setup_project_docs: wrap(
          'setup_project_docs',
          await createSetupProjectDocsTool(input.directory, getServerContext)
        ),
      };
    })(),
  };
};

// Default export for opencode plugin loader
export default {
  id: 'workflows',
  server: WorkflowsPlugin,
} satisfies { id: string; server: Plugin };
