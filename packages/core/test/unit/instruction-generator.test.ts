/**
 * Unit tests for InstructionGenerator
 *
 * Tests instruction generation and variable substitution functionality
 */

import { describe, it, expect, beforeEach, Mocked, vi } from 'vitest';
import { TestAccess } from '../utils/test-access.js';
import { InstructionGenerator } from '../../src/instruction-generator.js';
import { ProjectDocsManager } from '@codemcp/workflows-core';
import type { ConversationContext } from '../../src/types.js';
import type { InstructionContext } from '../../src/interfaces/instruction-generator.interface.js';
import { join } from 'node:path';

// Mock ProjectDocsManager
vi.mock('../../src/project-docs-manager.js');

describe('InstructionGenerator', () => {
  let instructionGenerator: InstructionGenerator;
  let mockProjectDocsManager: Mocked<ProjectDocsManager>;
  let testProjectPath: string;
  let mockConversationContext: ConversationContext;
  let mockInstructionContext: InstructionContext;

  beforeEach(() => {
    testProjectPath = '/test/project';

    // Mock ProjectDocsManager
    mockProjectDocsManager = {
      getVariableSubstitutions: vi.fn().mockReturnValue({
        $ARCHITECTURE_DOC: join(
          testProjectPath,
          '.vibe',
          'docs',
          'architecture.md'
        ),
        $REQUIREMENTS_DOC: join(
          testProjectPath,
          '.vibe',
          'docs',
          'requirements.md'
        ),
        $DESIGN_DOC: join(testProjectPath, '.vibe', 'docs', 'design.md'),
      }),
    } as unknown as Mocked<ProjectDocsManager>;

    // Create instruction generator and inject mocks
    instructionGenerator = new InstructionGenerator();
    TestAccess.injectMock(
      instructionGenerator,
      'projectDocsManager',
      mockProjectDocsManager
    );

    // Mock conversation context
    mockConversationContext = {
      projectPath: testProjectPath,
      planFilePath: join(testProjectPath, '.vibe', 'plan.md'),
      gitBranch: 'main',
      conversationId: 'test-conversation',
    } as ConversationContext;

    // Mock instruction context
    mockInstructionContext = {
      phase: 'design',
      conversationContext: mockConversationContext,
      transitionReason: 'Test transition',
      isModeled: false,
      instructionSource: 'whats_next',
    };
  });

  describe('generateInstructions', () => {
    it('should apply variable substitution to base instructions', async () => {
      const baseInstructions =
        'Review the architecture in $ARCHITECTURE_DOC and update requirements in $REQUIREMENTS_DOC.';

      const result = await instructionGenerator.generateInstructions(
        baseInstructions,
        mockInstructionContext
      );

      expect(result.instructions).toContain(
        join(testProjectPath, '.vibe', 'docs', 'architecture.md')
      );
      expect(result.instructions).toContain(
        join(testProjectPath, '.vibe', 'docs', 'requirements.md')
      );
      expect(result.instructions).not.toContain('$ARCHITECTURE_DOC');
      expect(result.instructions).not.toContain('$REQUIREMENTS_DOC');
    });

    it('should handle multiple occurrences of the same variable', async () => {
      const baseInstructions =
        'Check $DESIGN_DOC for details. Update $DESIGN_DOC with new information.';

      const result = await instructionGenerator.generateInstructions(
        baseInstructions,
        mockInstructionContext
      );

      const designDocPath = join(testProjectPath, '.vibe', 'docs', 'design.md');
      const occurrences = (
        result.instructions.match(
          new RegExp(designDocPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
        ) || []
      ).length;
      expect(occurrences).toBe(2);
      expect(result.instructions).not.toContain('$DESIGN_DOC');
    });

    it('should handle instructions with no variables', async () => {
      const baseInstructions = 'Continue with the current phase tasks.';

      const result = await instructionGenerator.generateInstructions(
        baseInstructions,
        mockInstructionContext
      );

      expect(result.instructions).toContain(
        'Continue with the current phase tasks.'
      );
      expect(
        mockProjectDocsManager.getVariableSubstitutions
      ).toHaveBeenCalledWith(testProjectPath, 'main');
    });

    it('should handle all three document variables', async () => {
      const baseInstructions =
        'Review $ARCHITECTURE_DOC, check $REQUIREMENTS_DOC, and update $DESIGN_DOC.';

      const result = await instructionGenerator.generateInstructions(
        baseInstructions,
        mockInstructionContext
      );

      expect(result.instructions).toContain(
        join(testProjectPath, '.vibe', 'docs', 'architecture.md')
      );
      expect(result.instructions).toContain(
        join(testProjectPath, '.vibe', 'docs', 'requirements.md')
      );
      expect(result.instructions).toContain(
        join(testProjectPath, '.vibe', 'docs', 'design.md')
      );
      expect(result.instructions).not.toContain('$ARCHITECTURE_DOC');
      expect(result.instructions).not.toContain('$REQUIREMENTS_DOC');
      expect(result.instructions).not.toContain('$DESIGN_DOC');
    });

    it('should preserve enhanced instruction structure', async () => {
      const baseInstructions = 'Work on design tasks using $DESIGN_DOC.';

      const result = await instructionGenerator.generateInstructions(
        baseInstructions,
        mockInstructionContext
      );

      // Should contain minimal workflow guidance
      expect(result.instructions).toContain('Read');
      expect(result.instructions).toContain('whats_next()');

      // Should contain substituted variable
      expect(result.instructions).toContain(
        join(testProjectPath, '.vibe', 'docs', 'design.md')
      );
    });

    it('should return correct metadata', async () => {
      const baseInstructions = 'Test instructions with $ARCHITECTURE_DOC.';

      const result = await instructionGenerator.generateInstructions(
        baseInstructions,
        mockInstructionContext
      );

      expect(result.metadata).toEqual({
        phase: 'design',
        planFilePath: join(testProjectPath, '.vibe', 'plan.md'),
        transitionReason: 'Test transition',
        isModeled: false,
      });
    });

    it('should handle special regex characters in variables', async () => {
      // Mock a variable with special characters (though unlikely in practice)
      mockProjectDocsManager.getVariableSubstitutions.mockReturnValue({
        '$TEST[DOC]': '/test/path/doc.md',
      });

      const baseInstructions = 'Check $TEST[DOC] for information.';

      const result = await instructionGenerator.generateInstructions(
        baseInstructions,
        mockInstructionContext
      );

      expect(result.instructions).toContain('/test/path/doc.md');
      expect(result.instructions).not.toContain('$TEST[DOC]');
    });
  });

  describe('variable substitution edge cases', () => {
    it('should handle empty substitutions', async () => {
      mockProjectDocsManager.getVariableSubstitutions.mockReturnValue({});

      const baseInstructions = 'Work on tasks without variables.';

      const result = await instructionGenerator.generateInstructions(
        baseInstructions,
        mockInstructionContext
      );

      expect(result.instructions).toContain('Work on tasks without variables.');
    });

    it('should handle variables that do not exist in instructions', async () => {
      const baseInstructions = 'Work on general tasks.';

      const result = await instructionGenerator.generateInstructions(
        baseInstructions,
        mockInstructionContext
      );

      expect(result.instructions).toContain('Work on general tasks.');
      expect(
        mockProjectDocsManager.getVariableSubstitutions
      ).toHaveBeenCalledWith(testProjectPath, 'main');
    });
  });
});
