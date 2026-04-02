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
 * 4. experimental.chat.system.transform - Suppress tools for non-whitelisted agents
 * 5. command.execute.before - Handle /workflow on|off commands
 *
 * Logs are sent via OpenCode SDK's client.app.log() API
 */

import type { Plugin, PluginInput, Hooks, ToolDefinition } from './types.js';
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

  // Parse WORKFLOW_ACTIVE_AGENTS env var: comma-separated list of agent names.
  // When set, workflows only activate for agents in that list.
  // When not set (or empty), workflows activate for all agents (default).
  const envActiveAgents = process.env.WORKFLOW_ACTIVE_AGENTS;
  const activeAgentFilter: Set<string> | null =
    envActiveAgents && envActiveAgents.trim()
      ? new Set(
          envActiveAgents
            .split(',')
            .map(a => a.trim().toLowerCase())
            .filter(Boolean)
        )
      : null; // null = no filter, all agents active

  // Per-session override: /workflow on|off toggles this for the given session only.
  // Sessions not explicitly toggled follow the default agent activation behavior:
  // enabled for all agents when WORKFLOW_ACTIVE_AGENTS is unset, otherwise only
  // for agents included in that filter.
  // Bounded to the last 50 sessions to prevent unbounded growth.
  const MAX_TRACKED_SESSIONS = 50;

  // Bounded set with LRU eviction — used for pendingActivation so it can't
  // grow unbounded if sessions end without a follow-up chat.message.
  class BoundedSessionSet extends Set<string> {
    constructor(private readonly maxSize: number) {
      super();
    }

    override add(value: string): this {
      if (this.has(value)) super.delete(value);
      super.add(value);
      while (this.size > this.maxSize) {
        const oldest = this.values().next().value;
        if (oldest === undefined) break;
        super.delete(oldest);
      }
      return this;
    }
  }

  // Bounded map with LRU eviction. When a session is evicted from
  // sessionEnabled, it is also removed from pendingActivation.
  class BoundedSessionMap extends Map<string, boolean> {
    constructor(
      private readonly maxSize: number,
      private readonly onEvict: (sessionID: string) => void
    ) {
      super();
    }

    override set(key: string, value: boolean): this {
      if (this.has(key)) super.delete(key);
      super.set(key, value);
      while (this.size > this.maxSize) {
        const oldest = this.keys().next().value;
        if (oldest === undefined) break;
        super.delete(oldest);
        this.onEvict(oldest);
      }
      return this;
    }
  }

  // Sessions where /workflow on was just typed by the user. The next
  // chat.message hook will inject a counter-instruction to override any
  // prior "ignore these tools" suppression the LLM may have seen.
  const pendingActivation = new BoundedSessionSet(MAX_TRACKED_SESSIONS);

  const sessionEnabled = new BoundedSessionMap(
    MAX_TRACKED_SESSIONS,
    sessionID => {
      pendingActivation.delete(sessionID);
    }
  );

  /**
   * Returns true if workflows should run for the given agent in the given session.
   *
   * Logic:
   *   - If the session was explicitly disabled (/workflow off) → false
   *   - If the session was explicitly enabled (/workflow on)   → true (overrides agent filter)
   *   - Otherwise (default): apply the agent filter
   */
  function isActiveForAgent(
    agent: string | undefined,
    sessionID: string | undefined
  ): boolean {
    const override = sessionID ? sessionEnabled.get(sessionID) : undefined;
    if (override === false) return false; // explicitly disabled
    if (override === true) return true; // explicitly enabled → bypass agent filter
    // No override: apply agent filter (undefined = follow filter)
    if (activeAgentFilter === null) return true; // no filter → all agents
    return activeAgentFilter.has((agent ?? '').toLowerCase());
  }

  function setSessionEnabled(sessionID: string, value: boolean): void {
    sessionEnabled.set(sessionID, value);
  }

  logger.info('Workflows state initialized', {
    activeAgentFilter: activeAgentFilter
      ? [...activeAgentFilter]
      : 'all (no filter)',
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

  // Track the most recent agent name seen in chat.message per session.
  // Used to gate tool.execute.before, which doesn't carry an agent field.
  // Bounded to MAX_TRACKED_SESSIONS to prevent unbounded growth.
  const sessionAgents = new Map<string, string>();

  /**
   * Record the agent for a session with LRU eviction.
   * Deletes and re-inserts the key to refresh insertion order.
   */
  function setSessionAgent(sessionID: string, agent: string): void {
    sessionAgents.delete(sessionID);
    sessionAgents.set(sessionID, agent);
    if (sessionAgents.size > MAX_TRACKED_SESSIONS) {
      const oldest = sessionAgents.keys().next().value;
      if (oldest !== undefined) sessionAgents.delete(oldest);
    }
  }

  /**
   * Set buffered instructions from a tool result.
   * The next chat.message hook will use these instead of calling WhatsNextHandler.
   */
  function setBufferedInstructions(result: WhatsNextResult): void {
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

        // Track the agent for this session so tool.execute.before can use it
        if (hookInput.agent) {
          setSessionAgent(hookInput.sessionID, hookInput.agent);
        }
      }

      // If /workflow on was just issued, inject counter-instruction first,
      // regardless of agent filter — this overrides any prior suppression.
      if (pendingActivation.has(hookInput.sessionID)) {
        pendingActivation.delete(hookInput.sessionID);
        output.parts.push({
          id: `prt_workflows_activate_${Date.now()}`,
          sessionID: hookInput.sessionID,
          messageID: hookInput.messageID || output.message.id,
          type: 'text' as const,
          synthetic: true,
          text: 'Workflows have been enabled for this session. Any prior instruction to ignore workflow tools (start_development, proceed_to_phase, conduct_review, reset_development, setup_project_docs) is rescinded — these tools are now available and should be used normally.',
        } as (typeof output.parts)[0]);
        logger.info(
          'chat.message: injected workflow activation counter-instruction'
        );
      }

      // Skip if workflows are disabled or agent is not in the active list.
      if (!isActiveForAgent(hookInput.agent, hookInput.sessionID)) {
        logger.debug(
          'chat.message: Workflows inactive for agent, skipping hook',
          { agent: hookInput.agent }
        );
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
              text: 'No active workflow. Use the `start_development` tool to begin.\n\nNote: The user can type `/workflow off` to disable workflow instructions for this session, or `/workflow on` to re-enable them.',
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
              text: 'No active workflow. Use the `start_development` tool to begin.\n\nNote: The user can type `/workflow off` to disable workflow instructions for this session, or `/workflow on` to re-enable them.',
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
     *
     * Note: tool.execute.before does not carry an agent field. We use the agent
     * last seen in chat.message for the same session (stored in sessionAgents).
     */
    'tool.execute.before': async (hookInput, output) => {
      // Skip if workflows are disabled or agent is not in the active list
      const sessionAgent = sessionAgents.get(hookInput.sessionID);
      if (!isActiveForAgent(sessionAgent, hookInput.sessionID)) {
        logger.debug(
          'tool.execute.before: Workflows inactive for agent, skipping hook',
          { agent: sessionAgent }
        );
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
      // Use the agent last seen for this session
      const sessionAgent = sessionAgents.get(hookInput.sessionID);
      if (!isActiveForAgent(sessionAgent, hookInput.sessionID)) {
        logger.debug(
          'experimental.session.compacting: Workflows inactive for agent, skipping hook',
          { agent: sessionAgent }
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
     * Hook 3b: experimental.chat.system.transform
     * When workflows are inactive for the current agent, inject a system prompt
     * instruction telling the agent to completely ignore the workflow tools.
     * This prevents the agent from discovering and calling them unprompted.
     */
    'experimental.chat.system.transform': async (hookInput, output) => {
      const sessionAgent = hookInput.sessionID
        ? sessionAgents.get(hookInput.sessionID)
        : undefined;
      const override = hookInput.sessionID
        ? sessionEnabled.get(hookInput.sessionID)
        : undefined;
      // Explicitly enabled → never suppress
      if (override === true) return;
      // Explicitly disabled → suppress
      if (override === false) {
        output.system.push(
          'IMPORTANT: The following tools are NOT available for use in this session and must be completely ignored. Never call them under any circumstances: start_development, proceed_to_phase, conduct_review, reset_development, setup_project_docs.'
        );
        return;
      }
      // No override: only suppress if we know the agent AND it's not in the filter.
      // If agent is unknown yet, don't suppress — we can't know yet.
      if (sessionAgent === undefined) return;
      if (isActiveForAgent(sessionAgent, hookInput.sessionID)) return;
      output.system.push(
        'IMPORTANT: The following tools are NOT available for use in this session and must be completely ignored. Never call them under any circumstances: start_development, proceed_to_phase, conduct_review, reset_development, setup_project_docs.'
      );
    },

    /**
     * Hook 4: command.execute.before
     * Intercept /workflow and /wf commands to toggle workflows enabled state
     * for the current session only. A synthetic instruction is injected telling
     * the agent to do nothing — so the toggle is silent from the agent's perspective.
     */
    'command.execute.before': async (hookInput, output) => {
      const cmd = hookInput.command.toLowerCase();
      const args = (hookInput.arguments || '').toLowerCase().trim();

      if (cmd === 'workflow' || cmd === 'wf') {
        if (args === 'on') {
          setSessionEnabled(hookInput.sessionID, true);
          pendingActivation.add(hookInput.sessionID);
          logger.info('Workflows toggled via command', {
            enabled: true,
            sessionID: hookInput.sessionID,
          });
        } else if (args === 'off') {
          setSessionEnabled(hookInput.sessionID, false);
          pendingActivation.delete(hookInput.sessionID);
          logger.info('Workflows toggled via command', {
            enabled: false,
            sessionID: hookInput.sessionID,
          });
        }
        // Replace the user-visible command text with a silent instruction so the
        // agent does not react to the toggle command at all.
        output.parts.push({
          id: `prt_workflows_toggle_${Date.now()}`,
          sessionID: hookInput.sessionID,
          type: 'text' as const,
          synthetic: true,
          text: 'The /workflow command was handled by the plugin. Do not respond to this message. Do not take any action. Simply wait for the next user message.',
        } as (typeof output.parts)[0]);
      }
    },

    /**
     * Custom tools - always registered so /workflow on can re-enable them mid-session.
     * Each tool's execute method checks the agent filter and per-session override
     * at call time, throwing a clear error when inactive.
     */
    tool: await (async (): Promise<{ [key: string]: ToolDefinition }> => {
      const DISABLED_MSG =
        'Workflows are disabled (/workflow off). Enable with /workflow on or /wf on';
      const AGENT_MSG = 'Workflow tools are not active for the current agent.';
      const wrap = (def: ToolDefinition): ToolDefinition => ({
        ...def,
        execute: async (args, ctx) => {
          const active = isActiveForAgent(ctx.agent, ctx.sessionID);
          if (!active) {
            const override = sessionEnabled.get(ctx.sessionID);
            throw new Error(override === false ? DISABLED_MSG : AGENT_MSG);
          }
          return def.execute(args, ctx);
        },
      });

      return {
        start_development: wrap(
          createStartDevelopmentTool(
            input.directory,
            getServerContext,
            setBufferedInstructions
          )
        ),
        proceed_to_phase: wrap(
          createProceedToPhaseTool(getServerContext, setBufferedInstructions)
        ),
        conduct_review: wrap(createConductReviewTool(getServerContext)),
        reset_development: wrap(
          createResetDevelopmentTool(input.directory, getServerContext)
        ),
        setup_project_docs: wrap(
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
