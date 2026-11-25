/** @jsxImportSource @opentui/solid */
import {
  Index,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from 'solid-js';
import type { JSX } from '@opentui/solid';
import type { TuiPlugin, TuiPluginModule } from '@opencode-ai/plugin/tui';
import type { Plugin as V2TuiPlugin } from '@opencode/plugin/tui';
import {
  WORKFLOW_TOOLS,
  createAgentFilter,
  isWorkflowDisabled,
  readStateBySessionId,
  type WorkflowViewState,
} from './state-reader.js';

interface MessagePartUpdatedEvent {
  properties?: {
    part?: {
      sessionID?: string;
      type?: string;
      tool?: string;
    };
  };
}

/** Color type accepted by <text fg>; avoids a direct @opentui/core dependency. */
type Color = NonNullable<JSX.IntrinsicElements['text']['fg']>;

interface SidebarColors {
  text: Color;
  textMuted: Color;
  warning: Color;
  success: Color;
}

interface SidebarProps {
  sessionID: () => string;
  directory: string | undefined;
  colors: () => SidebarColors;
  /** Lower-cased name of the agent that handled the most recent message. */
  currentAgent: () => string | undefined;
  isAgentEnabled: (agent: string | undefined) => boolean;
  /** Subscribe to "a workflow tool finished in this session"; returns unsubscribe. */
  subscribe: (sessionID: string, refresh: () => void) => () => void;
}

/**
 * Sidebar widget shared by the OpenCode 1.x and 2.x plugin entrypoints; only
 * the host wiring (theme, agent lookup, event subscription) differs.
 */
function Sidebar(props: SidebarProps) {
  const colors = props.colors;
  const [state, setState] = createSignal<WorkflowViewState | null>(null);
  const [collapsed, setCollapsed] = createSignal(false);

  // Derive whether the widget should be visible based on agent filter
  const isActive = createMemo(() => props.isAgentEnabled(props.currentAgent()));

  // Spinner frames for the current-phase icon
  const SPINNER = ['◐', '◓', '◑', '◒'];
  const [spinnerFrame, setSpinnerFrame] = createSignal(0);
  // Only animate when the phase list is visible (expanded + active workflow)
  createEffect(() => {
    const s = state();
    if (collapsed() || !s || !s.phases || s.phases.length === 0) return;
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

  // ONLY use session ID-based lookup. Do NOT fall back to the latest state,
  // as that would show workflow state from a different session.
  // Read eagerly so the state is visible immediately on reload, not only
  // after the first tool call.
  const refresh = () => {
    if (!props.directory) return;
    setState(readStateBySessionId(props.directory, props.sessionID()));
  };
  createEffect(() => {
    const sessionID = props.sessionID();
    refresh();
    const off = props.subscribe(sessionID, refresh);
    onCleanup(off);
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- JSX element typed as `error` by @opentui/solid's JSX types; safe at runtime
  return (
    // Return null (no DOM node at all) when the agent filter excludes this session's agent.
    // Returning an empty <box> would still occupy a line in the sidebar.
    !isActive() ? null : (
      <box flexDirection="column">
        {/* Header row — clickable to collapse/expand when an active workflow is present */}
        <text
          fg={colors().text}
          onMouseDown={() => state() && setCollapsed(c => !c)}
        >
          {state() ? (
            (state()?.phases ?? []).length === 0 ? (
              // Phases unknown
              collapsed() ? (
                // Collapsed: ▶ workflowName phaseName
                <span>
                  {'▶ '}
                  <b>{state()?.workflow}</b>
                  <span style={{ fg: colors().textMuted }}>
                    {' '}
                    {state()?.phase}
                  </span>
                </span>
              ) : (
                // Expanded: ▼ Workflow (body shows workflowName phaseName)
                <span>
                  {'▼ '}
                  <b>Workflow</b>
                </span>
              )
            ) : collapsed() ? (
              // Collapsed + active: ▶ workflowName phaseName
              <span>
                {'▶ '}
                <b>{state()?.workflow}</b>
                <span style={{ fg: colors().textMuted }}>
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
          (state()?.phases ?? []).length > 0 ? (
            <box flexDirection="column">
              <Index each={state()?.phases ?? []}>
                {(phase, index) => (
                  <text
                    fg={
                      phase() === state()?.phase
                        ? colors().warning
                        : currentPhaseIndex() >= 0 &&
                            index < currentPhaseIndex()
                          ? colors().success
                          : colors().textMuted
                    }
                  >
                    {phase() === state()?.phase
                      ? `${SPINNER[spinnerFrame()]} `
                      : currentPhaseIndex() >= 0 && index < currentPhaseIndex()
                        ? '● '
                        : '○ '}
                    {phase()}
                  </text>
                )}
              </Index>
            </box>
          ) : (
            // Phases unknown — show workflowName phaseName
            <text fg={colors().text}>
              <b>{state()?.workflow}</b>
              <span style={{ fg: colors().textMuted }}> {state()?.phase}</span>
            </text>
          )
        ) : null}
        {/* No active workflow message */}
        {!state() ? (
          <text fg={colors().textMuted}>No Active Workflow</text>
        ) : null}
      </box>
    )
  );
}

// eslint-disable-next-line @typescript-eslint/require-await -- TuiPlugin signature requires Promise<void>; plugin body is synchronous
const tui: TuiPlugin = async api => {
  // Respect the WORKFLOW env var used by the opencode-plugin.
  // Set WORKFLOW=off to disable the TUI sidebar widget.
  if (isWorkflowDisabled()) return;

  const isAgentEnabled = createAgentFilter();

  api.slots.register({
    order: 5,
    slots: {
      sidebar_content(_ctx, props) {
        // Derive the current agent for this session from the last message.
        // api.state.session.messages() is a reactive SolidJS accessor.
        const currentAgent = () => {
          const messages = api.state.session.messages(props.session_id);
          if (!messages || messages.length === 0) return undefined;
          // Walk backwards to find the most recent message with an agent field
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i] as { agent?: string };
            if (msg.agent) return msg.agent.toLowerCase();
          }
          return undefined;
        };

        return Sidebar({
          sessionID: () => props.session_id,
          directory: api.state.path.directory,
          colors: () => api.theme.current,
          currentAgent,
          isAgentEnabled,
          subscribe: (sessionID, refresh) =>
            api.event.on('message.part.updated', e => {
              const part = (e as MessagePartUpdatedEvent).properties?.part;
              if (!part || part.sessionID !== sessionID) return;
              if (part.type !== 'tool') return;
              if (!part.tool || !WORKFLOW_TOOLS.has(part.tool)) return;
              refresh();
            }),
        });
      },
    },
  });
};

/**
 * OpenCode 2.x (CLI plugin) entrypoint: context.ui.slot + context.data.
 * Event and theme shapes were taken from the @opencode/plugin@2.1.2 typings;
 * runtime behavior in a PTY is not covered by the container E2E (see plan).
 */
const setup: V2TuiPlugin.Definition['setup'] = context => {
  if (isWorkflowDisabled()) return;

  const isAgentEnabled = createAgentFilter();
  const directory = context.location?.directory ?? process.cwd();

  const currentAgent = (sessionID: string): string | undefined => {
    const messages = context.data.session.message.list(sessionID) as Array<{
      agent?: string;
    }>;
    for (let i = messages.length - 1; i >= 0; i--) {
      const agent = messages[i]?.agent;
      if (agent) return agent.toLowerCase();
    }
    return undefined;
  };

  return context.ui.slot({
    append: 'sidebar.content',
    render: input =>
      Sidebar({
        sessionID: () => input.sessionID,
        directory,
        colors: () => ({
          text: context.theme.text.base,
          textMuted: context.theme.text.muted,
          warning: context.theme.text.feedback.warning.base,
          success: context.theme.text.feedback.success.base,
        }),
        currentAgent: () => currentAgent(input.sessionID),
        isAgentEnabled,
        subscribe: (sessionID, refresh) => {
          // The V2 tool-success event carries the call id, not the tool name;
          // the name is announced earlier by session.tool.input.started.
          const names = new Map<string, string>();
          const offStarted = context.data.on(
            'session.tool.input.started',
            event => {
              if (event.data.sessionID !== sessionID) return;
              names.set(event.data.id, event.data.name);
            }
          );
          const offSuccess = context.data.on('session.tool.success', event => {
            if (event.data.sessionID !== sessionID) return;
            const name = names.get(event.data.id);
            names.delete(event.data.id);
            // Unknown name: refresh anyway, reading a small state file is cheap.
            if (!name || WORKFLOW_TOOLS.has(name)) refresh();
          });
          return () => {
            offStarted();
            offSuccess();
          };
        },
      }),
  });
};

/**
 * One default export for both hosts (same pattern as the server plugin):
 * OpenCode 1.x reads `tui`, OpenCode 2.x reads `setup`.
 */
const plugin: TuiPluginModule & {
  id: string;
  setup: V2TuiPlugin.Definition['setup'];
} = {
  id: 'workflows-phase',
  tui,
  setup,
};

export default plugin;
