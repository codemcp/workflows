/**
 * Shared Test Utilities
 *
 * Common utilities to eliminate repetition across test files
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { vi, expect } from 'vitest';
import {
  ResponsibleVibeMCPServer,
  createResponsibleVibeMCPServer,
} from '../../src/server.js';
import type { ServerContext } from '../../src/types';
import type { StartDevelopmentResult } from '../../src/tool-handlers/start-development.js';
import { TempProject } from './temp-files.js';
import { PluginRegistry } from '../../src/plugin-system/plugin-registry.js';

/**
 * Mock project documents content
 */
export const MOCK_DOCS = {
  architecture: '# Architecture\n\nMock architecture document for testing.',
  requirements: '# Requirements\n\nMock requirements document for testing.',
  design: '# Design\n\nMock design document for testing.',
} as const;

/**
 * Git repository setup utilities
 */
export class GitTestHelper {
  static initializeRepo(projectPath: string): void {
    execSync('git init', { cwd: projectPath });
    execSync('git config user.email "test@example.com"', { cwd: projectPath });
    execSync('git config user.name "Test User"', { cwd: projectPath });
  }

  static createInitialCommit(projectPath: string): void {
    writeFileSync(join(projectPath, 'README.md'), '# Test Project');
    execSync('git add .', { cwd: projectPath });
    execSync('git commit -m "Initial commit"', { cwd: projectPath });
  }

  static createFeatureBranch(
    projectPath: string,
    branchName: string = 'feature/test'
  ): void {
    execSync(`git checkout -b ${branchName}`, { cwd: projectPath });
  }

  static setupFullRepo(projectPath: string, branchName?: string): void {
    this.initializeRepo(projectPath);
    this.createInitialCommit(projectPath);
    if (branchName) {
      this.createFeatureBranch(projectPath, branchName);
    }
  }
}

/**
 * Server test utilities
 */
export class ServerTestHelper {
  static async createServer(
    projectPath: string,
    options: { enableLogging?: boolean } = {}
  ): Promise<ResponsibleVibeMCPServer> {
    const server = await createResponsibleVibeMCPServer({
      projectPath,
      enableLogging: options.enableLogging ?? false,
    });
    await server.initialize();
    return server;
  }

  static async cleanupServer(server: ResponsibleVibeMCPServer): Promise<void> {
    if (server) {
      await server.cleanup();
    }
  }
}

/**
 * Mock project documents utilities
 */
export class MockDocsHelper {
  static addToProject(projectPath: string): void {
    const docsDir = join(projectPath, '.vibe', 'docs');
    mkdirSync(docsDir, { recursive: true });

    for (const [docType, content] of Object.entries(MOCK_DOCS)) {
      writeFileSync(join(docsDir, `${docType}.md`), content);
    }
  }

  static addToTempProject(tempProject: TempProject): void {
    tempProject.addMockProjectDocs();
  }

  static ensureExists(projectPath: string): void {
    if (!existsSync(join(projectPath, '.vibe', 'docs'))) {
      this.addToProject(projectPath);
    }
  }
}

/**
 * Mock context factory for unit tests
 */
export class MockContextFactory {
  static createBasicContext(
    projectPath: string,
    overrides: Partial<ServerContext> = {}
  ) {
    return {
      projectPath,
      pluginRegistry: new PluginRegistry(),
      workflowManager: {
        validateWorkflowName: vi.fn().mockReturnValue(true),
        getWorkflowNames: vi
          .fn()
          .mockReturnValue(['waterfall', 'epcc', 'greenfield']),
        loadProjectWorkflows: vi.fn(),
        loadWorkflowForProject: vi.fn().mockReturnValue({
          initial_state: 'requirements',
          states: {
            requirements: {
              description: 'Define requirements',
              instructions: 'Create detailed requirements for the project.',
            },
          },
        }),
      },
      conversationManager: {
        createConversationContext: vi.fn().mockResolvedValue({
          conversationId: 'test-conversation',
          currentPhase: 'requirements',
          projectPath,
          planFilePath: join(projectPath, '.vibe', 'plan.md'),
          gitBranch: 'feature-branch',
        }),
        updateConversationState: vi.fn(),
      },
      transitionEngine: {
        handleExplicitTransition: vi.fn().mockResolvedValue({
          newPhase: 'requirements',
        }),
      },
      planManager: {
        setStateMachine: vi.fn(),
        ensurePlanFile: vi.fn(),
        getInitialPlanGuidance: vi
          .fn()
          .mockReturnValue(
            'Look at the plan file and define entrance criteria.'
          ),
      },
      ...overrides,
    };
  }

  static createProjectDocsManagerMock(projectPath: string) {
    return {
      getProjectDocsInfo: vi.fn(),
      getVariableSubstitutions: vi.fn().mockReturnValue({
        $ARCHITECTURE_DOC: join(
          projectPath,
          '.vibe',
          'docs',
          'architecture.md'
        ),
        $REQUIREMENTS_DOC: join(
          projectPath,
          '.vibe',
          'docs',
          'requirements.md'
        ),
        $DESIGN_DOC: join(projectPath, '.vibe', 'docs', 'design.md'),
      }),
      templateManager: {
        getAvailableTemplates: vi.fn().mockResolvedValue({
          architecture: ['arc42', 'freestyle'],
          requirements: ['ears', 'freestyle'],
          design: ['comprehensive', 'freestyle'],
        }),
        getDefaults: vi.fn().mockResolvedValue({
          architecture: 'freestyle',
          requirements: 'freestyle',
          design: 'freestyle',
        }),
      },
    };
  }
}

/**
 * Test workflow patterns
 */
export const TEST_WORKFLOWS = {
  simple: {
    initial_state: 'requirements',
    states: {
      requirements: {
        description: 'Define requirements',
        instructions: 'Create detailed requirements for the project.',
      },
    },
  },

  withArchDoc: {
    initial_state: 'design',
    states: {
      design: {
        description: 'Create design',
        instructions:
          'Review the architecture in $ARCHITECTURE_DOC and create detailed design.',
      },
    },
  },

  withMultipleDocs: {
    initial_state: 'implementation',
    states: {
      implementation: {
        description: 'Implement solution',
        instructions:
          'Follow the architecture in $ARCHITECTURE_DOC and implement according to $DESIGN_DOC requirements.',
      },
      testing: {
        description: 'Test solution',
        instructions: 'Verify all requirements from $REQUIREMENTS_DOC are met.',
      },
    },
  },

  // Test workflows with requiresDocumentation: true
  requiredArchDoc: {
    initial_state: 'design',
    metadata: {
      requiresDocumentation: true,
    },
    states: {
      design: {
        description: 'Create design',
        instructions:
          'Review the architecture in $ARCHITECTURE_DOC and create detailed design.',
      },
    },
  },

  requiredMultipleDocs: {
    initial_state: 'implementation',
    metadata: {
      requiresDocumentation: true,
    },
    states: {
      implementation: {
        description: 'Implement solution',
        instructions:
          'Follow the architecture in $ARCHITECTURE_DOC and implement according to $DESIGN_DOC requirements.',
      },
      testing: {
        description: 'Test solution',
        instructions: 'Verify all requirements from $REQUIREMENTS_DOC are met.',
      },
    },
  },
} as const;

/**
 * Common test assertions
 */
export class TestAssertions {
  static expectValidResult(result: StartDevelopmentResult): void {
    expect(result).toBeTypeOf('object');
    expect(result.phase).toBeDefined();
    expect(result.instructions).toBeDefined();
  }

  static expectArtifactSetupPhase(result: StartDevelopmentResult): void {
    expect(result.phase).toBe('artifact-setup');
    expect(result.instructions).toContain('Missing docs for');
  }

  static expectNormalPhase(
    result: StartDevelopmentResult,
    expectedPhase: string
  ): void {
    expect(result.phase).toBe(expectedPhase);
    expect(result.instructions).toBeDefined();
  }
}
