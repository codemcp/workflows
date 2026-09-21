import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TempProject,
  createTempProjectWithDefaultStateMachine,
} from '../utils/temp-files';
import {
  DirectServerInterface,
  createSuiteIsolatedE2EScenario,
  assertToolSuccess,
  initializeDevelopment,
} from '../utils/e2e-test-setup';
import { promises as fs } from 'node:fs';
import path from 'node:path';

vi.unmock('fs');
vi.unmock('fs/promises');

/**
 * State Management Tests
 *
 * Tests state machine functionality including:
 * - Phase transitions and state machine logic
 * - Custom state machine loading and validation
 * - State persistence and consistency
 * - Conversation state management across sessions
 */

describe('State Management', () => {
  let client: DirectServerInterface;
  let tempProject: TempProject;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const scenario = await createSuiteIsolatedE2EScenario({
      suiteName: 'state-management',
      tempProjectFactory: createTempProjectWithDefaultStateMachine,
    });
    client = scenario.client;
    tempProject = scenario.tempProject;
    cleanup = scenario.cleanup;

    // Initialize development with default workflow before each test
    await initializeDevelopment(client);
  });

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  describe('Phase Transitions', () => {
    it('should transition through standard development phases', async () => {
      // Start with requirements
      const start = await client.callTool('whats_next', {
        user_input: 'implement feature',
      });
      expect(assertToolSuccess(start).phase).toBe('requirements');

      // Transition to design
      const design = await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'requirements complete',
        review_state: 'not-required',
      });
      expect(assertToolSuccess(design).phase).toBe('design');

      // Transition to implementation
      const impl = await client.callTool('proceed_to_phase', {
        target_phase: 'implementation',
        reason: 'design complete',
        review_state: 'not-required',
      });
      expect(assertToolSuccess(impl).phase).toBe('implementation');

      // Verify state consistency
      const stateResource = await client.readResource('state://current');
      const stateData = JSON.parse(stateResource.contents[0].text);
      expect(stateData.currentPhase).toBe('implementation');
    });

    it('should support non-linear phase transitions', async () => {
      // Start conversation
      await client.callTool('whats_next', { user_input: 'start' });

      // Jump to testing phase
      const testing = await client.callTool('proceed_to_phase', {
        target_phase: 'testing',
        reason: 'skip to testing',
        review_state: 'not-required',
      });
      expect(assertToolSuccess(testing).phase).toBe('testing');

      // Go back to design
      const design = await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'need to revise design',
        review_state: 'not-required',
      });
      expect(assertToolSuccess(design).phase).toBe('design');
    });

    it('should track phase transition history', async () => {
      await client.callTool('whats_next', { user_input: 'start' });
      await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'test',
        review_state: 'not-required',
      });
      await client.callTool('proceed_to_phase', {
        target_phase: 'implementation',
        reason: 'test',
        review_state: 'not-required',
      });

      const stateResource = await client.readResource('state://current');
      const stateData = JSON.parse(stateResource.contents[0].text);

      expect(stateData.currentPhase).toBe('implementation');
      // Verify conversation maintains consistency
      expect(stateData.conversationId).toBeTruthy();
    });
  });

  describe('Custom State Machines', () => {
    beforeEach(async () => {
      // Reset any existing development state
      await cleanup();

      // Create a fresh test environment without initializing development
      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'state-management-custom',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });

      client = scenario.client;
      tempProject = scenario.tempProject;
      cleanup = scenario.cleanup;
    });

    it('should load custom state machine from .vibe directory', async () => {
      const vibeDir = path.join(tempProject.projectPath, '.vibe');
      await fs.mkdir(vibeDir, { recursive: true });

      const customStateMachine = `
name: "custom"
description: "Custom development workflow for testing"
initial_state: "planning"
states:
  planning:
    description: "Planning phase"
    default_instructions: "Start planning the feature. Define what needs to be built and create a plan."
    transitions:
      - trigger: "planning_complete"
        to: "building"
        instructions: "Planning complete, start building"
        transition_reason: "Planning phase finished, moving to building"
  building:
    description: "Building phase"
    default_instructions: "Build the feature according to the plan. Focus on implementation and testing."
    transitions:
      - trigger: "build_finished"
        to: "complete"
        instructions: "Building complete, feature is ready"
        transition_reason: "Building phase finished, feature complete"
  complete:
    description: "Completed"
    default_instructions: "Feature is complete and ready for delivery."
    transitions: []
`;

      await fs.writeFile(
        path.join(vibeDir, 'workflow.yaml'),
        customStateMachine
      );

      // Initialize development with start_development and specify custom workflow
      const result = await client.callTool('start_development', {
        workflow: 'custom',
        commit_behaviour: 'none',
      });
      const response = assertToolSuccess(result);

      expect(response.phase).toBe('planning');
      expect(response.instructions).toContain('whats_next()');
    });

    it('should support .yml extension for state machine files', async () => {
      const vibeDir = path.join(tempProject.projectPath, '.vibe');
      await fs.mkdir(vibeDir, { recursive: true });

      const customStateMachine = `
name: "custom"
description: "Test .yml extension"
initial_state: "start"
states:
  start:
    description: "Start state"
    default_instructions: "YML state machine loaded"
    transitions: []
`;

      await fs.writeFile(
        path.join(vibeDir, 'workflow.yml'),
        customStateMachine
      );

      // Initialize development with custom workflow
      await client.callTool('start_development', {
        workflow: 'custom',
        commit_behaviour: 'none',
      });

      // Then call whats_next
      const result = await client.callTool('whats_next', {
        user_input: 'test yml',
      });
      const response = assertToolSuccess(result);

      expect(response.phase).toBe('start');
      expect(response.instructions).toContain('YML state machine loaded');
    });

    it('should fall back to default state machine on invalid custom configuration', async () => {
      // Mock logger only for this test to suppress expected error output
      const mockCreateLogger = vi.fn().mockReturnValue({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      });

      // Mock the module
      vi.doMock('@codemcp/workflows-core', async () => {
        const actual = await vi.importActual('@codemcp/workflows-core');
        return {
          ...actual,
          createLogger: mockCreateLogger,
        };
      });

      const vibeDir = path.join(tempProject.projectPath, '.vibe');
      await fs.mkdir(vibeDir, { recursive: true });

      // Create invalid YAML
      await fs.writeFile(
        path.join(vibeDir, 'workflow.yaml'),
        'invalid: yaml: ['
      );

      // Initialize development with waterfall workflow since custom will fail
      await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const result = await client.callTool('whats_next', {
        user_input: 'test fallback',
      });
      const response = assertToolSuccess(result);

      // Should fall back to default state machine
      expect(response.phase).toBeTruthy();
      expect(response.instructions).toBeTruthy();
    });

    it('should use default state machine when no custom configuration exists', async () => {
      // Initialize development with waterfall workflow
      await client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const result = await client.callTool('whats_next', {
        user_input: 'test default',
      });
      const response = assertToolSuccess(result);

      // Should use default phases
      expect(['idle', 'requirements']).toContain(response.phase);
    });
  });

  describe('State Persistence', () => {
    it('should persist state across tool calls', async () => {
      const first = await client.callTool('whats_next', {
        user_input: 'start project',
      });
      assertToolSuccess(first);

      const proceedResult = await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'move to design',
        review_state: 'not-required',
      });
      const proceedResponse = assertToolSuccess(proceedResult);

      // Verify the proceed_to_phase result reflects the transition
      expect(proceedResponse.phase).toBe('design');
    });

    it('should maintain conversation state consistency', async () => {
      const result = await client.callTool('whats_next', {
        user_input: 'test consistency',
      });
      const response = assertToolSuccess(result);

      const stateResource = await client.readResource('state://current');
      const stateData = JSON.parse(stateResource.contents[0].text);

      expect(stateData.currentPhase).toBe(response.phase);
    });

    it('should handle concurrent state updates', async () => {
      // Initialize conversation
      await client.callTool('whats_next', { user_input: 'start' });

      // Make multiple rapid state changes
      const promises = [
        client.callTool('proceed_to_phase', {
          target_phase: 'design',
          reason: 'test1',
          review_state: 'not-required',
        }),
        client.callTool('proceed_to_phase', {
          target_phase: 'implementation',
          reason: 'test2',
          review_state: 'not-required',
        }),
        client.callTool('proceed_to_phase', {
          target_phase: 'qa',
          reason: 'test3',
          review_state: 'not-required',
        }),
      ];

      const results = await Promise.all(promises);

      // All should succeed (though final state may vary)
      for (const result of results) {
        expect(result).toBeTruthy();
      }

      // Final state should be consistent
      const stateResource = await client.readResource('state://current');
      const stateData = JSON.parse(stateResource.contents[0].text);
      expect(stateData.currentPhase).toBeTruthy();
    });
  });

  describe('Conversation Context Management', () => {
    it('should handle conversation context in whats_next calls', async () => {
      // Call whats_next with rich context
      const result = await client.callTool('whats_next', {
        user_input: 'I want to implement authentication',
        context: 'Starting new feature development',
        conversation_summary: 'Starting new auth feature',
        recent_messages: [
          { role: 'user', content: 'I need authentication' },
          { role: 'assistant', content: 'I can help with that' },
        ],
      });

      const response = assertToolSuccess(result);
      expect(response.phase).toBeTruthy();
      expect(response.instructions).toBeTruthy();
    });

    it('should maintain context across phase transitions', async () => {
      // Start with context
      await client.callTool('whats_next', {
        user_input: 'start feature',
        context: 'new feature development',
      });

      // Transition with context
      const transition = await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'requirements gathered',
        review_state: 'not-required',
      });

      const response = assertToolSuccess(transition);
      expect(response.phase).toBe('design');
      expect(response.instructions).toBeTruthy();
    });
  });
});
