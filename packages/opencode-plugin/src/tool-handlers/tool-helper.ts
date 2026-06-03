import { z } from 'zod';
import type { ToolContext } from '../types.js';
import type { ToolDefinition } from '@opencode-ai/plugin';

/**
 * Tool definition helper
 */
export function tool<Args extends z.ZodRawShape>(input: {
  description: string;
  args: Args;
  execute(
    args: z.infer<z.ZodObject<Args>>,
    context: ToolContext
  ): Promise<string>;
}): ToolDefinition {
  return input as ToolDefinition;
}
