/** @jsxImportSource @opentui/solid */
import { createSignal, onCleanup } from 'solid-js';
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

function readStateBySessionId(
  sessionDir: string,
  sessionId: string
): { phase: string; workflow: string } | null {
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
          return {
            phase: state.currentPhase ?? '—',
            workflow: state.workflowName ?? '—',
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
  api.slots.register({
    order: 5,
    slots: {
      sidebar_content(_ctx, props) {
        const theme = () => api.theme.current;
        const [state, setState] = createSignal<{
          phase: string;
          workflow: string;
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
          <box flexDirection="column" visible={!!state()}>
            <text fg={theme().text}>
              <b>Workflow</b>
            </text>
            <text fg={theme().textMuted}>
              {state()?.workflow}:{' '}
              {/* eslint-disable-next-line solid/style-prop -- `fg` is an OpenTUI-specific style prop, not a standard CSS property */}
              <span style={{ fg: theme().text }}>{state()?.phase}</span>
            </text>
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
