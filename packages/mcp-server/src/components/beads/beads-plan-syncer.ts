/**
 * Beads Plan Syncer
 *
 * Reads tasks from .beads/issues.jsonl and syncs them back into plan files,
 * making each phase's Tasks section reflect the current state of beads tasks.
 *
 * Used by BeadsPlugin's file watcher, which starts on plugin initialization
 * and triggers on any change to .beads/issues.jsonl.
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@codemcp/workflows-core';

const logger = createLogger('BeadsPlanSyncer');

interface BeadsIssue {
  id: string;
  title: string;
  status: string;
  dependencies?: Array<{
    issue_id: string;
    depends_on_id: string;
    type: string;
  }>;
}

/**
 * Syncs beads tasks into plan file task sections.
 *
 * For each phase that has a resolved beads-phase-id comment, reads child
 * tasks from .beads/issues.jsonl and rewrites the ### Tasks section with
 * checkbox-formatted task lines linking to task IDs.
 */
export class BeadsPlanSyncer {
  /**
   * Sync the given plan file with the latest beads tasks.
   *
   * No-ops when the plan file doesn't exist yet, when no phase IDs are
   * resolved, or when .beads/issues.jsonl is absent. Never throws.
   */
  async sync(planFilePath: string, projectPath: string): Promise<void> {
    try {
      const issues = await this.readIssues(projectPath);
      if (issues === null) {
        return; // .beads/issues.jsonl not present yet
      }

      let planContent: string;
      try {
        planContent = await readFile(planFilePath, 'utf-8');
      } catch {
        return; // Plan file doesn't exist yet — nothing to sync
      }

      const updated = this.updatePlanContent(planContent, issues);
      if (updated !== planContent) {
        await writeFile(planFilePath, updated, 'utf-8');
        this.logger.debug('Plan file synced with beads tasks', {
          planFilePath,
        });
      }
    } catch (error) {
      this.logger.warn('BeadsPlanSyncer: sync failed', {
        error: error instanceof Error ? error.message : String(error),
        planFilePath,
        projectPath,
      });
    }
  }

  /**
   * Read and parse .beads/issues.jsonl.
   * Returns null if the file doesn't exist.
   */
  private async readIssues(projectPath: string): Promise<BeadsIssue[] | null> {
    const jsonlPath = join(projectPath, '.beads', 'issues.jsonl');
    try {
      await access(jsonlPath);
    } catch {
      return null;
    }

    const raw = await readFile(jsonlPath, 'utf-8');
    const issues: BeadsIssue[] = [];

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        issues.push(JSON.parse(trimmed) as BeadsIssue);
      } catch {
        // Skip malformed lines
      }
    }

    return issues;
  }

  /**
   * Find direct children of a given phase task ID.
   * A child issue has a parent-child dependency pointing to phaseId.
   */
  private getChildTasks(issues: BeadsIssue[], phaseId: string): BeadsIssue[] {
    return issues.filter(issue =>
      issue.dependencies?.some(
        dep => dep.depends_on_id === phaseId && dep.type === 'parent-child'
      )
    );
  }

  /**
   * Map a beads status to a markdown checkbox state.
   */
  private isCompleted(status: string): boolean {
    return status === 'closed';
  }

  /**
   * Rewrite all synced task sections in the plan content.
   */
  private updatePlanContent(content: string, issues: BeadsIssue[]): string {
    // Match each phase section header + its beads-phase-id comment
    // Group 1: everything up to and including the phase ID comment line
    // Group 2: the phase ID value (never TBD — those aren't synced yet)
    // Group 3: everything after the comment up to (exclusive) the ### Tasks header
    // Group 4: the ### Tasks line + newline
    // Group 5: the existing tasks body (everything until next ## or ### heading, or EOF)
    const phaseSectionRe =
      /(## [^\n]+\n<!-- beads-phase-id: (?!TBD)([^\s>]+) -->)([\s\S]*?)(### Tasks\n)([\s\S]*?)(?=\n## |\n### |$)/g;

    return content.replace(
      phaseSectionRe,
      (
        _match,
        phaseHeaderAndId: string,
        phaseId: string,
        betweenIdAndTasks: string,
        tasksHeader: string,
        _existingBody: string
      ) => {
        const children = this.getChildTasks(issues, phaseId);

        const today = new Date().toISOString().split('T')[0];
        let tasksBody: string;

        if (children.length === 0) {
          tasksBody = `<!-- beads-synced: ${today} -->\n*Tasks managed via \`bd\` CLI*\n`;
        } else {
          const taskLines = children
            .map(task => {
              const checkbox = this.isCompleted(task.status) ? '[x]' : '[ ]';
              return `- ${checkbox} \`${task.id}\` ${task.title}`;
            })
            .join('\n');
          tasksBody = `<!-- beads-synced: ${today} -->\n${taskLines}\n`;
        }

        return `${phaseHeaderAndId}${betweenIdAndTasks}${tasksHeader}${tasksBody}`;
      }
    );
  }
}
