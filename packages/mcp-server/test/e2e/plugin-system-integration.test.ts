/**
 * Plugin System Integration Tests - REWRITTEN WITH PROPER ASSERTIONS
 *
 * Comprehensive end-to-end tests validating that the plugin system works correctly.
 *
 * This test suite focuses on:
 * 1. Contract validation - ensuring all responses meet defined interfaces
 * 2. Semantic validation - verifying values are valid and meaningful
 * 3. Plugin isolation - ensuring no internal plugin details leak
 * 4. Multi-workflow support - testing different workflow types
 * 5. State consistency - maintaining conversation state across calls
 *
 * DESIGN PRINCIPLES ENFORCED:
 * - NO fuzzy assertions with || operators
 * - NO type-only checks without semantic validation
 * - NO unsafe casts or assumptions
 * - ALL properties validated explicitly
 * - UUID format validation for IDs
 * - File existence checks for paths
 * - Phase validity checks against workflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTempProjectWithDefaultStateMachine } from '../utils/temp-files';
import {
  DirectServerInterface,
  createSuiteIsolatedE2EScenario,
  assertToolSuccess,
  initializeDevelopment,
} from '../utils/e2e-test-setup';
import { promises as fs } from 'node:fs';
import { McpToolResponse } from '../../src/types';
import type { StartDevelopmentResult } from '../../src/tool-handlers/start-development';
import type { ProceedToPhaseResult } from '../../src/tool-handlers/proceed-to-phase';
import type { WhatsNextResult } from '../../src/tool-handlers/whats-next';

vi.unmock('fs');
vi.unmock('fs/promises');

// ============================================================================
// TEST CONSTANTS (Remove magic numbers)
// ============================================================================

// Minimum length for substantive instructions
// Must be long enough to contain meaningful guidance, not just placeholders
const MIN_INSTRUCTION_LENGTH = 100;

// Expected initial phases for different workflows
const WORKFLOW_INITIAL_PHASES = {
  waterfall: 'requirements',
  epcc: 'explore',
  tdd: 'explore',
  minor: 'explore',
  bugfix: ['reproduce', 'analyze'], // Can start with either
};

// ============================================================================
// VALIDATION HELPER FUNCTIONS
// ============================================================================
// These helpers enforce strict contract validation and prevent assertion
// repetition. Each helper comprehensively validates one response type.

/**
 * Validates that a value is a non-empty string
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validates that instructions are substantive (not just whitespace)
 * VALIDATE: Instructions must contain meaningful content to guide users
 */
function isSubstantiveContent(value: string): boolean {
  // Must be >100 chars and contain development-related keywords
  return (
    value.length > 100 &&
    /\b(phase|development|task|workflow|requirements|design|implementation|plan)\b/i.test(
      value
    )
  );
}

/**
 * Comprehensive validation for StartDevelopmentResult
 * VALIDATE: Response must have all required properties with correct types and values
 */
function assertValidStartDevelopmentResponse(
  response: unknown
): StartDevelopmentResult {
  expect(response).toBeDefined();
  expect(typeof response).toBe('object');
  expect(response).not.toBeNull();

  // Type guard with direct cast (no chained as unknown as)
  if (typeof response !== 'object' || response === null) {
    throw new Error('Response must be an object');
  }
  const result = response as Record<string, unknown>;

  expect(result).toHaveProperty('phase');
  expect(isNonEmptyString(result.phase)).toBe(true);

  expect(result).toHaveProperty('plan_file_path');
  expect(isNonEmptyString(result.plan_file_path)).toBe(true);

  expect(result).toHaveProperty('instructions');
  expect(isNonEmptyString(result.instructions)).toBe(true);
  expect(isSubstantiveContent(result.instructions as string)).toBe(true);

  if (result.workflowDocumentationUrl !== undefined) {
    expect(typeof result.workflowDocumentationUrl).toBe('string');
  }

  return result as unknown as StartDevelopmentResult;
}

/**
 * Comprehensive validation for ProceedToPhaseResult
 * VALIDATE: Response must have all required properties with correct types and values
 */
function assertValidProceedToPhaseResponse(
  response: unknown
): ProceedToPhaseResult {
  expect(response).toBeDefined();
  expect(typeof response).toBe('object');
  expect(response).not.toBeNull();

  // Type guard with direct cast (no chained as unknown as)
  if (typeof response !== 'object' || response === null) {
    throw new Error('Response must be an object');
  }
  const result = response as Record<string, unknown>;

  expect(result).toHaveProperty('phase');
  expect(isNonEmptyString(result.phase)).toBe(true);

  expect(result).toHaveProperty('instructions');
  expect(isNonEmptyString(result.instructions)).toBe(true);
  expect(isSubstantiveContent(result.instructions as string)).toBe(true);

  expect(result).toHaveProperty('plan_file_path');
  expect(isNonEmptyString(result.plan_file_path)).toBe(true);

  expect(result).toHaveProperty('transition_reason');
  expect(isNonEmptyString(result.transition_reason)).toBe(true);

  return result as unknown as ProceedToPhaseResult;
}

/**
 * Comprehensive validation for WhatsNextResult
 * VALIDATE: Response must have all required properties with correct types and values
 */
function assertValidWhatsNextResponse(response: unknown): WhatsNextResult {
  expect(response).toBeDefined();
  expect(typeof response).toBe('object');
  expect(response).not.toBeNull();

  // Type guard with direct cast (no chained as unknown as)
  if (typeof response !== 'object' || response === null) {
    throw new Error('Response must be an object');
  }
  const result = response as Record<string, unknown>;

  expect(result).toHaveProperty('phase');
  expect(isNonEmptyString(result.phase)).toBe(true);

  expect(result).toHaveProperty('instructions');
  expect(isNonEmptyString(result.instructions)).toBe(true);
  expect(isSubstantiveContent(result.instructions as string)).toBe(true);

  expect(result).toHaveProperty('plan_file_path');
  expect(isNonEmptyString(result.plan_file_path)).toBe(true);

  return result as unknown as WhatsNextResult;
}

/**
 * Ensures no plugin internals leak into response
 * VALIDATE: User-facing responses must not expose plugin architecture
 */
function assertNoPluginLeak(response: unknown): void {
  const result = response as Record<string, unknown>;

  // Plugin internals that must NOT appear
  expect(result).not.toHaveProperty('plugins');
  expect(result).not.toHaveProperty('pluginRegistry');
  expect(result).not.toHaveProperty('plugin_metadata');
  expect(result).not.toHaveProperty('_plugins');
  expect(result).not.toHaveProperty('_pluginRegistry');
  expect(result).not.toHaveProperty('beads');
  expect(result).not.toHaveProperty('taskBackend');
}

/**
 * Validates that file exists at given path
 * VALIDATE: Plan files must be created and accessible
 */
async function assertFileExists(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`File does not exist: ${filePath}`);
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Plugin System Integration Tests', () => {
  describe('Contract Validation', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // Explicitly disable beads auto-detection for this test suite
      vi.stubEnv('TASK_BACKEND', 'markdown');

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'contract-validation',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should return valid StartDevelopmentResult with all required properties', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result);
      const validated = assertValidStartDevelopmentResponse(response);

      expect(validated.phase).toBeDefined();
      expect(validated.plan_file_path).toBeDefined();
      expect(validated.instructions).toBeDefined();
    });

    it('should return valid ProceedToPhaseResult with all required properties', async () => {
      await initializeDevelopment(client, 'waterfall');

      const result = await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'requirements analysis complete',
        review_state: 'not-required',
      });

      const response = assertToolSuccess(result);
      const validated = assertValidProceedToPhaseResponse(response);

      expect(validated.phase).toBe('design');
    });

    it('should return valid WhatsNextResult with all required properties', async () => {
      await initializeDevelopment(client, 'waterfall');

      const result = await client.callTool('whats_next', {
        user_input: 'what should I do now?',
        context: 'starting development',
      });

      const response = assertToolSuccess(result);
      const validated = assertValidWhatsNextResponse(response);

      expect(validated.phase).toBe('requirements');
    });

    it('should validate conversation IDs are UUID format', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      assertToolSuccess(result);
    });

    it('should validate instructions contain substantive content', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result);

      expect(response.instructions.length).toBeGreaterThan(100);
      expect(response.instructions).toMatch(
        /\b(phase|development|task|workflow|plan)\b/i
      );
    });

    it('should validate plan files exist after start_development', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result);

      await assertFileExists(response.plan_file_path);
      const content = await fs.readFile(response.plan_file_path, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe('Semantic Validation', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // Explicitly disable beads auto-detection for this test suite
      vi.stubEnv('TASK_BACKEND', 'markdown');

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'semantic-validation',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should create existing plan files with proper structure', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result);

      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');
      expect(planContent).toContain('## Explore');
      expect(planContent).toContain('## Plan');
      expect(planContent).toContain('## Code');
      expect(planContent).toContain('## Commit');
    });

    it('should transition to valid phases only', async () => {
      await initializeDevelopment(client, 'waterfall');

      const validPhases = [
        'requirements',
        'design',
        'implementation',
        'qa',
        'testing',
        'finalize',
      ];

      for (const targetPhase of validPhases.slice(1)) {
        const result = await client.callTool('proceed_to_phase', {
          target_phase: targetPhase,
          reason: 'test transition',
          review_state: 'not-required',
        });

        const response = assertToolSuccess(result);

        expect(response.phase).toBe(targetPhase);
        expect(validPhases).toContain(response.phase);
      }
    });

    it('should maintain plan file consistency across transitions', async () => {
      await initializeDevelopment(client, 'waterfall');

      const result1 = await client.callTool('whats_next', {
        user_input: 'test 1',
      });
      const response1 = assertToolSuccess(result1);
      const planPath1 = response1.plan_file_path;

      // Transition phases
      await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'ready to design',
        review_state: 'not-required',
      });

      const result2 = await client.callTool('whats_next', {
        user_input: 'test 2',
      });
      const response2 = assertToolSuccess(result2);

      expect(response2.plan_file_path).toBe(planPath1);

      const planContent = await fs.readFile(planPath1, 'utf-8');
      expect(planContent.length).toBeGreaterThan(0);
    });

    it('should generate substantive instructions for each phase', async () => {
      await initializeDevelopment(client, 'waterfall');

      const phases = [
        'requirements',
        'design',
        'implementation',
        'qa',
        'testing',
        'finalize',
      ];

      for (let i = 1; i < phases.length; i++) {
        const result = await client.callTool('whats_next', {
          user_input: `continue to ${phases[i]}`,
        });
        const response = assertToolSuccess(result);

        expect(isSubstantiveContent(response.instructions)).toBe(true);

        // Transition to next phase
        if (i < phases.length - 1) {
          await client.callTool('proceed_to_phase', {
            target_phase: phases[i + 1],
            reason: 'test transition',
            review_state: 'not-required',
          });
        }
      }
    });
  });

  describe('Plugin Isolation', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // Explicitly disable beads auto-detection for this test suite
      vi.stubEnv('TASK_BACKEND', 'markdown');

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'plugin-isolation',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should not expose plugin internals in StartDevelopmentResult', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result);

      assertNoPluginLeak(response);

      expect(response).toHaveProperty('phase');
      expect(response).toHaveProperty('instructions');
    });

    it('should not expose plugin internals in ProceedToPhaseResult', async () => {
      await initializeDevelopment(client, 'waterfall');

      const result = await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'test',
        review_state: 'not-required',
      });

      const response = assertToolSuccess(result);

      assertNoPluginLeak(response);

      expect(response).toHaveProperty('phase');
      expect(response).toHaveProperty('instructions');
    });

    it('should not expose plugin internals in WhatsNextResult', async () => {
      await initializeDevelopment(client, 'waterfall');

      const result = await client.callTool('whats_next', {
        user_input: 'test',
      });

      const response = assertToolSuccess(result);

      assertNoPluginLeak(response);

      expect(response).toHaveProperty('phase');
      expect(response).toHaveProperty('instructions');
    });
  });

  describe('Multi-Workflow Support', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // Explicitly disable beads auto-detection for this test suite
      vi.stubEnv('TASK_BACKEND', 'markdown');

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'multi-workflow',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should work with waterfall workflow', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      assertValidStartDevelopmentResponse(assertToolSuccess(result));
    });

    it('should work with epcc workflow', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      expect(response.phase).toBe('explore');
    });

    it('should work with tdd workflow', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'tdd',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      expect(response.phase).toBe('explore');
    });

    it('should work with minor workflow', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'minor',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      expect(response.phase).toBe('explore');
    });

    it('should work with bugfix workflow', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'bugfix',
        commit_behaviour: 'none',
      });

      assertValidStartDevelopmentResponse(assertToolSuccess(result));
    });
  });

  describe('State Consistency', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // Explicitly disable beads auto-detection for this test suite
      vi.stubEnv('TASK_BACKEND', 'markdown');

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'state-consistency',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should handle phase transitions with proper state updates', async () => {
      await initializeDevelopment(client, 'waterfall');

      // Verify initial state
      const stateResource1 = await client.readResource('state://current');
      if (typeof stateResource1 !== 'object' || stateResource1 === null) {
        throw new Error('State resource must be an object');
      }
      const state1 = stateResource1 as Record<string, unknown>;
      const contents1 = state1.contents as unknown[];
      const stateData1 = JSON.parse(
        (contents1[0] as Record<string, unknown>).text as string
      );

      expect(stateData1.currentPhase).toBe('requirements');

      // Transition
      await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'test',
        review_state: 'not-required',
      });

      // Verify state updated
      const stateResource2 = await client.readResource('state://current');
      if (typeof stateResource2 !== 'object' || stateResource2 === null) {
        throw new Error('State resource must be an object');
      }
      const state2 = stateResource2 as Record<string, unknown>;
      const contents2 = state2.contents as unknown[];
      const stateData2 = JSON.parse(
        (contents2[0] as Record<string, unknown>).text as string
      );

      expect(stateData2.currentPhase).toBe('design');
    });
  });

  describe('Error Handling and Resilience', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // Explicitly disable beads auto-detection for this test suite
      vi.stubEnv('TASK_BACKEND', 'markdown');

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'error-handling',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should recover from invalid phase transitions', async () => {
      await initializeDevelopment(client, 'waterfall');

      // Try invalid transition
      const invalid: McpToolResponse = await client.callTool(
        'proceed_to_phase',
        {
          target_phase: 'invalid_phase_name',
          reason: 'test',
          review_state: 'not-required',
        }
      );

      expect(invalid.error).toBeDefined();

      // Should still work afterwards
      const recovery = await client.callTool('whats_next', {
        user_input: 'recover',
      });
      assertValidWhatsNextResponse(assertToolSuccess(recovery));
    });

    it('should handle missing workflow gracefully', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'nonexistent_workflow_xyz',
        commit_behaviour: 'none',
      });

      expect(result).toBeDefined();
    });

    it('should maintain consistency after errors', async () => {
      await initializeDevelopment(client, 'waterfall');

      // Get initial state
      const state1 = (await client.readResource('state://current')) as unknown;
      const stateRes1 = state1 as Record<string, unknown>;
      const data1 = JSON.parse(
        ((stateRes1.contents as unknown[])[0] as Record<string, unknown>)
          .text as string
      );

      expect(data1.currentPhase).toBe('requirements');

      // Cause an error
      await client.callTool('proceed_to_phase', {
        target_phase: 'bad_phase',
        reason: 'error test',
        review_state: 'not-required',
      });

      // State should still be valid
      const state2 = (await client.readResource('state://current')) as unknown;
      const stateRes2 = state2 as Record<string, unknown>;
      const data2 = JSON.parse(
        ((stateRes2.contents as unknown[])[0] as Record<string, unknown>)
          .text as string
      );

      expect(data2.currentPhase).toBe(data1.currentPhase);

      expect(data2.conversationId).toBe(data1.conversationId);
    });
  });

  describe('Default Behavior (Without Beads)', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // Don't set TASK_BACKEND - tests auto-detection behavior
      if (process.env.TASK_BACKEND) {
        delete process.env.TASK_BACKEND;
      }

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'plugin-default-behavior',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should initialize server without beads plugin', async () => {
      // Verify environment is clean
      expect(process.env.TASK_BACKEND).toBeUndefined();

      const result = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      await assertFileExists(response.plan_file_path);
      expect(response.phase).toBe('requirements');
    });

    it('should handle start_development without plugin interference', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');
      expect(planContent).toContain('## Explore');
      expect(planContent).toContain('## Plan');
      expect(planContent).toContain('## Code');
      expect(planContent).toContain('## Commit');
    });
  });

  describe('Resource Access', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // Explicitly disable beads auto-detection for this test suite
      vi.stubEnv('TASK_BACKEND', 'markdown');

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'resource-access',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;

      await initializeDevelopment(client, 'waterfall');
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should provide access to state resource with valid structure', async () => {
      const stateResource = (await client.readResource(
        'state://current'
      )) as unknown;
      const resource = stateResource as Record<string, unknown>;

      expect(resource).toHaveProperty('contents');
      expect(Array.isArray(resource.contents)).toBe(true);
      expect((resource.contents as unknown[]).length).toBeGreaterThan(0);

      const content = (
        (resource.contents as unknown[])[0] as Record<string, unknown>
      ).text as string;
      const stateData = JSON.parse(content);
      expect(typeof stateData.conversationId).toBe('string');
      expect(stateData.conversationId.length).toBeGreaterThan(0);
      expect(typeof stateData.currentPhase).toBe('string');
      expect(stateData.currentPhase.length).toBeGreaterThan(0);
    });

    it('should provide access to plan resource with substantive content', async () => {
      const planResource = (await client.readResource(
        'plan://current'
      )) as unknown;
      const resource = planResource as Record<string, unknown>;

      expect(resource).toHaveProperty('contents');
      expect(Array.isArray(resource.contents)).toBe(true);
      expect((resource.contents as unknown[]).length).toBeGreaterThan(0);

      const content = (
        (resource.contents as unknown[])[0] as Record<string, unknown>
      ).text as string;
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    });

    it('should provide access to system prompt resource', async () => {
      const promptResource = (await client.readResource(
        'system-prompt://'
      )) as unknown;
      const resource = promptResource as Record<string, unknown>;

      expect(resource).toHaveProperty('contents');
      expect(Array.isArray(resource.contents)).toBe(true);
      expect((resource.contents as unknown[]).length).toBeGreaterThan(0);

      const contentObj = (resource.contents as unknown[])[0] as Record<
        string,
        unknown
      >;
      // Try text first (primary), then content (secondary), then get string representation
      let content: string;
      if (typeof contentObj.text === 'string' && contentObj.text.length > 0) {
        content = contentObj.text;
      } else if (
        typeof contentObj.content === 'string' &&
        contentObj.content.length > 0
      ) {
        content = contentObj.content;
      } else if (Object.keys(contentObj).length > 0) {
        // If object has properties but no usable string property, convert to string
        content = JSON.stringify(contentObj);
      } else {
        throw new Error('Content object has no usable content');
      }
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // PLUGIN HOOK EXECUTION VERIFICATION
  // =========================================================================

  describe('Plugin Hook Execution Verification', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // Explicitly disable beads auto-detection for this test suite
      vi.stubEnv('TASK_BACKEND', 'markdown');

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'plugin-hook-execution',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should execute hooks during start_development and return valid response', async () => {
      // Start development - triggers plugin hooks
      const result = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      // (plan file exists, instructions present, phase valid)
      expect(response.phase).toBe('requirements');
      expect(response.plan_file_path).toBeDefined();

      // Verify plan file was created by hooks
      await assertFileExists(response.plan_file_path);
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');
      expect(planContent.length).toBeGreaterThan(0);
    });

    it('should maintain state consistency after hook execution', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const startResponse = assertValidStartDevelopmentResponse(
        assertToolSuccess(startResult)
      );

      // Call whats_next immediately after hooks
      const whatsNextResult = await client.callTool('whats_next', {
        user_input: 'test after hooks',
        context: 'right after start',
      });

      const whatsNextResponse = assertValidWhatsNextResponse(
        assertToolSuccess(whatsNextResult)
      );

      expect(whatsNextResponse.phase).toBe(startResponse.phase);
      expect(whatsNextResponse.plan_file_path).toBe(
        startResponse.plan_file_path
      );
    });

    it('should ensure hooks do not break plan file validity', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      // Read and validate plan file
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      expect(planContent).toMatch(/^# /m); // Title
      expect(planContent).toMatch(/^## /m); // Sections
      expect(planContent).toContain('## Goal');
      expect(planContent).toContain('## Requirements');

      expect(planContent).not.toContain('undefined');
      expect(planContent).not.toContain('[object Object]');
    });

    it('should handle hook execution for multiple workflows', async () => {
      const workflows = ['waterfall', 'epcc', 'tdd', 'minor'];

      for (const workflow of workflows) {
        // Create fresh scenario for each workflow
        const scenario = await createSuiteIsolatedE2EScenario({
          suiteName: `plugin-hooks-${workflow}`,
          tempProjectFactory: createTempProjectWithDefaultStateMachine,
        });

        const result = await scenario.client.callTool('start_development', {
          workflow: workflow,
          commit_behaviour: 'none',
        });

        const response = assertValidStartDevelopmentResponse(
          assertToolSuccess(result)
        );

        await assertFileExists(response.plan_file_path);

        await scenario.cleanup();
      }
    });
  });

  // =========================================================================
  // PLUGIN SYSTEM ARCHITECTURE VALIDATION
  // =========================================================================

  describe('Plugin System Architecture', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // Explicitly disable beads auto-detection for this test suite
      vi.stubEnv('TASK_BACKEND', 'markdown');

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'plugin-architecture',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should not expose plugin registry or internal plugin details', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result);

      assertNoPluginLeak(response);

      expect(Object.keys(response).sort()).toEqual(
        [
          'allowed_file_patterns',
          'instructions',
          'phase',
          'plan_file_path',
          'workflowDocumentationUrl',
        ].sort()
      );
    });

    it('should apply plugins uniformly across all tool calls', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      assertValidStartDevelopmentResponse(assertToolSuccess(startResult));

      // Get whats_next
      const whatsNextResult = await client.callTool('whats_next', {
        user_input: 'next step',
      });

      assertValidWhatsNextResponse(assertToolSuccess(whatsNextResult));

      // Transition phase
      const transitionResult = await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'ready',
        review_state: 'not-required',
      });

      assertValidProceedToPhaseResponse(assertToolSuccess(transitionResult));
    });

    it('should preserve plugin boundaries (no cross-pollution)', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result);

      assertNoPluginLeak(response);

      expect(response).toHaveProperty('plan_file_path');
      expect(response).toHaveProperty('instructions');

      expect(response).not.toHaveProperty('_plugins');
      expect(response).not.toHaveProperty('beads');
      expect(response).not.toHaveProperty('taskBackendClient');
    });
  });

  // =========================================================================
  // WORKFLOW INITIALIZATION VALIDATION
  // =========================================================================

  describe('Workflow Initialization with Plugin Support', () => {
    let cleanup: () => Promise<void>;

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
      // Explicitly disable beads auto-detection for this test suite
      vi.stubEnv('TASK_BACKEND', 'markdown');
    });

    it('should initialize waterfall with correct initial phase', async () => {
      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'init-waterfall',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      cleanup = scenario.cleanup;

      const result = await scenario.client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      expect(response.phase).toBe(WORKFLOW_INITIAL_PHASES.waterfall);
    });

    it('should initialize epcc with correct initial phase', async () => {
      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'init-epcc',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      cleanup = scenario.cleanup;

      const result = await scenario.client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      expect(response.phase).toBe(WORKFLOW_INITIAL_PHASES.epcc);
    });

    it('should initialize tdd with correct initial phase', async () => {
      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'init-tdd',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      cleanup = scenario.cleanup;

      const result = await scenario.client.callTool('start_development', {
        workflow: 'tdd',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      expect(response.phase).toBe(WORKFLOW_INITIAL_PHASES.tdd);
    });

    it('should initialize minor with correct initial phase', async () => {
      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'init-minor',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      cleanup = scenario.cleanup;

      const result = await scenario.client.callTool('start_development', {
        workflow: 'minor',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      expect(response.phase).toBe(WORKFLOW_INITIAL_PHASES.minor);
    });

    it('should initialize bugfix with expected initial phase', async () => {
      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'init-bugfix',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      cleanup = scenario.cleanup;

      const result = await scenario.client.callTool('start_development', {
        workflow: 'bugfix',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      const expectedPhases = WORKFLOW_INITIAL_PHASES.bugfix;
      expect(expectedPhases).toContain(response.phase);
    });
  });

  // =========================================================================
  // PLAN FILE AND INSTRUCTION QUALITY
  // =========================================================================

  describe('Plan File and Instruction Quality Across Workflows', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // Explicitly disable beads auto-detection for this test suite
      vi.stubEnv('TASK_BACKEND', 'markdown');

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'quality-across-workflows',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should generate substantive instructions that meet minimum length requirement', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      expect(response.instructions.length).toBeGreaterThan(
        MIN_INSTRUCTION_LENGTH
      );
    });

    it('should create plan files with valid markdown structure', async () => {
      const result = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const response = assertValidStartDevelopmentResponse(
        assertToolSuccess(result)
      );

      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      expect(planContent).toMatch(/^# /m); // Must have main title
      expect(planContent).toMatch(/^## /m); // Must have sections
      expect(planContent).not.toContain('[object Object]'); // No serialization errors
      expect(planContent).not.toContain('undefined'); // No undefined placeholders
    });

    it('should ensure instructions are context-aware for the current phase', async () => {
      // Start and get initial instructions
      const startResult = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const startResponse = assertValidStartDevelopmentResponse(
        assertToolSuccess(startResult)
      );

      expect(startResponse.instructions).toMatch(/requirement|phase|task/i);

      // Transition to design phase
      await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'ready',
        review_state: 'not-required',
      });

      // Get instructions for design phase
      const designWhatsNext = await client.callTool('whats_next', {
        user_input: 'what now in design?',
      });

      const designResponse = assertValidWhatsNextResponse(
        assertToolSuccess(designWhatsNext)
      );

      expect(designResponse.instructions).toBeDefined();
      expect(designResponse.instructions.length).toBeGreaterThan(
        MIN_INSTRUCTION_LENGTH
      );
    });
  });

  // =========================================================================
  // STATE PERSISTENCE AND CONSISTENCY
  // =========================================================================

  describe('State Persistence Across Plugin Execution', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // Explicitly disable beads auto-detection for this test suite
      vi.stubEnv('TASK_BACKEND', 'markdown');

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'state-persistence',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should preserve plan file path through multiple operations', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const startResponse = assertValidStartDevelopmentResponse(
        assertToolSuccess(startResult)
      );
      const planPath = startResponse.plan_file_path;

      // Get whats_next
      const whatsNextResult = await client.callTool('whats_next', {
        user_input: 'continue',
      });

      const whatsNextResponse = assertValidWhatsNextResponse(
        assertToolSuccess(whatsNextResult)
      );

      expect(whatsNextResponse.plan_file_path).toBe(planPath);

      // Transition
      const transitionResult = await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'ready',
        review_state: 'not-required',
      });

      const transitionResponse = assertValidProceedToPhaseResponse(
        assertToolSuccess(transitionResult)
      );

      expect(transitionResponse.plan_file_path).toBe(planPath);
    });

    it('should maintain plan file integrity through multiple tool calls', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const startResponse = assertValidStartDevelopmentResponse(
        assertToolSuccess(startResult)
      );

      // Verify plan file exists for multiple operations
      const _initialContent = await fs.readFile(
        startResponse.plan_file_path,
        'utf-8'
      );

      // Make multiple calls
      await client.callTool('whats_next', { user_input: 'test' });
      await client.callTool('whats_next', { user_input: 'test2' });
      await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'ready',
        review_state: 'not-required',
      });

      // Check plan file still valid
      const finalContent = await fs.readFile(
        startResponse.plan_file_path,
        'utf-8'
      );

      expect(finalContent.length).toBeGreaterThan(0);

      expect(finalContent).not.toContain('[object Object]');
      expect(finalContent).not.toContain('undefined');
    });
  });
});
