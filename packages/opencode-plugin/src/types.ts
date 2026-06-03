/**
 * OpenCode Plugin Types
 *
 * Re-exports the types we need directly from the official @opencode-ai/plugin
 * SDK so that any change to the SDK's type signatures (e.g. ToolContext.ask)
 * is caught at compile time rather than silently breaking at runtime.
 *
 * Only types that are NOT exported by the SDK are defined here.
 */

// ---------------------------------------------------------------------------
// Re-export everything from the official SDK
// ---------------------------------------------------------------------------

export type {
  PluginInput,
  Plugin,
  PluginModule,
  Hooks,
  ToolDefinition,
  ToolContext,
} from '@opencode-ai/plugin';

// ---------------------------------------------------------------------------
// BusEvent subtypes
//
// The SDK exports a single opaque `Event` type from @opencode-ai/sdk, but the
// plugin needs to narrow on specific event types (session.compacted,
// session.idle) that are not individually exported.  These local types stay
// here until the SDK exposes them directly.
// ---------------------------------------------------------------------------

export type SessionCompactedEvent = {
  type: 'session.compacted';
  properties: { sessionID: string };
};

export type SessionIdleEvent = {
  type: 'session.idle';
  properties: { sessionID: string };
};

export type OtherEvent = {
  type: string;
  properties: Record<string, unknown>;
};

export type BusEvent = SessionCompactedEvent | SessionIdleEvent | OtherEvent;
