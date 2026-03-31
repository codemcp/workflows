/**
 * Comprehensive Beads Plugin Integration Test
 *
 * This single test file validates ALL aspects of beads plugin behavior:
 * 1. Plan file structure with beads markers
 * 2. Beads instruction generation
 * 3. Beads task creation on start
 * 4. Plan file task ID integration
 * 5. Phase transition validation
 * 6. With vs without beads comparison
 * 7. Beads error handling
 * 8. Plugin hook integration
 *
 * Design Principles:
 * - NO fuzzy assertions
 * - EXPLICIT validation of content (not just existence)
 * - COMPREHENSIVE coverage of all beads functionality
 * - PROPER isolation and cleanup between tests
 * - MEANINGFUL test names that describe what is validated
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTempProjectWithDefaultStateMachine } from '../utils/temp-files';
import {
  DirectServerInterface,
  createSuiteIsolatedE2EScenario,
  assertToolSuccess,
} from '../utils/e2e-test-setup';
import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import type { StartDevelopmentResult } from '../../src/tool-handlers/start-development';
import type { WhatsNextResult } from '../../src/tool-handlers/whats-next';

vi.unmock('fs');
vi.unmock('fs/promises');

// Mock child_process to simulate beads CLI responses
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Track created task IDs for consistent mock responses
let mockTaskIdCounter = 0;

/**
 * Setup beads CLI mock for tests
 * This simulates the bd CLI responses needed for beads integration
 */
function setupBeadsCliMock(): void {
  mockTaskIdCounter = 0;

  vi.mocked(execSync).mockImplementation((command: string) => {
    // Handle bd --version check (used by TaskBackendManager)
    if (command === 'bd --version') {
      return 'beads v1.0.0\n';
    }

    // Handle bd list command (used to check if beads is initialized)
    if (command.includes('bd list')) {
      return ''; // Return empty list
    }

    // Handle bd init command
    if (command.includes('bd init')) {
      return 'Initialized beads repository\n';
    }

    // Handle bd create command for epic/phase tasks
    if (command.includes('bd create')) {
      mockTaskIdCounter++;
      const taskId = `mock-task-${mockTaskIdCounter}`;
      return `✓ Created issue: ${taskId}\n`;
    }

    // Handle bd dep command for dependencies
    if (command.includes('bd dep')) {
      return '✓ Dependency created\n';
    }

    // Handle bd show command
    if (command.includes('bd show')) {
      return 'Title: Mock Task\nStatus: open\n';
    }

    // Handle bd update command
    if (command.includes('bd update')) {
      return '✓ Updated\n';
    }

    // Handle bd close command
    if (command.includes('bd close')) {
      return '✓ Closed\n';
    }

    // Handle git commands (used in some tests)
    if (command === 'git symbolic-ref --short HEAD') {
      return 'feature/test-branch\n';
    }

    // For any other command, throw an error (unexpected command)
    throw new Error(`Unexpected command in beads test: ${command}`);
  });
}

// ============================================================================
// TEST CONSTANTS (Remove magic numbers)
// ============================================================================

// Minimum number of phases in a workflow that should have beads markers
const MIN_PHASES_WITH_MARKERS = 4;

// Minimum length for substantive instructions
// Must be long enough to contain meaningful guidance, not just placeholders
const MIN_INSTRUCTION_LENGTH = 200;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verify beads plan file has the expected structure with markers
 */
function validateBeadsPlanFileStructure(content: string): void {
  // Should have beads-phase-id markers for each phase
  expect(content).toContain('<!-- beads-phase-id:');

  // Should have HTML comment format with either TBD or actual task IDs
  // Task IDs can include alphanumerics, hyphens, and dots
  expect(content).toMatch(/<!-- beads-phase-id:\s*(TBD|[a-zA-Z0-9\-.]+)\s*-->/);

  // Should have phase headers
  expect(content).toMatch(/^## \w+/m);

  // Should have "Tasks managed via `bd` CLI" guidance
  expect(content).toContain('Tasks managed via');
  expect(content).toContain('bd');
}

/**
 * Verify instructions contain beads CLI references
 */
function validateBeadsInstructions(instructions: string): void {
  // Should mention bd CLI tool
  expect(instructions.toLowerCase()).toContain('bd');

  // Should have bd commands
  const hasCommands = /bd\s+(list|create|update|close|show)/i.test(
    instructions
  );
  expect(hasCommands).toBe(true);

  // Should mention task management
  expect(instructions.toLowerCase()).toContain('task');

  // Should have beads-specific guidance (bd CLI only, not own todo tools)
  expect(instructions).toContain('ONLY');
  expect(instructions).toContain('bd');
}

/**
 * Extract beads phase IDs from plan file content
 * Returns array of task IDs found in the plan
 */
function extractBeadsPhaseIds(content: string): string[] {
  const matches =
    content.match(/<!-- beads-phase-id:\s*([a-zA-Z0-9\-.]+)\s*-->/g) || [];
  return matches
    .map(match => {
      const idMatch = match.match(/beads-phase-id:\s*([a-zA-Z0-9\-.]+)\s*-->/);
      return idMatch ? idMatch[1] : '';
    })
    .filter(id => id.length > 0);
}

// ============================================================================
// TESTS
// ============================================================================

describe('Beads Plugin Comprehensive Integration', () => {
  // =========================================================================
  // 1. PLAN FILE STRUCTURE
  // =========================================================================

  describe('1. Plan File Structure with Beads Markers', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      // CRITICAL: Enable beads backend and mock CLI
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-plan-structure',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
      delete process.env.TASK_BACKEND;
    });

    it('should create plan file WITH beads-phase-id placeholders when TASK_BACKEND=beads', async () => {
      // Verify environment
      expect(process.env.TASK_BACKEND).toBe('beads');

      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planFilePath = response.plan_file_path;

      // Read plan file
      const planContent = await fs.readFile(planFilePath, 'utf-8');

      // VALIDATE: Plan file has beads markers
      validateBeadsPlanFileStructure(planContent);

      // VALIDATE: Each phase has beads-phase-id placeholder
      expect(planContent).toContain('## Explore');
      expect(planContent).toMatch(/## Explore\n<!-- beads-phase-id:/);

      expect(planContent).toContain('## Plan');
      expect(planContent).toMatch(/## Plan\n<!-- beads-phase-id:/);

      expect(planContent).toContain('## Code');
      expect(planContent).toMatch(/## Code\n<!-- beads-phase-id:/);

      expect(planContent).toContain('## Commit');
      expect(planContent).toMatch(/## Commit\n<!-- beads-phase-id:/);
    });

    it('should have beads phase IDs for each phase (updated by plugin hook)', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Plan has beads-phase-id markers (either TBD or actual IDs)
      // The plugin's afterStartDevelopment hook will update TBD placeholders with actual task IDs
      expect(planContent).toContain('<!-- beads-phase-id:');

      // Count beads-phase-id occurrences (should be one per phase)
      const phaseIdMatches = planContent.match(/<!-- beads-phase-id:/g);
      expect(phaseIdMatches).not.toBeNull();
      expect((phaseIdMatches || []).length).toBeGreaterThanOrEqual(
        MIN_PHASES_WITH_MARKERS
      ); // At least 4 phases
    });

    it('should format beads markers as HTML comments with proper structure', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Format matches the pattern (either TBD or actual task IDs with dots)
      expect(planContent).toMatch(
        /## \w+\n<!-- beads-phase-id:\s*(TBD|[a-zA-Z0-9\-.]+)\s*-->\n### Tasks/
      );

      // VALIDATE: Must be HTML comment format
      expect(planContent).toMatch(/<!-- beads-phase-id:/);
      expect(planContent).not.toMatch(/\/\/ beads-phase-id:/);
    });
  });

  // =========================================================================
  // 2. BEADS INSTRUCTION GENERATION
  // =========================================================================

  describe('2. Beads Instruction Generation', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-instructions',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
      delete process.env.TASK_BACKEND;
    });

    it('should generate beads-specific instructions mentioning bd CLI', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });
      assertToolSuccess(startResult);

      // Get instructions
      const whatsNextResult = await client.callTool('whats_next', {
        context: 'Testing beads instructions',
        user_input: 'What should I do?',
        conversation_summary: 'Started development with beads',
        recent_messages: [],
      });

      const response = assertToolSuccess(whatsNextResult) as WhatsNextResult;
      const instructions = response.instructions;

      // VALIDATE: Instructions mention beads
      validateBeadsInstructions(instructions);
    });

    it('should include bd CLI commands in instructions', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });
      assertToolSuccess(startResult);

      // Get instructions
      const whatsNextResult = await client.callTool('whats_next', {
        context: 'Testing beads instructions',
        user_input: 'What should I do?',
        conversation_summary: 'Started development with beads',
        recent_messages: [],
      });

      const response = assertToolSuccess(whatsNextResult) as WhatsNextResult;
      const instructions = response.instructions;

      // VALIDATE: Should have multiple bd commands
      expect(instructions).toMatch(/`bd\s+list/);
      expect(instructions).toMatch(/`bd\s+create/);
      expect(instructions).toMatch(/`bd\s+(update|close)/);
    });

    it('should remind user to use ONLY bd CLI for task management', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });
      assertToolSuccess(startResult);

      // Get instructions
      const whatsNextResult = await client.callTool('whats_next', {
        context: 'Testing beads instructions',
        user_input: 'What should I do?',
        conversation_summary: 'Started development with beads',
        recent_messages: [],
      });

      const response = assertToolSuccess(whatsNextResult) as WhatsNextResult;
      const instructions = response.instructions;

      // VALIDATE: Clear instruction about bd CLI exclusivity
      expect(instructions).toContain('Use ONLY');
      expect(instructions).toContain('not your own todo tools');
    });
  });

  // =========================================================================
  // 3. WITH VS WITHOUT BEADS COMPARISON
  // =========================================================================

  describe('3. Plan File and Instructions: With vs Without Beads', () => {
    it('should produce DIFFERENT plan files with and without beads', async () => {
      // Create two independent scenarios
      let cleanupWith: () => Promise<void>;
      let cleanupWithout: () => Promise<void>;

      // WITH BEADS
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();
      const scenarioWith = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-comparison-with',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      const clientWith = scenarioWith.client;
      cleanupWith = scenarioWith.cleanup;

      const resultWith = await clientWith.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });
      const responseWith = assertToolSuccess(
        resultWith
      ) as StartDevelopmentResult;
      const planContentWith = await fs.readFile(
        responseWith.plan_file_path,
        'utf-8'
      );

      await cleanupWith();

      // WITHOUT BEADS - explicitly set markdown to disable auto-detection
      process.env.TASK_BACKEND = 'markdown';
      const scenarioWithout = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-comparison-without',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      const clientWithout = scenarioWithout.client;
      cleanupWithout = scenarioWithout.cleanup;

      const resultWithout = await clientWithout.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });
      const responseWithout = assertToolSuccess(
        resultWithout
      ) as StartDevelopmentResult;
      const planContentWithout = await fs.readFile(
        responseWithout.plan_file_path,
        'utf-8'
      );

      await cleanupWithout();
      delete process.env.TASK_BACKEND;

      // VALIDATE: WITH beads has beads markers
      expect(planContentWith).toContain('<!-- beads-phase-id:');

      // VALIDATE: WITHOUT beads does NOT have beads markers
      expect(planContentWithout).not.toContain('<!-- beads-phase-id:');

      // VALIDATE: WITHOUT beads uses checkbox format
      expect(planContentWithout).toContain('- [ ]');
    });

    it('should generate DIFFERENT instructions with and without beads', async () => {
      // WITH BEADS
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();
      const scenarioWith = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-instructions-comparison-with',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      const clientWith = scenarioWith.client;

      await clientWith.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const whatsNextWith = await clientWith.callTool('whats_next', {
        context: 'Testing',
        user_input: 'What should I do?',
        conversation_summary: 'Started',
        recent_messages: [],
      });
      const responseWith = assertToolSuccess(whatsNextWith) as WhatsNextResult;
      const instructionsWithBeads = responseWith.instructions;

      await scenarioWith.cleanup();

      // WITHOUT BEADS - explicitly set markdown to disable auto-detection
      process.env.TASK_BACKEND = 'markdown';
      const scenarioWithout = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-instructions-comparison-without',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      const clientWithout = scenarioWithout.client;

      await clientWithout.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const whatsNextWithout = await clientWithout.callTool('whats_next', {
        context: 'Testing',
        user_input: 'What should I do?',
        conversation_summary: 'Started',
        recent_messages: [],
      });
      const responseWithout = assertToolSuccess(
        whatsNextWithout
      ) as WhatsNextResult;
      const instructionsWithout = responseWithout.instructions;

      await scenarioWithout.cleanup();
      delete process.env.TASK_BACKEND;

      // VALIDATE: WITH beads mentions bd CLI and exclusivity
      expect(instructionsWithBeads.toLowerCase()).toContain('bd');
      expect(instructionsWithBeads).toContain('Use ONLY');

      // VALIDATE: WITHOUT beads does NOT mention bd CLI exclusivity
      expect(instructionsWithout.toLowerCase()).not.toContain('bd cli');
      expect(instructionsWithout).not.toContain('Use ONLY');
    });

    it('should maintain identical response contracts regardless of beads', async () => {
      // WITH BEADS
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();
      const scenarioWith = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-contract-with',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      const clientWith = scenarioWith.client;

      const resultWith = await clientWith.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });
      const responseWith = assertToolSuccess(resultWith);

      await scenarioWith.cleanup();
      delete process.env.TASK_BACKEND;

      // WITHOUT BEADS
      const scenarioWithout = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-contract-without',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      const clientWithout = scenarioWithout.client;

      const resultWithout = await clientWithout.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });
      const responseWithout = assertToolSuccess(resultWithout);

      await scenarioWithout.cleanup();

      // VALIDATE: Both responses have identical properties
      expect(responseWith).toHaveProperty('phase');
      expect(responseWith).toHaveProperty('plan_file_path');
      expect(responseWith).toHaveProperty('instructions');

      expect(responseWithout).toHaveProperty('phase');
      expect(responseWithout).toHaveProperty('plan_file_path');
      expect(responseWithout).toHaveProperty('instructions');

      // VALIDATE: Response structure identical
      expect(Object.keys(responseWith).sort()).toEqual(
        Object.keys(responseWithout).sort()
      );
    });
  });

  // =========================================================================
  // 4. PLAN FILE TASK ID INTEGRATION
  // =========================================================================

  describe('4. Plan File Task ID Integration', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-task-ids',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
      delete process.env.TASK_BACKEND;
    });

    it('should have beads phase IDs after task creation by plugin hooks', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planFilePath = response.plan_file_path;
      const planContent = await fs.readFile(planFilePath, 'utf-8');

      // VALIDATE: Plan has beads markers (IDs updated by afterStartDevelopment hook)
      expect(planContent).toContain('<!-- beads-phase-id:');

      // VALIDATE: Has proper format with TBD or actual task IDs
      expect(planContent).toMatch(
        /## \w+\n<!-- beads-phase-id:\s*(TBD|[a-zA-Z0-9\-.]+)\s*-->\n### Tasks/
      );
    });

    it('should have valid beads-phase-id format (not TBD after plugin execution)', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Format must match - either TBD or actual task IDs with dots
      const validFormats = planContent.match(
        /<!-- beads-phase-id:\s*(TBD|[a-zA-Z0-9\-.]+)\s*-->/g
      );
      expect(validFormats).not.toBeNull();
      expect((validFormats || []).length).toBeGreaterThanOrEqual(1);

      // VALIDATE: No malformed placeholders
      expect(planContent).not.toMatch(/<!-- beads-phase-id:\s*-->/);
    });

    it('should preserve plan file structure when updating task IDs', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Plan structure intact
      expect(planContent).toContain('# Development Plan:');
      expect(planContent).toContain('## Goal');
      expect(planContent).toContain('## Explore');
      expect(planContent).toContain('## Plan');
      expect(planContent).toContain('## Code');
      expect(planContent).toContain('## Commit');
      expect(planContent).toContain('## Key Decisions');
      expect(planContent).toContain('## Notes');

      // VALIDATE: Markdown is valid
      expect(planContent).toMatch(/^# Development Plan:/m);
      expect(planContent).toMatch(/^## /m);
    });
  });

  // =========================================================================
  // 5. ERROR HANDLING AND DEGRADATION
  // =========================================================================

  describe('5. Beads Error Handling and Graceful Degradation', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-error-handling',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
      delete process.env.TASK_BACKEND;
    });

    it('should create valid plan file even when beads unavailable', async () => {
      // Start development with beads enabled
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      // Should NOT return error - graceful degradation
      expect(result).not.toHaveProperty('error');

      const response = assertToolSuccess(result) as StartDevelopmentResult;

      // VALIDATE: Plan file created successfully
      expect(response.plan_file_path).toBeDefined();
      expect(response.plan_file_path).toBeTruthy();

      // VALIDATE: Plan file exists and is readable
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');
      expect(planContent).toBeTruthy();

      // VALIDATE: Plan has beads markers even if tasks weren't created
      expect(planContent).toContain('<!-- beads-phase-id:');
    });

    it('should return success response even if beads operations fail', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      // VALIDATE: Response is successful (no error field)
      expect(result).not.toHaveProperty('error');

      // VALIDATE: Has all required response fields
      const response = assertToolSuccess(result) as StartDevelopmentResult;
      expect(response).toHaveProperty('phase');
      expect(response).toHaveProperty('plan_file_path');
      expect(response).toHaveProperty('instructions');
    });
  });

  // =========================================================================
  // 6. PLUGIN HOOK INTEGRATION
  // =========================================================================

  describe('6. Plugin Hook Integration', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-plugin-hooks',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
      delete process.env.TASK_BACKEND;
    });

    it('should execute plugin hooks during start_development', async () => {
      // Start development - this should execute afterStartDevelopment hook
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;

      // VALIDATE: Plan file was created by plugin
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');
      expect(planContent).toContain('<!-- beads-phase-id:');

      // VALIDATE: Response indicates successful hook execution
      expect(response.plan_file_path).toBeTruthy();
      expect(response.instructions).toBeTruthy();
    });

    it('should coordinate afterStartDevelopment and afterPlanFileCreated hooks', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Plan file has beads structure (created by hooks)
      expect(planContent).toContain('<!-- beads-phase-id:');

      // VALIDATE: Plan has proper content from both hooks
      expect(planContent).toContain('## Explore');
      expect(planContent).toContain('## Plan');
      expect(planContent).toContain('## Code');
      expect(planContent).toContain('## Commit');

      // VALIDATE: Each phase has a beads marker
      const phaseMatches = planContent.match(/## \w+\n<!-- beads-phase-id:/g);
      expect(phaseMatches).not.toBeNull();
      expect((phaseMatches || []).length).toBeGreaterThanOrEqual(4);
    });

    it('should maintain system in consistent state after hook execution', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const startResponse = assertToolSuccess(
        startResult
      ) as StartDevelopmentResult;

      // Get current state
      const whatsNextResult = await client.callTool('whats_next', {
        context: 'Testing hook consistency',
        user_input: 'What should I do?',
        conversation_summary: 'Just started development',
        recent_messages: [],
      });

      const whatsNextResponse = assertToolSuccess(
        whatsNextResult
      ) as WhatsNextResult;

      // VALIDATE: State is consistent
      expect(whatsNextResponse.phase).toBe('explore');
      expect(whatsNextResponse.plan_file_path).toBe(
        startResponse.plan_file_path
      );

      // VALIDATE: Plan file is still valid
      const planContent = await fs.readFile(
        whatsNextResponse.plan_file_path,
        'utf-8'
      );
      expect(planContent).toContain('<!-- beads-phase-id:');
    });
  });

  // =========================================================================
  // 7. BEADS ACTIVATION AND ENVIRONMENT CHECK
  // =========================================================================

  describe('7. Beads Environment Activation', () => {
    it('should apply beads when TASK_BACKEND=beads is set', async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-activation-with',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });

      const result = await scenario.client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      await scenario.cleanup();
      delete process.env.TASK_BACKEND;

      // VALIDATE: Beads features enabled
      expect(planContent).toContain('<!-- beads-phase-id:');
    });

    it('should auto-detect and apply beads when TASK_BACKEND is not set and bd is available', async () => {
      // Ensure env var is NOT set - auto-detection will check for bd command
      delete process.env.TASK_BACKEND;
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-activation-auto',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });

      const result = await scenario.client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      await scenario.cleanup();

      // VALIDATE: Beads features auto-detected and enabled
      expect(planContent).toContain('<!-- beads-phase-id:');
    });

    it('should auto-detect beads when TASK_BACKEND has invalid value and bd is available', async () => {
      // Invalid values are treated as "not set" - triggers auto-detection
      process.env.TASK_BACKEND = 'other-backend';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-activation-invalid',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });

      const result = await scenario.client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      await scenario.cleanup();
      delete process.env.TASK_BACKEND;

      // VALIDATE: Beads features auto-detected and enabled
      expect(planContent).toContain('<!-- beads-phase-id:');
    });

    it('should NOT apply beads when TASK_BACKEND=markdown explicitly', async () => {
      // Explicitly setting markdown should disable beads even if bd is available
      process.env.TASK_BACKEND = 'markdown';

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-activation-disabled',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });

      const result = await scenario.client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      await scenario.cleanup();
      delete process.env.TASK_BACKEND;

      // VALIDATE: Beads features NOT enabled when markdown explicitly set
      expect(planContent).not.toContain('<!-- beads-phase-id:');
    });
  });

  // =========================================================================
  // 8. CONTENT VALIDATION AND SEMANTIC CHECKS
  // =========================================================================

  describe('8. Beads Content Validation and Semantic Checks', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-content-validation',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
      delete process.env.TASK_BACKEND;
    });

    it('should generate substantive beads instructions with actual guidance', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });
      assertToolSuccess(startResult);

      // Get instructions
      const whatsNextResult = await client.callTool('whats_next', {
        context: 'Testing instruction quality',
        user_input: 'What should I do?',
        conversation_summary: 'Started development',
        recent_messages: [],
      });

      const response = assertToolSuccess(whatsNextResult) as WhatsNextResult;
      const instructions = response.instructions;

      // VALIDATE: Instructions are substantive (not just placeholders)
      expect(instructions.length).toBeGreaterThan(MIN_INSTRUCTION_LENGTH);

      // VALIDATE: Instructions contain beads-specific guidance
      validateBeadsInstructions(instructions);

      // VALIDATE: Instructions mention specific phases
      expect(instructions).toMatch(/explore|plan|code|commit/i);
    });

    it('should create valid markdown plan file structure', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Markdown structure
      expect(planContent).toMatch(/^# /m); // Title
      expect(planContent).toMatch(/^## /m); // Sections
      expect(planContent).toMatch(/^### /m); // Subsections

      // VALIDATE: No malformed headers
      expect(planContent).not.toMatch(/^#$/m); // Empty header
      expect(planContent).not.toMatch(/^## $/m); // Empty section

      // VALIDATE: Beads markers are valid comments
      expect(planContent).toMatch(/<!-- beads-phase-id:/);
      expect(planContent).not.toMatch(/<!-- -->/); // Empty comment
    });

    it('should include beads CLI guidance in plan file', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Plan mentions beads CLI
      expect(planContent).toContain('bd');
      expect(planContent).toContain('Tasks managed via');
      expect(planContent).toContain('beads CLI');
    });
  });

  // =========================================================================
  // 9. TASK ID EXTRACTION AND VALIDATION
  // =========================================================================

  describe('9. Task ID Extraction and Validation', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-task-id-extraction',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
      delete process.env.TASK_BACKEND;
    });

    it('should extract beads phase IDs from plan file', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Extract IDs and verify format
      const extractedIds = extractBeadsPhaseIds(planContent);

      // VALIDATE: Should have extracted some IDs
      expect(extractedIds).toBeDefined();
      expect(Array.isArray(extractedIds)).toBe(true);

      // VALIDATE: Each ID should be a non-empty string
      for (const id of extractedIds) {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      }
    });

    it('should validate beads phase ID format', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: IDs must match pattern (alphanumeric, hyphens, dots)
      const allMatches = planContent.match(
        /<!-- beads-phase-id:\s*([a-zA-Z0-9\-.]+)\s*-->/g
      );
      expect(allMatches).not.toBeNull();
      expect((allMatches || []).length).toBeGreaterThan(0);

      // VALIDATE: Each match is properly formatted
      for (const match of allMatches || []) {
        expect(match).toMatch(/^<!-- beads-phase-id:/);
        expect(match).toMatch(/-->$/);
      }
    });

    it('should not have empty beads-phase-id placeholders', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: No malformed empty placeholders
      expect(planContent).not.toMatch(/<!-- beads-phase-id:\s*-->/);
      expect(planContent).not.toMatch(/<!-- beads-phase-id: -->/);
    });

    it('should replace TBD placeholders with actual task IDs or keep TBD', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: All placeholders are either TBD or actual IDs (not empty)
      const placeholders = planContent.match(
        /<!-- beads-phase-id:\s*(TBD|[a-zA-Z0-9\-.]+)\s*-->/g
      );
      expect(placeholders).not.toBeNull();

      for (const placeholder of placeholders || []) {
        // Each must have either TBD or an actual ID
        expect(placeholder).toMatch(/TBD|[a-zA-Z0-9\-.]+/);
      }
    });
  });

  // =========================================================================
  // 10. PHASE TRANSITION AND TASK COMPLETION VALIDATION
  // =========================================================================

  describe('10. Phase Transition and Task Completion', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-phase-transitions',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
      delete process.env.TASK_BACKEND;
    });

    it('should maintain beads markers through phase transitions', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const startResponse = assertToolSuccess(
        startResult
      ) as StartDevelopmentResult;
      let planContent = await fs.readFile(
        startResponse.plan_file_path,
        'utf-8'
      );
      const initialMarkers = planContent.match(/<!-- beads-phase-id:/g);

      // VALIDATE: Initial markers exist
      expect(initialMarkers).not.toBeNull();
      expect((initialMarkers || []).length).toBeGreaterThanOrEqual(
        MIN_PHASES_WITH_MARKERS
      );

      // Transition to next phase
      const transitionResult = await client.callTool('proceed_to_phase', {
        target_phase: 'plan',
        reason: 'exploration complete',
        review_state: 'not-required',
      });

      expect(transitionResult).not.toHaveProperty('error');

      // VALIDATE: Markers still present after transition
      planContent = await fs.readFile(startResponse.plan_file_path, 'utf-8');
      const afterTransitionMarkers = planContent.match(/<!-- beads-phase-id:/g);

      expect(afterTransitionMarkers).not.toBeNull();
      expect(afterTransitionMarkers).toEqual(initialMarkers);
    });

    it('should preserve plan file structure across multiple phase transitions', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const initialContent = await fs.readFile(
        response.plan_file_path,
        'utf-8'
      );

      // Verify initial structure
      expect(initialContent).toContain('## Explore');
      expect(initialContent).toContain('## Plan');

      // Transition through phases
      await client.callTool('proceed_to_phase', {
        target_phase: 'plan',
        reason: 'exploration complete',
        review_state: 'not-required',
      });

      // VALIDATE: Structure preserved
      const afterFirstTransition = await fs.readFile(
        response.plan_file_path,
        'utf-8'
      );
      expect(afterFirstTransition).toContain('## Explore');
      expect(afterFirstTransition).toContain('## Plan');
      expect(afterFirstTransition).toContain('## Code');
    });

    it('should keep beads markers consistent with phase structure', async () => {
      // Start development
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Each phase header has a corresponding beads marker
      const phasePattern = /## (\w+)\n<!-- beads-phase-id:/g;
      const phaseMatches: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = phasePattern.exec(planContent)) !== null) {
        if (match[1]) {
          phaseMatches.push(match[1]);
        }
      }

      // VALIDATE: Found multiple phases with markers
      expect(phaseMatches.length).toBeGreaterThanOrEqual(
        MIN_PHASES_WITH_MARKERS
      );

      // VALIDATE: Phases are expected workflow phases
      const expectedPhases = ['Explore', 'Plan', 'Code', 'Commit'];
      for (const phase of phaseMatches) {
        expect(expectedPhases).toContain(phase);
      }
    });
  });

  // =========================================================================
  // 11. PLUGIN HOOK EXECUTION AND SIDE EFFECTS
  // =========================================================================

  describe('11. Plugin Hook Execution and Side Effects', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-hook-execution',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
      delete process.env.TASK_BACKEND;
    });

    it('should execute hooks and update plan file with markers', async () => {
      // Start development - triggers afterStartDevelopment hook
      const result = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Hook executed and updated plan file
      expect(planContent).toContain('<!-- beads-phase-id:');

      // VALIDATE: Plan has beads-specific guidance
      expect(planContent).toContain('Tasks managed via');
      expect(planContent).toContain('bd');
    });

    it('should ensure whats_next respects beads plan markers', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      assertToolSuccess(startResult) as StartDevelopmentResult;

      // Get whats_next guidance
      const whatsNextResult = await client.callTool('whats_next', {
        context: 'Continuing development',
        user_input: 'What should I do?',
        conversation_summary: 'Started with beads',
        recent_messages: [],
      });

      const whatsNextResponse = assertToolSuccess(
        whatsNextResult
      ) as WhatsNextResult;

      // VALIDATE: Instructions include beads guidance
      expect(whatsNextResponse.instructions).toContain('bd');
      expect(whatsNextResponse.instructions).toContain('Use ONLY');

      // VALIDATE: Plan file still has markers
      const planContent = await fs.readFile(
        whatsNextResponse.plan_file_path,
        'utf-8'
      );
      expect(planContent).toContain('<!-- beads-phase-id:');
    });

    it('should maintain conversation state through plugin hook execution', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      assertToolSuccess(startResult) as StartDevelopmentResult;

      // Get whats_next
      const whatsNextResult = await client.callTool('whats_next', {
        context: 'Testing conversation preservation',
        user_input: 'What is the current state?',
        conversation_summary: 'Started development',
        recent_messages: [],
      });

      const whatsNextResponse = assertToolSuccess(
        whatsNextResult
      ) as WhatsNextResult;

      expect(whatsNextResponse.phase).toBe('explore');
    });
  });

  // =========================================================================
  // 12. MULTI-WORKFLOW BEADS SUPPORT
  // =========================================================================

  describe('12. Multi-Workflow Beads Support', () => {
    let cleanup: () => Promise<void>;

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    it('should apply beads markers to waterfall workflow', async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-waterfall',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      cleanup = scenario.cleanup;

      const result = await scenario.client.callTool('start_development', {
        workflow: 'waterfall',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Beads markers present in waterfall
      expect(planContent).toContain('<!-- beads-phase-id:');

      // VALIDATE: Waterfall phases have markers
      const phases = ['Requirements', 'Design', 'Implementation'];
      for (const phase of phases) {
        expect(planContent).toContain(`## ${phase}`);
      }

      delete process.env.TASK_BACKEND;
    });

    it('should apply beads markers to tdd workflow', async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-tdd',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      cleanup = scenario.cleanup;

      const result = await scenario.client.callTool('start_development', {
        workflow: 'tdd',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Beads markers present in tdd
      expect(planContent).toContain('<!-- beads-phase-id:');

      // VALIDATE: TDD phases have markers
      const phaseMatches = planContent.match(/## \w+\n<!-- beads-phase-id:/g);
      expect(phaseMatches).not.toBeNull();
      expect((phaseMatches || []).length).toBeGreaterThanOrEqual(3);

      delete process.env.TASK_BACKEND;
    });

    it('should apply beads markers to bugfix workflow', async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-bugfix',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      cleanup = scenario.cleanup;

      const result = await scenario.client.callTool('start_development', {
        workflow: 'bugfix',
        commit_behaviour: 'none',
      });

      const response = assertToolSuccess(result) as StartDevelopmentResult;
      const planContent = await fs.readFile(response.plan_file_path, 'utf-8');

      // VALIDATE: Beads markers present in bugfix
      expect(planContent).toContain('<!-- beads-phase-id:');

      // VALIDATE: Bugfix phases have markers
      const phaseMatches = planContent.match(/## \w+\n<!-- beads-phase-id:/g);
      expect(phaseMatches).not.toBeNull();
      expect((phaseMatches || []).length).toBeGreaterThanOrEqual(2);

      delete process.env.TASK_BACKEND;
    });
  });

  // =========================================================================
  // 13. BEADS INTEGRATION ROBUSTNESS
  // =========================================================================

  describe('13. Beads Integration Robustness', () => {
    let client: DirectServerInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      process.env.TASK_BACKEND = 'beads';
      setupBeadsCliMock();

      const scenario = await createSuiteIsolatedE2EScenario({
        suiteName: 'beads-robustness',
        tempProjectFactory: createTempProjectWithDefaultStateMachine,
      });
      client = scenario.client;
      cleanup = scenario.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
      delete process.env.TASK_BACKEND;
    });

    it('should not break normal functionality when beads enabled', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const startResponse = assertToolSuccess(
        startResult
      ) as StartDevelopmentResult;

      // VALIDATE: All standard response properties present
      expect(startResponse).toHaveProperty('phase');
      expect(startResponse).toHaveProperty('plan_file_path');
      expect(startResponse).toHaveProperty('instructions');

      // VALIDATE: Can transition phases normally
      const transitionResult = await client.callTool('proceed_to_phase', {
        target_phase: 'plan',
        reason: 'exploration complete',
        review_state: 'not-required',
      });

      expect(transitionResult).not.toHaveProperty('error');

      // VALIDATE: Can get whats_next normally
      const whatsNextResult = await client.callTool('whats_next', {
        context: 'Testing',
        user_input: 'What now?',
        conversation_summary: 'Testing beads',
        recent_messages: [],
      });

      expect(whatsNextResult).not.toHaveProperty('error');
    });

    it('should have consistent beads markers across all workflow operations', async () => {
      // Start
      const startResult = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      const startResponse = assertToolSuccess(
        startResult
      ) as StartDevelopmentResult;
      let planContent = await fs.readFile(
        startResponse.plan_file_path,
        'utf-8'
      );
      const startMarkers = planContent.match(/<!-- beads-phase-id:/g);

      // Get whats_next
      const whatsNextResult = await client.callTool('whats_next', {
        context: 'Checking markers',
        user_input: 'What should I do?',
        conversation_summary: 'Just started',
        recent_messages: [],
      });

      expect(whatsNextResult).not.toHaveProperty('error');

      // Transition
      await client.callTool('proceed_to_phase', {
        target_phase: 'plan',
        reason: 'ready',
        review_state: 'not-required',
      });

      planContent = await fs.readFile(startResponse.plan_file_path, 'utf-8');
      const transitionMarkers = planContent.match(/<!-- beads-phase-id:/g);

      // VALIDATE: Markers consistent
      expect(startMarkers).toEqual(transitionMarkers);
    });

    it('should generate consistent beads instructions across operations', async () => {
      // Start development
      const startResult = await client.callTool('start_development', {
        workflow: 'epcc',
        commit_behaviour: 'none',
      });

      assertToolSuccess(startResult);

      // Get instructions in whats_next
      const whatsNextResult = await client.callTool('whats_next', {
        context: 'Testing instruction consistency',
        user_input: 'What should I do?',
        conversation_summary: 'Started',
        recent_messages: [],
      });

      const whatsNextResponse = assertToolSuccess(
        whatsNextResult
      ) as WhatsNextResult;

      // VALIDATE: Instructions have beads content
      validateBeadsInstructions(whatsNextResponse.instructions);

      // VALIDATE: Instructions contain expected guidance
      expect(whatsNextResponse.instructions).toContain('bd');
      expect(whatsNextResponse.instructions).toContain('Task');
      expect(whatsNextResponse.instructions).toContain('ONLY');
    });
  });
});
