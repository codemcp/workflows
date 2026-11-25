import type fs from 'node:fs';
import type path from 'node:path';

/**
 * Framework-free helpers shared by the OpenCode 1.x and 2.x TUI plugins:
 * reading workflow state from `.vibe/conversations/<id>/state.json`, resolving the
 * phase list of a workflow and the WORKFLOW_AGENTS visibility filter.
 *
 * Node built-ins are loaded with require(): top-level ESM imports of Node
 * built-ins are not supported in the Bun plugin runtime.
 */

/**
 * Tool names that trigger a state refresh.
 *
 * Covers both usage modes:
 *   - opencode-plugin (bare names, no prefix)
 *   - MCP server (tools namespaced with "workflows_" prefix)
 */
export const WORKFLOW_TOOLS = new Set([
  // opencode-plugin direct tool names
  'start_development',
  'proceed_to_phase',
  'conduct_review',
  'reset_development',
  'setup_project_docs',
  // MCP server tool names (workflows_ namespace prefix)
  'workflows_start_development',
  'workflows_proceed_to_phase',
  'workflows_conduct_review',
  'workflows_reset_development',
  'workflows_setup_project_docs',
]);

interface StateJson {
  currentPhase?: string;
  workflowName?: string;
  sessionMetadata?: {
    referenceId: string;
    createdAt: string;
  };
}

export interface WorkflowViewState {
  phase: string;
  workflow: string;
  phases: string[];
}

/**
 * Parse WORKFLOW_AGENTS (comma-separated agent names). Returns a predicate:
 * with no filter every agent is enabled, otherwise only listed agents are.
 */
export function createAgentFilter(
  env: string | undefined = process.env.WORKFLOW_AGENTS
): (agent: string | undefined) => boolean {
  const filter: Set<string> | null =
    env && env.trim()
      ? new Set(
          env
            .split(',')
            .map(a => a.trim().toLowerCase())
            .filter(Boolean)
        )
      : null;
  return agent => filter === null || filter.has((agent ?? '').toLowerCase());
}

/** WORKFLOW=off disables the sidebar widget. */
export function isWorkflowDisabled(
  env: string | undefined = process.env.WORKFLOW
): boolean {
  return env?.toLowerCase() === 'off';
}

/**
 * Extract ordered phase names from a workflow YAML file without a YAML parser.
 *
 * The workflow YAML format is consistent: phase names are top-level keys under
 * the `states:` map, each indented with exactly two spaces. We use a simple
 * line-based scan rather than js-yaml because js-yaml is not a built-in Node
 * module and is not available in the TUI plugin's node_modules — it is a
 * dependency of @codemcp/workflows-core but is not hoisted into this package's
 * scope.
 */
export function parsePhasesFromYaml(content: string): string[] {
  const phases: string[] = [];
  let inStates = false;
  for (const line of content.split('\n')) {
    if (line.startsWith('states:')) {
      inStates = true;
      continue;
    }
    if (inStates) {
      // A new top-level key (no leading spaces) ends the states block
      if (/^\S/.test(line) && line.trim() !== '') {
        break;
      }
      // A key at exactly two-space indent is a phase name
      const match = /^  ([\w-]+):/.exec(line);
      if (match?.[1]) {
        phases.push(match[1]);
      }
    }
  }
  return phases;
}

/**
 * Look up the ordered phase list for a workflow name.
 *
 * Checks project-local workflows (.vibe/workflows/) first, then falls back to
 * the built-in workflows bundled in @codemcp/workflows-core.
 *
 * We read YAML files directly rather than delegating to WorkflowManager
 * because WorkflowManager is ESM-only: it uses `import.meta.url` to locate
 * the bundled resources/workflows/ directory at runtime. When loaded via
 * require() — which is required in the Bun TUI plugin runtime because
 * top-level ESM imports of Node built-ins are not supported there —
 * `import.meta` is undefined and the module throws on load, before the
 * constructor is even reached.
 */
export function getWorkflowPhases(
  projectDir: string,
  workflowName: string
): string[] {
  // Guard against path traversal — workflow names must be simple identifiers
  if (!/^[\w-]+$/.test(workflowName)) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fsSync = require('node:fs') as typeof fs;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pathSync = require('node:path') as typeof path;

    // 1. Project-local workflows: scan `.vibe/workflows` for a YAML whose `name:` matches workflowName
    const workflowsDir = pathSync.join(projectDir, '.vibe', 'workflows');
    if (
      fsSync.existsSync(workflowsDir) &&
      fsSync.statSync(workflowsDir).isDirectory()
    ) {
      for (const entry of fsSync.readdirSync(workflowsDir)) {
        if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;
        const fullPath = pathSync.join(workflowsDir, entry);
        try {
          const contents = fsSync.readFileSync(fullPath, 'utf8');
          // Extract the `name:` field from the YAML without a parser.
          // Strip surrounding single/double quotes (e.g. name: 'minor').
          const nameMatch = /^name:\s*(.+)/m.exec(contents);
          const rawName = nameMatch?.[1]?.trim();
          const parsedName =
            rawName !== undefined
              ? rawName.replace(/^(['"])(.*)\1$/, '$2')
              : undefined;
          if (parsedName === workflowName) {
            return parsePhasesFromYaml(contents);
          }
        } catch {
          // unreadable file — skip
        }
      }
    }

    // 2. Built-in workflow bundled with @codemcp/workflows-core (.yaml then .yml)
    const corePkgDir = pathSync.dirname(
      require.resolve('@codemcp/workflows-core/package.json')
    );
    const builtinBase = pathSync.join(
      corePkgDir,
      'resources',
      'workflows',
      workflowName
    );
    for (const ext of ['.yaml', '.yml']) {
      const builtinPath = builtinBase + ext;
      if (fsSync.existsSync(builtinPath)) {
        return parsePhasesFromYaml(fsSync.readFileSync(builtinPath, 'utf8'));
      }
    }

    // 3. Additional fallback locations: workspace/dev setups where
    //    @codemcp/workflows-core/resources/workflows has not been built yet,
    //    and project-local custom workflows under resources/workflows/.
    const additionalRoots = [
      pathSync.join(process.cwd(), 'resources', 'workflows'),
      pathSync.join(projectDir, 'resources', 'workflows'),
    ];
    for (const root of additionalRoots) {
      try {
        if (!fsSync.existsSync(root) || !fsSync.statSync(root).isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }
      const candidateBase = pathSync.join(root, workflowName);
      for (const ext of ['.yaml', '.yml']) {
        const candidatePath = candidateBase + ext;
        if (fsSync.existsSync(candidatePath)) {
          return parsePhasesFromYaml(
            fsSync.readFileSync(candidatePath, 'utf8')
          );
        }
      }
    }

    return [];
  } catch {
    return [];
  }
}

export function readStateBySessionId(
  sessionDir: string,
  sessionId: string
): WorkflowViewState | null {
  try {
    // require() is intentional: top-level ESM imports of Node built-ins are not
    // supported in the Bun plugin runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fsSync = require('node:fs') as typeof fs;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pathSync = require('node:path') as typeof path;
    const vibeDir = pathSync.join(sessionDir, '.vibe', 'conversations');
    const dirs = fsSync.readdirSync(vibeDir);

    // Search for the state file that matches this session ID
    for (const dir of dirs) {
      const file = pathSync.join(vibeDir, dir, 'state.json');
      try {
        const state = JSON.parse(
          fsSync.readFileSync(file, 'utf8')
        ) as StateJson;

        // Check if this state's sessionMetadata matches the current session ID
        if (state.sessionMetadata?.referenceId === sessionId) {
          if (!state.currentPhase && !state.workflowName) return null;
          const phases = state.workflowName
            ? getWorkflowPhases(sessionDir, state.workflowName)
            : [];
          return {
            phase: state.currentPhase ?? '—',
            workflow: state.workflowName ?? '—',
            phases,
          };
        }
      } catch {
        // unreadable entry — skip silently
      }
    }

    return null;
  } catch {
    return null;
  }
}
