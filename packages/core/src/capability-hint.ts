/**
 * Capability hint formatter
 *
 * Pure helper that renders an instruction-based "Capability hint" sentence so
 * the LLM picks a good model/agent for subagent work in a given phase. The
 * mechanism is intentionally instruction-based (no API model switching) and
 * fully opt-in: absent a capability, the helper returns an empty string and
 * there is no behavioral change.
 *
 * Built-in human-readable descriptions exist ONLY for `thinking` and
 * `research`. `coding` is deliberately omitted as self-evident, and any
 * unknown/custom term is echoed verbatim without a parenthetical.
 */

/**
 * Optional model/agent routing configuration consumed by the clause builder.
 */
export interface CapabilityConfig {
  model?: string;
  agent?: string;
}

/**
 * Built-in human-readable descriptions for known capabilities. `coding` is
 * INTENTIONALLY ABSENT because it is self-evident.
 */
const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  thinking: 'deep reasoning, complex planning',
  research: 'fast information gathering and browsing',
};

/**
 * Format a capability hint instruction sentence.
 *
 * @returns The full hint text, or `""` when `capability` is falsy. The hint
 *   is one sentence by default; when `config` declares model/agent a second
 *   sentence (the subagent clause) is appended.
 */
export function formatCapabilityHint(
  capability: string | undefined,
  config?: CapabilityConfig
): string {
  if (!capability) {
    return '';
  }

  // Label sentence with optional parenthetical description.
  const description = CAPABILITY_DESCRIPTIONS[capability];
  const label = description
    ? `Capability hint: This phase requires ${capability} capability (${description}).`
    : `Capability hint: This phase requires ${capability} capability.`;

  // Subagent clause (emitted only when model and/or agent is configured).
  const model = config?.model;
  const agent = config?.agent;

  if (agent && model) {
    return `${label} When launching subagents, use agent: ${agent} (model: ${model}).`;
  }
  if (agent) {
    return `${label} When launching subagents, use agent: ${agent}.`;
  }
  if (model) {
    return `${label} When launching subagents, prefer model: ${model}.`;
  }

  return label;
}
