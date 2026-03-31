/**
 * Integration tests for file linking functionality
 *
 * Tests the complete file linking workflow including path validation,
 * file detection, and symlink creation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PathValidationUtils } from '@codemcp/workflows-core';
import { FileDetectionManager } from '@codemcp/workflows-core';
import { ProjectDocsManager } from '@codemcp/workflows-core';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, writeFile, lstat } from 'node:fs/promises';
import { cleanupDirectory } from '../utils/temp-files.js';

describe('File Linking Integration', () => {
  let testProjectPath: string;
  let projectDocsManager: ProjectDocsManager;
  let fileDetectionManager: FileDetectionManager;

  beforeEach(async () => {
    // Create test project directory
    testProjectPath = join(tmpdir(), `file-linking-test-${Date.now()}`);
    await mkdir(testProjectPath, { recursive: true });

    // Create test files
    await writeFile(
      join(testProjectPath, 'README.md'),
      '# Test Project\n\nThis is a test project with requirements and architecture info.'
    );
    await writeFile(
      join(testProjectPath, 'ARCHITECTURE.md'),
      '# Architecture\n\nSystem architecture details.'
    );

    // Create docs directory with files
    await mkdir(join(testProjectPath, 'docs'), { recursive: true });
    await writeFile(
      join(testProjectPath, 'docs', 'design.md'),
      '# Design\n\nDetailed design specifications.'
    );

    projectDocsManager = new ProjectDocsManager();
    fileDetectionManager = new FileDetectionManager(testProjectPath);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await cleanupDirectory(testProjectPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('PathValidationUtils', () => {
    it('should validate template names correctly', () => {
      const availableTemplates = ['arc42', 'freestyle'];

      expect(
        PathValidationUtils.isTemplateName('arc42', availableTemplates)
      ).toBe(true);
      expect(
        PathValidationUtils.isTemplateName('freestyle', availableTemplates)
      ).toBe(true);
      expect(
        PathValidationUtils.isTemplateName('invalid', availableTemplates)
      ).toBe(false);
    });

    it('should validate file paths correctly', async () => {
      const result = await PathValidationUtils.validateFilePath(
        'README.md',
        testProjectPath
      );

      expect(result.isValid).toBe(true);
      expect(result.resolvedPath).toBe(join(testProjectPath, 'README.md'));
    });

    it('should reject non-existent files', async () => {
      const result = await PathValidationUtils.validateFilePath(
        'nonexistent.md',
        testProjectPath
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('should validate mixed parameters correctly', async () => {
      const availableTemplates = ['arc42', 'freestyle'];

      // Template name
      const templateResult = await PathValidationUtils.validateParameter(
        'arc42',
        availableTemplates,
        testProjectPath
      );
      expect(templateResult.isTemplate).toBe(true);
      expect(templateResult.isFilePath).toBe(false);

      // File path
      const fileResult = await PathValidationUtils.validateParameter(
        'README.md',
        availableTemplates,
        testProjectPath
      );
      expect(fileResult.isTemplate).toBe(false);
      expect(fileResult.isFilePath).toBe(true);
      expect(fileResult.resolvedPath).toBe(join(testProjectPath, 'README.md'));

      // Invalid parameter
      const invalidResult = await PathValidationUtils.validateParameter(
        'invalid',
        availableTemplates,
        testProjectPath
      );
      expect(invalidResult.isTemplate).toBe(false);
      expect(invalidResult.isFilePath).toBe(false);
      expect(invalidResult.error).toBeDefined();
    });
  });

  describe('FileDetectionManager', () => {
    it('should detect existing documentation files', async () => {
      const result = await fileDetectionManager.detectDocumentationFiles();

      expect(result.architecture.length).toBeGreaterThan(0);
      expect(result.requirements.length).toBeGreaterThan(0);
      expect(result.design.length).toBeGreaterThan(0);

      // Check that README.md is detected for multiple types
      const readmeInRequirements = result.requirements.some(
        file => file.relativePath === 'README.md'
      );
      expect(readmeInRequirements).toBe(true);
    });

    it('should format suggestions correctly', async () => {
      const result = await fileDetectionManager.detectDocumentationFiles();
      const suggestions = fileDetectionManager.formatSuggestions(result);

      expect(suggestions).toContain('Found:');
      expect(suggestions).toContain('README.md');
      expect(suggestions).toContain('setup_project_docs');
    });
  });

  describe('ProjectDocsManager Symlink Creation', () => {
    it('should create symlinks for file paths', async () => {
      const result = await projectDocsManager.createOrLinkProjectDocs(
        testProjectPath,
        {}, // No templates
        {
          architecture: join(testProjectPath, 'ARCHITECTURE.md'),
          requirements: join(testProjectPath, 'README.md'),
          design: join(testProjectPath, 'docs', 'design.md'),
        }
      );

      expect(result.created).toEqual([]);
      expect(result.linked).toEqual([
        'architecture.md',
        'requirements.md',
        'design.md',
      ]);
      expect(result.skipped).toEqual([]);

      // Verify symlinks were created
      const paths = projectDocsManager.getDocumentPaths(testProjectPath);

      const archStats = await lstat(paths.architecture);
      expect(archStats.isSymbolicLink()).toBe(true);

      const reqStats = await lstat(paths.requirements);
      expect(reqStats.isSymbolicLink()).toBe(true);

      const designStats = await lstat(paths.design);
      expect(designStats.isSymbolicLink()).toBe(true);
    });

    it('should handle mixed template and file path scenarios', async () => {
      const result = await projectDocsManager.createOrLinkProjectDocs(
        testProjectPath,
        {
          architecture: 'freestyle', // Template
        },
        {
          requirements: join(testProjectPath, 'README.md'), // File path
          design: join(testProjectPath, 'docs', 'design.md'), // File path
        }
      );

      expect(result.created).toEqual(['architecture.md']);
      expect(result.linked).toEqual(['requirements.md', 'design.md']);
      expect(result.skipped).toEqual([]);
    });

    it('should check if documents are symlinks', async () => {
      // Create a symlink
      await projectDocsManager.createOrLinkProjectDocs(
        testProjectPath,
        {},
        { requirements: join(testProjectPath, 'README.md') }
      );

      const isSymlink = await projectDocsManager.isSymlink(
        testProjectPath,
        'requirements'
      );
      expect(isSymlink).toBe(true);

      const isArchSymlink = await projectDocsManager.isSymlink(
        testProjectPath,
        'architecture'
      );
      expect(isArchSymlink).toBe(false);
    });
  });

  describe('End-to-End File Linking', () => {
    it('should support complete file linking workflow', async () => {
      // 1. Detect existing files
      const detectionResult =
        await fileDetectionManager.detectDocumentationFiles();
      expect(detectionResult.requirements.length).toBeGreaterThan(0);

      // 2. Validate file paths
      const readmePath = join(testProjectPath, 'README.md');
      const validation = await PathValidationUtils.validateFilePath(
        'README.md',
        testProjectPath
      );
      expect(validation.isValid).toBe(true);

      // 3. Create symlinks
      const linkResult = await projectDocsManager.createOrLinkProjectDocs(
        testProjectPath,
        { architecture: 'freestyle' }, // Mix of template and file
        { requirements: readmePath }
      );

      expect(linkResult.created).toContain('architecture.md');
      expect(linkResult.linked).toContain('requirements.md');

      // 4. Verify symlinks work
      const requirementsPath = await projectDocsManager.readDocument(
        testProjectPath,
        'requirements'
      );
      expect(requirementsPath).toContain('requirements.md');
      expect(requirementsPath).toContain('.vibe/docs');
    });
  });
});
