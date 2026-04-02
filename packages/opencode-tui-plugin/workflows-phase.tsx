/** @jsxImportSource @opentui/solid */
import {
  Index,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
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
        const [collapsed, setCollapsed] = createSignal(false);

        // Spinner frames for the current-phase icon
        const SPINNER = ['◐', '◓', '◑', '◒'];
        const [spinnerFrame, setSpinnerFrame] = createSignal(0);
        // Only animate when the phase list is visible (expanded + active workflow)
        createEffect(() => {
          if (collapsed() || !state()) return;
          const id = setInterval(() => {
            setSpinnerFrame(f => (f + 1) % SPINNER.length);
          }, 150);
          onCleanup(() => clearInterval(id));
        });

        // Precompute current phase index once per state change to avoid O(n²) indexOf in render
        const currentPhaseIndex = createMemo(() => {
          const s = state();
          if (!s) return -1;
          return s.phases.indexOf(s.phase);
        });

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
            {/* Header row — clickable when workflow is active */}
            <text
              fg={theme().text}
              onMouseDown={() => state() && setCollapsed(c => !c)}
            >
              {state() ? (
                collapsed() ? (
                  // Collapsed + active: ▶ workflowName phaseName
                  <span>
                    {'▶ '}
                    <b>{state()?.workflow}</b>
                    <span style={{ fg: theme().textMuted }}>
                      {' '}
                      {state()?.phase}
                    </span>
                  </span>
                ) : (
                  // Expanded + active: ▼ Workflow workflowName
                  <span>
                    {'▼ '}
                    <b>Workflow</b> {state()?.workflow}
                  </span>
                )
              ) : (
                // No active workflow
                // eslint-disable-next-line solid/style-prop -- `fg` is an OpenTUI-specific style prop, not a standard CSS property
                <b>Workflow</b>
              )}
            </text>
            {/* Expanded phase list */}
            {!collapsed() && state() ? (
              <box flexDirection="column">
                {(state()?.phases ?? []).length > 0 ? (
                  <Index each={state()?.phases ?? []}>
                    {(phase, index) => (
                      <text
                        fg={
                          phase() === state()?.phase
                            ? theme().warning
                            : currentPhaseIndex() >= 0 &&
                                index < currentPhaseIndex()
                              ? theme().success
                              : theme().textMuted
                        }
                      >
                        {phase() === state()?.phase
                          ? `${SPINNER[spinnerFrame()]} `
                          : currentPhaseIndex() >= 0 &&
                              index < currentPhaseIndex()
                            ? '● '
                            : '○ '}
                        {phase()}
                      </text>
                    )}
                  </Index>
                ) : null}
              </box>
            ) : null}
            {/* No active workflow message */}
            {!state() ? (
              <text fg={theme().textMuted}>No Active Workflow</text>
            ) : null}
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
