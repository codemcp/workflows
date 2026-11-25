/**
 * Containerized E2E against real OpenCode 2.x (opt-in: pnpm test:e2e:container).
 *
 * Asserts on artifacts (requests the model received, files on disk), never on
 * model text: the LLM is a scripted mock.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MockLlm, type Step } from './mock-llm.js';
import {
  createProject,
  detectRuntime,
  readWorkflowState,
  runOpenCode,
  type Project,
} from './harness.js';

const runtime = detectRuntime();
const WORKFLOW_TOOLS = [
  'start_development',
  'proceed_to_phase',
  'conduct_review',
  'reset_development',
  'setup_project_docs',
  'load_workflows',
];

describe.skipIf(!runtime)('OpenCode 2.x container E2E', () => {
  const mock = new MockLlm();
  let port = 0;
  const projects: Project[] = [];

  beforeAll(async () => {
    port = await mock.start();
  });
  afterAll(async () => {
    await mock.stop();
  });
  afterEach(() => {
    while (projects.length) projects.pop()!.cleanup();
  });

  async function run(
    script: Step[],
    options: { env?: Record<string, string>; prompt?: string } = {}
  ) {
    mock.reset(script);
    const project = createProject(port, runtime!);
    projects.push(project);
    const result = await runOpenCode(
      runtime!,
      project,
      options.prompt ?? 'build something',
      { env: options.env }
    );
    const main = mock.requests.filter(r => r.kind === 'main');
    return { project, result, main, all: mock.requests };
  }

  const userText = (req: { messages: Array<{ role: string; text: string }> }) =>
    req.messages
      .filter(m => m.role === 'user')
      .map(m => m.text)
      .join('\n');
  const systemText = (req: {
    messages: Array<{ role: string; text: string }>;
  }) =>
    req.messages
      .filter(m => m.role === 'system')
      .map(m => m.text)
      .join('\n');
  const lastText = (req: { messages: Array<{ text: string }> }) =>
    req.messages[req.messages.length - 1]?.text ?? '';

  it('1. loads the plugin and offers the workflow tools directly', async () => {
    const { main } = await run([{ text: 'hi' }]);
    expect(main.length).toBeGreaterThan(0);
    for (const tool of WORKFLOW_TOOLS) {
      expect(main[0].tools).toContain(tool);
    }
  });

  it('2. injects the no-workflow notice, then starts a workflow linked to the session', async () => {
    const { project, main } = await run([
      { tool: 'start_development', args: { workflow: 'epcc' } },
      { text: 'done' },
    ]);

    // injected into the system prompt, never into the visible user message
    expect(systemText(main[0])).toContain('No Active Workflow Detected');
    expect(userText(main[0])).not.toContain('No Active Workflow Detected');
    expect(userText(main[0]).trim()).toBe('"build something"');

    // after start_development the notice is gone; the instructions came with
    // the tool result, not with every message
    expect(systemText(main[1])).not.toContain('No Active Workflow Detected');

    // tool result carries the phase instructions back to the model
    expect(main[1].messages.some(m => m.role === 'tool')).toBe(true);
    expect(lastText(main[1]).length).toBeGreaterThan(200);

    const state = readWorkflowState(project);
    expect(state?.workflowName).toBe('epcc');
    expect(state?.currentPhase).toBe('explore');
    expect(state?.sessionMetadata?.referenceId).toMatch(/^ses_/);
  });

  it('3. blocks edits outside the phase patterns and allows matching ones', async () => {
    const { project, main } = await run([
      { tool: 'start_development', args: { workflow: 'epcc' } },
      { tool: 'write', args: { path: 'src/blocked.ts', content: 'x' } },
      { tool: 'write', args: { path: 'notes.md', content: '# ok' } },
      { text: 'done' },
    ]);

    // request after the .ts write: tool result is the BLOCKED error
    expect(lastText(main[2])).toContain('BLOCKED');
    expect(fs.existsSync(path.join(project.dir, 'src', 'blocked.ts'))).toBe(
      false
    );
    // request after the .md write: succeeded
    expect(lastText(main[3])).not.toContain('BLOCKED');
    expect(fs.existsSync(path.join(project.dir, 'notes.md'))).toBe(true);
  });

  it('4. runs workflow tools under --auto (permission.assert resolves)', async () => {
    const { main } = await run([
      { tool: 'start_development', args: { workflow: 'epcc' } },
      { text: 'done' },
    ]);
    expect(lastText(main[1])).not.toMatch(/^Error/);
  });

  // The post-compaction message (phase instructions, queued after the
  // compaction) is not asserted here: `opencode run` exits before a queued
  // message is executed, so this harness cannot observe it. It is covered by
  // the unit tests and was verified interactively in the TUI.

  it('5. does not compact when WORKFLOW_AUTO_COMPACT=false', async () => {
    const { all } = await run(
      [
        { tool: 'start_development', args: { workflow: 'epcc' } },
        {
          tool: 'proceed_to_phase',
          args: { target_phase: 'plan', reason: 'explored' },
        },
        { text: 'done' },
      ],
      { env: { WORKFLOW_AUTO_COMPACT: 'false' } }
    );
    expect(all.filter(r => r.kind === 'compaction')).toHaveLength(0);
  });

  it('6. suppresses workflow tools for agents outside WORKFLOW_AGENTS', async () => {
    const { main } = await run(
      [
        { tool: 'start_development', args: { workflow: 'epcc' } },
        { text: 'x' },
      ],
      { env: { WORKFLOW_AGENTS: 'other' } }
    );
    expect(systemText(main[0])).toContain('are NOT available in this session');
    expect(userText(main[0])).not.toContain('are NOT available');
    expect(lastText(main[1])).toContain('not enabled for this agent');
  });

  it('6b. keeps the workflow active for an agent that IS in WORKFLOW_AGENTS', async () => {
    const { main } = await run([{ text: 'hi' }], {
      env: { WORKFLOW_AGENTS: 'build' },
    });
    expect(systemText(main[0])).toContain('No Active Workflow Detected');
    expect(systemText(main[0])).not.toContain('are NOT available');
  });
});
