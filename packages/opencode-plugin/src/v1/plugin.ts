/**
 * OpenCode 1.x adapter for the Workflows plugin.
 *
 * Thin translation layer: maps the V1 hooks (chat.message, tool.execute.before,
 * experimental.session.compacting, event) and the V1 `tool` map onto the
 * host-neutral workflow runtime. Logs go through client.app.log().
 */

import type { Plugin, PluginInput, Hooks, ToolDefinition } from '../types.js';
import { Effect } from 'effect';
import {
  createOpenCodeLogger,
  createOpenCodeLoggerFactory,
  type OpenCodeClient,
} from '../opencode-logger.js';
import {
  createWorkflowRuntime,
  type AskPermission,
} from '../runtime/workflow-runtime.js';
import type { HostPort } from '../runtime/host-port.js';
import type { ToolSpec } from '../runtime/tool-spec.js';

// ---------------------------------------------------------------------------
// Monkey-patch resilience: ToolContext.ask return-type detection
//
// opencode has changed ToolContext.ask's return type between SDK releases:
//   • SDK ≤ some pre-April-2026 version  → Promise<void>
//   • SDK after PR #21986 (Apr 10 2026)  → Effect.Effect<void>
//   • SDK 1.15.x (current, Jun 2026)     → Promise<void>  ← reverted again
//
// Rather than chasing each flip, we inspect the actual return value at
// runtime and dispatch accordingly.  An Effect object carries the property
// key "~effect/Effect" (its TypeId), which is stable across Effect 3.x and
// 4.x.  A plain Promise does not have that key and is always thenable.
// ---------------------------------------------------------------------------

const EFFECT_TYPE_ID = '~effect/Effect';

/**
 * Execute the result of `ToolContext.ask()`, regardless of whether the SDK
 * version returns a `Promise<void>` or an `Effect.Effect<void>`.
 */
async function runAsk(
  askResult: Promise<void> | Effect.Effect<void>
): Promise<void> {
  if (
    askResult !== null &&
    typeof askResult === 'object' &&
    EFFECT_TYPE_ID in askResult
  ) {
    await Effect.runPromise(askResult as Effect.Effect<void>);
  } else {
    await (askResult as Promise<void>);
  }
}

interface V1PromptClient {
  session: {
    promptAsync(params: {
      path: { id: string };
      body: {
        parts: Array<{ type: string; text: string }>;
        agent?: string;
      };
    }): Promise<unknown>;
  };
}

/** Delay before the post-compaction continue so the runner can settle. */
const POST_COMPACTION_SETTLE_MS = 500;

export const WorkflowsPlugin: Plugin = async (
  input: PluginInput
): Promise<Hooks> => {
  const logger = createOpenCodeLogger(input.client);
  const loggerFactory = createOpenCodeLoggerFactory(input.client);
  logger.info('Plugin initializing', {
    host: 'opencode-v1',
    directory: input.directory,
    worktree: input.worktree,
  });

  // Last-known model from chat.message. The summarize API requires
  // providerID + modelID, so proceed_to_phase needs the cached value.
  let lastKnownModel: { providerID: string; modelID: string } | null = null;

  const host: HostPort = {
    compact: async sessionID => {
      const client = input.client as unknown as OpenCodeClient;
      await client.session.summarize({
        path: { id: sessionID },
        ...(lastKnownModel ? { body: lastKnownModel } : {}),
      });
    },
    sendPrompt: async (sessionID, text, agent) => {
      const client = input.client as unknown as V1PromptClient;
      await client.session.promptAsync({
        path: { id: sessionID },
        body: {
          parts: [{ type: 'text', text }],
          ...(agent ? { agent } : {}),
        },
      });
    },
  };

  const runtime = await createWorkflowRuntime({
    directory: input.directory,
    logger,
    loggerFactory,
    host,
  });

  const syntheticPart = (
    kind: string,
    text: string,
    hookInput: { sessionID: string; messageID?: string },
    fallbackMessageId: string
  ) =>
    ({
      id: `prt_workflows_${kind}${Date.now()}`,
      sessionID: hookInput.sessionID,
      messageID: hookInput.messageID || fallbackMessageId,
      type: 'text' as const,
      synthetic: true,
      text,
    }) as unknown;

  const toV1Tool = (name: string, spec: ToolSpec): ToolDefinition =>
    ({
      description: spec.description,
      args: spec.args,
      execute: async (
        args: unknown,
        ctx: Parameters<ToolDefinition['execute']>[1]
      ) => {
        const ask: AskPermission = async request => {
          await runAsk(
            ctx.ask({
              permission: request.action,
              patterns: request.patterns,
              always: request.always,
              metadata: request.metadata,
            })
          );
        };
        return runtime.executeTool(
          name,
          args as Record<string, unknown>,
          {
            sessionID: ctx.sessionID,
            agent: ctx.agent,
            messageID: ctx.messageID,
          },
          ask
        );
      },
    }) as unknown as ToolDefinition;

  const tool: { [key: string]: ToolDefinition } = {};
  for (const [name, spec] of Object.entries(runtime.tools)) {
    tool[name] = toV1Tool(name, spec);
  }

  return {
    'chat.message': async (hookInput, output) => {
      if (hookInput.model) {
        lastKnownModel = hookInput.model;
      }

      const text = await runtime.beforeUserMessage({
        sessionID: hookInput.sessionID,
        agent: hookInput.agent,
      });
      if (text === null) return;

      output.parts.push(
        syntheticPart(
          '',
          text,
          hookInput,
          output.message.id
        ) as (typeof output.parts)[0]
      );
    },

    'tool.execute.before': async (hookInput, output) => {
      await runtime.beforeEdit({ tool: hookInput.tool, args: output.args });
    },

    'experimental.session.compacting': async (hookInput, output) => {
      logger.debug('experimental.session.compacting hook fired', {
        sessionID: hookInput.sessionID,
      });
      const context = await runtime.compactionContext();
      output.context.push(...context);
    },

    event: async ({ event }) => {
      logger.debug('event hook fired', { type: event.type });

      if (event.type === 'session.compacted') {
        runtime.markCompacted(event.properties.sessionID as string);
        return;
      }

      if (
        event.type === 'session.idle' &&
        runtime.hasPendingContinue(event.properties.sessionID as string)
      ) {
        const sessionID = event.properties.sessionID as string;
        logger.info(
          'session.idle after compaction: sending phase-aware continue',
          { sessionID }
        );
        await new Promise(resolve =>
          setTimeout(resolve, POST_COMPACTION_SETTLE_MS)
        );
        await runtime.sendContinue(sessionID);
      }
    },

    tool,
  };
};
