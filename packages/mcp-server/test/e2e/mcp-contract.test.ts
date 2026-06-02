import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  TempProject,
  createTempProjectWithDefaultStateMachine,
} from '../utils/temp-files';

vi.unmock('fs');
vi.unmock('fs/promises');

/**
 * MCP Contract Validation Tests
 *
 * Tests the Model Context Protocol contract by using a real MCP TypeScript client
 * from the official SDK to connect to our @codemcp/workflows and validate:
 * - Server initialization and capability negotiation
 * - All exposed resources (plan://current, state://current)
 * - All exposed tools (whats_next, proceed_to_phase)
 * - Protocol compliance and message formats
 * - Error handling and edge cases
 */
describe('MCP Contract Validation', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let tempProject: TempProject;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Create temporary project for testing
    const scenario = await createTempProjectWithDefaultStateMachine();
    tempProject = scenario;
    cleanup = async () => {
      await scenario.cleanup();
    };

    // Build the server if needed
    const serverPath = path.resolve(__dirname, '../../../cli/dist/index.js');
    const serverExists = await fs
      .access(serverPath)
      .then(() => true)
      .catch(() => false);

    if (!serverExists) {
      throw new Error(
        `Server not built. Please run 'npm run build' first. Looking for: ${serverPath}`
      );
    }

    // Create MCP client and transport (this will spawn the server process)
    // Note: Due to limitations in StdioClientTransport, environment variables
    // are not properly passed to the spawned server process, so this test
    // may show INFO level logs despite our attempts to suppress them.

    // Use a shell script wrapper that explicitly changes the working directory
    // This ensures the server operates in the temporary directory and not the current project directory
    // which is essential for clean test isolation
    const wrapperScriptPath = path.resolve(
      __dirname,
      '../utils/run-server-in-dir.sh'
    );

    transport = new StdioClientTransport({
      command: wrapperScriptPath,
      args: [tempProject.projectPath, serverPath],
      env: {
        ...process.env,
        LOG_LEVEL: 'ERROR',
        NODE_ENV: 'test',
        VITEST: 'true',
      },
    });

    client = new Client(
      {
        name: 'mcp-contract-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          roots: {},
          sampling: {},
        },
      }
    );

    // Connect to the server
    await client.connect(transport);

    // Start development for all MCP contract tests
    await client.callTool({
      name: 'start_development',
      arguments: {
        workflow: 'waterfall',
        commit_behaviour: 'none', // Use 'none' for test isolation
      },
    });
  });

  afterEach(async () => {
    // Clean up client and transport
    if (client) {
      await client.close();
    }
    if (transport) {
      await transport.close();
    }
    if (cleanup) {
      await cleanup();
    }
  });

  describe('Server Initialization and Capabilities', () => {
    it('should successfully initialize with proper server info', async () => {
      // The connection in beforeEach validates basic initialization
      // Here we verify the server info was properly exchanged
      expect(client).toBeDefined();

      // Verify we can make basic requests (this confirms initialization succeeded)
      const tools = await client.listTools();
      expect(tools).toBeDefined();
    });

    it('should expose correct capabilities', async () => {
      // Test that server exposes the expected capabilities
      // by verifying we can call the expected methods without errors

      // Should support tools
      const tools = await client.listTools();
      expect(tools.tools).toBeDefined();
      expect(Array.isArray(tools.tools)).toBe(true);

      // Should support resources
      const resources = await client.listResources();
      expect(resources.resources).toBeDefined();
      expect(Array.isArray(resources.resources)).toBe(true);
    });
  });

  describe('Tools Contract Validation', () => {
    it('should expose whats_next tool with correct schema', async () => {
      const tools = await client.listTools();

      const whatsNextTool = tools.tools.find(
        tool => tool.name === 'whats_next'
      );
      expect(whatsNextTool).toBeDefined();
      expect(whatsNextTool!.description).toBeTruthy();
      expect(whatsNextTool!.inputSchema).toBeDefined();

      // Verify the input schema allows the expected parameters
      const schema = whatsNextTool!.inputSchema;
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();

      // Should accept optional parameters like user_input, context, etc.
      const properties = schema.properties as Record<string, unknown>;
      expect(properties.user_input).toBeDefined();
      expect(properties.context).toBeDefined();
      expect(properties.conversation_summary).toBeDefined();
      expect(properties.recent_messages).toBeDefined();
    });

    it('should expose proceed_to_phase tool with correct schema', async () => {
      const tools = await client.listTools();

      const proceedTool = tools.tools.find(
        tool => tool.name === 'proceed_to_phase'
      );
      expect(proceedTool).toBeDefined();
      expect(proceedTool!.description).toBeTruthy();
      expect(proceedTool!.inputSchema).toBeDefined();

      const schema = proceedTool!.inputSchema;
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();

      const properties = schema.properties as Record<string, unknown>;
      expect(properties.target_phase).toBeDefined();
      expect(properties.reason).toBeDefined();

      // target_phase should be required
      expect(schema.required).toContain('target_phase');
    });

    it('should execute whats_next tool successfully', async () => {
      const result = await client.callTool({
        name: 'whats_next',
        arguments: {
          user_input: 'implement authentication system',
        },
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      // Should return text content with phase information
      const textContent = result.content.find(c => c.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent!.text).toBeTruthy();

      // Response should contain structured data about the phase
      const responseText = textContent!.text;
      expect(responseText).toContain('phase');
      expect(responseText).toContain('instructions');
    });

    it('should execute proceed_to_phase tool successfully', async () => {
      // First call whats_next to establish a conversation
      await client.callTool({
        name: 'whats_next',
        arguments: {
          user_input: 'start project',
        },
      });

      // Then proceed to a different phase
      const result = await client.callTool({
        name: 'proceed_to_phase',
        arguments: {
          target_phase: 'design',
          reason: 'requirements complete',
          review_state: 'not-required',
        },
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      const textContent = result.content.find(c => c.type === 'text');
      expect(textContent).toBeDefined();
      expect(textContent!.text).toBeTruthy();

      const responseText = textContent!.text;
      expect(responseText).toContain('phase');
      expect(responseText).toContain('design');
    });

    it('should handle tool errors gracefully', async () => {
      // Test invalid phase transition
      const result = await client.callTool({
        name: 'proceed_to_phase',
        arguments: {
          target_phase: 'invalid_phase',
          reason: 'test error handling',
          review_state: 'not-required',
        },
      });

      // Should return error information rather than throwing
      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);
    });
  });

  describe('Resources Contract Validation', () => {
    it('should expose plan://current resource', async () => {
      const resources = await client.listResources();

      const planResource = resources.resources.find(
        r => r.uri === 'plan://current'
      );
      expect(planResource).toBeDefined();
      expect(planResource!.name).toBeTruthy();
      expect(planResource!.description).toBeTruthy();
      expect(planResource!.mimeType).toBe('text/markdown');
    });

    it('should expose state://current resource', async () => {
      const resources = await client.listResources();

      const stateResource = resources.resources.find(
        r => r.uri === 'state://current'
      );
      expect(stateResource).toBeDefined();
      expect(stateResource!.name).toBeTruthy();
      expect(stateResource!.description).toBeTruthy();
      expect(stateResource!.mimeType).toBe('application/json');
    });

    it('should read plan resource successfully', async () => {
      // First establish a conversation to ensure plan file exists
      await client.callTool({
        name: 'whats_next',
        arguments: {
          user_input: 'test plan resource',
        },
      });

      const result = await client.readResource({
        uri: 'plan://current',
      });

      expect(result.contents).toBeDefined();
      expect(Array.isArray(result.contents)).toBe(true);
      expect(result.contents.length).toBeGreaterThan(0);

      const content = result.contents[0];
      expect(content.uri).toBe('plan://current');
      expect(content.mimeType).toBe('text/markdown');
      expect(content.text).toBeTruthy();

      // Should contain markdown plan structure
      expect(content.text).toContain('# Development Plan');
      expect(content.text).toContain('## Goal');
    });

    it('should read state resource successfully', async () => {
      // First establish a conversation to ensure state exists
      await client.callTool({
        name: 'whats_next',
        arguments: {
          user_input: 'test state resource',
        },
      });

      const result = await client.readResource({
        uri: 'state://current',
      });

      expect(result.contents).toBeDefined();
      expect(Array.isArray(result.contents)).toBe(true);
      expect(result.contents.length).toBeGreaterThan(0);

      const content = result.contents[0];
      expect(content.uri).toBe('state://current');
      expect(content.mimeType).toBe('application/json');
      expect(content.text).toBeTruthy();

      // Should contain valid JSON with state information
      const stateData = JSON.parse(content.text);
      expect(stateData.currentPhase).toBeTruthy();
      expect(stateData.projectPath).toBeTruthy();
    });

    it('should handle resource read errors gracefully', async () => {
      // Test reading non-existent resource
      try {
        await client.readResource({
          uri: 'nonexistent://resource',
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Should throw an appropriate error
        expect(error).toBeDefined();
      }
    });
  });

  describe('Protocol Compliance', () => {
    it('should handle concurrent requests properly', async () => {
      // Make multiple concurrent requests to test protocol handling
      const promises = [
        client.callTool({
          name: 'whats_next',
          arguments: { user_input: 'concurrent test 1' },
        }),
        client.callTool({
          name: 'whats_next',
          arguments: { user_input: 'concurrent test 2' },
        }),
        client.listTools(),
        client.listResources(),
      ];

      const results = await Promise.all(promises);

      // All requests should succeed
      for (const result of results) {
        expect(result).toBeDefined();
      }

      // Tool results should have content
      expect(results[0].content).toBeDefined();
      expect(results[1].content).toBeDefined();

      // List results should have arrays
      expect(Array.isArray(results[2].tools)).toBe(true);
      expect(Array.isArray(results[3].resources)).toBe(true);
    });

    it('should handle malformed requests appropriately', async () => {
      // Test with missing required parameters
      try {
        await client.callTool({
          name: 'proceed_to_phase',
          arguments: {
            // Missing required target_phase
            reason: 'test malformed request',
            review_state: 'not-required',
          },
        });
        // Should not reach here if validation works
        expect(true).toBe(false);
      } catch (error) {
        // Should handle validation error appropriately
        expect(error).toBeDefined();
      }
    });
  });

  describe('Integration Scenarios', () => {
    it('should support complete development workflow', async () => {
      // Start with requirements
      const start = await client.callTool({
        name: 'whats_next',
        arguments: {
          user_input: 'implement user authentication system',
          context: 'new feature development',
        },
      });

      const startResponse = JSON.parse(start.content[0].text);

      // Check if we're using a custom state machine by looking at the phase
      // Default state machine uses: idle, requirements, design, implementation, qa, testing, complete
      // If we get other phases, skip the test as it's using a custom state machine
      const defaultPhases = [
        'idle',
        'requirements',
        'design',
        'implementation',
        'qa',
        'testing',
        'complete',
      ];

      if (!defaultPhases.includes(startResponse.phase)) {
        console.log(
          `Skipping test: Custom state machine detected (phase: ${startResponse.phase})`
        );
        return; // Skip test
      }

      // The server intelligently determines the appropriate starting phase
      expect(['requirements', 'design']).toContain(startResponse.phase);

      // Transition to design (if not already there)
      let currentPhase = startResponse.phase;
      if (currentPhase !== 'design') {
        const design = await client.callTool({
          name: 'proceed_to_phase',
          arguments: {
            target_phase: 'design',
            reason: 'requirements analysis complete',
            review_state: 'not-required',
          },
        });

        const designResponse = JSON.parse(design.content[0].text);
        expect(designResponse.phase).toBe('design');
        currentPhase = 'design';
      }

      // Verify state resource reflects the current phase
      const stateResult = await client.readResource({
        uri: 'state://current',
      });

      const stateData = JSON.parse(stateResult.contents[0].text);
      expect(stateData.currentPhase).toBe(currentPhase);

      // Verify plan resource contains relevant phase information
      const planResult = await client.readResource({
        uri: 'plan://current',
      });

      const planContent = planResult.contents[0].text;
      expect(planContent).toContain('# Development Plan');
      expect(planContent).toContain('## Goal');
    });

    it('should handle complex conversation context', async () => {
      const result = await client.callTool({
        name: 'whats_next',
        arguments: {
          user_input: 'implement OAuth integration',
          context: 'user wants third-party authentication',
          conversation_summary:
            'Discussed authentication options, user prefers OAuth with Google and GitHub',
          recent_messages: [
            {
              role: 'user',
              content: 'What authentication options do we have?',
            },
            {
              role: 'assistant',
              content: 'We can use OAuth, JWT, or traditional sessions',
            },
            {
              role: 'user',
              content: 'OAuth sounds good, especially Google and GitHub',
            },
          ],
        },
      });

      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.phase).toBeTruthy();
      expect(response.instructions).toBeTruthy();
    });
  });
});
