import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResponsibleVibeMCPServer } from '../packages/mcp-server/src/server.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { ServerTestHelper, MockDocsHelper } from '../utils/test-helpers.js';

describe('resume_workflow tool', () => {
  let server: ResponsibleVibeMCPServer;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await mkdtemp(join(tmpdir(), 'responsible-vibe-test-'));
    MockDocsHelper.addToProject(tempDir);

    server = await ServerTestHelper.createServer(tempDir);

    // Initialize development with waterfall workflow before testing
    await server.handleStartDevelopment({ workflow: 'waterfall' });
  });

  afterEach(async () => {
    await ServerTestHelper.cleanupServer(server);
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return comprehensive workflow resumption information', async () => {
    const result = await server.handleResumeWorkflow({});

    expect(result).toBeTypeOf('object');
    expect(result.workflow_status).toBeDefined();
    expect(result.plan_status).toBeDefined();
    expect(result.system_prompt).toBeDefined(); // Default: include system prompt
    expect(result.recommendations).toBeDefined();
    expect(result.generated_at).toBeDefined();
    expect(result.tool_version).toBeDefined();
  });

  it('should include workflow status information', async () => {
    const result = await server.handleResumeWorkflow({});

    const workflowStatus = result.workflow_status;
    expect(workflowStatus.current_phase).toBeTypeOf('string');
    expect(workflowStatus.project_path).toBe(tempDir);
    expect(workflowStatus.git_branch).toBeTypeOf('string');
    expect(workflowStatus.state_machine).toBeDefined();
  });

  it('should include plan status information', async () => {
    const result = await server.handleResumeWorkflow({});

    const planStatus = result.plan_status;
    expect(planStatus.exists).toBeTypeOf('boolean');
    expect(planStatus.path).toBeTypeOf('string');
    expect(planStatus.path).toContain('.vibe/development-plan');
  });

  it('should include system prompt by default', async () => {
    const result = await server.handleResumeWorkflow({});

    expect(result.system_prompt).toBeTypeOf('string');
    expect(result.system_prompt.length).toBeGreaterThan(500);
    expect(result.system_prompt).toContain('workflow-driven agent');
    expect(result.system_prompt).toContain('whats_next()');
  });

  it('should exclude system prompt when requested', async () => {
    const result = await server.handleResumeWorkflow({
      include_system_prompt: false,
    });

    expect(result.system_prompt).toBeNull();
  });

  it('should provide phase-specific recommendations', async () => {
    const result = await server.handleResumeWorkflow({});

    const recommendations = result.recommendations;
    expect(recommendations.immediate_actions).toBeInstanceOf(Array);
    expect(recommendations.immediate_actions.length).toBeGreaterThan(0);
    expect(recommendations.phase_guidance).toBeTypeOf('string');
    expect(recommendations.potential_issues).toBeInstanceOf(Array);

    // Should always recommend calling whats_next
    const hasWhatsNext = recommendations.immediate_actions.some(
      (action: string) => action.includes('whats_next')
    );
    expect(hasWhatsNext).toBe(true);
  });

  it('should analyze plan file content when available', async () => {
    // Create a mock plan file
    const planContent = `# Development Plan

## Implementation

### Tasks
- [x] Completed task 1
- [x] Completed task 2
- [ ] Active task 1
- [ ] Active task 2

## Decision Log
- Decision 1: Use TypeScript
- Decision 2: Use Vitest for testing
`;

    // Create .vibe directory and write plan file to expected location
    const planDir = join(tempDir, '.vibe');
    await mkdir(planDir, { recursive: true });
    await writeFile(join(planDir, 'development-plan-default.md'), planContent);

    const result = await server.handleResumeWorkflow({});

    const planStatus = result.plan_status;
    expect(planStatus.exists).toBe(true);
    expect(planStatus.analysis).toBeDefined();

    const analysis = planStatus.analysis;
    expect(analysis.active_tasks).toContain('Active task 1');
    expect(analysis.active_tasks).toContain('Active task 2');
    expect(analysis.completed_tasks).toContain('Completed task 1');
    expect(analysis.completed_tasks).toContain('Completed task 2');

    // Phase should come from database, not plan file
    expect(result.workflow_status.current_phase).toBeDefined();
    expect(result.workflow_status.current_phase).toBeTypeOf('string');
  });

  it('should handle missing plan file gracefully', async () => {
    // Create a custom test that mocks the plan manager to report no plan file
    const originalPlanManager = (server as unknown).components?.context
      ?.planManager;

    try {
      // Replace plan manager with a mock that reports no plan file
      if ((server as unknown).components?.context) {
        (server as unknown).components.context.planManager = {
          getPlanFileInfo: async () => ({
            exists: false,
            path: '/fake/path.md',
          }),
          ensurePlanFile: async () => {},
          setStateMachine: () => {},
        };
      }

      const result = await server.handleResumeWorkflow({});

      const planStatus = result.plan_status;
      expect(planStatus.exists).toBe(false);
      expect(planStatus.analysis).toBeNull();
    } finally {
      // Restore original plan manager
      if ((server as unknown).components?.context && originalPlanManager) {
        (server as unknown).components.context.planManager =
          originalPlanManager;
      }
    }
  });

  it('should provide different recommendations based on phase', async () => {
    // This test would ideally set up different phases and verify recommendations
    // For now, just verify the structure is correct
    const result = await server.handleResumeWorkflow({});

    const recommendations = result.recommendations;
    expect(recommendations.immediate_actions).toBeInstanceOf(Array);
    expect(recommendations.phase_guidance).toBeTypeOf('string');
    expect(recommendations.potential_issues).toBeInstanceOf(Array);
  });

  it('should handle errors gracefully', async () => {
    // This test ensures the method doesn't throw for any reasonable input
    await expect(server.handleResumeWorkflow({})).resolves.toBeDefined();
    await expect(
      server.handleResumeWorkflow({ include_system_prompt: true })
    ).resolves.toBeDefined();
    await expect(
      server.handleResumeWorkflow({ include_system_prompt: false })
    ).resolves.toBeDefined();
  });

  it('should include metadata in response', async () => {
    const result = await server.handleResumeWorkflow({});

    expect(result.generated_at).toBeTypeOf('string');
    expect(result.tool_version).toBeTypeOf('string');
    expect(new Date(result.generated_at)).toBeInstanceOf(Date);
  });
});
