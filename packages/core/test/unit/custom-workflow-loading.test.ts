import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowManager } from '@codemcp/workflows-core';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

describe('Custom Workflow Loading', () => {
  let testProjectPath: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.WORKFLOW_DOMAINS;
    testProjectPath = fs.mkdtempSync(
      path.join(tmpdir(), 'custom-workflow-test-')
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

  it('should load custom workflow from .vibe/workflows directory', () => {
    process.env.WORKFLOW_DOMAINS = 'code';

    const workflowsDir = path.join(testProjectPath, '.vibe', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });

    // Copy existing minor workflow and customize it
    const minorPath = path.join(
      __dirname,
      '..',
      '..',
      'resources',
      'workflows',
      'minor.yaml'
    );
    const originalContent = fs.readFileSync(minorPath, 'utf8');
    const customContent = originalContent
      .replace("name: 'minor'", "name: 'my-custom-workflow'")
      .replace(
        /description: .*/,
        "description: 'My completely custom workflow'"
      );

    fs.writeFileSync(path.join(workflowsDir, 'custom.yaml'), customContent);

    const manager = new WorkflowManager();

    // Load project workflows
    const workflows = manager.getAvailableWorkflowsForProject(testProjectPath);

    // Should load custom workflow
    const customWf = manager.getWorkflow('my-custom-workflow');
    expect(customWf?.name).toBe('my-custom-workflow');
    expect(customWf?.description).toBe('My completely custom workflow');
    expect(customWf?.initial_state).toBe('explore');
    expect(Object.keys(customWf?.states || {})).toEqual([
      'explore',
      'implement',
      'finalize',
    ]);

    // Should be in workflow list
    const customInList = workflows.find(w => w.name === 'my-custom-workflow');
    expect(customInList?.description).toBe('My completely custom workflow');
    expect(customInList?.phases).toEqual(['explore', 'implement', 'finalize']);
  });

  it('should load multiple custom workflows', () => {
    process.env.WORKFLOW_DOMAINS = 'code';

    const workflowsDir = path.join(testProjectPath, '.vibe', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });

    // Copy and customize first workflow
    const minorPath = path.join(
      __dirname,
      '..',
      '..',
      'resources',
      'workflows',
      'minor.yaml'
    );
    const minorContent = fs.readFileSync(minorPath, 'utf8');
    const workflow1 = minorContent
      .replace("name: 'minor'", "name: 'workflow-one'")
      .replace(/description: .*/, "description: 'First custom workflow'");

    // Copy and customize second workflow
    const bugfixPath = path.join(
      __dirname,
      '..',
      '..',
      'resources',
      'workflows',
      'bugfix.yaml'
    );
    const bugfixContent = fs.readFileSync(bugfixPath, 'utf8');
    const workflow2 = bugfixContent
      .replace("name: 'bugfix'", "name: 'workflow-two'")
      .replace(/description: .*/, "description: 'Second custom workflow'");

    fs.writeFileSync(path.join(workflowsDir, 'first.yaml'), workflow1);
    fs.writeFileSync(path.join(workflowsDir, 'second.yaml'), workflow2);

    const manager = new WorkflowManager();

    // Load project workflows
    const workflows = manager.getAvailableWorkflowsForProject(testProjectPath);

    // Should load both custom workflows
    const wf1 = manager.getWorkflow('workflow-one');
    const wf2 = manager.getWorkflow('workflow-two');

    expect(wf1?.name).toBe('workflow-one');
    expect(wf1?.description).toBe('First custom workflow');

    expect(wf2?.name).toBe('workflow-two');
    expect(wf2?.description).toBe('Second custom workflow');

    // Both should be in workflow list
    expect(workflows.some(w => w.name === 'workflow-one')).toBe(true);
    expect(workflows.some(w => w.name === 'workflow-two')).toBe(true);

    // Should still have predefined workflows too
    expect(workflows.some(w => w.name === 'waterfall')).toBe(true);
  });

  it('should ignore domain filtering for custom workflows', () => {
    process.env.WORKFLOW_DOMAINS = 'code'; // Only code domain

    const workflowsDir = path.join(testProjectPath, '.vibe', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });

    // Copy posts workflow (office domain) and customize it
    const postsPath = path.join(
      __dirname,
      '..',
      '..',
      'resources',
      'workflows',
      'posts.yaml'
    );
    const postsContent = fs.readFileSync(postsPath, 'utf8');
    const officeWorkflow = postsContent
      .replace('name: posts', 'name: custom-office-workflow')
      .replace(/description: .*/, "description: 'Custom office workflow'");

    fs.writeFileSync(path.join(workflowsDir, 'office.yaml'), officeWorkflow);

    const manager = new WorkflowManager();

    // Load project workflows
    const workflows = manager.getAvailableWorkflowsForProject(testProjectPath);

    // Custom office workflow should be available despite domain filtering
    const customOffice = manager.getWorkflow('custom-office-workflow');
    expect(customOffice?.name).toBe('custom-office-workflow');
    expect(customOffice?.metadata?.domain).toBe('office');

    // Should be in workflow list
    expect(workflows.some(w => w.name === 'custom-office-workflow')).toBe(true);

    // Predefined office workflows should still be filtered out
    expect(workflows.some(w => w.name === 'posts')).toBe(false);
    expect(workflows.some(w => w.name === 'slides')).toBe(false);
  });
});
