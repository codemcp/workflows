/**
 * Test Utilities for OpenCode Workflows Plugin
 *
 * Provides helper functions for setting up and tearing down test fixtures.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import type { PluginInput } from '../src/types.js';

/**
 * Create a unique temporary directory for testing
 */
export function createTempDir(prefix = 'opencode-plugin-test'): string {
  const dir = path.join(
    tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Clean up a directory (recursively)
 */
export function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Create a mock PluginInput for testing
 */
export function createMockPluginInput(
  directory: string,
  options: {
    projectId?: string;
    serverUrl?: string;
  } = {}
): PluginInput {
  const { projectId = 'test-project', serverUrl = 'http://localhost:4096' } =
    options;

  return {
    client: {
      app: {
        log: async () => {},
      },
    } as unknown,
    project: { id: projectId, path: directory },
    directory,
    worktree: directory,
    serverUrl: new URL(serverUrl),
    $: {} as unknown,
  };
}

/**
 * Compute the deterministic conversation ID that ConversationManager generates.
 *
 * In NODE_ENV=test, the core uses: `${projectName}-${cleanBranch}-p423k1`
 * - projectName = basename(directory)
 * - cleanBranch = gitBranch with non-alphanumeric chars replaced by '-', deduplicated, trimmed
 */
export function computeConversationId(
  directory: string,
  gitBranch: string
): string {
  const projectName = path.basename(directory) || 'unknown-project';
  const cleanBranch = gitBranch
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${projectName}-${cleanBranch}-p423k1`;
}

/**
 * Compute the plan file path that ConversationManager generates.
 *
 * - For main/master branches: `development-plan.md`
 * - For other branches: `development-plan-${sanitizedBranch}.md`
 *   where sanitizedBranch replaces '/' and '\' with '-'
 */
export function computePlanFilePath(
  directory: string,
  gitBranch: string
): string {
  const sanitizedBranch = gitBranch.replace(/[/\\]/g, '-');
  const planFileName =
    gitBranch === 'main' || gitBranch === 'master'
      ? 'development-plan.md'
      : `development-plan-${sanitizedBranch}.md`;
  return path.resolve(directory, '.vibe', planFileName);
}

/**
 * Setup a .vibe directory with workflow state for testing.
 *
 * Uses the same conversation ID scheme as ConversationManager (deterministic,
 * hash-based) and the same plan file naming as core (development-plan-*.md).
 *
 * IMPORTANT: temp dirs have no .git, so ConversationManager detects branch
 * as 'default'. The gitBranch parameter here is used as the stored branch
 * name in state, but the conversationId is always computed using 'default'
 * since that is what the core will detect at runtime.
 */
export async function setupWorkflowState(
  directory: string,
  options: {
    workflowName?: string;
    currentPhase?: string;
    gitBranch?: string;
    planContent?: string;
    requireReviews?: boolean;
  } = {}
): Promise<{
  conversationId: string;
  planFilePath: string;
  conversationDir: string;
}> {
  const {
    workflowName = 'epcc',
    currentPhase = 'explore',
    gitBranch = 'default',
    planContent,
    requireReviews = false,
  } = options;

  const vibeDir = path.join(directory, '.vibe');

  // Use the same deterministic ID scheme as ConversationManager
  // In test mode: `${basename(dir)}-${cleanBranch}-p423k1`
  const conversationId = computeConversationId(directory, gitBranch);

  // FileStorage expects: .vibe/conversations/{conversationId}/state.json
  const conversationDir = path.join(vibeDir, 'conversations', conversationId);
  fs.mkdirSync(conversationDir, { recursive: true });

  // Use the same plan file naming as core
  const planFilePath = computePlanFilePath(directory, gitBranch);

  const conversationState = {
    conversationId,
    projectPath: directory,
    gitBranch,
    currentPhase,
    planFilePath,
    workflowName,
    requireReviewsBeforePhaseTransition: requireReviews,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Save conversation state
  const stateFilePath = path.join(conversationDir, 'state.json');
  fs.writeFileSync(stateFilePath, JSON.stringify(conversationState, null, 2));

  // Create plan file with default or custom content
  const defaultPlanContent = `# Development Plan

## Goal
Test development plan

## ${capitalizeFirst(currentPhase)}

### Tasks
- [ ] Task 1
- [ ] Task 2

### Notes

## Key Decisions

## Notes
`;

  fs.writeFileSync(planFilePath, planContent || defaultPlanContent);

  return {
    conversationId,
    planFilePath,
    conversationDir,
  };
}

/**
 * Create a mock user message for chat.message hook testing
 */
export function createMockUserMessage(
  sessionId: string,
  messageId: string
): {
  hookInput: { sessionID: string; messageID: string };
  message: { id: string; sessionID: string; role: 'user' };
} {
  return {
    hookInput: {
      sessionID: sessionId,
      messageID: messageId,
    },
    message: {
      id: messageId,
      sessionID: sessionId,
      role: 'user',
    },
  };
}

/**
 * Create a mock tool execution input for tool.execute.before hook testing
 */
export function createMockToolExecution(
  tool: string,
  args: Record<string, unknown>
): {
  hookInput: { tool: string; sessionID: string; callID: string };
  output: { args: Record<string, unknown> };
} {
  return {
    hookInput: {
      tool,
      sessionID: `session_${Date.now()}`,
      callID: `call_${Date.now()}`,
    },
    output: { args },
  };
}

// Helper function
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
