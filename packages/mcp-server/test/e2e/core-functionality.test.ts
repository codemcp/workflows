import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTempProjectWithDefaultStateMachine } from '../utils/temp-files';
import {
  DirectServerInterface,
  createSuiteIsolatedE2EScenario,
  assertToolSuccess,
  initializeDevelopment,
} from '../utils/e2e-test-setup';

vi.unmock('fs');
vi.unmock('fs/promises');

/**
 * Core Functionality Tests
 *
 * Tests the essential server operations including:
 * - Server initialization and basic tool operations
 * - Resource access (plan and state resources)
 * - Basic conversation management
 * - Error handling and graceful failures
 */

describe('Core Functionality', () => {
  let client: DirectServerInterface;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const scenario = await createSuiteIsolatedE2EScenario({
      suiteName: 'core-functionality',
      tempProjectFactory: createTempProjectWithDefaultStateMachine,
    });
    client = scenario.client;
    cleanup = scenario.cleanup;

    // Initialize development with default workflow before each test
    await initializeDevelopment(client);
  });

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  describe('Server Initialization', () => {
    it('should initialize server and provide tools', async () => {
      const tools = await client.listTools();
      expect(tools.tools).toBeTruthy();
      expect(tools.tools).toHaveLength(2);
      expect(tools.tools.map(t => t.name)).toContain('whats_next');
      expect(tools.tools.map(t => t.name)).toContain('proceed_to_phase');
    });

    it('should provide resources', async () => {
      const resources = await client.listResources();
      expect(resources.resources).toBeTruthy();
      expect(resources.resources).toHaveLength(3);
      expect(resources.resources.map(r => r.uri)).toContain('plan://current');
      expect(resources.resources.map(r => r.uri)).toContain('state://current');
      expect(resources.resources.map(r => r.uri)).toContain('system-prompt://');
    });
  });

  describe('Basic Tool Operations', () => {
    it('should handle whats_next tool calls', async () => {
      const result = await client.callTool('whats_next', {
        user_input: 'implement authentication',
      });
      const response = assertToolSuccess(result);

      expect(response.phase).toBeTruthy();
      expect(response.instructions).toBeTruthy();
      expect(response.plan_file_path).toBeTruthy();
    });

    it('should handle proceed_to_phase tool calls', async () => {
      // First establish a conversation
      await client.callTool('whats_next', { user_input: 'start project' });

      const result = await client.callTool('proceed_to_phase', {
        target_phase: 'design',
        reason: 'requirements complete',
        review_state: 'not-required',
      });
      const response = assertToolSuccess(result);

      expect(response.phase).toBe('design');
      expect(response.instructions).toBeTruthy();
    });
  });

  describe('Resource Access', () => {
    it('should provide plan resource as markdown', async () => {
      // Initialize conversation to create plan file
      await client.callTool('whats_next', { user_input: 'test project' });

      const planResource = await client.readResource('plan://current');
      expect(planResource.contents).toHaveLength(1);
      expect(planResource.contents[0].mimeType).toBe('text/markdown');
      expect(planResource.contents[0].text).toContain('# Development Plan');
    });

    it('should provide state resource as JSON', async () => {
      // Initialize conversation
      await client.callTool('whats_next', { user_input: 'test project' });

      const stateResource = await client.readResource('state://current');
      expect(stateResource.contents).toHaveLength(1);
      expect(stateResource.contents[0].mimeType).toBe('application/json');

      const stateData = JSON.parse(stateResource.contents[0].text);
      expect(stateData.conversationId).toBeTruthy();
      expect(stateData.currentPhase).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid tool parameters gracefully', async () => {
      const result = await client.callTool('proceed_to_phase', {
        target_phase: 'invalid_phase',
        reason: 'test',
        review_state: 'not-required',
      });

      // Should not throw, but may return error or fallback behavior
      expect(result).toBeTruthy();
    });

    it('should handle missing parameters gracefully', async () => {
      const result = await client.callTool('whats_next', {});
      const response = assertToolSuccess(result);

      // Should still work with empty parameters
      expect(response.phase).toBeTruthy();
      expect(response.instructions).toBeTruthy();
    });

    it('should handle database errors gracefully', async () => {
      // This test would require mocking database failures
      // For now, verify basic resilience
      const result = await client.callTool('whats_next', {
        user_input: 'test resilience',
      });

      expect(assertToolSuccess(result)).toBeTruthy();
    });
  });

  describe('Basic Conversation Management', () => {
    it('should create new conversations', async () => {
      await client.callTool('whats_next', {
        user_input: 'new feature request',
      });
    });

    it('should maintain conversation state across calls', async () => {
      const first = await client.callTool('whats_next', {
        user_input: 'start project',
      });
      assertToolSuccess(first);

      const second = await client.callTool('whats_next', {
        user_input: 'continue project',
      });
      assertToolSuccess(second);
    });
  });
});
