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
