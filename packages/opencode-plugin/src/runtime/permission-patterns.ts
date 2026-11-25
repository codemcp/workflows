/**
 * Build human-readable permission patterns for the permission dialog.
 * The permission dialog only shows `patterns`/`resources`, so we put
 * meaningful "key: value" strings here instead of the generic '*'.
 */
export function buildPermissionPatterns(
  toolName: string,
  args: Record<string, unknown>
): string[] {
  const entry = (key: string, value: unknown): string | null => {
    if (value === undefined || value === null || value === '') return null;
    return `${key}: ${value}`;
  };

  switch (toolName) {
    case 'start_development': {
      const patterns = [entry('workflow', args['workflow'])].filter(
        (p): p is string => p !== null
      );
      return patterns.length > 0 ? patterns : ['*'];
    }
    case 'proceed_to_phase': {
      const patterns = [
        entry('target_phase', args['target_phase']),
        entry('reason', args['reason']),
      ].filter((p): p is string => p !== null);
      return patterns.length > 0 ? patterns : ['*'];
    }
    case 'conduct_review': {
      const patterns = [entry('target_phase', args['target_phase'])].filter(
        (p): p is string => p !== null
      );
      return patterns.length > 0 ? patterns : ['*'];
    }
    case 'reset_development': {
      const patterns = [
        args['delete_plan'] === true
          ? entry('delete_plan', args['delete_plan'])
          : null,
        entry('reason', args['reason']),
      ].filter((p): p is string => p !== null);
      return patterns.length > 0 ? patterns : ['*'];
    }
    case 'setup_project_docs': {
      const patterns = [
        entry('architecture', args['architecture']),
        entry('requirements', args['requirements']),
        entry('design', args['design']),
      ].filter((p): p is string => p !== null);
      return patterns.length > 0 ? patterns : ['*'];
    }
    default:
      return ['*'];
  }
}
