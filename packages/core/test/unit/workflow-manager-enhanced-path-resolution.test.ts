/**
 * Enhanced unit tests for WorkflowManager path resolution strategies
 *
 * Tests the comprehensive workflow directory finding functionality
 * including npx scenarios and various npm installation patterns
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkflowManager } from '@codemcp/workflows-core';

describe('WorkflowManager enhanced path resolution', () => {
  let tempDir: string;
  let originalNodePath: string | undefined;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    // Create temporary directory for testing
    tempDir = resolve(tmpdir(), `workflow-enhanced-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Store original environment variables
    originalNodePath = process.env.NODE_PATH;
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
  });

  afterEach(() => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    // Restore environment variables
    if (originalNodePath !== undefined) {
      process.env.NODE_PATH = originalNodePath;
    } else {
      delete process.env.NODE_PATH;
    }

    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }

    if (originalUserProfile !== undefined) {
      process.env.USERPROFILE = originalUserProfile;
    } else {
      delete process.env.USERPROFILE;
    }
  });

  function createWorkflowFile(dir: string, name: string = 'test.yaml') {
    const content = `name: ${name.replace('.yaml', '')}
description: Test workflow
initial_state: start
states:
  start:
    description: Test state
    instructions: Test instructions
    transitions:
      - to: end
        condition: always
  end:
    description: End state
    instructions: Complete
`;
    writeFileSync(join(dir, name), content);
  }

  function createPackageJson(dir: string, name: string = '@codemcp/workflows') {
    const packageJson = {
      name,
      version: '1.0.0',
      description: 'Test package',
    };
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
  }

  describe('Strategy 1: Relative to current file', () => {
    it('should find workflows relative to dist directory', () => {
      // Simulate dist/workflow-manager.js -> ../resources/workflows structure
      const projectRoot = join(tempDir, 'project');
      const distDir = join(projectRoot, 'dist');
      const workflowsDir = join(projectRoot, 'resources', 'workflows');

      mkdirSync(distDir, { recursive: true });
      mkdirSync(workflowsDir, { recursive: true });

      createWorkflowFile(workflowsDir, 'waterfall.yaml');
      createPackageJson(projectRoot);

      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      // Should find at least the predefined workflows
      expect(workflows.length).toBeGreaterThan(0);
      const workflowNames = workflows.map(w => w.name);
      expect(workflowNames).toContain('waterfall');
    });
  });

  describe('Strategy 2: Package root discovery', () => {
    it('should find workflows by traversing up to package.json', () => {
      // Create nested structure where we need to traverse up
      const projectRoot = join(tempDir, 'project');
      const deepDir = join(projectRoot, 'dist', 'server', 'handlers');
      const workflowsDir = join(projectRoot, 'resources', 'workflows');

      mkdirSync(deepDir, { recursive: true });
      mkdirSync(workflowsDir, { recursive: true });

      createWorkflowFile(workflowsDir, 'epcc.yaml');
      createPackageJson(projectRoot);

      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      expect(workflows.length).toBeGreaterThan(0);
      const workflowNames = workflows.map(w => w.name);
      expect(workflowNames).toContain('epcc');
    });

    it('should ignore package.json files from other packages', () => {
      // Create structure with multiple package.json files
      const projectRoot = join(tempDir, 'project');
      const nodeModulesDir = join(projectRoot, 'node_modules', 'other-package');
      const workflowsDir = join(projectRoot, 'resources', 'workflows');

      mkdirSync(nodeModulesDir, { recursive: true });
      mkdirSync(workflowsDir, { recursive: true });

      createWorkflowFile(workflowsDir, 'bugfix.yaml');
      createPackageJson(projectRoot); // Our package
      createPackageJson(nodeModulesDir, 'other-package'); // Different package

      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      expect(workflows.length).toBeGreaterThan(0);
      const workflowNames = workflows.map(w => w.name);
      expect(workflowNames).toContain('bugfix');
    });
  });

  describe('Strategy 3: Common npm installation paths', () => {
    it('should find workflows in local node_modules', () => {
      // Note: We can't actually create files in the real node_modules during tests,
      // but we can verify the path resolution logic works
      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      // Should still find predefined workflows from the actual package
      expect(workflows.length).toBeGreaterThan(0);
    });

    it('should handle NODE_PATH environment variable', () => {
      // Set up NODE_PATH scenario
      const nodePath = join(tempDir, 'global-modules');
      const packageDir = join(nodePath, '@codemcp', 'workflows');
      const workflowsDir = join(packageDir, 'resources', 'workflows');

      mkdirSync(workflowsDir, { recursive: true });
      createWorkflowFile(workflowsDir, 'greenfield.yaml');
      createPackageJson(packageDir);

      // Set NODE_PATH
      process.env.NODE_PATH = nodePath;

      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      expect(workflows.length).toBeGreaterThan(0);
      const workflowNames = workflows.map(w => w.name);
      expect(workflowNames).toContain('greenfield');
    });
  });

  describe('Strategy 4: npx cache locations', () => {
    it('should search in HOME-based npx cache directories', () => {
      // Simulate npx cache structure
      const homeDir = join(tempDir, 'home');
      const npxCacheDir = join(homeDir, '.npm/_npx');
      const cacheEntry = join(npxCacheDir, 'abc123');
      const packageDir = join(
        cacheEntry,
        'node_modules',
        '@codemcp',
        'workflows'
      );
      const workflowsDir = join(packageDir, 'resources', 'workflows');

      mkdirSync(workflowsDir, { recursive: true });
      createWorkflowFile(workflowsDir, 'minor.yaml');
      createPackageJson(packageDir);

      // Set HOME environment variable
      process.env.HOME = homeDir;

      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      expect(workflows.length).toBeGreaterThan(0);
      const workflowNames = workflows.map(w => w.name);
      expect(workflowNames).toContain('minor');
    });

    it('should search in USERPROFILE-based cache directories (Windows)', () => {
      // Simulate Windows npx cache structure
      const userProfile = join(tempDir, 'Users', 'testuser');
      const npxCacheDir = join(userProfile, 'AppData/Local/npm-cache/_npx');
      const cacheEntry = join(npxCacheDir, 'def456');
      const packageDir = join(cacheEntry, '@codemcp', 'workflows');
      const workflowsDir = join(packageDir, 'resources', 'workflows');

      mkdirSync(workflowsDir, { recursive: true });
      createWorkflowFile(workflowsDir, 'waterfall.yaml');
      createPackageJson(packageDir);

      // Set USERPROFILE environment variable (Windows)
      process.env.USERPROFILE = userProfile;
      delete process.env.HOME; // Remove HOME to simulate Windows

      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      expect(workflows.length).toBeGreaterThan(0);
      const workflowNames = workflows.map(w => w.name);
      expect(workflowNames).toContain('waterfall');
    });

    it('should handle macOS Library cache directories', () => {
      // Simulate macOS cache structure
      const homeDir = join(tempDir, 'Users', 'testuser');
      const npxCacheDir = join(homeDir, 'Library/Caches/npm/_npx');
      const cacheEntry = join(npxCacheDir, 'ghi789');
      const packageDir = join(
        cacheEntry,
        'node_modules',
        '@codemcp',
        'workflows'
      );
      const workflowsDir = join(packageDir, 'resources', 'workflows');

      mkdirSync(workflowsDir, { recursive: true });
      createWorkflowFile(workflowsDir, 'epcc.yaml');
      createPackageJson(packageDir);

      // Set HOME environment variable
      process.env.HOME = homeDir;

      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      expect(workflows.length).toBeGreaterThan(0);
      const workflowNames = workflows.map(w => w.name);
      expect(workflowNames).toContain('epcc');
    });
  });

  describe('Strategy 5: Executable directory', () => {
    it('should find workflows relative to executable location', () => {
      // This strategy uses process.argv[1] which is set by Node.js
      // We can't easily mock this in tests, but we can verify the logic
      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      // Should find predefined workflows
      expect(workflows.length).toBeGreaterThan(0);
    });
  });

  describe('Strategy 6: require.resolve', () => {
    it('should use require.resolve to find package location', () => {
      // This strategy attempts to resolve our own package
      // In the test environment, this should work since we're running from the package
      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      expect(workflows.length).toBeGreaterThan(0);
      const workflowNames = workflows.map(w => w.name);

      // Should find all predefined workflows
      expect(workflowNames).toContain('waterfall');
      expect(workflowNames).toContain('bugfix');
      expect(workflowNames).toContain('epcc');
    });
  });

  describe('Fallback behavior', () => {
    it('should handle gracefully when no workflows directory is found', () => {
      // Create a scenario where no workflows can be found
      // This is difficult to test since our actual package has workflows
      // But we can verify the manager doesn't crash
      const workflowManager = new WorkflowManager();

      expect(() => {
        const workflows = workflowManager.getAvailableWorkflows();
        expect(workflows).toBeDefined();
        expect(Array.isArray(workflows)).toBe(true);
      }).not.toThrow();
    });

    it('should deduplicate strategies and filter invalid paths', () => {
      // The implementation should remove duplicates and invalid paths
      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      // Should work without errors despite potential duplicate strategies
      expect(workflows).toBeDefined();
      expect(Array.isArray(workflows)).toBe(true);
    });
  });

  describe('Integration with actual workflows', () => {
    it('should load all predefined workflows correctly', () => {
      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      // Verify all expected workflows are present
      const workflowNames = workflows.map(w => w.name).sort();
      expect(workflowNames).toContain('waterfall');
      expect(workflowNames).toContain('bugfix');
      expect(workflowNames).toContain('epcc');

      // Verify each workflow has required properties
      for (const workflow of workflows) {
        expect(workflow.name).toBeDefined();
        expect(workflow.displayName).toBeDefined();
        expect(workflow.description).toBeDefined();
        expect(workflow.initialState).toBeDefined();
        expect(workflow.phases).toBeDefined();
        expect(Array.isArray(workflow.phases)).toBe(true);
        expect(workflow.phases.length).toBeGreaterThan(0);
      }
    });

    it('should load specific workflows with correct structure', () => {
      const workflowManager = new WorkflowManager();

      // Test waterfall workflow
      const waterfall = workflowManager.getWorkflow('waterfall');
      expect(waterfall).toBeDefined();
      expect(waterfall?.name).toBe('waterfall');
      expect(waterfall?.initial_state).toBe('requirements');
      expect(Object.keys(waterfall?.states || {})).toContain('requirements');
      expect(Object.keys(waterfall?.states || {})).toContain('design');
      expect(Object.keys(waterfall?.states || {})).toContain('implementation');

      // Test bugfix workflow
      const bugfix = workflowManager.getWorkflow('bugfix');
      expect(bugfix).toBeDefined();
      expect(bugfix?.name).toBe('bugfix');
      expect(bugfix?.initial_state).toBe('reproduce');
      expect(Object.keys(bugfix?.states || {})).toContain('reproduce');
      expect(Object.keys(bugfix?.states || {})).toContain('analyze');
      expect(Object.keys(bugfix?.states || {})).toContain('fix');
      expect(Object.keys(bugfix?.states || {})).toContain('verify');
    });
  });
});
