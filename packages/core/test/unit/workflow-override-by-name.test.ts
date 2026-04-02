import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowManager } from '@codemcp/workflows-core';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

describe('Workflow Override by Name', () => {
  let testProjectPath: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.WORKFLOW_DOMAINS;
    testProjectPath = fs.mkdtempSync(
      path.join(tmpdir(), 'workflow-override-test-')
    );
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.WORKFLOW_DOMAINS = originalEnv;
    } else {
      delete process.env.WORKFLOW_DOMAINS;
    }

    fs.rmSync(testProjectPath, { recursive: true, force: true });
  });

  it('should override predefined workflow by YAML name, not filename', () => {
    process.env.WORKFLOW_DOMAINS = 'code';

    const workflowsDir = path.join(testProjectPath, '.vibe', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });

    // Copy existing waterfall workflow but change description
    const waterfallPath = path.join(
      __dirname,
      '..',
      '..',
      'resources',
      'workflows',
      'waterfall.yaml'
    );
    const originalContent = fs.readFileSync(waterfallPath, 'utf8');
    const customContent = originalContent.replace(
      /description: .*/,
      "description: 'Custom company waterfall'"
    );

    fs.writeFileSync(
      path.join(workflowsDir, 'company-waterfall.yaml'),
      customContent
    );

    const manager = new WorkflowManager();

    // Load project workflows to trigger override
    const workflows = manager.getAvailableWorkflowsForProject(testProjectPath);

    // Should override predefined waterfall workflow
    const workflow = manager.getWorkflow('waterfall');
    expect(workflow?.name).toBe('waterfall');
    expect(workflow?.description).toBe('Custom company waterfall');

    // Should be available in workflow list
    const waterfallWorkflow = workflows.find(w => w.name === 'waterfall');
    expect(waterfallWorkflow?.description).toBe('Custom company waterfall');
  });

  it('should use YAML name as workflow key, not filename', () => {
    process.env.WORKFLOW_DOMAINS = 'code';

    const workflowsDir = path.join(testProjectPath, '.vibe', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });

    // Copy existing waterfall workflow with different filename
    const waterfallPath = path.join(
      __dirname,
      '..',
      '..',
      'resources',
      'workflows',
      'waterfall.yaml'
    );
    const originalContent = fs.readFileSync(waterfallPath, 'utf8');
    const customContent = originalContent.replace(
      /description: .*/,
      "description: 'Different filename, same name'"
    );

    // Use completely different filename but keep YAML name as 'waterfall'
    fs.writeFileSync(
      path.join(workflowsDir, 'totally-different-filename.yaml'),
      customContent
    );

    const manager = new WorkflowManager();

    // Load project workflows
    const workflows = manager.getAvailableWorkflowsForProject(testProjectPath);

    // Should still be accessible as 'waterfall' (YAML name), not 'totally-different-filename'
    const workflow = manager.getWorkflow('waterfall');
    expect(workflow?.name).toBe('waterfall');
    expect(workflow?.description).toBe('Different filename, same name');

    // Should not be accessible by filename
    const byFilename = manager.getWorkflow('totally-different-filename');
    expect(byFilename).toBeUndefined();

    // Should be in workflow list with correct name
    const waterfallWorkflow = workflows.find(w => w.name === 'waterfall');
    expect(waterfallWorkflow?.description).toBe(
      'Different filename, same name'
    );
  });
});
