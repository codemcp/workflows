import { describe, it, expect, afterEach } from 'vitest';
import { WorkflowManager } from '../../src/workflow-manager.js';

describe('WORKFLOW_DOMAINS precedence (backward compat)', () => {
  const originalVibe = process.env.VIBE_WORKFLOW_DOMAINS;
  const originalWorkflow = process.env.WORKFLOW_DOMAINS;
  const originalDefault = process.env.DEFAULT_DOMAINS;
  const originalDefaultAll = process.env.DEFAULT_ALL_DOMAINS;

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

  it('should prefer WORKFLOW_DOMAINS over legacy VIBE_WORKFLOW_DOMAINS when both are set', () => {
    delete process.env['VIBE_WORKFLOW_DOMAINS'];
    delete process.env['WORKFLOW_DOMAINS'];

    process.env['VIBE_WORKFLOW_DOMAINS'] = 'code';
    process.env['WORKFLOW_DOMAINS'] = 'architecture';

    const manager = new WorkflowManager();
    const workflows = manager.getAvailableWorkflows();

    console.log('Available workflows:', workflows.map(w => w.name).join(', '));

    const workflowNames = workflows.map(w => w.name);
    const hasArchitecture = workflowNames.some(w =>
      [
        'adr',
        'big-bang-conversion',
        'boundary-testing',
        'business-analysis',
        'c4-analysis',
      ].includes(w)
    );

    console.log('Has architecture workflows:', hasArchitecture);
    expect(hasArchitecture).toBe(true);
  });

  it('should fall back to legacy VIBE_WORKFLOW_DOMAINS when WORKFLOW_DOMAINS is not set', () => {
    delete process.env['VIBE_WORKFLOW_DOMAINS'];
    delete process.env['WORKFLOW_DOMAINS'];

    // Simulate a user who still has the old VIBE_WORKFLOW_DOMAINS set
    process.env['VIBE_WORKFLOW_DOMAINS'] = 'code';

    const manager = new WorkflowManager();
    const workflows = manager.getAvailableWorkflows();

    console.log(
      'Available workflows (code only):',
      workflows.map(w => w.name).join(', ')
    );

    const workflowNames = workflows.map(w => w.name);
    const hasCode = workflowNames.some(w =>
      ['epcc', 'tdd', 'bugfix', 'minor'].includes(w)
    );
    const hasArchitecture = workflowNames.some(w =>
      ['adr', 'big-bang-conversion'].includes(w)
    );

    console.log('Has code workflows:', hasCode);
    console.log('Has architecture workflows:', hasArchitecture);

    expect(hasCode).toBe(true);
    expect(hasArchitecture).toBe(false);
  });

  it('should use DEFAULT_DOMAINS when WORKFLOW_DOMAINS is unset', () => {
    delete process.env['WORKFLOW_DOMAINS'];
    delete process.env['VIBE_WORKFLOW_DOMAINS'];
    delete process.env['DEFAULT_DOMAINS'];

    process.env['DEFAULT_DOMAINS'] = 'architecture';

    const manager = new WorkflowManager();
    const workflows = manager.getAvailableWorkflows();

    const workflowNames = workflows.map(w => w.name);
    const hasArchitecture = workflowNames.some(w =>
      ['adr', 'big-bang-conversion'].includes(w)
    );
    const hasCode = workflowNames.some(w =>
      ['epcc', 'tdd', 'bugfix', 'minor'].includes(w)
    );

    expect(hasArchitecture).toBe(true);
    expect(hasCode).toBe(false);
  });

  it('should prefer WORKFLOW_DOMAINS over DEFAULT_DOMAINS', () => {
    delete process.env['WORKFLOW_DOMAINS'];
    delete process.env['VIBE_WORKFLOW_DOMAINS'];

    process.env['WORKFLOW_DOMAINS'] = 'code';
    process.env['DEFAULT_DOMAINS'] = 'architecture';

    const manager = new WorkflowManager();
    const workflows = manager.getAvailableWorkflows();

    const workflowNames = workflows.map(w => w.name);
    const hasCode = workflowNames.some(w =>
      ['epcc', 'tdd', 'bugfix', 'minor'].includes(w)
    );
    const hasArchitecture = workflowNames.some(w =>
      ['adr', 'big-bang-conversion'].includes(w)
    );

    expect(hasCode).toBe(true);
    expect(hasArchitecture).toBe(false);
  });

  it('should prefer DEFAULT_DOMAINS over VIBE_WORKFLOW_DOMAINS', () => {
    delete process.env['WORKFLOW_DOMAINS'];
    delete process.env['VIBE_WORKFLOW_DOMAINS'];

    process.env['DEFAULT_DOMAINS'] = 'architecture';
    process.env['VIBE_WORKFLOW_DOMAINS'] = 'code';

    const manager = new WorkflowManager();
    const workflows = manager.getAvailableWorkflows();

    const workflowNames = workflows.map(w => w.name);
    const hasArchitecture = workflowNames.some(w =>
      ['adr', 'big-bang-conversion'].includes(w)
    );
    const hasCode = workflowNames.some(w =>
      ['epcc', 'tdd', 'bugfix', 'minor'].includes(w)
    );

    expect(hasArchitecture).toBe(true);
    expect(hasCode).toBe(false);
  });

  it('should use constructor defaultDomains when provided (overrides all env vars)', () => {
    delete process.env['WORKFLOW_DOMAINS'];
    delete process.env['VIBE_WORKFLOW_DOMAINS'];
    delete process.env['DEFAULT_DOMAINS'];

    process.env['WORKFLOW_DOMAINS'] = 'code';
    process.env['DEFAULT_DOMAINS'] = 'architecture';

    const manager = new WorkflowManager({ defaultDomains: 'office' });
    const workflows = manager.getAvailableWorkflows();

    const workflowNames = workflows.map(w => w.name);
    const hasOffice = workflowNames.some(w => ['posts', 'slides'].includes(w));
    const hasCode = workflowNames.some(w =>
      ['epcc', 'tdd', 'bugfix', 'minor'].includes(w)
    );
    const hasArchitecture = workflowNames.some(w =>
      ['adr', 'big-bang-conversion'].includes(w)
    );

    expect(hasOffice).toBe(true);
    expect(hasCode).toBe(false);
    expect(hasArchitecture).toBe(false);
  });

  it('should load all workflows when no domain configuration is set (empty Set fallback)', () => {
    delete process.env['WORKFLOW_DOMAINS'];
    delete process.env['VIBE_WORKFLOW_DOMAINS'];
    delete process.env['DEFAULT_DOMAINS'];

    const manager = new WorkflowManager();
    const workflows = manager.getAvailableWorkflows();

    // Collect all unique domains from loaded workflows
    const domains = new Set(
      workflows.map(w => w.metadata?.domain).filter(Boolean) as string[]
    );

    // Should have workflows from multiple domains, not just 'code'
    expect(domains.size).toBeGreaterThan(1);
  });

  it('should use DEFAULT_ALL_DOMAINS env var in getAllAvailableWorkflows()', () => {
    delete process.env['WORKFLOW_DOMAINS'];
    delete process.env['VIBE_WORKFLOW_DOMAINS'];
    delete process.env['DEFAULT_DOMAINS'];
    delete process.env['DEFAULT_ALL_DOMAINS'];

    process.env['DEFAULT_ALL_DOMAINS'] = 'code,office';

    const manager = new WorkflowManager();
    const allWorkflows = manager.getAllAvailableWorkflows();

    const workflowNames = allWorkflows.map(w => w.name);
    const hasCode = workflowNames.some(w => ['epcc', 'tdd'].includes(w));
    const hasOffice = workflowNames.some(w => ['posts', 'slides'].includes(w));
    const hasArchitecture = workflowNames.some(w =>
      ['adr', 'big-bang-conversion'].includes(w)
    );

    expect(hasCode).toBe(true);
    expect(hasOffice).toBe(true);
    expect(hasArchitecture).toBe(false);
  });

  it('getAllAvailableWorkflows() should include all known domains by default', () => {
    delete process.env['WORKFLOW_DOMAINS'];
    delete process.env['VIBE_WORKFLOW_DOMAINS'];
    delete process.env['DEFAULT_DOMAINS'];
    delete process.env['DEFAULT_ALL_DOMAINS'];

    const manager = new WorkflowManager();
    const allWorkflows = manager.getAllAvailableWorkflows();

    const domains = new Set(
      allWorkflows.map(w => w.metadata?.domain).filter(Boolean) as string[]
    );

    // Should include all 7 known domains
    expect(domains).toContain('code');
    expect(domains).toContain('architecture');
    expect(domains).toContain('office');
    expect(domains).toContain('sdd');
  });
});
