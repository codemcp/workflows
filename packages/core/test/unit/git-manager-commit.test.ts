/**
 * Test GitManager commit operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitManager } from '@codemcp/workflows-core';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Mock node modules
vi.mock('node:child_process');
vi.mock('node:fs');

const mockExecSync = vi.mocked(execSync);
const mockExistsSync = vi.mocked(existsSync);

describe('GitManager Commit Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true); // Default: is git repository
  });

  // PHASE-0: disabled for incremental re-enable
  describe('createCommit', () => {
    it('should create commit with message when changes exist', () => {
      // Arrange
      const projectPath = '/test/project';
      const message = 'WIP: test progress';
      mockExecSync.mockReturnValue(''); // git add and commit succeed

      // Act
      const result = GitManager.createCommit(message, projectPath);

      // Assert
      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('git add .', {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      expect(mockExecSync).toHaveBeenCalledWith(`git commit -m "${message}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    });

    it('should return false when not a git repository', () => {
      // Arrange
      mockExistsSync.mockReturnValue(false);
      const projectPath = '/test/project';
      const message = 'WIP: test progress';

      // Act
      const result = GitManager.createCommit(message, projectPath);

      // Assert
      expect(result).toBe(false);
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should return false when git command fails', () => {
      // Arrange
      const projectPath = '/test/project';
      const message = 'WIP: test progress';
      mockExecSync.mockImplementation(() => {
        throw new Error('git command failed');
      });

      // Act
      const result = GitManager.createCommit(message, projectPath);

      // Assert
      expect(result).toBe(false);
    });
  });

  // PHASE-0: disabled for incremental re-enable
  describe('hasUncommittedChanges', () => {
    it('should return true when there are uncommitted changes', () => {
      // Arrange
      const projectPath = '/test/project';
      mockExecSync.mockReturnValue('M  file.txt\n?? new-file.txt\n'); // Changes exist

      // Act
      const result = GitManager.hasUncommittedChanges(projectPath);

      // Assert
      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('git status --porcelain', {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    });

    it('should return false when there are no uncommitted changes', () => {
      // Arrange
      const projectPath = '/test/project';
      mockExecSync.mockReturnValue(''); // No changes

      // Act
      const result = GitManager.hasUncommittedChanges(projectPath);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when not a git repository', () => {
      // Arrange
      mockExistsSync.mockReturnValue(false);
      const projectPath = '/test/project';

      // Act
      const result = GitManager.hasUncommittedChanges(projectPath);

      // Assert
      expect(result).toBe(false);
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should return false when git command fails', () => {
      // Arrange
      const projectPath = '/test/project';
      mockExecSync.mockImplementation(() => {
        throw new Error('git command failed');
      });

      // Act
      const result = GitManager.hasUncommittedChanges(projectPath);

      // Assert
      expect(result).toBe(false);
    });
  });
});
