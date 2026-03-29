/**
 * BeadsPlanSyncer Integration Tests
 *
 * Uses real temp directories and real file I/O — no mocks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { BeadsPlanSyncer } from '../../src/components/beads/beads-plan-syncer.js';

vi.unmock('fs');
vi.unmock('fs/promises');

// ── helpers ──────────────────────────────────────────────────────────────────

function issuesJsonl(
  issues: Array<{
    id: string;
    title: string;
    status: string;
    parentId?: string;
  }>
): string {
  return issues
    .map(({ id, title, status, parentId }) => {
      const issue = {
        id,
        title,
        status,
        dependencies: parentId
          ? [{ issue_id: id, depends_on_id: parentId, type: 'parent-child' }]
          : [],
      };
      return JSON.stringify(issue);
    })
    .join('\n');
}

const TODAY = new Date().toISOString().split('T')[0];

// ── fixture plan content ──────────────────────────────────────────────────────

const PLAN_WITH_TWO_PHASES = `# Development Plan

## Requirements
<!-- beads-phase-id: proj-1.1 -->

### Goal
Gather requirements.

### Tasks
*Tasks managed via \`bd\` CLI*

## Design
<!-- beads-phase-id: proj-1.2 -->

### Goal
Design the solution.

### Tasks
*Tasks managed via \`bd\` CLI*
`;

const PLAN_WITH_TBD_PHASE = `# Development Plan

## Requirements
<!-- beads-phase-id: TBD -->

### Tasks
*Tasks managed via \`bd\` CLI*
`;

const PLAN_NO_PHASE_IDS = `# Development Plan

## Requirements

### Tasks
*Tasks managed via \`bd\` CLI*
`;

// ── setup / teardown ──────────────────────────────────────────────────────────

let tempDir: string;
let syncer: BeadsPlanSyncer;

beforeEach(async () => {
  tempDir = join(process.cwd(), `beads-syncer-test-${Date.now()}`);
  await mkdir(join(tempDir, '.beads'), { recursive: true });
  syncer = new BeadsPlanSyncer();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ── helpers to read/write within tempDir ──────────────────────────────────────

async function writePlan(content: string): Promise<string> {
  const path = join(tempDir, 'plan.md');
  await writeFile(path, content, 'utf-8');
  return path;
}

async function writeIssues(content: string): Promise<void> {
  await writeFile(join(tempDir, '.beads', 'issues.jsonl'), content, 'utf-8');
}

async function readPlan(path: string): Promise<string> {
  return readFile(path, 'utf-8');
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('BeadsPlanSyncer', () => {
  describe('happy path — tasks are written to the plan file', () => {
    it('replaces the Tasks section with open and closed task checkboxes', async () => {
      const planPath = await writePlan(PLAN_WITH_TWO_PHASES);
      await writeIssues(
        issuesJsonl([
          {
            id: 'proj-1.1.1',
            title: 'Collect user stories',
            status: 'closed',
            parentId: 'proj-1.1',
          },
          {
            id: 'proj-1.1.2',
            title: 'Write acceptance criteria',
            status: 'open',
            parentId: 'proj-1.1',
          },
          {
            id: 'proj-1.1.3',
            title: 'Review with stakeholders',
            status: 'in_progress',
            parentId: 'proj-1.1',
          },
        ])
      );

      await syncer.sync(planPath, tempDir);

      const result = await readPlan(planPath);
      expect(result).toContain(`<!-- beads-synced: ${TODAY} -->`);
      expect(result).toContain(
        '*Auto-synced — do not edit here, use `bd` CLI instead.*'
      );
      expect(result).toContain('- [x] `proj-1.1.1` Collect user stories');
      expect(result).toContain('- [ ] `proj-1.1.2` Write acceptance criteria');
      expect(result).toContain('- [ ] `proj-1.1.3` Review with stakeholders');
    });

    it('only writes children of the correct phase (no cross-contamination)', async () => {
      const planPath = await writePlan(PLAN_WITH_TWO_PHASES);
      await writeIssues(
        issuesJsonl([
          {
            id: 'proj-1.1.1',
            title: 'Requirements task',
            status: 'open',
            parentId: 'proj-1.1',
          },
          {
            id: 'proj-1.2.1',
            title: 'Design task',
            status: 'open',
            parentId: 'proj-1.2',
          },
        ])
      );

      await syncer.sync(planPath, tempDir);

      const result = await readPlan(planPath);

      // Requirements section must contain only its own child
      const reqSection = result.split('## Design')[0];
      expect(reqSection).toContain('proj-1.1.1');
      expect(reqSection).not.toContain('proj-1.2.1');

      // Design section must contain only its own child
      const designSection = result.split('## Design')[1];
      expect(designSection).toContain('proj-1.2.1');
      expect(designSection).not.toContain('proj-1.1.1');
    });

    it('writes placeholder text when a phase has no child tasks', async () => {
      const planPath = await writePlan(PLAN_WITH_TWO_PHASES);
      // JSONL has tasks only for proj-1.1, nothing for proj-1.2
      await writeIssues(
        issuesJsonl([
          {
            id: 'proj-1.1.1',
            title: 'Requirements task',
            status: 'open',
            parentId: 'proj-1.1',
          },
        ])
      );

      await syncer.sync(planPath, tempDir);

      const result = await readPlan(planPath);
      expect(result).toContain(`<!-- beads-synced: ${TODAY} -->`);
      expect(result).toContain(
        '*Auto-synced — do not edit here, use `bd` CLI instead.*'
      );
    });

    it('is idempotent — re-syncing produces the same output', async () => {
      const planPath = await writePlan(PLAN_WITH_TWO_PHASES);
      await writeIssues(
        issuesJsonl([
          {
            id: 'proj-1.1.1',
            title: 'Task one',
            status: 'closed',
            parentId: 'proj-1.1',
          },
        ])
      );

      await syncer.sync(planPath, tempDir);
      const firstSync = await readPlan(planPath);

      await syncer.sync(planPath, tempDir);
      const secondSync = await readPlan(planPath);

      expect(secondSync).toBe(firstSync);
    });

    it('updates task status on re-sync after a task is closed', async () => {
      const planPath = await writePlan(PLAN_WITH_TWO_PHASES);
      await writeIssues(
        issuesJsonl([
          {
            id: 'proj-1.1.1',
            title: 'Task one',
            status: 'open',
            parentId: 'proj-1.1',
          },
        ])
      );
      await syncer.sync(planPath, tempDir);
      expect(await readPlan(planPath)).toContain('- [ ] `proj-1.1.1`');

      // Simulate bd close: rewrite JSONL with status=closed
      await writeIssues(
        issuesJsonl([
          {
            id: 'proj-1.1.1',
            title: 'Task one',
            status: 'closed',
            parentId: 'proj-1.1',
          },
        ])
      );
      await syncer.sync(planPath, tempDir);
      expect(await readPlan(planPath)).toContain('- [x] `proj-1.1.1`');
    });
  });

  describe('graceful no-ops', () => {
    it('does nothing when issues.jsonl is absent', async () => {
      const planPath = await writePlan(PLAN_WITH_TWO_PHASES);
      // No issues.jsonl written

      await syncer.sync(planPath, tempDir);

      // Plan file must be unchanged
      expect(await readPlan(planPath)).toBe(PLAN_WITH_TWO_PHASES);
    });

    it('does nothing when the plan file does not exist', async () => {
      await writeIssues(
        issuesJsonl([
          {
            id: 'proj-1.1.1',
            title: 'Task one',
            status: 'open',
            parentId: 'proj-1.1',
          },
        ])
      );
      const missingPlan = join(tempDir, 'nonexistent-plan.md');

      // Must not throw
      await expect(syncer.sync(missingPlan, tempDir)).resolves.toBeUndefined();
    });

    it('skips phases whose beads-phase-id is TBD', async () => {
      const planPath = await writePlan(PLAN_WITH_TBD_PHASE);
      await writeIssues(
        issuesJsonl([
          {
            id: 'proj-1.1.1',
            title: 'Some task',
            status: 'open',
            parentId: 'TBD',
          },
        ])
      );

      await syncer.sync(planPath, tempDir);

      // Plan file must be unchanged — TBD phases are not synced
      expect(await readPlan(planPath)).toBe(PLAN_WITH_TBD_PHASE);
    });

    it('does nothing when the plan has no beads-phase-id markers at all', async () => {
      const planPath = await writePlan(PLAN_NO_PHASE_IDS);
      await writeIssues(
        issuesJsonl([
          {
            id: 'proj-1.1.1',
            title: 'Some task',
            status: 'open',
            parentId: 'proj-1.1',
          },
        ])
      );

      await syncer.sync(planPath, tempDir);

      expect(await readPlan(planPath)).toBe(PLAN_NO_PHASE_IDS);
    });

    it('silently skips malformed JSONL lines and still syncs valid ones', async () => {
      const planPath = await writePlan(PLAN_WITH_TWO_PHASES);
      const mixed =
        '{"id":"proj-1.1.1","title":"Valid task","status":"open","dependencies":[{"issue_id":"proj-1.1.1","depends_on_id":"proj-1.1","type":"parent-child"}]}\n' +
        'NOT_VALID_JSON\n' +
        '{"id":"proj-1.1.2","title":"Another valid","status":"closed","dependencies":[{"issue_id":"proj-1.1.2","depends_on_id":"proj-1.1","type":"parent-child"}]}\n';
      await writeFile(join(tempDir, '.beads', 'issues.jsonl'), mixed, 'utf-8');

      await syncer.sync(planPath, tempDir);

      const result = await readPlan(planPath);
      expect(result).toContain('- [ ] `proj-1.1.1` Valid task');
      expect(result).toContain('- [x] `proj-1.1.2` Another valid');
    });
  });
});
