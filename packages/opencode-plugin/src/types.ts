/**
 * OpenCode Plugin Types
 *
 * Minimal type definitions needed for the plugin.
 * Based on @opencode-ai/plugin package types.
 */

import { z } from 'zod';

// Simplified types from opencode SDK
export type Part = {
  type: 'text' | 'image' | 'file' | 'tool_use' | 'tool_result';
  text?: string;
  [key: string]: unknown;
};

export type UserMessage = {
  id: string;
  sessionID: string;
  role: 'user';
  [key: string]: unknown;
};

export type Message = {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  [key: string]: unknown;
};

export type Model = {
  providerID: string;
  modelID: string;
  [key: string]: unknown;
};

export type Project = {
  id: string;
  path: string;
  [key: string]: unknown;
};

// Plugin input provided by opencode
export type PluginInput = {
  client: unknown; // SDK client
  project: Project;
  directory: string;
  worktree: string;
  serverUrl: URL;
  $: unknown; // BunShell
};

// Tool context for custom tools
import type { Effect } from 'effect';

export type ToolContext = {
  sessionID: string;
  messageID: string;
  agent: string;
  directory: string;
  worktree: string;
  abort: AbortSignal;
  metadata(input: { title?: string; metadata?: Record<string, unknown> }): void;
  ask(input: {
    permission: string;
    patterns: string[];
    always: string[];
    metadata: Record<string, unknown>;
  }): Effect.Effect<void>;
};

// Tool definition
export type ToolDefinition = {
  description: string;
  args: z.ZodRawShape;
  execute(args: unknown, context: ToolContext): Promise<string>;
};

// Minimal Event types from @opencode-ai/sdk needed for the event hook
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

// All available hooks
export interface Hooks {
  event?: (input: { event: BusEvent }) => Promise<void>;
  config?: (input: unknown) => Promise<void>;
  tool?: {
    [key: string]: ToolDefinition;
  };
  auth?: unknown;

  /**
   * Called when a new message is received
   */
  'chat.message'?: (
    input: {
      sessionID: string;
      agent?: string;
      model?: { providerID: string; modelID: string };
      messageID?: string;
      variant?: string;
    },
    output: { message: UserMessage; parts: Part[] }
  ) => Promise<void>;

  /**
   * Modify parameters sent to LLM
   */
  'chat.params'?: (
    input: {
      sessionID: string;
      agent: string;
      model: Model;
      provider: unknown;
      message: UserMessage;
    },
    output: {
      temperature: number;
      topP: number;
      topK: number;
      options: Record<string, unknown>;
    }
  ) => Promise<void>;

  'chat.headers'?: (
    input: {
      sessionID: string;
      agent: string;
      model: Model;
      provider: unknown;
      message: UserMessage;
    },
    output: { headers: Record<string, string> }
  ) => Promise<void>;

  'permission.ask'?: (
    input: unknown,
    output: { status: 'ask' | 'deny' | 'allow' }
  ) => Promise<void>;

  'command.execute.before'?: (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: Part[] }
  ) => Promise<void>;

  'tool.execute.before'?: (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: Record<string, unknown> }
  ) => Promise<void>;

  'shell.env'?: (
    input: { cwd: string; sessionID?: string; callID?: string },
    output: { env: Record<string, string> }
  ) => Promise<void>;

  'tool.execute.after'?: (
    input: {
      tool: string;
      sessionID: string;
      callID: string;
      args: unknown;
    },
    output: {
      title: string;
      output: string;
      metadata: unknown;
    }
  ) => Promise<void>;

  'experimental.chat.messages.transform'?: (
    input: Record<string, never>,
    output: {
      messages: {
        info: Message;
        parts: Part[];
      }[];
    }
  ) => Promise<void>;

  'experimental.chat.system.transform'?: (
    input: { sessionID?: string; model: Model },
    output: {
      system: string[];
    }
  ) => Promise<void>;

  /**
   * Called before session compaction starts. Allows plugins to customize
   * the compaction prompt.
   */
  'experimental.session.compacting'?: (
    input: { sessionID: string },
    output: { context: string[]; prompt?: string }
  ) => Promise<void>;

  'experimental.text.complete'?: (
    input: { sessionID: string; messageID: string; partID: string },
    output: { text: string }
  ) => Promise<void>;

  /**
   * Modify tool definitions (description and parameters) sent to LLM
   */
  'tool.definition'?: (
    input: { toolID: string },
    output: { description: string; parameters: unknown }
  ) => Promise<void>;
}

// Plugin function signature
export type Plugin = (input: PluginInput) => Promise<Hooks>;

// Plugin module structure expected by opencode
export type PluginModule = {
  id?: string;
  server: Plugin;
  tui?: never;
};
