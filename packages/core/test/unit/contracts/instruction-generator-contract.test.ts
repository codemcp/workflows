/**
 * Instruction Generator Interface Contract Tests
 *
 * Tests that all InstructionGenerator implementations satisfy the interface contract.
 */

import { describe, it, expect } from 'vitest';
import {
  BaseInterfaceContract,
  ValidationHelpers,
  type MethodTestConfig,
  type ErrorTestConfig,
  type ImplementationRegistration,
} from './base-interface-contract.js';
import { ImplementationRegistry } from './implementation-registry.js';
import type {
  InstructionContext,
  GeneratedInstructions,
} from '../../../src/interfaces/instruction-generator.interface.js';
import type { ConversationContext } from '../../../src/types.js';
import { InstructionGenerator } from '../../../src/instruction-generator.js';

// Register implementations before creating contract tests
const existingImplementations =
  ImplementationRegistry.getInstructionGeneratorImplementations();

if (existingImplementations.length === 0) {
  ImplementationRegistry.registerInstructionGenerator({
    name: 'InstructionGenerator',
    description:
      'Core InstructionGenerator implementation for markdown-based task management',
    createInstance: () => {
      return new InstructionGenerator();
    },
  });
}

/**
 * Mock conversation context for testing
 */
const mockConversationContext: ConversationContext = {
  projectPath: '/test/project',
  planFilePath: '/test/project/.vibe/plan.md',
  gitBranch: 'main',
  conversationId: 'test-conversation-123',
  currentPhase: 'explore',
  workflowName: 'test-workflow',
};

/**
 * Mock instruction context for testing
 */
const mockInstructionContext: InstructionContext = {
  phase: 'explore',
  conversationContext: mockConversationContext,
  transitionReason: 'Starting exploration',
  isModeled: true,
  instructionSource: 'whats_next',
};

/**
 * Instruction Generator Contract Test Suite
 */
class InstructionGeneratorContract extends BaseInterfaceContract<InstructionGenerator> {
  protected interfaceName = 'IInstructionGenerator';

  protected getRequiredMethods(): string[] {
    return ['generateInstructions'];
  }

  protected getMethodTests(): MethodTestConfig[] {
    return [
      {
        methodName: 'generateInstructions',
        parameters: ['Base instructions for testing', mockInstructionContext],
        isAsync: true,
        returnTypeValidator: (result): result is GeneratedInstructions => {
          return (
            ValidationHelpers.hasProperties(['instructions', 'metadata'])(
              result
            ) &&
            typeof (result as GeneratedInstructions).instructions ===
              'string' &&
            ValidationHelpers.hasProperties([
              'phase',
              'planFilePath',
              'transitionReason',
              'isModeled',
            ])((result as GeneratedInstructions).metadata)
          );
        },
        description: 'should return valid GeneratedInstructions structure',
      },
      {
        methodName: 'generateInstructions',
        parameters: ['', mockInstructionContext],
        isAsync: true,
        returnTypeValidator: (result): result is GeneratedInstructions => {
          return (
            ValidationHelpers.hasProperties(['instructions', 'metadata'])(
              result
            ) &&
            typeof (result as GeneratedInstructions).instructions === 'string'
          );
        },
        description: 'should handle empty base instructions gracefully',
      },
    ];
  }

  protected getErrorTests(): ErrorTestConfig[] {
    return [
      {
        methodName: 'generateInstructions',
        invalidParameters: ['Base instructions', null],
        expectedError: /context|null|undefined/i,
        description: 'should reject null instruction context',
      },
    ];
  }

  protected testImplementationBehavior(
    registration: ImplementationRegistration<InstructionGenerator>
  ): void {
    describe('Instruction Generation', () => {
      it(`${registration.name} should generate enhanced instructions`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          // Generate instructions (no setStateMachine needed)
          const baseInstructions = 'Work on the current phase tasks';
          const result = await instance.generateInstructions(
            baseInstructions,
            mockInstructionContext
          );

          expect(result.instructions).toContain(baseInstructions);
          expect(result.instructions.length).toBeGreaterThan(
            baseInstructions.length
          );
          expect(result.metadata.phase).toBe(mockInstructionContext.phase);
          expect(result.metadata.planFilePath).toBe(
            mockInstructionContext.conversationContext.planFilePath
          );
          expect(result.metadata.isModeled).toBe(
            mockInstructionContext.isModeled
          );
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });

      it(`${registration.name} should handle variable substitution`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          const baseInstructions =
            'Check the architecture document at $ARCHITECTURE_DOC and requirements at $REQUIREMENTS_DOC';
          const result = await instance.generateInstructions(
            baseInstructions,
            mockInstructionContext
          );

          expect(result.instructions).toBeTruthy();
          expect(typeof result.instructions).toBe('string');
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });
    });
  }
}

describe('IInstructionGenerator Interface Contract', () => {
  const contract = new InstructionGeneratorContract();

  const instructionGeneratorRegistration: ImplementationRegistration<InstructionGenerator> =
    {
      name: 'InstructionGenerator',
      description:
        'Core InstructionGenerator implementation for markdown-based task management',
      createInstance: () => {
        return new InstructionGenerator();
      },
    };

  contract.registerImplementation(instructionGeneratorRegistration);
  contract.createContractTests();

  describe('Contract Test Meta-validation', () => {
    it('should have required method tests defined', () => {
      const c = new InstructionGeneratorContract();
      const requiredMethods = c['getRequiredMethods']();
      const methodTests = c['getMethodTests']();

      expect(requiredMethods.length).toBeGreaterThan(0);
      expect(methodTests.length).toBeGreaterThan(0);

      const testedMethods = methodTests.map(test => test.methodName);
      expect(testedMethods).toContain('generateInstructions');
    });

    it('should have error handling tests defined', () => {
      const c = new InstructionGeneratorContract();
      const errorTests = c['getErrorTests']();
      expect(errorTests.length).toBeGreaterThan(0);
    });

    it('should validate generated instructions structure', () => {
      const mockResult: GeneratedInstructions = {
        instructions: 'Enhanced instructions',
        metadata: {
          phase: 'explore',
          planFilePath: '/test/plan.md',
          transitionReason: 'Test transition',
          isModeled: true,
        },
      };

      const c = new InstructionGeneratorContract();
      const methodTests = c['getMethodTests']();
      const generateTest = methodTests.find(
        test => test.methodName === 'generateInstructions'
      );

      expect(generateTest?.returnTypeValidator).toBeDefined();
      expect(generateTest?.returnTypeValidator!(mockResult)).toBe(true);
    });
  });
});
