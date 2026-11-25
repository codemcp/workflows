/**
 * Everything the host-neutral runtime needs from the surrounding OpenCode
 * version. Implemented once per host (V1 SDK client, V2 plugin context).
 */
export interface HostPort {
  /**
   * Trigger a session compaction. Must not throw for a failed compaction
   * (fire-and-forget): a failed compaction must never block a phase transition.
   */
  compact(sessionID: string): Promise<void> | void;

  /**
   * Send a user prompt to the session, optionally under a specific agent.
   * Used for the phase-aware continue message after compaction.
   */
  sendPrompt(sessionID: string, text: string, agent?: string): Promise<void>;
}
