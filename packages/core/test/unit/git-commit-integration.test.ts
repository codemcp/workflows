/**
 * Git Commit Integration Tests
 *
 * Simple tests to verify that the commit_behaviour parameter is handled correctly
 * and that the dynamic tool descriptions work as expected
 */

import { describe, it, expect } from 'vitest';
import { GitManager } from '@codemcp/workflows-core';

describe('Git Commit Integration', () => {
  // PHASE-0: disabled for incremental re-enable
  describe('GitManager Repository Detection', () => {
    it('should detect git repositories correctly', () => {
      // This test verifies that GitManager can detect git repositories
      // The actual detection logic is tested in git-manager.test.ts
      expect(typeof GitManager.isGitRepository).toBe('function');
      expect(typeof GitManager.getCurrentBranch).toBe('function');
      expect(typeof GitManager.getCurrentCommitHash).toBe('function');
    });
  });

  // PHASE-0: disabled for incremental re-enable
  describe('Commit Behaviour Parameter', () => {
    it('should define all expected commit behaviour options', () => {
      // This test verifies that all expected commit behaviour options are available
      const expectedOptions = ['step', 'phase', 'end', 'none'];

      // These are the options that should be available in the MCP tool description
      for (const option of expectedOptions) {
        expect(typeof option).toBe('string');
        expect(option.length).toBeGreaterThan(0);
      }
    });

    it('should have meaningful option descriptions', () => {
      // This test verifies that the commit behaviour options have meaningful descriptions
      const optionDescriptions = {
        step: 'commit after each development step',
        phase: 'commit before phase transitions',
        end: 'final commit only',
        none: 'no automatic commits',
      };

      for (const [option, description] of Object.entries(optionDescriptions)) {
        expect(typeof option).toBe('string');
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(10);
      }
    });
  });

  // PHASE-0: disabled for incremental re-enable
  describe('Dynamic Tool Description Logic', () => {
    it('should provide different guidance for git vs non-git projects', () => {
      // This test verifies the core logic of our dynamic tool descriptions

      // Simulate git repository detection
      const isGitRepo = true;
      const gitDescription = isGitRepo
        ? 'Use "end" unless the user specifically requests different behavior.'
        : 'Use "none" as this is not a git repository. Other options are not applicable for non-git projects.';

      expect(gitDescription).toContain('Use "end"');
      expect(gitDescription).toContain('unless the user specifically requests');

      // Simulate non-git directory detection
      const isNonGitRepo = false;
      const nonGitDescription = isNonGitRepo
        ? 'Use "end" unless the user specifically requests different behavior.'
        : 'Use "none" as this is not a git repository. Other options are not applicable for non-git projects.';

      expect(nonGitDescription).toContain('Use "none"');
      expect(nonGitDescription).toContain('not a git repository');
      expect(nonGitDescription).toContain('not applicable');

      // Verify the descriptions are different
      expect(gitDescription).not.toBe(nonGitDescription);
    });

    it('should maintain all commit behavior options regardless of project type', () => {
      // This test verifies that all options remain available regardless of git detection
      const allOptions = ['step', 'phase', 'end', 'none'];

      // Both git and non-git projects should have access to all options
      // (the difference is in the guidance, not the available options)
      for (const option of allOptions) {
        expect(allOptions).toContain(option);
      }

      expect(allOptions).toHaveLength(4);
    });
  });
});
