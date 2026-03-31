import { describe, it, expect, beforeEach } from 'vitest';
import { InstructionGenerator } from '../../src/instruction-generator';
import type { InstructionContext } from '../../src/interfaces/instruction-generator.interface';
import type { ConversationContext } from '../../src/types';

describe('Markdown Backend Protection Tests', () => {
  let instructionGenerator: InstructionGenerator;
  let mockInstructionContext: InstructionContext;
  let mockConversationContext: ConversationContext;

  beforeEach(() => {
    instructionGenerator = new InstructionGenerator();

    // Set up mock contexts
    mockConversationContext = {
      conversationId: 'test-conversation',
      projectPath: '/test/project',
      planFilePath: '/test/project/.vibe/plan.md',
      gitBranch: 'main',
      currentPhase: 'design',
      workflowName: 'epcc',
    };

    mockInstructionContext = {
      phase: 'design',
      conversationContext: mockConversationContext,
      transitionReason: 'test',
      isModeled: false,
      instructionSource: 'whats_next',
    };
  });

  describe('Complete Markdown Structure Validation', () => {
    it('should generate complete markdown backend instruction structure', async () => {
      const result = await instructionGenerator.generateInstructions(
        'Work on design tasks.',
        mockInstructionContext
      );

      // Verify minimal markdown-specific elements are present
      expect(result.instructions).toContain('Read `');
      expect(result.instructions).toContain(
        mockConversationContext.planFilePath
      );
      expect(result.instructions).toContain('whats_next()');

      // Should NOT contain ANY beads-specific content
      expect(result.instructions).not.toContain('bd CLI');
      expect(result.instructions).not.toContain('bd create');
      expect(result.instructions).not.toContain('bd list');
    });

    it('should include correct plan file path in markdown instructions', async () => {
      const customPlanPath = '/custom/project/.vibe/custom-plan.md';
      const customContext = {
        ...mockInstructionContext,
        conversationContext: {
          ...mockConversationContext,
          planFilePath: customPlanPath,
        },
      };

      const result = await instructionGenerator.generateInstructions(
        'Test instructions',
        customContext
      );

      expect(result.instructions).toContain(`Read \`${customPlanPath}\``);
    });

    it('should customize markdown guidance based on phase', async () => {
      // Test design phase
      const designResult = await instructionGenerator.generateInstructions(
        'Design phase instructions',
        { ...mockInstructionContext, phase: 'design' }
      );

      expect(designResult.instructions).toContain('Design');

      // Test implementation phase
      const implResult = await instructionGenerator.generateInstructions(
        'Implementation phase instructions',
        { ...mockInstructionContext, phase: 'implementation' }
      );

      expect(implResult.instructions).toContain('Implementation');
    });
  });

  describe('Anti-Contamination Protection', () => {
    it('should never include beads instructions in markdown mode', async () => {
      const result = await instructionGenerator.generateInstructions(
        'Test instructions',
        mockInstructionContext
      );

      // Explicitly verify NO beads content
      const beadsTerms = [
        'bd CLI',
        'bd create',
        'bd list',
        'bd close',
        'beads',
        'BEADS',
      ];

      for (const term of beadsTerms) {
        expect(
          result.instructions,
          `Should not contain beads term: "${term}"`
        ).not.toContain(term);
      }
    });

    it('should never lose plan file references in markdown mode', async () => {
      const result = await instructionGenerator.generateInstructions(
        'Test instructions',
        mockInstructionContext
      );

      // Plan file path MUST be present
      expect(result.instructions).toContain(
        mockConversationContext.planFilePath
      );
    });

    it('should provide only markdown task management guidance', async () => {
      const result = await instructionGenerator.generateInstructions(
        'Test instructions',
        mockInstructionContext
      );

      // Verify markdown-specific task guidance
      expect(result.instructions).toContain('Read `');
      expect(result.instructions).toContain('whats_next()');

      // Verify NO beads task guidance
      expect(result.instructions).not.toContain('Use bd CLI tool exclusively');
    });
  });

  describe('Plan File Integration', () => {
    it('should handle non-existent plan file in markdown mode', async () => {
      const contextNoPlan = {
        ...mockInstructionContext,
      };

      const result = await instructionGenerator.generateInstructions(
        'Test instructions',
        contextNoPlan
      );

      // Should still reference plan file even if it doesn't exist
      expect(result.instructions).toContain('Read');
    });

    it('should maintain markdown structure regardless of backend availability', async () => {
      const result = await instructionGenerator.generateInstructions(
        'Test instructions with backend variations',
        mockInstructionContext
      );

      // Core markdown structure should always be present
      expect(result.instructions).toContain('Read `');
      expect(result.instructions).toContain(
        mockConversationContext.planFilePath
      );
    });
  });

  describe('Variable Substitution in Markdown Context', () => {
    it('should properly substitute variables in markdown mode', async () => {
      const instructionsWithVariables =
        'Review the design in $DESIGN_DOC and implement according to $ARCHITECTURE_DOC.';

      const result = await instructionGenerator.generateInstructions(
        instructionsWithVariables,
        mockInstructionContext
      );

      // Should contain substituted paths
      expect(result.instructions).toContain(
        '/test/project/.vibe/docs/design.md'
      );
      expect(result.instructions).toContain(
        '/test/project/.vibe/docs/architecture.md'
      );

      // Should still be in markdown format
      expect(result.instructions).not.toContain('bd CLI');
    });
  });

  describe('Markdown Mode Consistency', () => {
    it('should provide consistent markdown instructions across different phases', async () => {
      const phases = ['explore', 'plan', 'code', 'commit'];

      for (const phase of phases) {
        const context = { ...mockInstructionContext, phase };
        const result = await instructionGenerator.generateInstructions(
          `${phase} instructions`,
          context
        );

        // All phases should have consistent markdown structure
        expect(
          result.instructions,
          `Phase ${phase} should have plan file reference`
        ).toContain('Read');
        expect(
          result.instructions,
          `Phase ${phase} should not have beads content`
        ).not.toContain('bd CLI');
      }
    });

    it('should never accidentally switch to beads mode in markdown backend', async () => {
      const results = await Promise.all([
        instructionGenerator.generateInstructions(
          'Test 1',
          mockInstructionContext
        ),
        instructionGenerator.generateInstructions(
          'Test 2',
          mockInstructionContext
        ),
        instructionGenerator.generateInstructions(
          'Test 3',
          mockInstructionContext
        ),
      ]);

      for (let index = 0; index < results.length; index++) {
        const result = results[index];
        expect(
          result.instructions,
          `Result ${index + 1} should be markdown mode`
        ).toContain('Read');
        expect(
          result.instructions,
          `Result ${index + 1} should not have beads content`
        ).not.toContain('bd CLI');
      }
    });

    it('should handle stressful instruction generation patterns without mode switching', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await instructionGenerator.generateInstructions(
          `Sequential test ${i}`,
          mockInstructionContext
        );

        expect(
          result.instructions,
          `Sequential result ${i + 1} should be markdown mode`
        ).toContain('Read');
        expect(
          result.instructions,
          `Sequential result ${i + 1} should not have beads content`
        ).not.toContain('bd CLI');
      }
    });

    it('should maintain markdown backend protection even with beads-like instruction content', async () => {
      const trickInstructions =
        'Create a task database with bd-style commands.';

      const result = await instructionGenerator.generateInstructions(
        trickInstructions,
        mockInstructionContext
      );

      // Should still be markdown mode
      expect(result.instructions).toContain('Read');
      expect(result.instructions).not.toContain('bd CLI');

      // Original instructions should be preserved
      expect(result.instructions).toContain(trickInstructions);
    });

    it('should handle long complex instructions without corruption', async () => {
      const longInstructions = `
        This is a very long set of instructions that includes multiple paragraphs.
        The system should remain in markdown mode regardless of these requirements.
      `.trim();

      const result = await instructionGenerator.generateInstructions(
        longInstructions,
        mockInstructionContext
      );

      // Core markdown structure should be preserved
      expect(result.instructions).toContain('Read `');
      expect(result.instructions).toContain(
        mockConversationContext.planFilePath
      );
      expect(result.instructions).not.toContain('bd CLI');
    });
  });
});
