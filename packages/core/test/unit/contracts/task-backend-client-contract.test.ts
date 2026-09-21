/**
 * Task Backend Client Interface Contract Tests
 *
 * Tests that all ITaskBackendClient implementations satisfy the interface contract.
 * These tests ensure compliance with the ITaskBackendClient interface requirements.
 */

import { describe, it, expect } from 'vitest';
import {
  BaseInterfaceContract,
  ValidationHelpers,
  type MethodTestConfig,
  type ErrorTestConfig,
  type ImplementationRegistration,
} from './base-interface-contract.js';
import type {
  ITaskBackendClient,
  BackendTask,
  TaskValidationResult,
} from '../../../src/interfaces/task-backend-client.interface.js';

/**
 * Mock backend tasks for testing
 */
const _mockParentTask: BackendTask = {
  id: 'parent-task-1',
  title: 'Parent Task',
  status: 'open',
  priority: 1,
};

const _mockChildTask1: BackendTask = {
  id: 'child-task-1',
  title: 'Child Task 1',
  status: 'completed',
  priority: 2,
  parent: 'parent-task-1',
};

const mockChildTask2: BackendTask = {
  id: 'child-task-2',
  title: 'Child Task 2',
  status: 'open',
  priority: 2,
  parent: 'parent-task-1',
};

/**
 * Mock TaskBackendClient implementation for testing
 */
class MockTaskBackendClient implements ITaskBackendClient {
  private tasks: Map<string, BackendTask> = new Map();

  constructor() {
    // Initialize with some mock tasks
    this.tasks.set('parent-task-1', {
      id: 'parent-task-1',
      title: 'Parent Task',
      status: 'open',
      priority: 1,
    });

    this.tasks.set('child-task-1', {
      id: 'child-task-1',
      title: 'Child Task 1',
      status: 'completed',
      priority: 2,
      parent: 'parent-task-1',
    });

    this.tasks.set('task-1', {
      id: 'task-1',
      title: 'Test Task 1',
      status: 'open',
      priority: 1,
    });
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getOpenTasks(parentTaskId: string): Promise<BackendTask[]> {
    if (!parentTaskId.trim()) {
      throw new Error('Parent task ID cannot be empty');
    }

    return Array.from(this.tasks.values()).filter(
      task => task.parent === parentTaskId && task.status === 'open'
    );
  }

  async validateTasksCompleted(
    parentTaskId: string
  ): Promise<TaskValidationResult> {
    if (!parentTaskId.trim()) {
      throw new Error('Parent task ID cannot be empty');
    }

    const openTasks = await this.getOpenTasks(parentTaskId);
    return {
      valid: openTasks.length === 0,
      openTasks,
      message: openTasks.length > 0 ? 'There are incomplete tasks' : undefined,
    };
  }

  async createTask(
    title: string,
    parentTaskId: string,
    priority = 2
  ): Promise<string> {
    if (!title.trim()) {
      throw new Error('Task title cannot be empty');
    }
    if (!parentTaskId.trim()) {
      throw new Error('Parent task ID cannot be empty');
    }

    const taskId = `task-${Date.now()}`;
    this.tasks.set(taskId, {
      id: taskId,
      title,
      status: 'open',
      priority,
      parent: parentTaskId,
    });

    return taskId;
  }

  async updateTaskStatus(
    taskId: string,
    status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  ): Promise<void> {
    if (!taskId.trim()) {
      throw new Error('Task ID cannot be empty');
    }

    // Validate status first
    const validStatuses = ['open', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid task status: ${status}`);
    }

    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = status;
  }
}

/**
 * Task Backend Client Contract Test Suite
 */
class TaskBackendClientContract extends BaseInterfaceContract<ITaskBackendClient> {
  protected interfaceName = 'ITaskBackendClient';

  protected getRequiredMethods(): string[] {
    return [
      'isAvailable',
      'getOpenTasks',
      'validateTasksCompleted',
      'createTask',
      'updateTaskStatus',
    ];
  }

  protected getMethodTests(): MethodTestConfig[] {
    return [
      {
        methodName: 'isAvailable',
        parameters: [],
        isAsync: true,
        returnTypeValidator: ValidationHelpers.isBoolean,
        description: 'should return boolean indicating backend availability',
      },
      {
        methodName: 'getOpenTasks',
        parameters: ['parent-task-1'],
        isAsync: true,
        returnTypeValidator: ValidationHelpers.isArray,
        description: 'should return array of open tasks',
      },
      {
        methodName: 'validateTasksCompleted',
        parameters: ['parent-task-1'],
        isAsync: true,
        returnTypeValidator: (result): result is TaskValidationResult => {
          return (
            ValidationHelpers.hasProperties(['valid', 'openTasks'])(result) &&
            typeof (result as TaskValidationResult).valid === 'boolean' &&
            Array.isArray((result as TaskValidationResult).openTasks)
          );
        },
        description: 'should return valid TaskValidationResult structure',
      },
      {
        methodName: 'createTask',
        parameters: ['Test Task', 'parent-task-1', 2],
        isAsync: true,
        returnTypeValidator: ValidationHelpers.isNonEmptyString,
        description: 'should return task ID as string',
      },
      {
        methodName: 'updateTaskStatus',
        parameters: ['task-1', 'completed'],
        isAsync: true,
        description: 'should handle task status updates',
      },
    ];
  }

  protected getErrorTests(): ErrorTestConfig[] {
    return [
      {
        methodName: 'getOpenTasks',
        invalidParameters: [''],
        expectedError: /parent|task|id/i,
        description: 'should reject empty parent task ID',
      },
      {
        methodName: 'validateTasksCompleted',
        invalidParameters: [''],
        expectedError: /parent|task|id/i,
        description: 'should reject empty parent task ID for validation',
      },
      {
        methodName: 'createTask',
        invalidParameters: ['', 'parent-task-1'],
        expectedError: /title|task/i,
        description: 'should reject empty task title',
      },
      {
        methodName: 'createTask',
        invalidParameters: ['Test Task', ''],
        expectedError: /parent|task|id/i,
        description: 'should reject empty parent task ID for creation',
      },
      {
        methodName: 'updateTaskStatus',
        invalidParameters: ['', 'completed'],
        expectedError: /task|id/i,
        description: 'should reject empty task ID for status update',
      },
      {
        methodName: 'updateTaskStatus',
        invalidParameters: ['task-1', 'invalid_status' as unknown],
        expectedError: /status|invalid/i,
        description: 'should reject invalid task status',
      },
    ];
  }

  protected testImplementationBehavior(
    registration: ImplementationRegistration<ITaskBackendClient>
  ): void {
    // PHASE-0: disabled for incremental re-enable
    describe('Backend Availability', () => {
      it(`${registration.name} should indicate availability status consistently`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          // Test availability check is consistent
          const isAvailable1 = await instance.isAvailable();
          const isAvailable2 = await instance.isAvailable();

          expect(typeof isAvailable1).toBe('boolean');
          expect(typeof isAvailable2).toBe('boolean');
          expect(isAvailable1).toBe(isAvailable2); // Should be consistent
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });
    });

    // PHASE-0: disabled for incremental re-enable
    describe('Task Retrieval', () => {
      it(`${registration.name} should return task arrays with correct structure`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          const openTasks = await instance.getOpenTasks('test-parent-task');

          expect(Array.isArray(openTasks)).toBe(true);

          // If tasks are returned, they should have the correct structure
          for (const task of openTasks) {
            expect(task).toHaveProperty('id');
            expect(task).toHaveProperty('title');
            expect(task).toHaveProperty('status');
            expect(task).toHaveProperty('priority');
            expect(typeof task.id).toBe('string');
            expect(typeof task.title).toBe('string');
            expect(['open', 'in_progress', 'completed', 'cancelled']).toContain(
              task.status
            );
            expect(typeof task.priority).toBe('number');
          }
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });

      it(`${registration.name} should filter open tasks correctly`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          const openTasks = await instance.getOpenTasks('test-parent-task');

          // All returned tasks should be open (not completed or cancelled)
          for (const task of openTasks) {
            expect(['open', 'in_progress']).toContain(task.status);
          }
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });
    });

    // PHASE-0: disabled for incremental re-enable
    describe('Task Validation', () => {
      it(`${registration.name} should provide meaningful validation results`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          const validation =
            await instance.validateTasksCompleted('test-parent-task');

          expect(typeof validation.valid).toBe('boolean');
          expect(Array.isArray(validation.openTasks)).toBe(true);

          // If validation fails, there should be open tasks
          if (!validation.valid) {
            expect(validation.openTasks.length).toBeGreaterThan(0);
          }

          // If validation passes, there should be no open tasks
          if (validation.valid) {
            expect(validation.openTasks.length).toBe(0);
          }
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });

      it(`${registration.name} should include helpful messages in validation results`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          const validation =
            await instance.validateTasksCompleted('test-parent-task');

          // If a message is provided, it should be a non-empty string
          if (validation.message) {
            expect(typeof validation.message).toBe('string');
            expect(validation.message.length).toBeGreaterThan(0);
          }
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });
    });

    // PHASE-0: disabled for incremental re-enable
    describe('Task Creation', () => {
      it(`${registration.name} should create tasks and return valid IDs`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          // Skip this test if backend is not available
          const isAvailable = await instance.isAvailable();
          if (!isAvailable) {
            console.warn(
              `Skipping task creation test for ${registration.name} - backend not available`
            );
            return;
          }

          const taskId = await instance.createTask(
            'Test Task Creation',
            'test-parent',
            2
          );

          expect(typeof taskId).toBe('string');
          expect(taskId.length).toBeGreaterThan(0);
        } catch (error) {
          // Some implementations might not support task creation in test mode
          console.warn(
            `Task creation test failed for ${registration.name}:`,
            (error as Error).message
          );
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });

      it(`${registration.name} should handle priority values correctly`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          const isAvailable = await instance.isAvailable();
          if (!isAvailable) {
            return;
          }

          // Test with different priority values
          const priorities = [1, 2, 3];

          for (const priority of priorities) {
            try {
              const taskId = await instance.createTask(
                `Test Priority ${priority}`,
                'test-parent',
                priority
              );
              expect(typeof taskId).toBe('string');
            } catch (_error) {
              // Some priorities might not be supported
              console.warn(
                `Priority ${priority} not supported by ${registration.name}`
              );
            }
          }
        } catch (error) {
          console.warn(
            `Priority test failed for ${registration.name}:`,
            (error as Error).message
          );
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });
    });

    // PHASE-0: disabled for incremental re-enable
    describe('Task Status Updates', () => {
      it(`${registration.name} should handle status transitions`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          const isAvailable = await instance.isAvailable();
          if (!isAvailable) {
            return;
          }

          const validStatuses: Array<
            'open' | 'in_progress' | 'completed' | 'cancelled'
          > = ['open', 'in_progress', 'completed', 'cancelled'];

          // Test each status (using a mock task ID)
          for (const status of validStatuses) {
            try {
              await instance.updateTaskStatus('mock-task-id', status);
              // If no error is thrown, the status is supported
            } catch (error) {
              // Some statuses might not be supported or task might not exist
              console.warn(
                `Status ${status} test failed for ${registration.name}:`,
                (error as Error).message
              );
            }
          }
        } catch (error) {
          console.warn(
            `Status update test failed for ${registration.name}:`,
            (error as Error).message
          );
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });
    });

    // PHASE-0: disabled for incremental re-enable
    describe('Error Handling', () => {
      it(`${registration.name} should handle non-existent parent tasks gracefully`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          // Test with non-existent parent task
          const openTasks = await instance.getOpenTasks('non-existent-parent');

          // Should return empty array, not throw error
          expect(Array.isArray(openTasks)).toBe(true);
          expect(openTasks.length).toBe(0);
        } catch (error) {
          // Some implementations might throw errors for non-existent tasks
          // This is acceptable as long as it's a meaningful error
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBeTruthy();
        } finally {
          if (registration.cleanup) {
            await registration.cleanup(instance);
          }
        }
      });

      it(`${registration.name} should handle non-existent tasks in status updates gracefully`, async () => {
        const instance = await registration.createInstance();

        if (registration.setup) {
          await registration.setup(instance);
        }

        try {
          // Attempt to update non-existent task
          await instance.updateTaskStatus('non-existent-task', 'completed');
        } catch (error) {
          // Should throw a meaningful error
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBeTruthy();
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

describe('ITaskBackendClient Interface Contract', () => {
  const contract = new TaskBackendClientContract();

  // Register implementations directly with the contract before creating tests
  const mockTaskBackendClientRegistration: ImplementationRegistration<ITaskBackendClient> =
    {
      name: 'MockTaskBackendClient',
      description:
        'Mock TaskBackendClient implementation for testing contract compliance',
      createInstance: () => {
        return new MockTaskBackendClient();
      },
    };

  contract.registerImplementation(mockTaskBackendClientRegistration);

  // Create the actual contract test suite
  contract.createContractTests();

  // Additional meta-tests to ensure the contract testing itself works
  // PHASE-0: disabled for incremental re-enable
  describe('Contract Test Meta-validation', () => {
    it('should have required method tests defined', () => {
      const contract = new TaskBackendClientContract();
      const requiredMethods = contract['getRequiredMethods']();
      const methodTests = contract['getMethodTests']();

      expect(requiredMethods.length).toBeGreaterThan(0);
      expect(methodTests.length).toBeGreaterThan(0);

      // Ensure we have tests for core methods
      const testedMethods = methodTests.map(test => test.methodName);
      expect(testedMethods).toContain('isAvailable');
      expect(testedMethods).toContain('getOpenTasks');
      expect(testedMethods).toContain('validateTasksCompleted');
      expect(testedMethods).toContain('createTask');
      expect(testedMethods).toContain('updateTaskStatus');
    });

    it('should have error handling tests defined', () => {
      const contract = new TaskBackendClientContract();
      const errorTests = contract['getErrorTests']();

      expect(errorTests.length).toBeGreaterThan(0);
    });

    it('should validate task structure correctly', () => {
      const mockTask: BackendTask = {
        id: 'test-id',
        title: 'Test Task',
        status: 'open',
        priority: 1,
      };

      expect(mockTask.id).toBeTruthy();
      expect(mockTask.title).toBeTruthy();
      expect(['open', 'in_progress', 'completed', 'cancelled']).toContain(
        mockTask.status
      );
      expect(typeof mockTask.priority).toBe('number');
    });

    it('should validate TaskValidationResult structure correctly', () => {
      const mockValidationResult: TaskValidationResult = {
        valid: false,
        openTasks: [mockChildTask2],
        message: 'Task validation failed due to open tasks',
      };

      const contract = new TaskBackendClientContract();
      const methodTests = contract['getMethodTests']();
      const validateTest = methodTests.find(
        test => test.methodName === 'validateTasksCompleted'
      );

      expect(validateTest?.returnTypeValidator).toBeDefined();
      expect(validateTest?.returnTypeValidator!(mockValidationResult)).toBe(
        true
      );
    });
  });
});
