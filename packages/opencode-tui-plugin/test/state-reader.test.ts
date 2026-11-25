import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  WORKFLOW_TOOLS,
  createAgentFilter,
  isWorkflowDisabled,
  parsePhasesFromYaml,
  readStateBySessionId,
} from '../state-reader.js';

describe('state-reader', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tui-state-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const writeState = (id: string, state: object) => {
    const d = path.join(dir, '.vibe', 'conversations', id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify(state));
  };

  it('parses ordered phase names from the states block only', () => {
    const yaml = [
      'name: demo',
      'initial_state: a',
      'states:',
      '  explore:',
      '    description: x',
      '  plan:',
      '    description: y',
      'metadata:',
      '  other:',
    ].join('\n');
    expect(parsePhasesFromYaml(yaml)).toEqual(['explore', 'plan']);
  });

  it('returns the state of the conversation linked to the session id', () => {
    writeState('a', {
      currentPhase: 'plan',
      workflowName: 'epcc',
      sessionMetadata: { referenceId: 'ses-1', createdAt: 'x' },
    });
    writeState('b', {
      currentPhase: 'code',
      workflowName: 'epcc',
      sessionMetadata: { referenceId: 'ses-2', createdAt: 'x' },
    });
    const result = readStateBySessionId(dir, 'ses-1');
    expect(result?.phase).toBe('plan');
    expect(result?.workflow).toBe('epcc');
  });

  it('never falls back to another session', () => {
    writeState('a', {
      currentPhase: 'plan',
      workflowName: 'epcc',
      sessionMetadata: { referenceId: 'ses-1', createdAt: 'x' },
    });
    expect(readStateBySessionId(dir, 'other')).toBeNull();
  });

  it('returns null without a .vibe directory', () => {
    expect(readStateBySessionId(dir, 'ses-1')).toBeNull();
  });

  it('resolves project-local workflow phases', () => {
    const wf = path.join(dir, '.vibe', 'workflows');
    fs.mkdirSync(wf, { recursive: true });
    fs.writeFileSync(
      path.join(wf, 'mine.yaml'),
      "name: 'mine'\nstates:\n  one:\n    description: a\n  two:\n    description: b\n"
    );
    writeState('a', {
      currentPhase: 'one',
      workflowName: 'mine',
      sessionMetadata: { referenceId: 'ses-1', createdAt: 'x' },
    });
    expect(readStateBySessionId(dir, 'ses-1')?.phases).toEqual(['one', 'two']);
  });

  it('rejects workflow names that could traverse paths', () => {
    writeState('a', {
      currentPhase: 'x',
      workflowName: '../../etc/passwd',
      sessionMetadata: { referenceId: 'ses-1', createdAt: 'x' },
    });
    expect(readStateBySessionId(dir, 'ses-1')?.phases).toEqual([]);
  });

  it('applies the WORKFLOW_AGENTS filter', () => {
    // '' (not undefined): undefined would fall back to process.env
    const all = createAgentFilter('');
    expect(all('anything')).toBe(true);
    const some = createAgentFilter(' Workflow , plan ');
    expect(some('workflow')).toBe(true);
    expect(some('PLAN')).toBe(true);
    expect(some('build')).toBe(false);
    expect(some(undefined)).toBe(false);
  });

  it('honors WORKFLOW=off', () => {
    expect(isWorkflowDisabled('off')).toBe(true);
    expect(isWorkflowDisabled('OFF')).toBe(true);
    expect(isWorkflowDisabled('')).toBe(false);
  });

  it('covers both direct and MCP-namespaced tool names', () => {
    expect(WORKFLOW_TOOLS.has('proceed_to_phase')).toBe(true);
    expect(WORKFLOW_TOOLS.has('workflows_proceed_to_phase')).toBe(true);
    expect(WORKFLOW_TOOLS.has('read')).toBe(false);
  });
});
