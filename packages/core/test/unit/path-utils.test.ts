/**
 * Path Utilities Tests
 *
 * Tests for cross-platform path utility functions.
 */

import { describe, it, expect } from 'vitest';
import { getPathBasename } from '../../src/path-validation-utils.js';

describe('getPathBasename', () => {
  // PHASE-0: disabled for incremental re-enable
  describe('disabled-group-1', () => {
    it('should extract basename from Unix paths', () => {
      expect(getPathBasename('/home/user/project')).toBe('project');
      expect(getPathBasename('/var/www/html')).toBe('html');
      expect(getPathBasename('/Users/dev/my-project')).toBe('my-project');
    });

    it('should handle paths with trailing slash', () => {
      expect(getPathBasename('/home/user/project/')).toBe('project');
    });

    it('should handle root path', () => {
      expect(getPathBasename('/')).toBe('unknown');
    });
  });

  // PHASE-0: disabled for incremental re-enable
  // PHASE-0: disabled for incremental re-enable
  describe('disabled-group-2', () => {
    it('should extract basename from Windows paths', () => {
      expect(getPathBasename('c:\\work\\project')).toBe('project');
      expect(getPathBasename('D:\\Users\\dev\\my-app')).toBe('my-app');
      expect(getPathBasename('C:\\work_knechte\\cross-team-knechte')).toBe(
        'cross-team-knechte'
      );
    });

    it('should handle paths with trailing backslash', () => {
      expect(getPathBasename('C:\\Users\\project\\')).toBe('project');
    });

    it('should handle drive root', () => {
      // On Unix, this returns 'C:' as basename; behavior may vary
      const result = getPathBasename('C:\\');
      expect(result).toBeTruthy();
    });
  });

  // PHASE-0: disabled for incremental re-enable
  // PHASE-0: disabled for incremental re-enable
  describe('disabled-group-3', () => {
    it('should handle forward slashes on Windows-style paths', () => {
      expect(getPathBasename('c:/work/project')).toBe('project');
      expect(getPathBasename('D:/Users/dev/my-app')).toBe('my-app');
    });
  });

  // PHASE-0: disabled for incremental re-enable
  // PHASE-0: disabled for incremental re-enable
  describe('disabled-group-4', () => {
    it('should return fallback for empty string', () => {
      expect(getPathBasename('')).toBe('unknown');
      expect(getPathBasename('', 'default')).toBe('default');
    });

    it('should return custom fallback when provided', () => {
      expect(getPathBasename('', 'custom-fallback')).toBe('custom-fallback');
    });

    it('should handle simple names without path separators', () => {
      expect(getPathBasename('project')).toBe('project');
      expect(getPathBasename('my-app')).toBe('my-app');
    });

    it('should handle relative paths', () => {
      expect(getPathBasename('./project')).toBe('project');
      expect(getPathBasename('../parent/project')).toBe('project');
      expect(getPathBasename('parent/child/project')).toBe('project');
    });
  });
});
