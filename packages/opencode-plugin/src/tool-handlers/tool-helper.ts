import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

/**
 * Tool definition helper
 */
export function tool<Args extends z.ZodRawShape>(input: {
  description: string;
  args: Args;
  execute(args: z.infer<z.ZodObject<Args>>, context: unknown): Promise<string>;
}): ToolDefinition {
  return input as ToolDefinition;
}
