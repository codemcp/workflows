/** @jsxImportSource @opentui/solid */
import { Index, createSignal, onCleanup } from 'solid-js';
import type { TuiPlugin, TuiPluginModule } from '@opencode-ai/plugin/tui';
import type fs from 'node:fs';
import type path from 'node:path';

/**
 * Tool names that trigger a state refresh.
 *
 * Covers both usage modes:
 *   - opencode-plugin (bare names, no prefix)
 *   - MCP server (tools namespaced with "workflows_" prefix)
 */
const WORKFLOW_TOOLS = new Set([
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

interface MessagePartUpdatedEvent {
  properties?: {
    part?: {
      sessionID?: string;
      type?: string;
      tool?: string;
    };
  };
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
function parsePhasesFromYaml(content: string): string[] {
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
function getWorkflowPhases(projectDir: string, workflowName: string): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fsSync = require('node:fs') as typeof fs;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pathSync = require('node:path') as typeof path;

    // 1. Project-local workflow
    const localPath = pathSync.join(
      projectDir,
      '.vibe',
      'workflows',
      `${workflowName}.yaml`
    );
    if (fsSync.existsSync(localPath)) {
      return parsePhasesFromYaml(fsSync.readFileSync(localPath, 'utf8'));
    }

    // 2. Built-in workflow bundled with @codemcp/workflows-core
    const corePkgDir = pathSync.dirname(
      require.resolve('@codemcp/workflows-core/package.json')
    );
    const builtinPath = pathSync.join(
      corePkgDir,
      'resources',
      'workflows',
      `${workflowName}.yaml`
    );
    if (fsSync.existsSync(builtinPath)) {
      return parsePhasesFromYaml(fsSync.readFileSync(builtinPath, 'utf8'));
    }

    return [];
  } catch {
    return [];
  }
}

function readStateBySessionId(
  sessionDir: string,
  sessionId: string
): { phase: string; workflow: string; phases: string[] } | null {
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

// eslint-disable-next-line @typescript-eslint/require-await -- TuiPlugin signature requires Promise<void>; plugin body is synchronous
const tui: TuiPlugin = async api => {
  // Respect the same WORKFLOWS env var used by the opencode-plugin.
  // Set WORKFLOWS=off to disable the TUI sidebar widget.
  if (process.env.WORKFLOWS?.toLowerCase() === 'off') return;

  api.slots.register({
    order: 5,
    slots: {
      sidebar_content(_ctx, props) {
        const theme = () => api.theme.current;
        const [state, setState] = createSignal<{
          phase: string;
          workflow: string;
          phases: string[];
        } | null>(null);

        // Read state eagerly on mount so it's visible immediately on reload,
        // not only after the first tool call.
        const dir = api.state.path.directory;
        if (dir) {
          // ONLY use session ID-based lookup. Do NOT fall back to readLatestState,
          // as that would show workflow state from a different session.
          // If no matching session state exists, that means no workflow is active in this session.
          const stateBySession = readStateBySessionId(dir, props.session_id);
          setState(stateBySession);
        }

        const offPart = api.event.on('message.part.updated', e => {
          const ev = e as MessagePartUpdatedEvent;
          const part = ev.properties?.part;
          if (!part) return;
          if (part.sessionID !== props.session_id) return;
          if (part.type !== 'tool') return;
          if (!part.tool || !WORKFLOW_TOOLS.has(part.tool)) return;
          if (!dir) return;
          // ONLY use session ID-based lookup. Do NOT fall back to readLatestState,
          // as that would show workflow state from a different session.
          const stateBySession = readStateBySessionId(dir, props.session_id);
          setState(stateBySession);
        });
        onCleanup(offPart);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- JSX element typed as `error` by @opentui/solid's JSX types; safe at runtime
        return (
          <box flexDirection="column">
            <text fg={theme().text}>
              {/* eslint-disable-next-line solid/style-prop -- `fg` is an OpenTUI-specific style prop, not a standard CSS property */}
              <b>Workflow</b>
              {state() ? (
                <span style={{ fg: theme().textMuted }}>
                  : {state()?.workflow}
                </span>
              ) : null}
            </text>
            {state() ? (
              <box flexDirection="column">
                {(state()?.phases ?? []).length > 0 ? (
                  <Index each={state()?.phases ?? []}>
                    {phase => (
                      <text
                        fg={
                          phase() === state()?.phase
                            ? theme().text
                            : theme().textMuted
                        }
                      >
                        {phase() === state()?.phase ? '▶ ' : '  '}
                        {phase()}
                      </text>
                    )}
                  </Index>
                ) : null}
              </box>
            ) : (
              <text fg={theme().textMuted}>No Active Workflow</text>
            )}
          </box>
        );
      },
    },
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id: 'workflows-phase',
  tui,
};

export default plugin;
