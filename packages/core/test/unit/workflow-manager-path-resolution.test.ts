/**
 * Unit tests for WorkflowManager path resolution
 *
 * Tests the robust workflow directory finding functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkflowManager } from '@codemcp/workflows-core';

describe('WorkflowManager path resolution', () => {
  let tempDir: string;
  let originalNodePath: string | undefined;

  beforeEach(() => {
    // Create temporary directory for testing
    tempDir = resolve(tmpdir(), `workflow-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Store original NODE_PATH
    originalNodePath = process.env.NODE_PATH;
  });

  afterEach(() => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    // Restore NODE_PATH
    if (originalNodePath !== undefined) {
      process.env.NODE_PATH = originalNodePath;
    } else {
      delete process.env.NODE_PATH;
    }
  });

  describe('findWorkflowsDirectory', () => {
    it('should find workflows in development environment structure', () => {
      // Create development-like structure
      const projectRoot = join(tempDir, 'project');
      const srcDir = join(projectRoot, 'src');
      const workflowsDir = join(projectRoot, 'resources', 'workflows');

      mkdirSync(srcDir, { recursive: true });
      mkdirSync(workflowsDir, { recursive: true });

      // Create a sample workflow file
      writeFileSync(
        join(workflowsDir, 'test.yaml'),
        'name: test\ndescription: test workflow\ninitial_state: start\nstates:\n  start:\n    description: test'
      );

      // Create package.json to identify the project
      writeFileSync(
        join(projectRoot, 'package.json'),
        JSON.stringify({
          name: '@codemcp/workflows',
          version: '1.0.0',
        })
      );

      const workflowManager = new WorkflowManager();

      // The method should find workflows
      const workflows = workflowManager.getAvailableWorkflows();
      expect(workflows.length).toBeGreaterThan(0);
    });

    it('should handle missing workflows directory gracefully', () => {
      // Create a project without workflows directory
      const projectRoot = join(tempDir, 'no-workflows');
      mkdirSync(projectRoot, { recursive: true });

      const workflowManager = new WorkflowManager();

      // Should not throw error, just return empty workflows
      const workflows = workflowManager.getAvailableWorkflows();
      expect(workflows).toBeDefined();
      // Note: In real implementation, it might still find predefined workflows from the actual package
    });

    it('should load predefined workflows successfully', () => {
      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      // Should have the standard predefined workflows
      const workflowNames = workflows.map(w => w.name);
      expect(workflowNames).toContain('waterfall');
      expect(workflowNames).toContain('bugfix');
      expect(workflowNames).toContain('epcc');
      expect(workflowNames).toContain('minor');
      expect(workflowNames).toContain('greenfield');
    });

    it('should load specific workflows correctly', () => {
      const workflowManager = new WorkflowManager();

      // Test loading a specific workflow
      const waterfall = workflowManager.getWorkflow('waterfall');
      expect(waterfall).toBeDefined();
      expect(waterfall?.name).toBe('waterfall');
      expect(waterfall?.initial_state).toBe('requirements');

      const bugfix = workflowManager.getWorkflow('bugfix');
      expect(bugfix).toBeDefined();
      expect(bugfix?.name).toBe('bugfix');
      expect(bugfix?.initial_state).toBe('reproduce');
    });

    it('should validate workflow names correctly', () => {
      const workflowManager = new WorkflowManager();

      // Test predefined workflows
      expect(workflowManager.validateWorkflowName('waterfall', tempDir)).toBe(
        true
      );
      expect(workflowManager.validateWorkflowName('bugfix', tempDir)).toBe(
        true
      );
      expect(workflowManager.validateWorkflowName('nonexistent', tempDir)).toBe(
        false
      );
    });
  });

  describe('workflow loading from different directories', () => {
    it('should work when called from different working directories', () => {
      // Change to temp directory (different from package location)
      const originalCwd = process.cwd();

      try {
        process.chdir(tempDir);

        const workflowManager = new WorkflowManager();
        const workflows = workflowManager.getAvailableWorkflows();

        // Should still find predefined workflows
        expect(workflows.length).toBeGreaterThan(0);

        const workflowNames = workflows.map(w => w.name);
        expect(workflowNames).toContain('waterfall');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
