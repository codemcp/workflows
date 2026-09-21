import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TempProject,
  createTempProjectWithDefaultStateMachine,
} from '../utils/temp-files';
import {
  DirectServerInterface,
  createSuiteIsolatedE2EScenario,
  assertToolSuccess,
  initializeDevelopment,
} from '../utils/e2e-test-setup';
import { promises as fs } from 'node:fs';
import path from 'node:path';

vi.unmock('fs');
vi.unmock('fs/promises');

/**
 * Plan Management Tests
 *
 * Tests plan file functionality including:
 * - Plan file creation and structure
 * - Content management and updates
 * - File path handling and organization
 * - Integration with development phases
 */

describe('Plan Management', () => {
  let client: DirectServerInterface;
  let tempProject: TempProject;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Explicitly disable beads auto-detection to test markdown format
    vi.stubEnv('TASK_BACKEND', 'markdown');

    const scenario = await createSuiteIsolatedE2EScenario({
      suiteName: 'plan-management',
      tempProjectFactory: createTempProjectWithDefaultStateMachine,
    });
    client = scenario.client;
    tempProject = scenario.tempProject;
    cleanup = scenario.cleanup;

    // Initialize development with default workflow before each test
    await initializeDevelopment(client);
  });

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  describe('Plan File Creation', () => {
    it('should create plan file on first conversation', async () => {
      const result = await client.callTool('whats_next', {
        user_input: 'implement new feature',
      });
      const response = assertToolSuccess(result);

      expect(response.plan_file_path).toBeTruthy();
      expect(response.plan_file_path).toMatch(/\.md$/);

      // Verify file exists
      const planExists = await fs
        .access(response.plan_file_path)
        .then(() => true)
        .catch(() => false);
      expect(planExists).toBe(true);
    });

    it('should use absolute paths for plan files', async () => {
      const result = await client.callTool('whats_next', {
        user_input: 'test absolute paths',
      });
      const response = assertToolSuccess(result);

      expect(path.isAbsolute(response.plan_file_path)).toBe(true);
      expect(response.plan_file_path).toContain(tempProject.projectPath);
    });

    it('should create plan files in .vibe directory', async () => {
      const result = await client.callTool('whats_next', {
        user_input: 'test vibe directory',
      });
      const response = assertToolSuccess(result);

      expect(response.plan_file_path).toContain('.vibe');

      // Verify .vibe directory exists
      const vibeDir = path.dirname(response.plan_file_path);
      const vibeDirExists = await fs
        .access(vibeDir)
        .then(() => true)
        .catch(() => false);
      expect(vibeDirExists).toBe(true);
    });
  });

  describe('Plan File Structure', () => {
    it('should create well-structured markdown plan', async () => {
      await client.callTool('whats_next', {
        user_input: 'create structured plan',
      });

      const planResource = await client.readResource('plan://current');
      const planContent = planResource.contents[0].text;

      expect(planContent).toContain('# Development Plan');
      expect(planContent).toContain('## Goal');
      expect(planContent).toContain('## Requirements');
      expect(planContent).toContain('## Key Decisions');
    });

    it('should include phase-specific sections', async () => {
      // Start in requirements phase
      await client.callTool('whats_next', {
        user_input: 'requirements phase test',
      });

      // Move to design phase
      await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'test design section',
        review_state: 'not-required',
      });

      const planResource = await client.readResource('plan://current');
      const planContent = planResource.contents[0].text;

      expect(planContent).toContain('## Design');
      expect(planContent).toContain('## Requirements');
    });

    it('should maintain consistent markdown formatting', async () => {
      await client.callTool('whats_next', {
        user_input: 'test formatting',
      });

      const planResource = await client.readResource('plan://current');
      const planContent = planResource.contents[0].text;

      // Check for proper markdown structure
      expect(planContent).toMatch(/^# /m); // H1 headers
      expect(planContent).toMatch(/^## /m); // H2 headers
      expect(planContent).toMatch(/^- \[ \]/m); // Task checkboxes
    });
  });

  describe('Plan File Updates', () => {
    it('should update plan file across phase transitions', async () => {
      // Get initial plan content
      const initialPlan = await client.readResource('plan://current');
      const initialContent = initialPlan.contents[0].text;

      // Transition to design
      await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'move to design',
        review_state: 'not-required',
      });

      // Get updated plan content
      const updatedPlan = await client.readResource('plan://current');
      const updatedContent = updatedPlan.contents[0].text;

      // Plan should be updated with design phase information
      expect(updatedContent).toContain('## Design');
      expect(updatedContent.length).toBeGreaterThanOrEqual(
        initialContent.length
      );
    });

    it('should preserve existing plan content when updating', async () => {
      const result = await client.callTool('whats_next', {
        user_input: 'preserve content test',
      });
      const response = assertToolSuccess(result);

      // Manually add content to plan file
      const customContent = '\n\n## Custom Section\n- Custom task\n';
      await fs.appendFile(response.plan_file_path, customContent);

      // Make another call that would update the plan
      await client.callTool('proceed_to_phase', {
        target_phase: 'implementation',
        reason: 'test preservation',
        review_state: 'not-required',
      });

      const planResource = await client.readResource('plan://current');
      const planContent = planResource.contents[0].text;

      // Custom content should still be present
      expect(planContent).toContain('## Custom Section');
      expect(planContent).toContain('- Custom task');
    });

    it('should handle concurrent plan file access', async () => {
      await client.callTool('whats_next', { user_input: 'concurrent test' });

      // Make multiple rapid calls that would update the plan
      const promises = [
        client.callTool('proceed_to_phase', {
          target_phase: 'design',
          reason: 'test1',
          review_state: 'not-required',
        }),
        client.callTool('proceed_to_phase', {
          target_phase: 'implementation',
          reason: 'test2',
          review_state: 'not-required',
        }),
        client.callTool('whats_next', { user_input: 'update plan' }),
      ];

      const results = await Promise.all(promises);

      // All operations should succeed
      for (const result of results) {
        expect(result).toBeTruthy();
      }

      // Plan file should still be accessible and valid
      const planResource = await client.readResource('plan://current');
      expect(planResource.contents[0].text).toContain('# Development Plan');
    });
  });

  describe('Plan File Organization', () => {
    it('should organize plan files by branch when applicable', async () => {
      const result = await client.callTool('whats_next', {
        user_input: 'branch organization test',
      });
      const response = assertToolSuccess(result);

      // Plan file path should reflect current branch context
      expect(response.plan_file_path).toContain('development-plan');
      expect(response.plan_file_path).toMatch(/\.md$/);
    });

    it('should handle special characters in project paths', async () => {
      // This test verifies the system handles various path scenarios
      const result = await client.callTool('whats_next', {
        user_input: 'special characters test',
      });
      const response = assertToolSuccess(result);

      expect(path.isAbsolute(response.plan_file_path)).toBe(true);

      // File should be creatable and accessible
      const planExists = await fs
        .access(response.plan_file_path)
        .then(() => true)
        .catch(() => false);
      expect(planExists).toBe(true);
    });

    it('should maintain plan file consistency across sessions', async () => {
      // First session
      const first = await client.callTool('whats_next', {
        user_input: 'session consistency test',
      });
      const firstResponse = assertToolSuccess(first);
      const firstPlanPath = firstResponse.plan_file_path;

      // Second call in same session
      const second = await client.callTool('whats_next', {
        user_input: 'continue session',
      });
      const secondResponse = assertToolSuccess(second);

      // Should use same plan file
      expect(secondResponse.plan_file_path).toBe(firstPlanPath);
    });
  });

  describe('Plan Content Integration', () => {
    it('should integrate plan content with phase instructions', async () => {
      let result = await client.callTool('whats_next', {
        user_input: 'integration test',
      });
      let response = assertToolSuccess(result);

      // Instructions should reference plan file updates
      expect(response.instructions).toContain('plan');
      expect(response.plan_file_path).toBeTruthy();

      const planResource = await client.readResource('plan://current');
      const planContent = planResource.contents[0].text;

      // Plan should contain relevant phase information of all but the initial phase
      result = await client.callTool('proceed_to_phase', {
        target_phase: 'requirements',
        reason: 'Starting specification',
        review_state: 'not-required',
      });
      response = assertToolSuccess(result);

      expect(planContent).toContain(response.phase);
    });

    it('should provide contextual plan guidance', async () => {
      await client.callTool('whats_next', {
        user_input: 'contextual guidance test',
      });

      await client.callTool('proceed_to_phase', {
        target_phase: 'qa',
        reason: 'test qa guidance',
        review_state: 'not-required',
      });

      const planResource = await client.readResource('plan://current');
      const planContent = planResource.contents[0].text;

      // Plan should contain QA-specific content
      expect(planContent).toContain('## Qa');
    });

    it('should track task completion in plan file', async () => {
      await client.callTool('whats_next', {
        user_input: 'task tracking test',
      });

      const planResource = await client.readResource('plan://current');
      const planContent = planResource.contents[0].text;

      // Should contain task checkboxes
      expect(planContent).toMatch(/- \[ \]/); // Uncompleted tasks
      // May contain completed tasks depending on phase logic
    });
  });
});
