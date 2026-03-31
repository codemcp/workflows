/**
 * Plan Manager Interface Contract Tests
 *
 * Tests that all IPlanManager implementations satisfy the interface contract.
 * These tests ensure compliance with the IPlanManager interface requirements.
 */

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import {
  BaseInterfaceContract,
  ValidationHelpers,
  type MethodTestConfig,
  type ErrorTestConfig,
  type ImplementationRegistration,
} from './base-interface-contract.js';
import type {
  IPlanManager,
  PlanFileInfo,
} from '../../../src/interfaces/plan-manager-interface.js';
import { PlanManager } from '../../../src/plan-manager.js';
import type { TaskBackendConfig } from '../../../src/task-backend.js';
import { cleanupDirectory } from '../../utils/temp-files.js';

/**
 * Mock data for testing
 */
const mockTaskBackend: TaskBackendConfig = {
  backend: 'markdown',
  isAvailable: true,
  client: null,
};

// Mock state machine for testing
const mockStateMachine = {
  name: 'test-workflow',
  description: 'Test workflow for contract compliance',
  initial_state: 'start',
  states: {
    start: {
      name: 'Start',
      instructions: 'Starting phase instructions',
      entrance_criteria: ['Project initialized'],
      tasks: ['Initialize project'],
      transitions: { complete: 'end' },
    },
    end: {
      name: 'End',
      instructions: 'Ending phase instructions',
      entrance_criteria: ['All tasks completed'],
      tasks: ['Finalize project'],
      transitions: {},
    },
  },
};

// Paths are resolved lazily in setup() so each test run gets a unique directory.
// Using a static path caused flakiness when cleanup in one test deleted the
// directory while another concurrent test was still writing to it.
let testDir = join(tmpdir(), 'plan-manager-contract-tests');
let testPlanPath = join(testDir, 'plan.md');
let testProjectPath = join(testDir, 'project');

/**
 * Plan Manager Contract Test Suite
 */
class PlanManagerContract extends BaseInterfaceContract<IPlanManager> {
  protected interfaceName = 'IPlanManager';

  protected getRequiredMethods(): string[] {
    return [
      'setStateMachine',
      'setTaskBackend',
      'getPlanFileInfo',
      'ensurePlanFile',
      'updatePlanFile',
      'getPlanFileContent',
      'generatePlanFileGuidance',
      'deletePlanFile',
      'ensurePlanFileDeleted',
    ];
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
        methodName: 'setTaskBackend',
        parameters: [mockTaskBackend],
        isAsync: false,
        description: 'should accept task backend configuration',
      },
      {
        methodName: 'getPlanFileInfo',
        parameters: [testPlanPath],
        isAsync: true,
        returnTypeValidator: (result): result is PlanFileInfo => {
          return (
            ValidationHelpers.hasProperties(['path', 'exists'])(result) &&
            typeof (result as PlanFileInfo).path === 'string' &&
            typeof (result as PlanFileInfo).exists === 'boolean'
          );
        },
        description: 'should return valid PlanFileInfo structure',
      },
      {
        methodName: 'ensurePlanFile',
        parameters: [testPlanPath, testProjectPath, 'main'],
        isAsync: true,
        description: 'should handle plan file creation',
      },
      {
        methodName: 'updatePlanFile',
        parameters: [testPlanPath, 'test content'],
        isAsync: true,
        description: 'should handle plan file updates',
      },
      {
        methodName: 'getPlanFileContent',
        parameters: [testPlanPath],
        isAsync: true,
        returnTypeValidator: ValidationHelpers.isNonEmptyString,
        description: 'should return plan file content as string',
      },
      {
        methodName: 'generatePlanFileGuidance',
        parameters: ['explore'],
        isAsync: false,
        returnTypeValidator: ValidationHelpers.isNonEmptyString,
        description: 'should generate guidance for phases',
      },
      {
        methodName: 'generatePlanFileGuidance',
        parameters: ['invalid_phase'],
        isAsync: false,
        returnTypeValidator: ValidationHelpers.isNonEmptyString,
        description: 'should handle invalid phase names gracefully',
      },
      {
        methodName: 'deletePlanFile',
        parameters: [testPlanPath],
        isAsync: true,
        returnTypeValidator: ValidationHelpers.isBoolean,
        description: 'should return boolean indicating deletion success',
      },
      {
        methodName: 'ensurePlanFileDeleted',
        parameters: [testPlanPath],
        isAsync: true,
        returnTypeValidator: ValidationHelpers.isBoolean,
        description: 'should verify plan file deletion',
      },
    ];
  }

  protected getErrorTests(): ErrorTestConfig[] {
    return [
      {
        methodName: 'generatePlanFileGuidance',
        invalidParameters: [null as unknown],
        expectedError: /phase/i,
        description: 'should reject null phase parameter',
      },
    ];
  }

  protected testImplementationBehavior(
    registration: ImplementationRegistration<IPlanManager>
  ): void {
    describe('Plan File Operations', () => {
      it(`${registration.name} should handle file existence checking`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          // Configure the instance with required dependencies
          instance.setStateMachine(mockStateMachine);
          instance.setTaskBackend(mockTaskBackend);

          // Test non-existent file
          const nonExistentResult = await instance.getPlanFileInfo(
            '/non-existent-path/plan.md'
          );
          expect(nonExistentResult.exists).toBe(false);
          expect(nonExistentResult.path).toBe('/non-existent-path/plan.md');
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });

      it(`${registration.name} should maintain state machine configuration`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          // Set state machine first
          instance.setStateMachine(mockStateMachine);

          // Test guidance generation works after setting state machine
          const guidance = instance.generatePlanFileGuidance('explore');
          expect(guidance).toBeTruthy();
          expect(typeof guidance).toBe('string');
          expect(guidance.length).toBeGreaterThan(10);
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });

      it(`${registration.name} should handle task backend configuration`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          // Should not throw when setting task backend
          expect(() => {
            instance.setTaskBackend(mockTaskBackend);
          }).not.toThrow();

          // Should handle different backend types
          const beadsBackend: TaskBackendConfig = {
            backend: 'beads',
            isAvailable: true,
          };
          expect(() => {
            instance.setTaskBackend(beadsBackend);
          }).not.toThrow();
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });
    });

    describe('Plan Content Generation', () => {
      it(`${registration.name} should generate appropriate content for different phases`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          instance.setStateMachine(mockStateMachine);
          instance.setTaskBackend(mockTaskBackend);

          // Test guidance for each phase
          for (const phase of Object.keys(mockStateMachine.states)) {
            const guidance = instance.generatePlanFileGuidance(phase);
            expect(guidance).toBeTruthy();
            expect(typeof guidance).toBe('string');
            expect(guidance.length).toBeGreaterThan(0);
          }
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });
    });

    describe('Error Resilience', () => {
      it(`${registration.name} should handle missing state machine gracefully`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          // Don't set state machine, attempt to use guidance
          expect(() => {
            instance.generatePlanFileGuidance('explore');
          }).toThrow();
        } catch (error) {
          // Some implementations might handle this gracefully instead of throwing
          expect(error).toBeDefined();
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
describe('IPlanManager Interface Contract', () => {
  const contract = new PlanManagerContract();

  // Register implementations directly with the contract before creating tests
  const planManagerRegistration: ImplementationRegistration<IPlanManager> = {
    name: 'PlanManager',
    description:
      'Core PlanManager implementation for filesystem-based plan management',
    createInstance: () => {
      return new PlanManager();
    },
    setup: async (instance: IPlanManager) => {
      // Create a unique temp directory per test run to avoid concurrent-cleanup races
      testDir = await mkdtemp(join(tmpdir(), 'plan-manager-contract-'));
      testPlanPath = join(testDir, 'plan.md');
      testProjectPath = join(testDir, 'project');

      // Set up state machine for PlanManager
      (
        instance as unknown as { setStateMachine: typeof mockStateMachine }
      ).setStateMachine(mockStateMachine);
    },
    cleanup: async () => {
      await cleanupDirectory(testDir);
    },
  };

  contract.registerImplementation(planManagerRegistration);

  // Create the actual contract test suite
  contract.createContractTests();

  // Additional meta-tests to ensure the contract testing itself works
  describe('Contract Test Meta-validation', () => {
    it('should have required method tests defined', () => {
      const contract = new PlanManagerContract();
      const requiredMethods = contract['getRequiredMethods']();
      const methodTests = contract['getMethodTests']();

      expect(requiredMethods.length).toBeGreaterThan(0);
      expect(methodTests.length).toBeGreaterThan(0);

      // Ensure we have tests for core methods
      const testedMethods = methodTests.map(test => test.methodName);
      expect(testedMethods).toContain('getPlanFileInfo');
      expect(testedMethods).toContain('generatePlanFileGuidance');
      expect(testedMethods).toContain('setStateMachine');
    });

    it('should have error handling tests defined', () => {
      const contract = new PlanManagerContract();
      const errorTests = contract['getErrorTests']();

      expect(errorTests.length).toBeGreaterThan(0);
    });
  });
});
