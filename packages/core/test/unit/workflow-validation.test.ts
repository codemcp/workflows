/**
 * Workflow Validation Tests
 *
 * Comprehensive tests to ensure all workflow files are valid and meet formal criteria:
 * - All workflows can be loaded without errors
 * - Every state is reachable through transition chains
 * - Workflow structure integrity (initial state exists, phases defined, etc.)
 * - No orphaned states or unreachable phases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowInfo, WorkflowManager } from '@codemcp/workflows-core';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { YamlStateMachine, YamlState } from '@codemcp/workflows-core';

describe('Workflow Validation', () => {
  const workflowsDir = join(__dirname, '..', '..', 'resources', 'workflows');
  const workflowFiles = readdirSync(workflowsDir).filter(
    file => file.endsWith('.yaml') || file.endsWith('.yml')
  );

  describe('Workflow Loading', () => {
    it('should load all workflow files without errors', () => {
      const workflowManager = new WorkflowManager();

      // Get all available workflows
      const workflows = workflowManager.getAvailableWorkflows();

      // Should have loaded workflows (at least the core ones)
      expect(workflows.length).toBeGreaterThan(0);

      // Check that we have the expected core workflows
      const expectedCoreWorkflows = ['bugfix', 'waterfall', 'epcc', 'minor'];
      const workflowNames = workflows.map(w => w.name);
      for (const workflow of expectedCoreWorkflows) {
        expect(workflowNames).toContain(workflow);
      }
    });

    it('should load ALL workflow files from resources directory', () => {
      // Temporarily disable domain filtering for this test
      const originalEnv = process.env.WORKFLOW_DOMAINS;
      process.env.WORKFLOW_DOMAINS =
        'code,architecture,office,sdd,sdd-crowd,children,skilled';

      try {
        // Create manager after setting env var to include all domains
        const workflowManager = new WorkflowManager();
        const loadedWorkflows = workflowManager.getAvailableWorkflows();
        const loadedWorkflowNames = loadedWorkflows.map(w => w.name);

        // Count expected workflow files
        const expectedWorkflowCount = workflowFiles.length;

        // Should load exactly the same number of workflows as files
        expect(loadedWorkflows.length).toBe(expectedWorkflowCount);

        // Each workflow file should correspond to a loaded workflow
        for (const file of workflowFiles) {
          const workflowName = file.replace(/\.(yaml|yml)$/, '');
          expect(loadedWorkflowNames).toContain(workflowName);
        }
      } finally {
        if (originalEnv !== undefined) {
          process.env.WORKFLOW_DOMAINS = originalEnv;
        } else {
          delete process.env.WORKFLOW_DOMAINS;
        }
      }
    });

    it('should have valid workflow files in resources directory', () => {
      expect(workflowFiles.length).toBeGreaterThan(0);

      // Check that all files have valid extensions
      for (const file of workflowFiles) {
        expect(file.endsWith('.yaml') || file.endsWith('.yml')).toBe(true);
      }
    });
  });

  describe('Workflow Structure Validation', () => {
    let workflowManager: WorkflowManager;
    let workflows: WorkflowInfo[];

    beforeEach(() => {
      workflowManager = new WorkflowManager();
      workflows = workflowManager.getAvailableWorkflows();
    });

    it('should have required fields for each workflow', () => {
      for (const workflow of workflows) {
        expect(workflow).toBeDefined();
        expect(workflow.name).toBeDefined();
        expect(typeof workflow.name).toBe('string');
        expect(workflow.displayName).toBeDefined();
        expect(typeof workflow.displayName).toBe('string');
        expect(workflow.phases).toBeDefined();
        expect(Array.isArray(workflow.phases)).toBe(true);
        expect(workflow.phases.length).toBeGreaterThan(0);
      }
    });

    it('should have valid state machines for each workflow', () => {
      for (const workflow of workflows) {
        // Get the state machine for this workflow
        const stateMachine = workflowManager.getWorkflow(workflow.name);

        expect(stateMachine).toBeDefined();
        expect(stateMachine!.name).toBe(workflow.name);
        expect(stateMachine!.description).toBeDefined();
        expect(stateMachine!.initial_state).toBeDefined();
        expect(stateMachine!.states).toBeDefined();
        expect(typeof stateMachine!.states).toBe('object');
      }
    });

    it('should have initial state defined in states', () => {
      for (const workflow of workflows) {
        const stateMachine = workflowManager.getWorkflow(workflow.name);

        expect(stateMachine!.states[stateMachine!.initial_state]).toBeDefined();
      }
    });

    it('should have all phases represented as states', () => {
      for (const workflow of workflows) {
        const stateMachine = workflowManager.getWorkflow(workflow.name);

        // Every phase should exist as a state
        for (const phase of workflow.phases) {
          expect(stateMachine!.states[phase]).toBeDefined();
        }
      }
    });
  });

  describe('State Reachability Analysis', () => {
    let workflowManager: WorkflowManager;
    let workflows: WorkflowInfo[];

    beforeEach(() => {
      workflowManager = new WorkflowManager();
      workflows = workflowManager.getAvailableWorkflows();
    });

    /**
     * Build a graph of state transitions and check reachability
     */
    function analyzeStateReachability(stateMachine: YamlStateMachine) {
      const states = Object.keys(stateMachine.states);
      const reachableStates = new Set<string>();
      const visited = new Set<string>();

      // Start from initial state
      const queue = [stateMachine.initial_state];
      reachableStates.add(stateMachine.initial_state);

      while (queue.length > 0) {
        const currentState = queue.shift()!;

        if (visited.has(currentState)) continue;
        visited.add(currentState);

        const stateConfig = stateMachine.states[currentState];
        if (stateConfig.transitions) {
          for (const transition of stateConfig.transitions) {
            if (transition.to && !reachableStates.has(transition.to)) {
              reachableStates.add(transition.to);
              queue.push(transition.to);
            }
          }
        }
      }

      return {
        allStates: states,
        reachableStates: Array.from(reachableStates),
        unreachableStates: states.filter(state => !reachableStates.has(state)),
      };
    }

    it('should have all states reachable from initial state', () => {
      for (const workflow of workflows) {
        const stateMachine = workflowManager.getWorkflow(workflow.name);
        const analysis = analyzeStateReachability(stateMachine!);

        expect(analysis.unreachableStates).toEqual([]);

        // All states should be reachable
        expect(analysis.reachableStates.length).toBe(analysis.allStates.length);
      }
    });

    it('should have valid transition targets', () => {
      for (const workflow of workflows) {
        const stateMachine = workflowManager.getWorkflow(workflow.name);

        for (const [_stateName, stateConfig] of Object.entries(
          stateMachine!.states
        ) as [string, YamlState][]) {
          if (stateConfig.transitions) {
            for (const transition of stateConfig.transitions) {
              if (transition.to) {
                // Target state must exist
                expect(stateMachine!.states[transition.to]).toBeDefined();
              }
            }
          }
        }
      }
    });

    it('should have meaningful transition triggers', () => {
      for (const workflow of workflows) {
        const stateMachine = workflowManager.getWorkflow(workflow.name);

        for (const [_stateName, stateConfig] of Object.entries(
          stateMachine!.states
        ) as [string, YamlState][]) {
          if (stateConfig.transitions) {
            for (const transition of stateConfig.transitions) {
              // Each transition should have a trigger
              expect(transition.trigger).toBeDefined();
              expect(typeof transition.trigger).toBe('string');
              expect(transition.trigger.length).toBeGreaterThan(0);

              // Trigger should be meaningful (not just whitespace)
              expect(transition.trigger.trim()).toBe(transition.trigger);
              expect(transition.trigger.trim().length).toBeGreaterThan(0);
            }
          }
        }
      }
    });
  });

  describe('Workflow Content Quality', () => {
    let workflowManager: WorkflowManager;
    let workflows: WorkflowInfo[];

    beforeEach(() => {
      workflowManager = new WorkflowManager();
      workflows = workflowManager.getAvailableWorkflows();
    });

    it('should have meaningful descriptions for all states', () => {
      for (const workflow of workflows) {
        const stateMachine = workflowManager.getWorkflow(workflow.name);

        for (const [_stateName, stateConfig] of Object.entries(
          stateMachine!.states
        ) as [string, YamlState][]) {
          expect(stateConfig.description).toBeDefined();
          expect(typeof stateConfig.description).toBe('string');
          expect(stateConfig.description.length).toBeGreaterThan(10); // Meaningful description
        }
      }
    });

    it('should have default instructions for all states', () => {
      for (const workflow of workflows) {
        const stateMachine = workflowManager.getWorkflow(workflow.name);

        for (const [_stateName, stateConfig] of Object.entries(
          stateMachine!.states
        ) as [string, YamlState][]) {
          expect(stateConfig.default_instructions).toBeDefined();
          expect(typeof stateConfig.default_instructions).toBe('string');
          expect(stateConfig.default_instructions.length).toBeGreaterThan(20); // Substantial instructions
        }
      }
    });

    it('should have workflow metadata', () => {
      for (const workflow of workflows) {
        const stateMachine = workflowManager.getWorkflow(workflow.name);

        // Should have basic metadata
        expect(stateMachine!.name).toBeDefined();
        expect(stateMachine!.description).toBeDefined();
        expect(typeof stateMachine!.description).toBe('string');
        expect(stateMachine!.description.length).toBeGreaterThan(10);
      }
    });
  });

  describe('Workflow Integration', () => {
    it('should be able to create workflow instances', () => {
      const workflowManager = new WorkflowManager();
      const workflows = workflowManager.getAvailableWorkflows();

      // Should be able to get workflow info for each workflow
      for (const workflow of workflows) {
        const workflowInfo = workflowManager.getWorkflowInfo(workflow.name);
        expect(workflowInfo).toBeDefined();
        expect(workflowInfo!.name).toBe(workflow.name);
        expect(workflowInfo!.phases).toBeDefined();
        expect(Array.isArray(workflowInfo!.phases)).toBe(true);
      }
    });
  });
});
