/**
 * OpenCode 2.x adapter for the Workflows plugin.
 *
 * Maps the V2 plugin context (ctx.session / ctx.tool / ctx.permission /
 * ctx.event) onto the host-neutral workflow runtime. Types come from
 * `@opencode/plugin` via `import type` only: V1 hosts do not have that package,
 * so nothing here may import it at runtime.
 */

import { z } from 'zod';
import type { Plugin as V2PluginTypes } from '@opencode/plugin';
import { createWorkflowRuntime } from '../runtime/workflow-runtime.js';
import type { HostPort } from '../runtime/host-port.js';
import type { ToolSpec } from '../runtime/tool-spec.js';
import { createV2Logging } from './logger.js';

type V2Context = V2PluginTypes.Context;

export interface V2PluginModule {
  readonly id: string;
  readonly setup: V2PluginTypes.Plugin['setup'];
}

export const PLUGIN_ID = 'workflows';

/** JSON Schema for a tool's zod shape (zod >= 4.1.8). */
export function toJsonSchema(spec: ToolSpec): Record<string, unknown> {
  const schema = z.toJSONSchema(z.object(spec.args)) as Record<string, unknown>;
  delete schema['$schema'];
  return schema;
}

export const v2Plugin: V2PluginModule = {
  id: PLUGIN_ID,
  async setup(ctx: V2Context) {
    const { logger, loggerFactory } = createV2Logging();
    logger.info('Plugin initializing', {
      host: 'opencode-v2',
      version: ctx.app.version,
      directory: ctx.location.directory,
    });

    const host: HostPort = {
      compact: async sessionID => {
        await ctx.session.compact({ sessionID, delivery: 'queue' } as never);
      },
      // The agent is session state in V2 and survives compaction, so the
      // prompt runs under the current agent without a switchAgent round trip
      // (the extra await also lets `opencode run` exit before the prompt lands).
      sendPrompt: async (sessionID, text) => {
        await ctx.session.prompt({
          sessionID,
          text,
          delivery: 'queue',
        } as never);
      },
    };

    const runtime = await createWorkflowRuntime({
      directory: ctx.location.directory,
      logger,
      loggerFactory,
      host,
    });

    // The `prompt` hook has no agent field; remember the agent per session from
    // hooks that do carry it, and fall back to the session's configured agent.
    // --- Notices (no workflow / tool suppression) ----------------------------
    // Phase instructions are NOT sent with every message: the start/proceed
    // tool results carry them, and after the compaction that a phase change
    // triggers they are sent once (see below). Only the short notices that are
    // needed while no workflow is active go into the SYSTEM prompt of a model
    // call, so they never show up in the transcript (a V2 prompt edit would be
    // stored as visible user text).
    // The `prompt` hook only marks the start of a user message so the cached
    // notice is re-evaluated once per message, not once per tool-loop call.
    ctx.session.hook('prompt', event => {
      runtime.beginUserMessage(event.sessionID as string);
    });

    ctx.session.hook('context', async event => {
      const text = await runtime.systemNotice({
        sessionID: event.sessionID as string,
        agent: event.agent as string,
      });
      if (text) {
        event.system.push({ type: 'text', text } as never);
      }
    });

    // --- Phase-based edit blocking -----------------------------------------
    ctx.tool.hook('execute.before', async event => {
      const sessionID = event.sessionID as string;
      runtime.trackSession(sessionID);
      runtime.rememberAgent(event.agent as string);
      await runtime.beforeEdit({ tool: event.tool, args: event.input });
    });

    // --- Compaction guidance -----------------------------------------------
    ctx.session.hook('compaction', async event => {
      runtime.trackSession(event.sessionID as string);
      const context = await runtime.compactionContext();
      for (const text of context) {
        event.system.push({ type: 'text', text } as never);
      }
    });

    // --- Tools ---------------------------------------------------------------
    await ctx.tool.transform(editor => {
      for (const [name, spec] of Object.entries(runtime.tools)) {
        editor.add({
          name,
          description: spec.description,
          input: toJsonSchema(spec),
          // Without this the tool is hidden behind OpenCode's generic
          // `execute` (code mode) tool and never offered to the model directly.
          options: { codemode: false },
          execute: async (input, tctx) => {
            runtime.trackSession(tctx.sessionID as string);
            runtime.rememberAgent(tctx.agent as string);
            const text = await runtime.executeTool(
              name,
              (input ?? {}) as Record<string, unknown>,
              {
                sessionID: tctx.sessionID as string,
                agent: tctx.agent as string,
                messageID: tctx.messageID as string,
                callID: tctx.id as string,
              },
              async (request, call) => {
                await ctx.permission.assert({
                  sessionID: call.sessionID,
                  agent: call.agent,
                  action: request.action,
                  resources: request.patterns,
                  save: request.always,
                  metadata: request.metadata,
                  source: {
                    type: 'tool',
                    messageID: call.messageID ?? '',
                    id: call.callID ?? '',
                  },
                } as never);
              }
            );
            return { content: [{ type: 'text', text }] };
          },
        });
      }
    });

    // --- Post-compaction continue ------------------------------------------
    // V2 emits neither session.compacted nor session.idle; compaction.ended is
    // the signal, and a queued prompt is delivered after the compaction run.
    const abort = new AbortController();
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({
          signal: abort.signal,
        } as never) as AsyncIterable<{
          type: string;
          data?: { sessionID?: string; agent?: string };
        }>) {
          if (event.type === 'session.agent.selected') {
            const selected = event.data as
              | { sessionID?: string; agent?: string }
              | undefined;
            if (selected?.sessionID) {
              runtime.rememberAgent(selected.agent);
            }
            continue;
          }
          if (event.type !== 'session.compaction.ended') continue;
          const sessionID = event.data?.sessionID;
          if (!sessionID) continue;
          runtime.markCompacted(sessionID);
          // Detach so the event loop keeps draining while the prompt is queued.
          setTimeout(() => {
            void runtime.sendContinue(sessionID);
          }, 0);
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          logger.error('event subscription failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    return () => {
      abort.abort();
    };
  },
};
