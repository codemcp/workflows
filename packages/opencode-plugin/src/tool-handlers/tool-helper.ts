import { z } from 'zod';
import type { ToolCallContext, ToolSpec } from '../runtime/tool-spec.js';

/**
 * Tool definition helper (host-neutral, see runtime/tool-spec.ts)
 */
export function tool<Args extends z.ZodRawShape>(input: {
  description: string;
  args: Args;
  execute(
    args: z.infer<z.ZodObject<Args>>,
    context: ToolCallContext
  ): Promise<string>;
}): ToolSpec {
  return input as unknown as ToolSpec;
}
