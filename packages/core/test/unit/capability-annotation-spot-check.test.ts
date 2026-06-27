/**
 * Spot-check for built-in workflow capability annotations.
 *
 * Loads the REAL built-in workflow YAML files (not mocks) and verifies:
 *  1. Each annotated phase exposes `required_capability` with the expected
 *     value (proves the YAML edits are present and load cleanly).
 *  2. Each "DO NOT annotate" phase has NO `required_capability` (guards
 *     against over-annotation).
 *  3. The loaded capability, when fed to {@link formatCapabilityHint} with
 *     NO user config (undefined capabilityConfig), yields the exact
 *     label-only hint sentence — proves an annotated phase with no user
 *     config still produces the label-only hint out of the box.
 */

import { describe, it, expect } from 'vitest';
import {
  WorkflowManager,
  formatCapabilityHint,
  type YamlStateMachine,
} from '@codemcp/workflows-core';

type PhaseExpectations = Record<string, string | undefined>;

const ANNOTATED_PHASES: Record<string, PhaseExpectations> = {
  qrspi: {
    research: 'research',
    design: 'thinking',
    structure: 'thinking',
    plan: 'thinking',
    implement: 'coding',
    questions: undefined,
    commit: undefined,
  },
  epcc: {
    explore: 'research',
    plan: 'thinking',
    code: 'coding',
    commit: undefined,
  },
  greenfield: {
    ideation: 'thinking',
    architecture: 'thinking',
    code: 'coding',
    plan: undefined,
    finalize: undefined,
  },
  waterfall: {
    requirements: 'research',
    design: 'thinking',
    implementation: 'coding',
    qa: undefined,
    testing: undefined,
    finalize: undefined,
  },
  bugfix: {
    reproduce: 'research',
    analyze: 'thinking',
    fix: 'coding',
    verify: 'thinking',
    finalize: undefined,
  },
  tdd: {
    explore: 'research',
    red: 'thinking',
    green: 'coding',
    refactor: undefined,
    done: undefined,
  },
  'pr-review': {
    review_architecture: 'thinking',
    review_correctness: 'thinking',
    determine_intent: undefined,
    orient: undefined,
    review_quality: undefined,
    summarize: undefined,
    publish_review: undefined,
  },
};

describe('built-in workflow capability annotations', () => {
  const manager = new WorkflowManager();

  for (const [workflowName, expectations] of Object.entries(ANNOTATED_PHASES)) {
    describe(`${workflowName} workflow`, () => {
      let stateMachine: YamlStateMachine;

      it('loads the workflow YAML cleanly', () => {
        const sm = manager.getWorkflow(workflowName);
        expect(sm).toBeDefined();
        stateMachine = sm!;
        expect(stateMachine.states).toBeDefined();
      });

      for (const [phase, expectedCapability] of Object.entries(expectations)) {
        const assertion =
          expectedCapability === undefined
            ? `does NOT annotate phase "${phase}"`
            : `annotates phase "${phase}" as "${expectedCapability}"`;

        it(assertion, () => {
          const sm = manager.getWorkflow(workflowName)!;
          const state = sm.states[phase];
          expect(
            state,
            `phase "${phase}" missing in ${workflowName}`
          ).toBeDefined();
          expect(state!.required_capability).toBe(expectedCapability);
        });
      }
    });
  }

  describe('label-only hint flows from real annotations with no user config', () => {
    it('epcc explore phase yields the research label-only hint', () => {
      const sm = manager.getWorkflow('epcc')!;
      const capability = sm.states['explore'].required_capability;
      expect(capability).toBe('research');

      // No user config -> undefined capabilityConfig -> label-only hint.
      const hint = formatCapabilityHint(capability, undefined);
      expect(hint).toBe(
        'Capability hint: This phase requires research capability (fast information gathering and browsing).'
      );
      // No subagent clause emitted when config is absent.
      expect(hint).not.toContain('When launching subagents');
    });

    it('qrspi implement phase yields the coding label-only hint', () => {
      const sm = manager.getWorkflow('qrspi')!;
      const capability = sm.states['implement'].required_capability;
      expect(capability).toBe('coding');

      const hint = formatCapabilityHint(capability, undefined);
      expect(hint).toBe(
        'Capability hint: This phase requires coding capability.'
      );
    });

    it('pr-review review_architecture phase yields the thinking label-only hint', () => {
      const sm = manager.getWorkflow('pr-review')!;
      const capability = sm.states['review_architecture'].required_capability;
      expect(capability).toBe('thinking');

      const hint = formatCapabilityHint(capability, undefined);
      expect(hint).toBe(
        'Capability hint: This phase requires thinking capability (deep reasoning, complex planning).'
      );
    });
  });
});
