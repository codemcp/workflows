import { vi } from 'vitest';
import { execSync } from 'node:child_process';

// Mock child_process for consistent usage across tests
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

/**
 * Create standardized beads mocks for testing
 */
export const createBeadsMocks = () => {
  const mockExecSync = vi.mocked(execSync);

  return {
    mockExecSync,
    mockBeadsAvailable: () => {
      mockExecSync.mockReturnValue('beads v1.0.0\n');
    },
    mockBeadsUnavailable: () => {
      mockExecSync.mockImplementation(() => {
        const error = new Error('command not found: bd');
        (error as Error & { code: string }).code = 'ENOENT';
        throw error;
      });
    },
    mockBeadsTimeout: () => {
      mockExecSync.mockImplementation(() => {
        const error = new Error('Command failed: timeout');
        throw error;
      });
    },
    mockBeadsInit: () => {
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error('beads not initialized in this directory');
        })
        .mockImplementationOnce(() => {
          return 'Initialized beads in /test/project\n';
        });
    },
    mockBeadsCreateEpic: (epicId = 'project-epic-123') => {
      mockExecSync.mockReturnValue(`✓ Created issue: ${epicId}\n`);
    },
  };
};

/**
 * Utility functions for setting up common beads mock scenarios
 * Note: These must be called with a mockExecSync instance from the test file
 */
export const beadsMockHelpers = {
  setupBeadsAvailable: (
    mockExecSync: ReturnType<typeof vi.mocked<typeof execSync>>
  ) => {
    mockExecSync.mockReturnValue('beads v1.0.0\n');
  },
  setupBeadsNotFound: (
    mockExecSync: ReturnType<typeof vi.mocked<typeof execSync>>
  ) => {
    mockExecSync.mockImplementation(() => {
      const error = new Error('command not found: bd');
      (error as Error & { code: string }).code = 'ENOENT';
      throw error;
    });
  },
  setupBeadsTimeout: (
    mockExecSync: ReturnType<typeof vi.mocked<typeof execSync>>
  ) => {
    mockExecSync.mockImplementation(() => {
      const error = new Error('Command failed: timeout');
      throw error;
    });
  },
};

/**
 * Create standardized test context objects
 */
export const createTestContext = (overrides = {}) => ({
  conversationContext: {
    conversationId: 'test-conversation',
    projectPath: '/test/project',
    planFilePath: '/test/project/.vibe/plan.md',
    gitBranch: 'main',
    currentPhase: 'design',
    workflowName: 'epcc',
    ...overrides.conversationContext,
  },
  instructionContext: {
    phase: 'design',
    conversationContext: {
      conversationId: 'test-conversation',
      projectPath: '/test/project',
      planFilePath: '/test/project/.vibe/plan.md',
      gitBranch: 'main',
      currentPhase: 'design',
      workflowName: 'epcc',
    },
    transitionReason: 'test',
    isModeled: false,
    ...overrides.instructionContext,
  },
});

/**
 * Environment management utility for consistent test isolation
 */
export const withCleanEnv = (testFn: () => void) => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  testFn();
};

/**
 * Standard task backend configurations for testing
 */
export const taskBackendConfigs = {
  markdown: {
    backend: 'markdown' as const,
    isAvailable: true,
  },
  beads: {
    backend: 'beads' as const,
    isAvailable: true,
  },
  beadsUnavailable: {
    backend: 'beads' as const,
    isAvailable: false,
  },
};
