/**
 * Phase-Specific Task ID Integration Tests for BeadsPlugin
 *
 * Tests that validate BeadsPlugin's afterInstructionsGenerated hook ability to
 * extract phase task IDs from plan files and integrate them properly into bd commands.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BeadsPlugin } from '../../src/plugin-system/beads-plugin.js';
import type {
  PluginHookContext,
  GeneratedInstructions,
} from '../../src/plugin-system/plugin-interfaces.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

describe('Phase-Specific Task ID Integration Tests', () => {
  let beadsPlugin: BeadsPlugin;
  let afterInstructionsGenerated: (
    context: PluginHookContext,
    instructions: GeneratedInstructions
  ) => Promise<GeneratedInstructions>;
  let mockPluginContext: PluginHookContext;
  let testTempDir: string;
  let testPlanFilePath: string;

  beforeEach(async () => {
    // Create temporary directory for test files
    testTempDir = join(process.cwd(), 'temp-test-' + Date.now());
    await mkdir(testTempDir, { recursive: true });

    testPlanFilePath = join(testTempDir, 'plan.md');

    beadsPlugin = new BeadsPlugin({ projectPath: testTempDir });
    const hooks = beadsPlugin.getHooks();
    afterInstructionsGenerated = hooks.afterInstructionsGenerated!;

    // Set up mock plugin context
    mockPluginContext = {
      conversationId: 'test-conversation',
      planFilePath: testPlanFilePath,
      currentPhase: 'design',
      workflow: 'epcc',
      projectPath: testTempDir,
      gitBranch: 'main',
    };
  });

  afterEach(async () => {
    // Clean up temp files
    try {
      await rm(testTempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper to create GeneratedInstructions input for the hook
   */
  function createInstructions(
    baseInstructions: string,
    phase: string,
    instructionSource: 'whats_next' | 'proceed_to_phase' = 'whats_next',
    planFileExists: boolean = true
  ): GeneratedInstructions {
    return {
      instructions: baseInstructions,
      planFilePath: testPlanFilePath,
      phase,
      instructionSource,
      planFileExists,
    };
  }

  describe('Phase Task ID Extraction from Plan Files', () => {
    it('should extract phase task ID from properly formatted plan file', async () => {
      const planContent = `# Project Plan

## Explore
Some exploration tasks here.

## Design
<!-- beads-phase-id: project-epic-1.2 -->
- Design the system architecture
- Create wireframes
- Review requirements

## Implementation
Some implementation tasks here.
`;

      await writeFile(testPlanFilePath, planContent);

      const result = await afterInstructionsGenerated(
        { ...mockPluginContext, currentPhase: 'design' },
        createInstructions('Work on design tasks.', 'design')
      );

      // Should include specific phase task ID in commands
      expect(result.instructions).toContain('--parent project-epic-1.2');
      expect(result.instructions).toContain('bd create');
    });

    it('should handle phase task IDs with various formats', async () => {
      const testCases = [
        { id: 'epic-123', phase: 'design' },
        { id: 'project-1.2.3', phase: 'design' },
        { id: 'feature-456.1', phase: 'design' },
        { id: 'milestone-x', phase: 'design' },
      ];

      for (const testCase of testCases) {
        const planContent = `# Project Plan

## Design
<!-- beads-phase-id: ${testCase.id} -->
- Task 1
- Task 2
`;

        await writeFile(testPlanFilePath, planContent);

        const result = await afterInstructionsGenerated(
          { ...mockPluginContext, currentPhase: testCase.phase },
          createInstructions('Work on tasks.', testCase.phase)
        );

        expect(result.instructions).toContain(`--parent ${testCase.id}`);
      }
    });

    it('should handle missing phase task ID gracefully', async () => {
      const planContent = `# Project Plan

## Design
- Task 1
- Task 2
`;

      await writeFile(testPlanFilePath, planContent);

      const result = await afterInstructionsGenerated(
        mockPluginContext,
        createInstructions('Work on tasks.', 'design')
      );

      // Should still generate valid instructions with generic placeholder
      expect(result.instructions).toContain('bd');
    });

    it('should handle non-existent plan file gracefully', async () => {
      // Don't create the plan file

      const result = await afterInstructionsGenerated(
        mockPluginContext,
        createInstructions('Work on tasks.', 'design', 'whats_next', false)
      );

      // Should still generate valid instructions
      expect(result.instructions).toContain('bd');
    });

    it('should match correct phase when multiple phases have task IDs', async () => {
      const planContent = `# Project Plan

## Explore
<!-- beads-phase-id: explore-task-1 -->
- Explore task 1

## Design
<!-- beads-phase-id: design-task-2 -->
- Design task 1

## Code
<!-- beads-phase-id: code-task-3 -->
- Code task 1
`;

      await writeFile(testPlanFilePath, planContent);

      // Test design phase
      const designResult = await afterInstructionsGenerated(
        { ...mockPluginContext, currentPhase: 'design' },
        createInstructions('Work on design.', 'design')
      );
      expect(designResult.instructions).toContain('design-task-2');
      expect(designResult.instructions).not.toContain('explore-task-1');
      expect(designResult.instructions).not.toContain('code-task-3');

      // Test code phase
      const codeResult = await afterInstructionsGenerated(
        { ...mockPluginContext, currentPhase: 'code' },
        createInstructions('Work on code.', 'code')
      );
      expect(codeResult.instructions).toContain('code-task-3');
      expect(codeResult.instructions).not.toContain('explore-task-1');
      expect(codeResult.instructions).not.toContain('design-task-2');
    });
  });

  describe('Beads-Specific Content', () => {
    it('should include plan file guidance', async () => {
      await writeFile(testPlanFilePath, '# Plan');

      const result = await afterInstructionsGenerated(
        mockPluginContext,
        createInstructions('Base instructions.', 'design')
      );

      expect(result.instructions).toContain('Log decisions');
    });

    it('should include beads-specific reminders', async () => {
      await writeFile(testPlanFilePath, '# Plan');

      const result = await afterInstructionsGenerated(
        mockPluginContext,
        createInstructions('Base instructions.', 'design')
      );

      expect(result.instructions).toContain('bd');
      expect(result.instructions).toContain('whats_next()');
    });

    it('should only generate task guidance for whats_next source', async () => {
      await writeFile(
        testPlanFilePath,
        '# Plan\n## Design\n<!-- beads-phase-id: task-1 -->'
      );

      const whatsNextResult = await afterInstructionsGenerated(
        mockPluginContext,
        createInstructions('Base.', 'design', 'whats_next')
      );

      const proceedResult = await afterInstructionsGenerated(
        mockPluginContext,
        createInstructions('Base.', 'design', 'proceed_to_phase')
      );

      // whats_next should have detailed task guidance
      expect(whatsNextResult.instructions).toContain('bd list --parent task-1');

      // proceed_to_phase should not have detailed task guidance
      expect(proceedResult.instructions).not.toContain(
        'bd list --parent task-1'
      );
    });

    it('should preserve base instructions', async () => {
      await writeFile(testPlanFilePath, '# Plan');

      const baseInstructions =
        'These are the original instructions from the workflow.';
      const result = await afterInstructionsGenerated(
        mockPluginContext,
        createInstructions(baseInstructions, 'design')
      );

      expect(result.instructions).toContain(baseInstructions);
    });
  });

  describe('Phase Name Capitalization', () => {
    it('should handle snake_case phase names', async () => {
      const planContent = `# Project Plan

## Red Phase
<!-- beads-phase-id: red-task -->
Tasks here
`;

      await writeFile(testPlanFilePath, planContent);

      const result = await afterInstructionsGenerated(
        { ...mockPluginContext, currentPhase: 'red_phase' },
        createInstructions('Work on red phase.', 'red_phase')
      );

      expect(result.instructions).toContain('red-task');
    });

    it('should handle simple phase names', async () => {
      const planContent = `# Project Plan

## Design
<!-- beads-phase-id: design-task -->
Tasks here
`;

      await writeFile(testPlanFilePath, planContent);

      const result = await afterInstructionsGenerated(
        { ...mockPluginContext, currentPhase: 'design' },
        createInstructions('Work on design.', 'design')
      );

      expect(result.instructions).toContain('design-task');
    });
  });
});
