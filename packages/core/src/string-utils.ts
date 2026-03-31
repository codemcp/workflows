/**
 * Shared string utility functions
 */

/**
 * Convert a snake_case or lowercase phase name to Title Case for display.
 * e.g. "explore" → "Explore", "proceed_to_phase" → "Proceed To Phase"
 */
export function capitalizePhase(phase: string): string {
  return phase
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
