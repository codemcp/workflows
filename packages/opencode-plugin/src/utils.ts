import { GitManager } from '@codemcp/workflows-core';

/**
 * Format a date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get the current git branch for a project
 */
export function getCurrentGitBranch(projectPath: string): string {
  return GitManager.getCurrentBranch(projectPath);
}

/**
 * Strip whats_next() references from instructions.
 * The plugin auto-injects instructions via chat.message hook,
 * so users don't need to call whats_next() manually.
 */
export function stripWhatsNextReferences(text: string): string {
  return text
    .split('\n')
    .filter(line => !line.toLowerCase().includes('whats_next'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n'); // Collapse multiple blank lines
}

/**
 * Known OpenCode subagent names.
 * These agents should not have access to workflow state manipulation tools.
 */
const SUBAGENT_NAMES = new Set(['general', 'explore']);

/**
 * Verify that the calling agent is a primary agent, not a subagent.
 * Throws an error if the agent is a subagent.
 *
 * Used to enforce that workflow state tools (start_development, proceed_to_phase,
 * reset_development, conduct_review) can only be invoked from primary agents.
 *
 * @param agentName - The name of the agent calling the workflow tool
 * @throws Error if the agent is a known subagent
 */
export function requirePrimaryAgent(agentName: string): void {
  if (SUBAGENT_NAMES.has(agentName)) {
    throw new Error(
      `Workflow tools cannot be invoked from subagents. ` +
        `Agent "${agentName}" is a subagent. Use a primary agent to manage workflow state.`
    );
  }
}
