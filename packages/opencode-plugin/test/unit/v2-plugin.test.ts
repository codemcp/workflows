/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for the OpenCode 2.x adapter, driven by a mock V2 plugin context.
 * Behavior shapes (hook payloads, event types, permission input) were verified
 * against OpenCode 2.1.2 in the container spike.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v2Plugin, toJsonSchema } from '../../src/v2/plugin.js';
import defaultExport from '../../src/index.js';
import { createTempDir, cleanupDir, setupWorkflowState } from '../utils.js';

type Handler = (event: any) => unknown;

function createMockV2Context(directory: string) {
  const sessionHooks = new Map<string, Handler>();
  const toolHooks = new Map<string, Handler>();
  const tools = new Map<string, any>();
  const eventQueue: any[] = [];
  let wake: (() => void) | null = null;
  let closed = false;

  const ctx = {
    app: { name: 'cli', version: '2.1.2', channel: 'latest' },
    location: { directory },
    session: {
      hook: vi.fn((name: string, fn: Handler) => {
        sessionHooks.set(name, fn);
      }),
      compact: vi.fn().mockResolvedValue({}),
      prompt: vi.fn().mockResolvedValue({}),
      switchAgent: vi.fn().mockResolvedValue(undefined),
    },
    agent: {
      list: vi.fn().mockResolvedValue({
        data: [
          { id: 'build', mode: 'primary', hidden: false },
          { id: 'general', mode: 'subagent', hidden: false },
          { id: 'title', mode: 'primary', hidden: true },
        ],
      }),
    },
    tool: {
      hook: vi.fn((name: string, fn: Handler) => {
        toolHooks.set(name, fn);
      }),
      transform: vi.fn(async (fn: (editor: any) => void) => {
        fn({ add: (tool: any) => tools.set(tool.name, tool) });
      }),
    },
    permission: { assert: vi.fn().mockResolvedValue(undefined) },
    event: {
      subscribe: vi.fn(() => ({
        async *[Symbol.asyncIterator]() {
          while (!closed) {
            if (eventQueue.length === 0) {
              await new Promise<void>(resolve => (wake = resolve));
            }
            while (eventQueue.length > 0) yield eventQueue.shift();
          }
        },
      })),
    },
  };

  return {
    ctx,
    sessionHooks,
    toolHooks,
    tools,
    emit(event: any) {
      eventQueue.push(event);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
  };
}

describe('OpenCode 2 adapter', () => {
  let dir: string;
  let mock: ReturnType<typeof createMockV2Context>;
  let cleanup: (() => void) | void;

  beforeEach(() => {
    dir = createTempDir();
    delete process.env.WORKFLOW_AGENTS;
    delete process.env.WORKFLOW_AUTO_COMPACT;
    mock = createMockV2Context(dir);
  });

  afterEach(() => {
    if (typeof cleanup === 'function') cleanup();
    mock.close();
    cleanupDir(dir);
  });

  const setup = async () => {
    cleanup = (await v2Plugin.setup(mock.ctx as never)) as () => void;
  };

  const promptEvent = (text = 'hello') => ({
    sessionID: 'ses-1',
    messageID: 'msg-1',
    prompt: { text, files: [] },
    metadata: undefined,
    delivery: 'steer',
  });

  it('exports one default object serving V1 (server) and V2 (id + setup)', () => {
    expect(defaultExport.id).toBe('workflows');
    expect(typeof defaultExport.setup).toBe('function');
    expect(typeof defaultExport.server).toBe('function');
  });

  it('registers the workflow tools with JSON schema and codemode disabled', async () => {
    await setup();

    expect([...mock.tools.keys()].sort()).toEqual([
      'conduct_review',
      'load_workflows',
      'proceed_to_phase',
      'reset_development',
      'setup_project_docs',
      'start_development',
    ]);
    const proceed = mock.tools.get('proceed_to_phase');
    expect(proceed.options).toEqual({ codemode: false });
    expect(proceed.input.type).toBe('object');
    expect(proceed.input.required).toContain('target_phase');
    expect(proceed.input.$schema).toBeUndefined();
  });

  it('converts zod arg shapes to JSON schema', () => {
    const schema = toJsonSchema({
      description: 'x',
      args: {},
      execute: async () => '',
    } as never);
    expect(schema.type).toBe('object');
  });

  it('registers prompt, context, compaction and execute.before hooks', async () => {
    await setup();
    expect(mock.sessionHooks.has('prompt')).toBe(true);
    expect(mock.sessionHooks.has('context')).toBe(true);
    expect(mock.sessionHooks.has('compaction')).toBe(true);
    expect(mock.toolHooks.has('execute.before')).toBe(true);
  });

  const contextEvent = (agent = 'build', sessionID = 'ses-1') => ({
    sessionID,
    agent,
    system: [] as Array<{ type: string; text: string }>,
    messages: [],
  });
  const systemText = (event: { system: Array<{ text: string }> }) =>
    event.system.map(p => p.text).join('\n');

  it('never edits the visible user prompt', async () => {
    await setupWorkflowState(dir, {
      workflowName: 'epcc',
      currentPhase: 'explore',
    });
    await setup();
    const event = promptEvent('build something');
    await mock.sessionHooks.get('prompt')!(event);
    expect(event.prompt.text).toBe('build something');
  });

  it('adds the "no active workflow" notice to the system prompt', async () => {
    await setup();
    await mock.sessionHooks.get('prompt')!(promptEvent());
    const event = contextEvent();
    await mock.sessionHooks.get('context')!(event);
    expect(systemText(event)).toContain('No Active Workflow Detected');
  });

  it('adds nothing to the system prompt while a workflow is active', async () => {
    await setupWorkflowState(dir, {
      workflowName: 'epcc',
      currentPhase: 'explore',
    });
    await setup();
    await mock.sessionHooks.get('prompt')!(promptEvent());
    const event = contextEvent();
    await mock.sessionHooks.get('context')!(event);
    // phase instructions come with the tool results and after a compaction
    expect(event.system).toHaveLength(0);
  });

  it('adds the tool suppression notice for agents outside WORKFLOW_AGENTS', async () => {
    process.env.WORKFLOW_AGENTS = 'workflow';
    await setup();
    await mock.sessionHooks.get('prompt')!(promptEvent());
    const event = contextEvent('build');
    await mock.sessionHooks.get('context')!(event);
    expect(systemText(event)).toContain('are NOT available in this session');
  });

  it('uses the agent of the model call, so the default agent needs no guessing', async () => {
    process.env.WORKFLOW_AGENTS = 'workflow';
    await setup();
    await mock.sessionHooks.get('prompt')!(promptEvent());
    const event = contextEvent('workflow');
    await mock.sessionHooks.get('context')!(event);
    expect(systemText(event)).toContain('No Active Workflow Detected');
    expect(systemText(event)).not.toContain('are NOT available');
  });

  it('looks at the workflow state once per user message, not once per model call', async () => {
    await setup();
    await mock.sessionHooks.get('prompt')!(promptEvent());
    const first = contextEvent();
    await mock.sessionHooks.get('context')!(first);
    expect(systemText(first)).toContain('No Active Workflow Detected');

    // A workflow appears behind the plugin's back (e.g. via the MCP server)
    await setupWorkflowState(dir, {
      workflowName: 'epcc',
      currentPhase: 'explore',
    });
    const sameMessage = contextEvent();
    await mock.sessionHooks.get('context')!(sameMessage);
    expect(systemText(sameMessage)).toContain('No Active Workflow Detected');

    // The next user message looks again
    await mock.sessionHooks.get('prompt')!(promptEvent());
    const nextMessage = contextEvent();
    await mock.sessionHooks.get('context')!(nextMessage);
    expect(nextMessage.system).toHaveLength(0);
  });

  it('drops the "no workflow" notice right after start_development ran', async () => {
    await setup();
    await mock.sessionHooks.get('prompt')!(promptEvent());
    const before = contextEvent();
    await mock.sessionHooks.get('context')!(before);
    expect(systemText(before)).toContain('No Active Workflow Detected');

    await mock.tools.get('start_development').execute(
      { workflow: 'epcc' },
      {
        sessionID: 'ses-1',
        agent: 'build',
        messageID: 'm',
        id: 'c',
        signal: new AbortController().signal,
        progress: async () => {},
      }
    );

    // same user message, next model call in the tool loop
    const after = contextEvent();
    await mock.sessionHooks.get('context')!(after);
    expect(after.system).toHaveLength(0);
  });

  it('blocks edits to disallowed files via execute.before', async () => {
    await setupWorkflowState(dir, {
      workflowName: 'epcc',
      currentPhase: 'explore',
    });
    await setup();
    const before = mock.toolHooks.get('execute.before')!;

    await expect(
      before({
        tool: 'write',
        sessionID: 'ses-1',
        agent: 'build',
        input: { filePath: '/x/src/file.ts', content: 'x' },
      })
    ).rejects.toThrow('BLOCKED:');

    await expect(
      before({
        tool: 'write',
        sessionID: 'ses-1',
        agent: 'build',
        input: { filePath: '/x/notes.md', content: 'x' },
      })
    ).resolves.toBeUndefined();

    // Non-edit tools are never blocked
    await expect(
      before({ tool: 'read', sessionID: 'ses-1', agent: 'build', input: {} })
    ).resolves.toBeUndefined();
  });

  it('adds workflow guidance to the compaction system prompt', async () => {
    await setupWorkflowState(dir, {
      workflowName: 'epcc',
      currentPhase: 'explore',
    });
    await setup();
    const event = { sessionID: 'ses-1', system: [] as any[] };
    await mock.sessionHooks.get('compaction')!(event);
    const text = event.system.map(p => p.text).join('\n');
    expect(text).toContain('Preserve:');
    expect(text).toContain('Current workflow phase: explore');
  });

  it('asks permission with the V2 assert shape before running a tool', async () => {
    await setup();
    const tool = mock.tools.get('conduct_review');
    await tool.execute(
      { target_phase: 'plan' },
      {
        sessionID: 'ses-1',
        agent: 'build',
        messageID: 'msg-9',
        id: 'call-9',
        signal: new AbortController().signal,
        progress: async () => {},
      }
    );
    expect(mock.ctx.permission.assert).toHaveBeenCalledWith({
      sessionID: 'ses-1',
      agent: 'build',
      action: 'conduct_review',
      resources: ['target_phase: plan'],
      save: ['*'],
      metadata: { target_phase: 'plan' },
      source: { type: 'tool', messageID: 'msg-9', id: 'call-9' },
    });
  });

  it('returns tool output as {content:[{type:"text"}]}', async () => {
    await setup();
    const result = await mock.tools.get('conduct_review').execute(
      { target_phase: 'plan' },
      {
        sessionID: 'ses-1',
        agent: 'build',
        messageID: 'm',
        id: 'c',
        signal: new AbortController().signal,
        progress: async () => {},
      }
    );
    expect(result.content[0].type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
  });

  it('rejects workflow tools for subagents', async () => {
    await setup();
    await expect(
      mock.tools.get('start_development').execute(
        { workflow: 'epcc' },
        {
          sessionID: 'ses-1',
          agent: 'explore',
          messageID: 'm',
          id: 'c',
          signal: new AbortController().signal,
          progress: async () => {},
        }
      )
    ).rejects.toThrow(/subagent/i);
  });

  it('rejects workflow tools for agents outside WORKFLOW_AGENTS', async () => {
    process.env.WORKFLOW_AGENTS = 'workflow';
    await setup();
    await expect(
      mock.tools.get('conduct_review').execute(
        { target_phase: 'plan' },
        {
          sessionID: 'ses-1',
          agent: 'build',
          messageID: 'm',
          id: 'c',
          signal: new AbortController().signal,
          progress: async () => {},
        }
      )
    ).rejects.toThrow('Workflows are not enabled for this agent');
  });

  it('triggers session.compact after proceed_to_phase (queued) and skips it when disabled', async () => {
    await setupWorkflowState(dir, {
      workflowName: 'epcc',
      currentPhase: 'explore',
    });
    await setup();
    const call = () =>
      mock.tools.get('proceed_to_phase').execute(
        { target_phase: 'plan', reason: 'done' },
        {
          sessionID: 'ses-1',
          agent: 'build',
          messageID: 'm',
          id: 'c',
          signal: new AbortController().signal,
          progress: async () => {},
        }
      );

    await call();
    await vi.waitFor(() =>
      expect(mock.ctx.session.compact).toHaveBeenCalledWith({
        sessionID: 'ses-1',
        delivery: 'queue',
      })
    );

    mock.ctx.session.compact.mockClear();
    process.env.WORKFLOW_AUTO_COMPACT = 'false';
    await call();
    await new Promise(r => setTimeout(r, 20));
    expect(mock.ctx.session.compact).not.toHaveBeenCalled();
  });

  it('queues the phase instructions as a message when compaction ends', async () => {
    await setupWorkflowState(dir, {
      workflowName: 'epcc',
      currentPhase: 'explore',
    });
    process.env.WORKFLOW_AGENTS = 'workflow';
    await setup();
    await mock.sessionHooks.get('context')!(contextEvent('workflow'));
    // the compaction hook prepares the text while the request is built
    await mock.sessionHooks.get('compaction')!({
      sessionID: 'ses-1',
      system: [],
    });

    mock.emit({
      type: 'session.compaction.ended',
      data: { sessionID: 'ses-1', reason: 'manual' },
    });

    await vi.waitFor(() => expect(mock.ctx.session.prompt).toHaveBeenCalled());
    const arg = mock.ctx.session.prompt.mock.calls[0][0];
    expect(arg.sessionID).toBe('ses-1');
    expect(arg.delivery).toBe('queue');
    expect(arg.text).not.toBe('Continue with the current phase.');
    expect(arg.text.length).toBeGreaterThan(100);
    expect(mock.ctx.session.switchAgent).not.toHaveBeenCalled();
  });

  it('falls back to a short continue when there is no workflow', async () => {
    await setup();
    mock.emit({
      type: 'session.compaction.ended',
      data: { sessionID: 'ses-1', reason: 'manual' },
    });
    await vi.waitFor(() => expect(mock.ctx.session.prompt).toHaveBeenCalled());
    expect(mock.ctx.session.prompt.mock.calls[0][0].text).toBe(
      'Continue with the current phase.'
    );
  });

  it('sends the instructions once, not with later messages', async () => {
    await setupWorkflowState(dir, {
      workflowName: 'epcc',
      currentPhase: 'explore',
    });
    await setup();
    mock.emit({
      type: 'session.compaction.ended',
      data: { sessionID: 'ses-1', reason: 'manual' },
    });
    await vi.waitFor(() => expect(mock.ctx.session.prompt).toHaveBeenCalled());

    await mock.sessionHooks.get('prompt')!(promptEvent());
    const event = contextEvent();
    await mock.sessionHooks.get('context')!(event);
    expect(event.system).toHaveLength(0);
    expect(mock.ctx.session.prompt).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from events on cleanup', async () => {
    await setup();
    expect(typeof cleanup).toBe('function');
    const signal = (mock.ctx.event.subscribe.mock.calls[0] as any[])[0].signal;
    expect(signal.aborted).toBe(false);
    (cleanup as () => void)();
    expect(signal.aborted).toBe(true);
    cleanup = undefined;
  });
});
