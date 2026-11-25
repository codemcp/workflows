/**
 * Host-neutral workflow runtime.
 *
 * Owns everything that is independent of the OpenCode plugin API version:
 * session tracking, the cached ServerContext, buffered instructions, the agent
 * filter, edit blocking, post-compaction flow and the workflow tools. The V1
 * and V2 adapters only translate their native hooks to these methods.
 *
 * The runtime never starts or wraps the MCP server; it calls the
 * @codemcp/workflows-server handlers in-process.
 */

import { PlanManager, InstructionGenerator } from '@codemcp/workflows-core';
import type { LoggerFactory } from '@codemcp/workflows-core';
import { WhatsNextHandler } from '@codemcp/workflows-server';
import { createProceedToPhaseTool } from '../tool-handlers/proceed-to-phase.js';
import { createConductReviewTool } from '../tool-handlers/conduct-review.js';
import { createResetDevelopmentTool } from '../tool-handlers/reset-development.js';
import { createStartDevelopmentTool } from '../tool-handlers/start-development.js';
import { createSetupProjectDocsTool } from '../tool-handlers/setup-project-docs.js';
import { createLoadWorkflowsTool } from '../tool-handlers/load-workflows.js';
import {
  createServerContext,
  initializeServerContext,
} from '../server-context.js';
import { stripWhatsNextReferences } from '../utils.js';
import { isFileAllowed } from './file-patterns.js';
import { buildPermissionPatterns } from './permission-patterns.js';
import type { HostPort } from './host-port.js';
import type {
  PermissionRequest,
  ToolCallContext,
  ToolSpec,
} from './tool-spec.js';

export interface RuntimeLogger {
  debug: (message: string, extra?: Record<string, unknown>) => void;
  info: (message: string, extra?: Record<string, unknown>) => void;
  warn: (message: string, extra?: Record<string, unknown>) => void;
  error: (message: string, extra?: Record<string, unknown>) => void;
}

export interface WorkflowRuntimeOptions {
  directory: string;
  logger: RuntimeLogger;
  loggerFactory: LoggerFactory;
  host: HostPort;
}

/** Tools that modify files and are subject to the phase file restrictions. */
const EDIT_TOOLS = ['edit', 'write', 'patch', 'apply_patch', 'multiedit'];

export const NO_WORKFLOW_TEXT = `No Active Workflow Detected. You MUST initiate a new development workflow before proceeding. First, create a new branch with a meaningful name using a conventional commit prefix (e.g., \`feat/add-new-feature\`, \`fix/bug-description\`, \`refactor/improve-logic\`). Then call the \`start_development\` tool to begin. Do NOT attempt any file edits or tool executions until a workflow is active.`;

export const SUPPRESSION_TEXT =
  'IMPORTANT: The following workflow tools are NOT available in this session and must NOT be called under any circumstances: ' +
  'start_development, proceed_to_phase, conduct_review, reset_development, setup_project_docs. ' +
  'Calling them will result in an error. Ignore them entirely.';

export const COMPACTION_PRESERVE_TEXT =
  'Preserve: user intents, key decisions, significant changes and the reasoning why they were made. Remove tool calls, intermediate thoughts, and minor details.';

export interface WorkflowState {
  phase: string;
  phaseDescription: string | null;
  allowedFilePatterns: string[];
  workflowName: string;
}

export type AskPermission = (
  request: PermissionRequest,
  context: ToolCallContext
) => Promise<void>;

export interface WorkflowRuntime {
  /** Record the session the host is currently working in. */
  trackSession(sessionID: string | undefined): void;
  /** True if workflows are active for this agent (WORKFLOW_AGENTS filter). */
  isAgentEnabled(agent: string | undefined): boolean;
  /** Remember the last primary workflow agent (used for the continue prompt). */
  rememberAgent(agent: string | undefined): void;
  /**
   * V1 hosts: notice to attach (as a hidden part) to a new user message: the
   * "no active workflow" notice or the tool suppression notice. Phase
   * instructions are NOT part of it, they are sent once after a phase change
   * plus compaction (see sendContinue). Returns null when nothing is needed.
   */
  beforeUserMessage(input: {
    sessionID: string | undefined;
    agent: string | undefined;
  }): Promise<string | null>;
  /**
   * V2 hosts: a new user message starts. Drops the cached notice so the next
   * model call looks at the workflow state again.
   */
  beginUserMessage(sessionID: string): void;
  /**
   * V2 hosts: the notice for the system prompt of one model call (never
   * visible in the transcript): "no active workflow" or tool suppression.
   * Cached per session until the next user message or workflow tool call, so
   * tool-loop calls do not re-read the state.
   */
  systemNotice(input: {
    sessionID: string;
    agent: string | undefined;
  }): Promise<string | null>;
  /** Throws a BLOCKED error if the edit is not allowed in the current phase. */
  beforeEdit(input: { tool: string; args: unknown }): Promise<void>;
  /** Extra guidance for the compaction summary request. */
  compactionContext(): Promise<string[]>;
  /** A compaction finished: arm the post-compaction flow. */
  markCompacted(sessionID: string): void;
  /** True if a phase-aware continue is pending for this session. */
  hasPendingContinue(sessionID: string): boolean;
  /**
   * Send the one-time message with the current phase instructions after a
   * compaction (which a phase change triggers). No-op unless markCompacted ran.
   */
  sendContinue(sessionID: string): Promise<void>;
  /** Tools by name; run them through executeTool. */
  readonly tools: Record<string, ToolSpec>;
  executeTool(
    name: string,
    args: Record<string, unknown>,
    context: ToolCallContext,
    ask: AskPermission
  ): Promise<string>;
  getWorkflowState(): Promise<WorkflowState | null>;
}

export async function createWorkflowRuntime(
  options: WorkflowRuntimeOptions
): Promise<WorkflowRuntime> {
  const { directory, logger, loggerFactory, host } = options;

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

  const planManager = new PlanManager();
  const instructionGenerator = new InstructionGenerator();

  // Cached ServerContext - created once, reused within a session. When the
  // session changes the context is invalidated so workflow state from a
  // previous session is not shown.
  let cachedServerContext: Awaited<
    ReturnType<typeof createServerContext>
  > | null = null;
  let serverContextInitialized = false;
  let currentSessionId: string | null = null;
  let lastKnownSessionId: string | null = null;

  // Sessions that just completed compaction and need the phase instructions.
  let postCompactionSession: string | null = null;
  // Set right after a compaction so the very next user message (OpenCode's own
  // auto-continue, possibly under a non-workflow agent) is left alone.
  let postCompactionAutoResume = false;
  // V2: per-session cache of the notice (see systemNotice).
  const noticeCache = new Map<string, string | null>();
  // Phase instructions fetched while the compaction request is built, so the
  // message can be queued the moment the compaction ends (a prompt that
  // arrives after the run finished is lost for `opencode run`).
  let preparedContinueText: string | null = null;
  // Last-known primary workflow agent, used for the continue message.
  let lastKnownAgent: string | null = null;

  async function getServerContext() {
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
        projectDir: directory,
        planManager,
        instructionGenerator,
        loggerFactory,
        sessionMetadata,
      });

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

  async function getWorkflowState(): Promise<WorkflowState | null> {
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

  function trackSession(sessionID: string | undefined) {
    if (!sessionID) return;
    if (!currentSessionId) {
      currentSessionId = sessionID;
      lastKnownSessionId = sessionID;
      logger.debug('Captured initial session ID', {
        sessionId: currentSessionId,
      });
    } else if (currentSessionId !== sessionID) {
      // getServerContext() handles the invalidation
      logger.info('Session ID changed', {
        oldSessionId: lastKnownSessionId,
        newSessionId: sessionID,
      });
      currentSessionId = sessionID;
    }
  }

  function rememberAgent(agent: string | undefined) {
    // Only cache enabled (primary workflow) agents, never a subagent name.
    if (agent && isAgentEnabled(agent)) {
      lastKnownAgent = agent;
    }
  }

  type WorkflowLookup =
    | { status: 'active'; instructions: string | null }
    | { status: 'none' }
    | { status: 'error' };

  /** Ask the handler (reads state from disk) whether a workflow is active. */
  async function lookupWorkflow(): Promise<WorkflowLookup> {
    try {
      const serverContext = await getServerContext();
      const handler = new WhatsNextHandler();
      const handlerResult = await handler.handle(
        { _instructionSource: 'plugin_hook' },
        serverContext
      );
      if (!handlerResult.success || !handlerResult.data) {
        return { status: 'none' };
      }
      // The plugin sends instructions itself, so whats_next references are noise
      const text = stripWhatsNextReferences(handlerResult.data.instructions);
      return { status: 'active', instructions: text.trim() ? text : null };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('CONVERSATION_NOT_FOUND')) {
        return { status: 'none' };
      }
      logger.error('error delegating to WhatsNextHandler', {
        error: errorMessage,
      });
      return { status: 'error' };
    }
  }

  async function beforeUserMessage(input: {
    sessionID: string | undefined;
    agent: string | undefined;
  }): Promise<string | null> {
    trackSession(input.sessionID);
    rememberAgent(input.agent);

    // OpenCode's own auto-continue after a compaction may arrive under a
    // non-workflow agent; the plugin's continue message covers it.
    if (postCompactionAutoResume) {
      postCompactionAutoResume = false;
      logger.debug(
        'beforeUserMessage: leaving the post-compaction auto-resume alone',
        { agent: input.agent }
      );
      return null;
    }

    if (!isAgentEnabled(input.agent)) {
      logger.debug(
        'beforeUserMessage: agent not enabled, injecting tool suppression',
        { agent: input.agent }
      );
      return SUPPRESSION_TEXT;
    }

    const lookup = await lookupWorkflow();
    if (lookup.status === 'none') {
      logger.info('no active workflow, injecting start prompt');
      return NO_WORKFLOW_TEXT;
    }
    return null;
  }

  function beginUserMessage(sessionID: string) {
    noticeCache.delete(sessionID);
  }

  async function systemNotice(input: {
    sessionID: string;
    agent: string | undefined;
  }): Promise<string | null> {
    trackSession(input.sessionID);
    rememberAgent(input.agent);

    if (!isAgentEnabled(input.agent)) {
      return SUPPRESSION_TEXT;
    }
    if (noticeCache.has(input.sessionID)) {
      return noticeCache.get(input.sessionID) ?? null;
    }
    const lookup = await lookupWorkflow();
    // A failed lookup is not cached so the next call retries
    if (lookup.status === 'error') return null;
    const notice = lookup.status === 'none' ? NO_WORKFLOW_TEXT : null;
    noticeCache.set(input.sessionID, notice);
    return notice;
  }

  async function beforeEdit(input: {
    tool: string;
    args: unknown;
  }): Promise<void> {
    if (!EDIT_TOOLS.includes(input.tool)) {
      return;
    }

    const state = await getWorkflowState();
    if (!state) {
      // No active workflow: allow all edits
      return;
    }

    logger.debug('beforeEdit', { tool: input.tool, phase: state.phase });

    const args = (input.args ?? {}) as Record<string, unknown>;
    const filePath = String(args?.filePath || args?.path || '');

    if (!filePath) {
      logger.warn('Edit tool called without filePath', { tool: input.tool });
      return;
    }

    if (!isFileAllowed(filePath, state.allowedFilePatterns)) {
      const allowedList = state.allowedFilePatterns
        .map(p => `  • ${p}`)
        .join('\n');

      const error = `BLOCKED: Cannot edit "${filePath}" in ${state.phase} phase.

Current phase "${state.phase}" only allows editing:
${allowedList}

ACTION REQUIRED: Use proceed_to_phase tool to move to a phase that allows editing this file type, OR focus on files matching the allowed patterns above.`;

      logger.error('BLOCKING edit', {
        filePath,
        phase: state.phase,
        allowedPatterns: state.allowedFilePatterns,
      });
      throw new Error(error);
    }
  }

  async function compactionContext(): Promise<string[]> {
    const state = await getWorkflowState();
    if (!state) {
      logger.debug('No active workflow - skipping compaction guidance');
      return [];
    }

    // Full phase instructions make the summary self-sufficient, even if the
    // injection does not fire for the host's auto-continue message.
    let phaseInstructions: string | null = null;
    try {
      const serverContext = await getServerContext();
      const handler = new WhatsNextHandler();
      const handlerResult = await handler.handle(
        { _instructionSource: 'plugin_hook' },
        serverContext
      );
      if (handlerResult.success && handlerResult.data) {
        phaseInstructions = stripWhatsNextReferences(
          handlerResult.data.instructions
        );
      }
    } catch (_err) {
      // Fall back to minimal guidance if instructions can't be fetched
    }

    preparedContinueText = phaseInstructions?.trim() ? phaseInstructions : null;

    const context = [COMPACTION_PRESERVE_TEXT];
    if (phaseInstructions) {
      context.push(
        `Current workflow phase: ${state.phase}. After compaction, resume with full phase context:\n\n${phaseInstructions}`
      );
    } else {
      context.push(
        `End summary with: "Continue ${state.phase} phase. ${state.phaseDescription || ''}"`
      );
    }

    logger.info('Compaction guidance prepared', {
      phase: state.phase,
      fullInstructions: phaseInstructions !== null,
    });
    return context;
  }

  function markCompacted(sessionID: string) {
    postCompactionSession = sessionID;
    postCompactionAutoResume = true;
    logger.info('compaction finished: pending phase instructions', {
      sessionID,
    });
  }

  function hasPendingContinue(sessionID: string): boolean {
    return postCompactionSession === sessionID;
  }

  async function sendContinue(sessionID: string): Promise<void> {
    if (postCompactionSession !== sessionID) return;
    postCompactionSession = null;

    // The phase instructions are the message: the model gets its phase context
    // once, right after the context was compacted away.
    let text = 'Continue with the current phase.';
    const prepared = preparedContinueText;
    preparedContinueText = null;
    if (prepared) {
      text = prepared;
    } else {
      const lookup = await lookupWorkflow();
      if (lookup.status === 'active' && lookup.instructions) {
        text = lookup.instructions;
      }
    }

    try {
      await host.sendPrompt(sessionID, text, lastKnownAgent ?? undefined);
      logger.info('phase instructions sent after compaction', { sessionID });
    } catch (err) {
      logger.error('failed to send phase instructions after compaction', {
        sessionID,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------------
  const tools: Record<string, ToolSpec> = {
    start_development: createStartDevelopmentTool(directory, getServerContext),
    proceed_to_phase: createProceedToPhaseTool(getServerContext, sessionID =>
      host.compact(sessionID)
    ),
    conduct_review: createConductReviewTool(getServerContext),
    reset_development: createResetDevelopmentTool(directory, getServerContext),
    setup_project_docs: await createSetupProjectDocsTool(
      directory,
      getServerContext
    ),
    load_workflows: createLoadWorkflowsTool(getServerContext),
  };

  async function executeTool(
    name: string,
    args: Record<string, unknown>,
    context: ToolCallContext,
    ask: AskPermission
  ): Promise<string> {
    const spec = tools[name];
    if (!spec) {
      throw new Error(`Unknown workflow tool: ${name}`);
    }

    if (!isAgentEnabled(context.agent)) {
      throw new Error(
        `Workflows are not enabled for this agent (${context.agent}). Set WORKFLOW_AGENTS environment variable to include this agent, or use a different agent.`
      );
    }

    await ask(
      {
        action: name,
        patterns: buildPermissionPatterns(name, args),
        always: ['*'],
        metadata: args,
      },
      context
    );

    try {
      return await spec.execute(args as never, context);
    } finally {
      // Workflow tools change (or reset) the state: look at it again
      noticeCache.delete(context.sessionID);
    }
  }

  return {
    trackSession,
    isAgentEnabled,
    rememberAgent,
    beforeUserMessage,
    beginUserMessage,
    systemNotice,
    beforeEdit,
    compactionContext,
    markCompacted,
    hasPendingContinue,
    sendContinue,
    tools,
    executeTool,
    getWorkflowState,
  };
}
