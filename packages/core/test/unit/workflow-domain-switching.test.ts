import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowManager } from '../../src/workflow-manager.js';

describe('setDomains() — runtime domain switching', () => {
  let manager: WorkflowManager;
  const originalVibe = process.env.VIBE_WORKFLOW_DOMAINS;
  const originalWorkflow = process.env.WORKFLOW_DOMAINS;
  const originalDefault = process.env.DEFAULT_DOMAINS;
  const originalDefaultAll = process.env.DEFAULT_ALL_DOMAINS;

  beforeEach(() => {
    // Clear all domain env vars for clean state
    delete process.env['VIBE_WORKFLOW_DOMAINS'];
    delete process.env['WORKFLOW_DOMAINS'];
    delete process.env['DEFAULT_DOMAINS'];
    delete process.env['DEFAULT_ALL_DOMAINS'];

    // Start with code domain
    process.env['WORKFLOW_DOMAINS'] = 'code';
    manager = new WorkflowManager();
  });

  afterEach(() => {
    if (originalVibe) process.env.VIBE_WORKFLOW_DOMAINS = originalVibe;
    else delete process.env.VIBE_WORKFLOW_DOMAINS;

    if (originalWorkflow) process.env.WORKFLOW_DOMAINS = originalWorkflow;
    else delete process.env.WORKFLOW_DOMAINS;

    if (originalDefault) process.env.DEFAULT_DOMAINS = originalDefault;
    else delete process.env.DEFAULT_DOMAINS;

    if (originalDefaultAll)
      process.env.DEFAULT_ALL_DOMAINS = originalDefaultAll;
    else delete process.env.DEFAULT_ALL_DOMAINS;
  });

  it('should replace current domains and reload workflows', () => {
    const initialWorkflows = manager.getAvailableWorkflows();
    const initialNames = initialWorkflows.map(w => w.name);

    // Verify we start with code workflows
    expect(initialNames.some(w => ['epcc', 'tdd'].includes(w))).toBe(true);

    // Switch to architecture domain
    manager.setDomains('architecture');

    const updatedWorkflows = manager.getAvailableWorkflows();
    const updatedNames = updatedWorkflows.map(w => w.name);

    // Should now have architecture workflows
    expect(
      updatedNames.some(w => ['adr', 'big-bang-conversion'].includes(w))
    ).toBe(true);

    // Should no longer have code workflows
    expect(updatedNames.some(w => ['epcc', 'tdd'].includes(w))).toBe(false);
  });

  it('should accept comma-separated domains', () => {
    manager.setDomains('code,architecture');

    const workflows = manager.getAvailableWorkflows();
    const workflowNames = workflows.map(w => w.name);

    expect(workflowNames.some(w => ['epcc', 'tdd'].includes(w))).toBe(true);
    expect(
      workflowNames.some(w => ['adr', 'big-bang-conversion'].includes(w))
    ).toBe(true);
  });

  it('should accept array of domains', () => {
    manager.setDomains(['code', 'architecture', 'office']);

    const workflows = manager.getAvailableWorkflows();
    const workflowNames = workflows.map(w => w.name);

    expect(workflowNames.some(w => ['epcc', 'tdd'].includes(w))).toBe(true);
    expect(
      workflowNames.some(w => ['adr', 'big-bang-conversion'].includes(w))
    ).toBe(true);
    expect(workflowNames.some(w => ['posts', 'slides'].includes(w))).toBe(true);
  });

  it('should reject unknown domains with a helpful error', () => {
    expect(() => manager.setDomains('nonexistent')).toThrow('Unknown domain');
    expect(() => manager.setDomains('nonexistent')).toThrow('Known domains');
  });

  it('should reject multiple unknown domains', () => {
    expect(() => manager.setDomains('nonexistent,also-invalid')).toThrow(
      'Unknown domain'
    );
  });

  it('should allow switching to a superset of current domain', () => {
    // Start with code, switch to code+architecture
    manager.setDomains('code,architecture');

    const workflows = manager.getAvailableWorkflows();
    expect(workflows.length).toBeGreaterThan(0);
  });

  it('should handle empty domain string gracefully', () => {
    // Empty string should result in empty set (all workflows load)
    manager.setDomains('');

    const workflows = manager.getAvailableWorkflows();
    // With empty set, all workflows load (no filtering)
    expect(workflows.length).toBeGreaterThan(0);
  });

  it('should strip whitespace from domain names', () => {
    manager.setDomains(' code , architecture ');

    const workflows = manager.getAvailableWorkflows();
    const workflowNames = workflows.map(w => w.name);

    expect(workflowNames.some(w => ['epcc', 'tdd'].includes(w))).toBe(true);
    expect(
      workflowNames.some(w => ['adr', 'big-bang-conversion'].includes(w))
    ).toBe(true);
  });

  it('should provide DOMAIN_DESCRIPTIONS constant with all known domains', () => {
    // Import the DOMAIN_DESCRIPTIONS constant
    // We test it indirectly through setDomains validation
    // All known domains should be accepted without error
    const knownDomains = [
      'code',
      'architecture',
      'sdd',
      'sdd-crowd',
      'skilled',
      'office',
      'children',
    ];

    for (const domain of knownDomains) {
      expect(() => manager.setDomains(domain)).not.toThrow();
    }
  });
});
