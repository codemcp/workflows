/**
 * Test plugin registration in server-config
 *
 * Design principle: Plugins are always REGISTERED, but only ENABLED when their
 * activation conditions are met. This allows plugins to activate/deactivate
 * dynamically based on conditions that may change after registration.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { initializeServerComponents } from '../../src/server-config.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// Mock child_process to control bd command availability
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('Server Config Plugin Registration', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.resetAllMocks(); // Reset mock implementations, not just call history
    tempDir = await mkdtemp(join(tmpdir(), 'server-config-test-'));
  });

  afterEach(async () => {
    vi.resetAllMocks();
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should register BeadsPlugin when TASK_BACKEND is beads and bd is available', async () => {
    vi.stubEnv('TASK_BACKEND', 'beads');

    // Mock bd --version to return success
    vi.mocked(execSync).mockReturnValue('beads v1.0.0\n');

    const components = await initializeServerComponents({
      projectPath: tempDir,
    });

    expect(components.context.pluginRegistry).toBeDefined();
    const pluginRegistry = components.context.pluginRegistry!;

    // Check that BeadsPlugin was registered
    const pluginNames = pluginRegistry.getPluginNames();
    expect(pluginNames).toContain('BeadsPlugin');

    // Check that it's enabled
    const enabledPlugins = pluginRegistry.getEnabledPlugins();
    expect(enabledPlugins).toHaveLength(1);
    expect(enabledPlugins[0].getName()).toBe('BeadsPlugin');
  });

  it('should register BeadsPlugin but not enable it when TASK_BACKEND is markdown', async () => {
    // Explicitly set markdown to disable beads
    vi.stubEnv('TASK_BACKEND', 'markdown');

    const components = await initializeServerComponents({
      projectPath: tempDir,
    });

    expect(components.context.pluginRegistry).toBeDefined();
    const pluginRegistry = components.context.pluginRegistry!;

    // Both plugins should be REGISTERED
    const pluginNames = pluginRegistry.getPluginNames();
    expect(pluginNames).toContain('CommitPlugin');
    expect(pluginNames).toContain('BeadsPlugin');

    // But neither should be ENABLED (CommitPlugin needs COMMIT_BEHAVIOR, BeadsPlugin needs beads)
    const enabledPlugins = pluginRegistry.getEnabledPlugins();
    expect(enabledPlugins).toHaveLength(0);
  });

  it('should register BeadsPlugin but not enable it when bd is not available', async () => {
    // Explicitly clear TASK_BACKEND - triggers auto-detection
    delete process.env.TASK_BACKEND;

    // Mock bd --version to throw (command not found)
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('command not found: bd');
    });

    const components = await initializeServerComponents({
      projectPath: tempDir,
    });

    expect(components.context.pluginRegistry).toBeDefined();
    const pluginRegistry = components.context.pluginRegistry!;

    // Both plugins should be REGISTERED
    const pluginNames = pluginRegistry.getPluginNames();
    expect(pluginNames).toContain('CommitPlugin');
    expect(pluginNames).toContain('BeadsPlugin');

    // But neither should be ENABLED
    expect(pluginRegistry.getEnabledPlugins()).toHaveLength(0);
  });

  // Note: Auto-detection tests are covered in E2E tests (beads-plugin-integration.test.ts)
  // because mocking child_process across package boundaries requires E2E-style server setup
});
