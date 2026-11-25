/**
 * Match a file path against a glob pattern.
 * Supports patterns like:
 *   - `**\/*`       → matches everything
 *   - `**\/*.md`    → matches any .md file in any directory
 *   - `**\/*.test.ts` → matches test files
 */
export function matchGlobPattern(filePath: string, pattern: string): boolean {
  // Normalise to forward slashes
  const normalised = filePath.replace(/\\/g, '/');
  const baseName = normalised.split('/').pop() ?? '';

  // `**/*` means "allow everything"
  if (pattern === '**/*' || pattern === '*') {
    return true;
  }

  // Convert glob pattern to a regex:
  //   - Escape regex metacharacters except * and .
  //   - `**/` at the start → match any path prefix (or empty)
  //   - `**`  elsewhere    → match any sequence of characters incl. /
  //   - `*`               → match any sequence of characters excl. /
  //   - `.`               → literal dot
  const regexSource = pattern
    .replace(/\\/g, '/')
    // Escape regex special chars (except * which we handle separately)
    .replace(/[+?^${}()|[\]]/g, '\\$&')
    // Literal dot
    .replace(/\./g, '\\.')
    // `**/` at the start → optional path prefix
    .replace(/^\*\*\//, '(?:.+\\/)?')
    // remaining `**` → any chars including /
    .replace(/\*\*/g, '.*')
    // remaining `*` → any chars except /
    .replace(/\*/g, '[^/]*');

  const regex = new RegExp(`^${regexSource}$`);

  // Try matching against full normalised path and against basename
  return regex.test(normalised) || regex.test(baseName);
}

/**
 * Check if a file edit is allowed based on glob patterns
 */
export function isFileAllowed(filePath: string, patterns: string[]): boolean {
  // If allowed patterns includes '**/*' or '*', all files are allowed
  if (patterns.includes('**/*') || patterns.includes('*')) {
    return true;
  }

  // Check if the file path matches any allowed glob pattern
  return patterns.some(pattern => matchGlobPattern(filePath, pattern));
}
