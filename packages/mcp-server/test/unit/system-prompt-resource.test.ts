/**
 * System Prompt Resource Tests
 *
 * Tests for the system-prompt resource handler to ensure it properly
 * exposes the system prompt through the MCP protocol.
 */

import { describe, it, expect } from 'vitest';
import { SystemPromptResourceHandler } from '../../src/resource-handlers/system-prompt.js';
import type { ServerContext } from '../../src/types.js';

describe('System Prompt Resource', () => {
  it('should expose system prompt as MCP resource', async () => {
    const handler = new SystemPromptResourceHandler();

    // Call the handler directly
    const result = await handler.handle(
      new URL('system-prompt://'),
      {} as ServerContext
    );

    // Verify the safeExecute wrapper structure
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const data = result.data!;
    expect(data.uri).toBe('system-prompt://');
    expect(data.mimeType).toBe('text/plain');
    expect(data.text).toBeDefined();
    expect(typeof data.text).toBe('string');

    // Verify content contains expected system prompt elements
    expect(data.text).toContain('You are a structured, workflow-driven agent');
    expect(data.text).toContain('whats_next()');
    expect(data.text).toContain('instructions');
    expect(data.text).toContain('plan_file_path');

    // Prompt is more comprehensive now — verify it's substantive but not unbounded
    expect(data.text.length).toBeGreaterThan(500);
    expect(data.text.length).toBeLessThan(5000);
  });

  it('should be workflow-independent and consistent', async () => {
    const handler = new SystemPromptResourceHandler();

    // Get system prompt multiple times
    const result1 = await handler.handle(
      new URL('system-prompt://'),
      {} as ServerContext
    );
    const result2 = await handler.handle(
      new URL('system-prompt://'),
      {} as ServerContext
    );
    const result3 = await handler.handle(
      new URL('system-prompt://'),
      {} as ServerContext
    );

    // All should be successful
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result3.success).toBe(true);

    // All should be identical
    expect(result1.data!.text).toBe(result2.data!.text);
    expect(result2.data!.text).toBe(result3.data!.text);

    // Verify the prompt contains standard elements
    expect(result1.data!.text).toContain(
      'You are a structured, workflow-driven agent'
    );
    expect(result1.data!.text).toContain('whats_next()');
    expect(result1.data!.text).toContain('instructions');
  });

  it('should contain all major sections of the meta-level agent prompt', async () => {
    const handler = new SystemPromptResourceHandler();

    const result = await handler.handle(
      new URL('system-prompt://'),
      {} as ServerContext
    );

    expect(result.success).toBe(true);

    const text = result.data!.text;

    // Core loop section
    expect(text).toContain('## Core loop');
    expect(text).toContain('whats_next()');
    expect(text).toContain('plan_file_path');

    // Before acting section
    expect(text).toContain('## Before acting');
    expect(text).toContain('clarifying question');

    // Scope discipline section
    expect(text).toContain('## Scope discipline');
    expect(text).toContain('proceed_to_phase');

    // Subagent delegation section
    expect(text).toContain('## Subagent delegation');
    expect(text).toContain('Capability hint');
    expect(text).toContain('thinking-specialized subagent');

    // Task management section
    expect(text).toContain('## Task management');
    expect(text).toContain('Do not use your own task management tools.');
  });
});
