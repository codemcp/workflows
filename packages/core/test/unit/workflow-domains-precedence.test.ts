import { describe, it, expect, afterEach } from 'vitest';
import { WorkflowManager } from '../../src/workflow-manager.js';

describe('WORKFLOW_DOMAINS precedence', () => {
  const originalVibe = process.env.VIBE_WORKFLOW_DOMAINS;
  const originalWorkflow = process.env.WORKFLOW_DOMAINS;

  afterEach(() => {
    if (originalVibe) process.env.VIBE_WORKFLOW_DOMAINS = originalVibe;
    else delete process.env.VIBE_WORKFLOW_DOMAINS;

    if (originalWorkflow) process.env.WORKFLOW_DOMAINS = originalWorkflow;
    else delete process.env.WORKFLOW_DOMAINS;
  });

  it('should prefer WORKFLOW_DOMAINS over VIBE_WORKFLOW_DOMAINS', () => {
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

  it('should use VIBE_WORKFLOW_DOMAINS when WORKFLOW_DOMAINS is not set', () => {
    delete process.env['VIBE_WORKFLOW_DOMAINS'];
    delete process.env['WORKFLOW_DOMAINS'];

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
});
