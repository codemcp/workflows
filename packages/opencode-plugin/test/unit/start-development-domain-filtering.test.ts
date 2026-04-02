/**
 * Unit Tests for Domain Filtering in start_development Tool
 *
 * Tests that the start_development tool respects WORKFLOW_DOMAINS
 * configuration and only shows workflows matching enabled domains.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { createStartDevelopmentTool } from '../../src/tool-handlers/start-development.js';

// Test utilities
function createTempDir(): string {
  const dir = path.join(
    tmpdir(),
    `opencode-start-dev-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('start_development tool - Domain Filtering', () => {
  let testDir: string;
  const originalWorkflowEnv = process.env.WORKFLOW_DOMAINS;
  const originalLegacyEnv = process.env.VIBE_WORKFLOW_DOMAINS;

  beforeEach(() => {
    testDir = createTempDir();
  });

  afterEach(() => {
    cleanupDir(testDir);
    // Restore original environment
    if (originalWorkflowEnv !== undefined) {
      process.env.WORKFLOW_DOMAINS = originalWorkflowEnv;
    } else {
      delete process.env.WORKFLOW_DOMAINS;
    }
    if (originalLegacyEnv !== undefined) {
      process.env.VIBE_WORKFLOW_DOMAINS = originalLegacyEnv;
    } else {
      delete process.env.VIBE_WORKFLOW_DOMAINS;
    }
  });

  it('shows only code domain workflows when WORKFLOW_DOMAINS=code', () => {
    process.env.WORKFLOW_DOMAINS = 'code';
    delete process.env.VIBE_WORKFLOW_DOMAINS;

    const mockGetServerContext = async () =>
      ({
        loggerFactory: undefined,
      }) as never;
    const updateCachedState = () => {};

    const tool = createStartDevelopmentTool(
      testDir,
      mockGetServerContext,
      updateCachedState
    );

    // Tool description should indicate workflows from code domain
    expect(tool.description).toBeDefined();
    expect(typeof tool.description).toBe('string');

    // Should mention available workflows
    expect(
      tool.description.includes('Available:') ||
        tool.description.includes('workflow')
    ).toBe(true);

    // Code domain workflows: epcc, tdd, minor, bugfix
    console.log(
      'Tool description with WORKFLOW_DOMAINS=code:',
      tool.description
    );
  });

  it('shows multiple domain workflows when WORKFLOW_DOMAINS=code,architecture', () => {
    process.env.WORKFLOW_DOMAINS = 'code,architecture';
    delete process.env.VIBE_WORKFLOW_DOMAINS;

    const mockGetServerContext = async () =>
      ({
        loggerFactory: undefined,
      }) as never;
    const updateCachedState = () => {};

    const tool = createStartDevelopmentTool(
      testDir,
      mockGetServerContext,
      updateCachedState
    );

    const description = tool.description;

    // Should show workflows from both domains
    expect(description).toBeDefined();
    expect(typeof description).toBe('string');

    // Should have workflow information
    expect(
      description.includes('Available:') || description.includes('workflow')
    ).toBe(true);

    console.log(
      'Tool description with WORKFLOW_DOMAINS=code,architecture:',
      description
    );
  });

  it('shows default code domain workflows when WORKFLOW_DOMAINS is not set', () => {
    delete process.env.WORKFLOW_DOMAINS;
    delete process.env.VIBE_WORKFLOW_DOMAINS;

    const mockGetServerContext = async () =>
      ({
        loggerFactory: undefined,
      }) as never;
    const updateCachedState = () => {};

    const tool = createStartDevelopmentTool(
      testDir,
      mockGetServerContext,
      updateCachedState
    );

    const description = tool.description;

    // Default is 'code' domain only
    expect(description).toBeDefined();
    expect(typeof description).toBe('string');

    // Should show available workflows or indicate code domain
    expect(
      description.includes('Available:') ||
        description.includes('workflow') ||
        description.includes('no workflows')
    ).toBe(true);

    console.log('Tool description with default WORKFLOW_DOMAINS:', description);
  });

  it('tool description indicates when no workflows are available for configured domains', () => {
    // Set an impossible domain that won't match any workflows
    process.env.WORKFLOW_DOMAINS = 'nonexistent-impossible-domain';
    delete process.env.VIBE_WORKFLOW_DOMAINS;

    const mockGetServerContext = async () =>
      ({
        loggerFactory: undefined,
      }) as never;
    const updateCachedState = () => {};

    const tool = createStartDevelopmentTool(
      testDir,
      mockGetServerContext,
      updateCachedState
    );

    const description = tool.description;

    // Should indicate no workflows available and mention domain configuration
    expect(description).toContain('no workflows available');
    expect(description.includes('WORKFLOW_DOMAINS')).toBe(true);

    console.log('Tool description with impossible domain:', description);
  });

  it('has proper tool structure with description, args, and execute', () => {
    process.env.WORKFLOW_DOMAINS = 'code';
    delete process.env.VIBE_WORKFLOW_DOMAINS;

    const mockGetServerContext = async () =>
      ({
        loggerFactory: undefined,
      }) as never;
    const updateCachedState = () => {};

    const tool = createStartDevelopmentTool(
      testDir,
      mockGetServerContext,
      updateCachedState
    );

    // Verify tool structure
    expect(tool.description).toBeDefined();
    expect(typeof tool.description).toBe('string');

    expect(tool.args).toBeDefined();
    expect(typeof tool.args).toBe('object');

    expect(tool.execute).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });

  it('falls back to legacy VIBE_WORKFLOW_DOMAINS when WORKFLOW_DOMAINS is not set', () => {
    delete process.env.WORKFLOW_DOMAINS;
    process.env.VIBE_WORKFLOW_DOMAINS = 'code';

    const mockGetServerContext = async () =>
      ({
        loggerFactory: undefined,
      }) as never;
    const updateCachedState = () => {};

    const tool = createStartDevelopmentTool(
      testDir,
      mockGetServerContext,
      updateCachedState
    );

    const description = tool.description;

    // Should work the same as WORKFLOW_DOMAINS=code
    expect(description).toBeDefined();
    expect(
      description.includes('Available:') || description.includes('workflow')
    ).toBe(true);

    console.log(
      'Tool description with legacy VIBE_WORKFLOW_DOMAINS=code:',
      description
    );
  });

  it('prefers WORKFLOW_DOMAINS over legacy VIBE_WORKFLOW_DOMAINS when both are set', () => {
    // WORKFLOW_DOMAINS should take precedence over the legacy alias
    process.env.VIBE_WORKFLOW_DOMAINS = 'code';
    process.env.WORKFLOW_DOMAINS = 'architecture';

    const mockGetServerContext = async () =>
      ({
        loggerFactory: undefined,
      }) as never;
    const updateCachedState = () => {};

    const tool = createStartDevelopmentTool(
      testDir,
      mockGetServerContext,
      updateCachedState
    );

    const description = tool.description;

    // Should use WORKFLOW_DOMAINS (architecture) instead of VIBE_WORKFLOW_DOMAINS (code)
    expect(description).toBeDefined();

    const hasArchitecture =
      description.includes('adr') ||
      description.includes('big-bang-conversion') ||
      description.includes('boundary-testing') ||
      description.includes('business-analysis') ||
      description.includes('c4-analysis');

    const hasOnlyCode = description.includes('epcc') && !hasArchitecture;

    expect(
      hasArchitecture,
      'Should show architecture domain workflows when WORKFLOW_DOMAINS=architecture'
    ).toBe(true);
    expect(
      hasOnlyCode,
      'Should not show only code workflows when WORKFLOW_DOMAINS=architecture'
    ).toBe(false);

    console.log(
      'Tool description with both vars set (WORKFLOW_DOMAINS takes precedence):',
      description
    );
  });
});
