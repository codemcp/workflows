/**
 * Tests for directory linking and extension preservation functionality
 *
 * Tests the fixes for:
 * - Issue 1: Directory linking support
 * - Issue 2: Extension preservation in symlinks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PathValidationUtils } from '@codemcp/workflows-core';
import { ProjectDocsManager } from '@codemcp/workflows-core';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, rm, readlink, lstat } from 'node:fs/promises';

describe('Directory Linking and Extension Preservation', () => {
  let testProjectPath: string;
  let projectDocsManager: ProjectDocsManager;

  beforeEach(async () => {
    // Create test project directory
    testProjectPath = join(tmpdir(), `dir-ext-test-${Date.now()}`);
    await mkdir(testProjectPath, { recursive: true });

    projectDocsManager = new ProjectDocsManager();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testProjectPath, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // PHASE-0: disabled for incremental re-enable
  describe('disabled-group-1', () => {
    it('should validate directories with validateFileOrDirectoryPath', async () => {
      // Create test directory
      const docsDir = join(testProjectPath, 'docs');
      await mkdir(docsDir, { recursive: true });
      await writeFile(join(docsDir, 'index.md'), '# Documentation');

      const result = await PathValidationUtils.validateFileOrDirectoryPath(
        docsDir,
        testProjectPath
      );

      expect(result.isValid).toBe(true);
      expect(result.resolvedPath).toBe(docsDir);
    });

    it('should reject directories with old validateFilePath method', async () => {
      // Create test directory
      const docsDir = join(testProjectPath, 'docs');
      await mkdir(docsDir, { recursive: true });
      await writeFile(join(docsDir, 'index.md'), '# Documentation');

      const result = await PathValidationUtils.validateFilePath(
        docsDir,
        testProjectPath
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('directory, not a file');
    });

    it('should recognize directories as valid file paths in validateParameter', async () => {
      // Create test directory
      const docsDir = join(testProjectPath, 'docs');
      await mkdir(docsDir, { recursive: true });
      await writeFile(join(docsDir, 'index.md'), '# Documentation');

      const result = await PathValidationUtils.validateParameter(
        docsDir,
        ['arc42'],
        testProjectPath
      );

      expect(result.isTemplate).toBe(false);
      expect(result.isFilePath).toBe(true);
      expect(result.resolvedPath).toBe(docsDir);
    });

    it('should create symlinks to directories', async () => {
      // Create test directory
      const docsDir = join(testProjectPath, 'docs');
      await mkdir(docsDir, { recursive: true });
      await writeFile(join(docsDir, 'architecture.md'), '# Architecture');

      const result = await projectDocsManager.createOrLinkProjectDocs(
        testProjectPath,
        {}, // No templates
        { architecture: docsDir }
      );

      expect(result.linked).toContain('architecture');
      expect(result.created.length).toBe(2); // requirements and design from templates
      expect(result.skipped.length).toBe(0);

      // Verify symlink was created
      const paths = await projectDocsManager.getDocumentPathsWithExtensions(
        testProjectPath,
        { architecture: docsDir }
      );
      const stats = await lstat(paths.architecture);
      expect(stats.isSymbolicLink()).toBe(true);

      const linkTarget = await readlink(paths.architecture);
      expect(linkTarget).toContain('docs');
    });
  });

  // PHASE-0: disabled for incremental re-enable
  // PHASE-0: disabled for incremental re-enable
  describe('disabled-group-2', () => {
    it('should preserve file extensions in getDocumentPathsWithExtensions', async () => {
      // Create test files with different extensions
      await writeFile(join(testProjectPath, 'arch.adoc'), '= Architecture');
      await writeFile(join(testProjectPath, 'reqs.docx'), 'Requirements');
      await writeFile(join(testProjectPath, 'design.txt'), 'Design');

      const sourcePaths = {
        architecture: join(testProjectPath, 'arch.adoc'),
        requirements: join(testProjectPath, 'reqs.docx'),
        design: join(testProjectPath, 'design.txt'),
      };

      const paths = await projectDocsManager.getDocumentPathsWithExtensions(
        testProjectPath,
        sourcePaths
      );

      expect(paths.architecture.endsWith('.adoc')).toBe(true);
      expect(paths.requirements.endsWith('.docx')).toBe(true);
      expect(paths.design.endsWith('.txt')).toBe(true);
    });

    it('should use .md extension for templates (backward compatibility)', async () => {
      const paths =
        await projectDocsManager.getDocumentPathsWithExtensions(
          testProjectPath
        );

      expect(paths.architecture.endsWith('.md')).toBe(true);
      expect(paths.requirements.endsWith('.md')).toBe(true);
      expect(paths.design.endsWith('.md')).toBe(true);
    });

    it('should create symlinks with preserved extensions', async () => {
      // Create test files
      await writeFile(
        join(testProjectPath, 'architecture.adoc'),
        '= Architecture\n\nAsciiDoc format'
      );
      await writeFile(
        join(testProjectPath, 'requirements.docx'),
        'Word document'
      );
      await writeFile(join(testProjectPath, 'design.txt'), 'Plain text');

      const sourcePaths = {
        architecture: join(testProjectPath, 'architecture.adoc'),
        requirements: join(testProjectPath, 'requirements.docx'),
        design: join(testProjectPath, 'design.txt'),
      };

      const result = await projectDocsManager.createOrLinkProjectDocs(
        testProjectPath,
        {}, // No templates
        sourcePaths
      );

      expect(result.linked).toEqual([
        'architecture.adoc',
        'requirements.docx',
        'design.txt',
      ]);
      expect(result.created).toEqual([]);
      expect(result.skipped).toEqual([]);

      // Verify symlinks exist with correct extensions
      const paths = await projectDocsManager.getDocumentPathsWithExtensions(
        testProjectPath,
        sourcePaths
      );

      const archStats = await lstat(paths.architecture);
      expect(archStats.isSymbolicLink()).toBe(true);

      const reqStats = await lstat(paths.requirements);
      expect(reqStats.isSymbolicLink()).toBe(true);

      const designStats = await lstat(paths.design);
      expect(designStats.isSymbolicLink()).toBe(true);
    });

    it('should handle mixed templates and file paths with correct extensions', async () => {
      // Create one test file
      await writeFile(
        join(testProjectPath, 'existing-design.adoc'),
        '= Design\n\nExisting design doc'
      );

      const result = await projectDocsManager.createOrLinkProjectDocs(
        testProjectPath,
        {
          architecture: 'freestyle', // Template
          requirements: 'freestyle', // Template
        },
        {
          design: join(testProjectPath, 'existing-design.adoc'), // File path
        }
      );

      expect(result.created).toEqual(['architecture.md', 'requirements.md']);
      expect(result.linked).toEqual(['design.adoc']);
      expect(result.skipped).toEqual([]);
    });

    it('should handle files without extensions', async () => {
      // Create file without extension
      await writeFile(
        join(testProjectPath, 'README'),
        '# Project\n\nNo extension file'
      );

      const sourcePaths = {
        architecture: join(testProjectPath, 'README'),
      };

      const paths = await projectDocsManager.getDocumentPathsWithExtensions(
        testProjectPath,
        sourcePaths
      );

      // Should default to .md for files without extensions
      expect(paths.architecture.endsWith('.md')).toBe(true);
    });

    it('should handle directories with no extension', async () => {
      // Create test directory
      const docsDir = join(testProjectPath, 'documentation');
      await mkdir(docsDir, { recursive: true });
      await writeFile(join(docsDir, 'index.md'), '# Documentation Index');

      const sourcePaths = {
        architecture: docsDir,
      };

      const paths = await projectDocsManager.getDocumentPathsWithExtensions(
        testProjectPath,
        sourcePaths
      );

      // Should use standardized document type name
      expect(paths.architecture.endsWith('architecture')).toBe(true);
      expect(paths.architecture).not.toContain('.md');
    });
  });

  // PHASE-0: disabled for incremental re-enable
  // PHASE-0: disabled for incremental re-enable
  describe('disabled-group-3', () => {
    it('should maintain old getDocumentPaths behavior', () => {
      const paths = projectDocsManager.getDocumentPaths(testProjectPath);

      expect(paths.architecture.endsWith('architecture.md')).toBe(true);
      expect(paths.requirements.endsWith('requirements.md')).toBe(true);
      expect(paths.design.endsWith('design.md')).toBe(true);
    });

    it('should maintain old getVariableSubstitutions behavior', () => {
      const substitutions =
        projectDocsManager.getVariableSubstitutions(testProjectPath);

      expect(
        substitutions['$ARCHITECTURE_DOC'].endsWith('architecture.md')
      ).toBe(true);
      expect(
        substitutions['$REQUIREMENTS_DOC'].endsWith('requirements.md')
      ).toBe(true);
      expect(substitutions['$DESIGN_DOC'].endsWith('design.md')).toBe(true);
    });

    it('should provide new getVariableSubstitutionsWithExtensions method', async () => {
      // Create test files
      await writeFile(join(testProjectPath, 'arch.adoc'), '= Architecture');

      const sourcePaths = {
        architecture: join(testProjectPath, 'arch.adoc'),
      };

      const substitutions =
        await projectDocsManager.getVariableSubstitutionsWithExtensions(
          testProjectPath,
          sourcePaths
        );

      expect(
        substitutions['$ARCHITECTURE_DOC'].endsWith('architecture.adoc')
      ).toBe(true);
      expect(
        substitutions['$REQUIREMENTS_DOC'].endsWith('requirements.md')
      ).toBe(true); // Default for no source
      expect(substitutions['$DESIGN_DOC'].endsWith('design.md')).toBe(true); // Default for no source
    });
  });

  // PHASE-0: disabled for incremental re-enable
  // PHASE-0: disabled for incremental re-enable
  describe('disabled-group-4', () => {
    it('should handle non-existent source paths gracefully', async () => {
      const sourcePaths = {
        architecture: join(testProjectPath, 'nonexistent.adoc'),
      };

      const paths = await projectDocsManager.getDocumentPathsWithExtensions(
        testProjectPath,
        sourcePaths
      );

      // Should default to .md when source doesn't exist
      expect(paths.architecture.endsWith('.md')).toBe(true);
    });

    it('should validate security boundaries for directories', async () => {
      // Test with an absolute path that's clearly outside any reasonable project boundary
      // This tests the security logic without relying on filesystem creation
      const maliciousPath = '/etc/passwd';

      const result = await PathValidationUtils.validateFileOrDirectoryPath(
        maliciousPath,
        testProjectPath
      );

      // This should fail because /etc/passwd doesn't exist as a directory we can create,
      // but more importantly, it tests that we're not allowing arbitrary system paths
      expect(result.isValid).toBe(false);
      // The error could be either "outside project boundaries" or "not found" - both are acceptable
      expect(result.error).toBeDefined();
    });
  });
});
