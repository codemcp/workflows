/**
 * Tests for Existing Interface Implementations
 *
 * Registers and tests existing implementations against their interface contracts.
 * This ensures that current implementations satisfy the interface requirements.
 */

import { describe, beforeAll, afterEach, it, expect } from 'vitest';
import { ImplementationRegistry } from './implementation-registry.js';
import type { ImplementationRegistration } from './base-interface-contract.js';
import type { IPlanManager } from '../../../src/interfaces/plan-manager.interface.js';
import type { IInstructionGenerator } from '../../../src/interfaces/instruction-generator.interface.js';
import { PlanManager } from '../../../src/plan-manager.js';
import { InstructionGenerator } from '../../../src/instruction-generator.js';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupDirectory } from '../../utils/temp-files.js';

/**
 * Test directory for file operations
 */
const testDir = join(tmpdir(), 'responsible-vibe-contract-tests');

/**
 * Setup and cleanup test directory
 */
async function setupTestDirectory(): Promise<void> {
  if (existsSync(testDir)) {
    await cleanupDirectory(testDir);
  }
  await mkdir(testDir, { recursive: true });
}

async function cleanupTestDirectory(): Promise<void> {
  await cleanupDirectory(testDir);
}

/**
 * PlanManager implementation registration
 */
const planManagerRegistration: ImplementationRegistration<IPlanManager> = {
  name: 'PlanManager',
  description:
    'Default filesystem-based plan manager that handles markdown plan files and supports both markdown and beads task backends',
  createInstance: () => new PlanManager(),
  setup: async (instance: IPlanManager) => {
    await setupTestDirectory();
    // Set up a minimal state machine for testing
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
    (
      instance as unknown as { setStateMachine: typeof mockStateMachine }
    ).setStateMachine(mockStateMachine);
  },
  cleanup: async () => {
    await cleanupTestDirectory();
  },
};

/**
 * InstructionGenerator implementation registration
 */
const instructionGeneratorRegistration: ImplementationRegistration<IInstructionGenerator> =
  {
    name: 'InstructionGenerator',
    description:
      'Default instruction generator that creates context-aware LLM instructions with variable substitution and task backend integration',
    createInstance: () => {
      return new InstructionGenerator();
    },
    setup: async () => {
      await setupTestDirectory();
    },
    cleanup: async () => {
      await cleanupTestDirectory();
    },
  };

describe('Existing Implementations Contract Compliance', () => {
  beforeAll(() => {
    // Clear any existing registrations
    ImplementationRegistry.clearAll();

    // Register existing implementations
    ImplementationRegistry.registerPlanManager(planManagerRegistration);
    ImplementationRegistry.registerInstructionGenerator(
      instructionGeneratorRegistration
    );
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await cleanupTestDirectory();
    } catch (error) {
      console.warn('Cleanup warning:', (error as Error).message);
    }
  });

  describe('Implementation Registry Integration', () => {
    it('should have registered PlanManager implementation', () => {
      const implementations =
        ImplementationRegistry.getPlanManagerImplementations();
      expect(implementations.length).toBeGreaterThan(0);

      const planManagerImpl = implementations.find(
        impl => impl.name === 'PlanManager'
      );
      expect(planManagerImpl).toBeDefined();
      expect(planManagerImpl?.description).toContain('plan manager');
    });

    it('should have registered InstructionGenerator implementation', () => {
      const implementations =
        ImplementationRegistry.getInstructionGeneratorImplementations();
      expect(implementations.length).toBeGreaterThan(0);

      const instructionGeneratorImpl = implementations.find(
        impl => impl.name === 'InstructionGenerator'
      );
      expect(instructionGeneratorImpl).toBeDefined();
      expect(instructionGeneratorImpl?.description).toContain(
        'instruction generator'
      );
    });

    it('should provide complete implementation summary', () => {
      const summary = ImplementationRegistry.getRegistrationSummary();

      expect(summary.planManagers).toContain('PlanManager');
      expect(summary.instructionGenerators).toContain('InstructionGenerator');
      expect(summary.total).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Implementation Factory Functions', () => {
    it('should create PlanManager instances successfully', async () => {
      const instance = await planManagerRegistration.createInstance();
      expect(instance).toBeInstanceOf(PlanManager);
      expect(instance).toHaveProperty('setStateMachine');
      expect(instance).toHaveProperty('getPlanFileInfo');
    });

    it('should create InstructionGenerator instances successfully', async () => {
      const instance = await instructionGeneratorRegistration.createInstance();
      expect(instance).toBeInstanceOf(InstructionGenerator);
      expect(instance).toHaveProperty('setStateMachine');
      expect(instance).toHaveProperty('generateInstructions');
    });
  });

  describe('Setup and Cleanup Functions', () => {
    it('should handle PlanManager setup and cleanup', async () => {
      expect(planManagerRegistration.setup).toBeDefined();
      expect(planManagerRegistration.cleanup).toBeDefined();

      const instance = await planManagerRegistration.createInstance();

      // Test setup
      await planManagerRegistration.setup!(instance);
      expect(existsSync(testDir)).toBe(true);

      // Test cleanup
      await planManagerRegistration.cleanup!(instance);
    });

    it('should handle InstructionGenerator setup and cleanup', async () => {
      expect(instructionGeneratorRegistration.setup).toBeDefined();
      expect(instructionGeneratorRegistration.cleanup).toBeDefined();

      const instance = await instructionGeneratorRegistration.createInstance();

      // Test setup
      await instructionGeneratorRegistration.setup!(instance);
      expect(existsSync(testDir)).toBe(true);

      // Test cleanup
      await instructionGeneratorRegistration.cleanup!(instance);
    });
  });

  describe('Implementation Behavior Validation', () => {
    it('should have properly functioning PlanManager implementation', async () => {
      const instance = await planManagerRegistration.createInstance();

      // Test that instance has required interface methods
      expect(typeof instance.setStateMachine).toBe('function');
      expect(typeof instance.setTaskBackend).toBe('function');
      expect(typeof instance.getPlanFileInfo).toBe('function');
      expect(typeof instance.ensurePlanFile).toBe('function');
      expect(typeof instance.updatePlanFile).toBe('function');
      expect(typeof instance.getPlanFileContent).toBe('function');
      expect(typeof instance.generatePlanFileGuidance).toBe('function');
      expect(typeof instance.deletePlanFile).toBe('function');
      expect(typeof instance.ensurePlanFileDeleted).toBe('function');
    });

    it('should have properly functioning InstructionGenerator implementation', async () => {
      const instance = await instructionGeneratorRegistration.createInstance();

      // Test that instance has required interface methods
      expect(typeof instance.setStateMachine).toBe('function');
      expect(typeof instance.generateInstructions).toBe('function');
    });
  });
});

// Import the contract test files to run them with registered implementations
import './plan-manager-contract.test.js';
import './instruction-generator-contract.test.js';
import './task-backend-client-contract.test.js';
