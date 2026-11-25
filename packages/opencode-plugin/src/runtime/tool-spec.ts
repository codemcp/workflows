import type { z } from 'zod';

/**
 * Host-neutral context handed to a tool's execute function.
 * Both the V1 and the V2 adapter map their native tool context onto this.
 */
export interface ToolCallContext {
  sessionID: string;
  agent: string;
  messageID?: string;
  callID?: string;
}

/**
 * Host-neutral tool definition: authored once with zod, adapted per host
 * (V1 uses the zod shape directly, V2 converts it to JSON Schema).
 */
export interface ToolSpec<Args extends z.ZodRawShape = z.ZodRawShape> {
  description: string;
  args: Args;
  execute(
    args: z.infer<z.ZodObject<Args>>,
    context: ToolCallContext
  ): Promise<string>;
}

/** A permission request issued before a workflow tool runs. */
export interface PermissionRequest {
  action: string;
  patterns: string[];
  always: string[];
  metadata: Record<string, unknown>;
}
