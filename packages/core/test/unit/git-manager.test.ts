/**
 * GitManager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitManager } from '@codemcp/workflows-core';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('GitManager', () => {
  const testDir = resolve(__dirname, 'test-git-repo');

  beforeEach(() => {
    // Clean up any existing test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }

    // Create test directory
    mkdirSync(testDir, { recursive: true });

    // Initialize git repository
    execSync('git init', { cwd: testDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', {
      cwd: testDir,
      stdio: 'ignore',
    });
    execSync('git config user.email "test@example.com"', {
      cwd: testDir,
      stdio: 'ignore',
    });

    // Create initial commit
    writeFileSync(resolve(testDir, 'README.md'), '# Test Repository');
    execSync('git add .', { cwd: testDir, stdio: 'ignore' });
    execSync('git commit -m "Initial commit"', {
      cwd: testDir,
      stdio: 'ignore',
    });
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // PHASE-0: disabled for incremental re-enable
  describe('isGitRepository', () => {
    it('should detect git repository', () => {
      expect(GitManager.isGitRepository(testDir)).toBe(true);
    });

    it('should detect non-git directory', () => {
      const nonGitDir = resolve(__dirname, 'non-git-dir');
      mkdirSync(nonGitDir, { recursive: true });

      try {
        expect(GitManager.isGitRepository(nonGitDir)).toBe(false);
      } finally {
        rmSync(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  // PHASE-0: disabled for incremental re-enable
  describe('getCurrentBranch', () => {
    it('should get current branch name', () => {
      const branch = GitManager.getCurrentBranch(testDir);
      // CI environments may use different default branch names
      expect(['main', 'master']).toContain(branch);
    });
  });

  // PHASE-0: disabled for incremental re-enable
  describe('getCurrentCommitHash', () => {
    it('should get current commit hash', () => {
      const hash = GitManager.getCurrentCommitHash(testDir);
      expect(hash).toBeTruthy();
      expect(hash).toMatch(/^[a-f0-9]{40}$/); // SHA-1 hash format
    });
  });
});
