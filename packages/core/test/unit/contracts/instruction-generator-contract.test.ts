/**
 * Instruction Generator Interface Contract Tests
 *
 * Tests that all IInstructionGenerator implementations satisfy the interface contract.
 * These tests ensure compliance with the IInstructionGenerator interface requirements.
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
  IInstructionGenerator,
  InstructionContext,
  GeneratedInstructions,
} from '../../../src/interfaces/instruction-generator.interface.js';
import type { YamlStateMachine } from '../../../src/state-machine-types.js';
import type { ConversationContext } from '../../../src/types.js';
import { InstructionGenerator } from '../../../src/instruction-generator.js';

// Register implementations before creating contract tests
const existingImplementations =
  ImplementationRegistry.getInstructionGeneratorImplementations();

if (existingImplementations.length === 0) {
  // Register the core InstructionGenerator implementation
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
 * Mock state machine for testing
 */
const mockStateMachine: YamlStateMachine = {
  name: 'test-workflow',
  description: 'Test workflow for contract testing',
  initial_state: 'explore',
  states: {
    explore: {
      description: 'Initial exploration phase',
      default_instructions: 'Explore the problem space',
      transitions: [
        {
          trigger: 'ready_to_plan',
          to: 'plan',
          transition_reason: 'Exploration complete',
        },
      ],
    },
    plan: {
      description: 'Planning phase',
      default_instructions: 'Create implementation plan',
      transitions: [
        {
          trigger: 'ready_to_code',
          to: 'code',
          transition_reason: 'Planning complete',
        },
      ],
    },
  },
};

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
class InstructionGeneratorContract extends BaseInterfaceContract<IInstructionGenerator> {
  protected interfaceName = 'IInstructionGenerator';

  protected getRequiredMethods(): string[] {
    return ['setStateMachine', 'generateInstructions'];
  }

  protected getMethodTests(): MethodTestConfig[] {
    return [
      {
        methodName: 'setStateMachine',
        parameters: [mockStateMachine],
        isAsync: false,
        description: 'should accept state machine configuration',
      },
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
    registration: ImplementationRegistration<IInstructionGenerator>
  ): void {
    describe('Instruction Generation', () => {
      it(`${registration.name} should generate enhanced instructions`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          // Configure the instance
          instance.setStateMachine(mockStateMachine);

          // Generate instructions
          const baseInstructions = 'Work on the current phase tasks';
          const result = await instance.generateInstructions(
            baseInstructions,
            mockInstructionContext
          );

          // Verify the instructions are enhanced (should contain more than just base)
          expect(result.instructions).toContain(baseInstructions);
          expect(result.instructions.length).toBeGreaterThan(
            baseInstructions.length
          );

          // Verify metadata is correctly populated
          expect(result.metadata.phase).toBe(mockInstructionContext.phase);
          expect(result.metadata.planFilePath).toBe(
            mockInstructionContext.conversationContext.planFilePath
          );
          expect(result.metadata.transitionReason).toBe(
            mockInstructionContext.transitionReason
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
          instance.setStateMachine(mockStateMachine);

          // Test with instructions containing variables
          const baseInstructions =
            'Check the architecture document at $ARCHITECTURE_DOC and requirements at $REQUIREMENTS_DOC';
          const result = await instance.generateInstructions(
            baseInstructions,
            mockInstructionContext
          );

          // Verify variables are processed (either substituted or left as-is)
          expect(result.instructions).toBeTruthy();
          expect(typeof result.instructions).toBe('string');
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });

      it(`${registration.name} should handle different phases consistently`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          instance.setStateMachine(mockStateMachine);

          const baseInstructions = 'Work on current phase';

          // Test different phases
          for (const phase of Object.keys(mockStateMachine.states)) {
            const context: InstructionContext = {
              ...mockInstructionContext,
              phase,
            };

            const result = await instance.generateInstructions(
              baseInstructions,
              context
            );

            expect(result.metadata.phase).toBe(phase);
            expect(result.instructions).toBeTruthy();
          }
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });

      it(`${registration.name} should handle project path context`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          instance.setStateMachine(mockStateMachine);

          const baseInstructions = 'Work on the project';
          const result = await instance.generateInstructions(
            baseInstructions,
            mockInstructionContext
          );

          // Instructions should include project context
          expect(result.instructions).toContain(
            mockInstructionContext.conversationContext.projectPath
          );
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });
    });

    describe('Context Handling', () => {
      it(`${registration.name} should handle modeled vs non-modeled transitions`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          instance.setStateMachine(mockStateMachine);

          const baseInstructions = 'Work on current phase';

          // Test modeled transition
          const modeledContext: InstructionContext = {
            ...mockInstructionContext,
            isModeled: true,
            transitionReason: 'Model-driven transition',
          };

          const modeledResult = await instance.generateInstructions(
            baseInstructions,
            modeledContext
          );
          expect(modeledResult.metadata.isModeled).toBe(true);

          // Test non-modeled transition
          const nonModeledContext: InstructionContext = {
            ...mockInstructionContext,
            isModeled: false,
            transitionReason: 'Manual transition',
          };

          const nonModeledResult = await instance.generateInstructions(
            baseInstructions,
            nonModeledContext
          );
          expect(nonModeledResult.metadata.isModeled).toBe(false);
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });

      it(`${registration.name} should handle plan file existence flags`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          instance.setStateMachine(mockStateMachine);

          const baseInstructions = 'Work on current phase';

          // Test with existing plan file
          const existingPlanContext: InstructionContext = {
            ...mockInstructionContext,
          };

          const existingResult = await instance.generateInstructions(
            baseInstructions,
            existingPlanContext
          );
          expect(existingResult.instructions).toBeTruthy();

          // Test without existing plan file
          const newPlanContext: InstructionContext = {
            ...mockInstructionContext,
          };

          const newResult = await instance.generateInstructions(
            baseInstructions,
            newPlanContext
          );
          expect(newResult.instructions).toBeTruthy();
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });
    });

    describe('Error Resilience', () => {
      it(`${registration.name} should handle empty or minimal instructions`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          instance.setStateMachine(mockStateMachine);

          // Test with minimal instructions
          const minimalInstructions = '.';
          const result = await instance.generateInstructions(
            minimalInstructions,
            mockInstructionContext
          );

          expect(result.instructions).toBeTruthy();
          expect(result.instructions.length).toBeGreaterThan(1); // Should be enhanced
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });
    });
  }
}

// Create and run the contract tests
describe('IInstructionGenerator Interface Contract', () => {
  const contract = new InstructionGeneratorContract();

  // Register implementations directly with the contract before creating tests
  const instructionGeneratorRegistration: ImplementationRegistration<IInstructionGenerator> =
    {
      name: 'InstructionGenerator',
      description:
        'Core InstructionGenerator implementation for markdown-based task management',
      createInstance: () => {
        return new InstructionGenerator();
      },
    };

  contract.registerImplementation(instructionGeneratorRegistration);

  // Create the actual contract test suite
  contract.createContractTests();

  // Additional meta-tests to ensure the contract testing itself works
  describe('Contract Test Meta-validation', () => {
    it('should have required method tests defined', () => {
      const contract = new InstructionGeneratorContract();
      const requiredMethods = contract['getRequiredMethods']();
      const methodTests = contract['getMethodTests']();

      expect(requiredMethods.length).toBeGreaterThan(0);
      expect(methodTests.length).toBeGreaterThan(0);

      // Ensure we have tests for core methods
      const testedMethods = methodTests.map(test => test.methodName);
      expect(testedMethods).toContain('generateInstructions');
      expect(testedMethods).toContain('setStateMachine');
    });

    it('should have error handling tests defined', () => {
      const contract = new InstructionGeneratorContract();
      const errorTests = contract['getErrorTests']();

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

      const contract = new InstructionGeneratorContract();
      const methodTests = contract['getMethodTests']();
      const generateTest = methodTests.find(
        test => test.methodName === 'generateInstructions'
      );

      expect(generateTest?.returnTypeValidator).toBeDefined();
      expect(generateTest?.returnTypeValidator!(mockResult)).toBe(true);
    });
  });
});
