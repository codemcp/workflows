import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowManager } from '@codemcp/workflows-core';

describe('Workflow Domain Filtering', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.WORKFLOW_DOMAINS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.WORKFLOW_DOMAINS = originalEnv;
    } else {
      delete process.env.WORKFLOW_DOMAINS;
    }
  });

  it('should load all workflows when no domain filter is set (empty Set fallback)', () => {
    delete process.env.WORKFLOW_DOMAINS;

    const manager = new WorkflowManager();
    const workflows = manager.getAvailableWorkflows();

    // With empty Set, all workflows load (no filtering applied)
    // Should have workflows from multiple domains
    const domains = new Set(
      workflows.map(w => w.metadata?.domain).filter(Boolean) as string[]
    );
    expect(domains.size).toBeGreaterThan(1);
  });

  it('should filter workflows by domain when WORKFLOW_DOMAINS is set', () => {
    process.env.WORKFLOW_DOMAINS = 'code';

    const manager = new WorkflowManager();
    const workflows = manager.getAvailableWorkflows();

    // Should only include code domain workflows
    const codeWorkflows = workflows.filter(w => w.metadata?.domain === 'code');
    const nonCodeWorkflows = workflows.filter(
      w => w.metadata?.domain && w.metadata.domain !== 'code'
    );

    expect(codeWorkflows.length).toBeGreaterThan(0);
    expect(nonCodeWorkflows.length).toBe(0);
  });

  it('should support multiple domains', () => {
    process.env.WORKFLOW_DOMAINS = 'code,office';

    const manager = new WorkflowManager();
    const workflows = manager.getAvailableWorkflows();

    const allowedWorkflows = workflows.filter(
      w => !w.metadata?.domain || ['code', 'office'].includes(w.metadata.domain)
    );

    expect(allowedWorkflows.length).toBe(workflows.length);
  });

  it('should handle invalid domains gracefully', () => {
    process.env.WORKFLOW_DOMAINS = 'code,invalid,office';

    const manager = new WorkflowManager();
    const workflows = manager.getAvailableWorkflows();

    // Should still work with valid domains
    expect(workflows.length).toBeGreaterThan(0);
  });
});
