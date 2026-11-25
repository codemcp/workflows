/**
 * OpenCode Workflows Plugin
 *
 * Structured development workflows for OpenCode. One default export serves
 * both plugin APIs (see the OpenCode 2 "migrate from V1" guide):
 *   - OpenCode 2.x reads `id` + `setup`
 *   - OpenCode 1.x reads `id` + `server`
 */

import type { Plugin } from './types.js';
import { WorkflowsPlugin } from './v1/plugin.js';
import { v2Plugin } from './v2/plugin.js';

export { WorkflowsPlugin };
export { v2Plugin };
export * from './types.js';

const plugin = {
  id: 'workflows',
  // OpenCode 2.x
  setup: v2Plugin.setup,
  // OpenCode 1.x
  server: WorkflowsPlugin,
} satisfies { id: string; setup: V2Setup; server: Plugin };

type V2Setup = typeof v2Plugin.setup;

export default plugin;
