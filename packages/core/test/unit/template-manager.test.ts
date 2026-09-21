/**
 * Unit tests for TemplateManager
 *
 * Tests template loading, validation, and rendering functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestAccess } from '../utils/test-access.js';
import { TemplateManager } from '@codemcp/workflows-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupDirectory } from '../utils/temp-files.js';

describe('TemplateManager', () => {
  let templateManager: TemplateManager;
  let testTemplatesPath: string;

  beforeEach(async () => {
    // Create a temporary directory for test templates
    testTemplatesPath = join(tmpdir(), `template-test-${Date.now()}`);
    await mkdir(testTemplatesPath, { recursive: true });

    // Create test template directories
    await mkdir(join(testTemplatesPath, 'architecture'), { recursive: true });
    await mkdir(join(testTemplatesPath, 'requirements'), { recursive: true });
    await mkdir(join(testTemplatesPath, 'design'), { recursive: true });

    // Create test template files
    await writeFile(
      join(testTemplatesPath, 'architecture', 'freestyle.md'),
      '# Test Architecture Template\n\nThis is a test template.'
    );

    await writeFile(
      join(testTemplatesPath, 'requirements', 'ears.md'),
      '# Test Requirements Template\n\n## REQ-1: Test Requirement'
    );

    await writeFile(
      join(testTemplatesPath, 'requirements', 'freestyle.md'),
      '# Freestyle Requirements Template\n\nFlexible requirements format.'
    );

    await writeFile(
      join(testTemplatesPath, 'design', 'comprehensive.md'),
      '# Test Design Template\n\n## Components\n\nTest components here.'
    );

    await writeFile(
      join(testTemplatesPath, 'design', 'freestyle.md'),
      '# Freestyle Design Template\n\nFlexible design format.'
    );

    // Create arc42 directory template with images
    const arc42Path = join(testTemplatesPath, 'architecture', 'arc42');
    await mkdir(arc42Path, { recursive: true });
    await mkdir(join(arc42Path, 'images'), { recursive: true });

    await writeFile(
      join(arc42Path, 'arc42-template-EN.md'),
      '# Arc42 Template\n\n## Introduction and Goals\n\nTest arc42 content.'
    );

    await writeFile(
      join(arc42Path, 'images', 'test-image.png'),
      Buffer.from('fake-image-data')
    );

    // Mock the templatesPath in TemplateManager
    templateManager = new TemplateManager();
    TestAccess.injectMock(templateManager, 'templatesPath', testTemplatesPath);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await cleanupDirectory(testTemplatesPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  // PHASE-0: disabled for incremental re-enable
  describe('getDefaults', () => {
    it('should return correct default template options', async () => {
      const defaults = await templateManager.getDefaults();

      expect(defaults).toEqual({
        architecture: 'arc42',
        requirements: 'ears',
        design: 'comprehensive',
      });
    });
  });

  // PHASE-0: disabled for incremental re-enable
  describe('validateOptions', () => {
    it('should validate correct template options', async () => {
      await expect(
        templateManager.validateOptions({
          architecture: 'arc42',
          requirements: 'ears',
          design: 'comprehensive',
        })
      ).resolves.not.toThrow();
    });

    it('should validate freestyle options', async () => {
      await expect(
        templateManager.validateOptions({
          architecture: 'freestyle',
          requirements: 'freestyle',
          design: 'freestyle',
        })
      ).resolves.not.toThrow();
    });

    it('should throw error for invalid architecture template', async () => {
      await expect(
        templateManager.validateOptions({
          // @ts-ignore - testing invalid input
          architecture: 'invalid',
        })
      ).rejects.toThrow('Invalid architecture template: invalid');
    });

    it('should throw error for invalid requirements template', async () => {
      await expect(
        templateManager.validateOptions({
          // @ts-ignore - testing invalid input
          requirements: 'invalid',
        })
      ).rejects.toThrow('Invalid requirements template: invalid');
    });

    it('should throw error for invalid design template', async () => {
      await expect(
        templateManager.validateOptions({
          // @ts-ignore - testing invalid input
          design: 'invalid',
        })
      ).rejects.toThrow('Invalid design template: invalid');
    });
  });

  // PHASE-0: disabled for incremental re-enable
  describe('loadTemplate', () => {
    it('should load freestyle architecture template', async () => {
      const result = await templateManager.loadTemplate(
        'architecture',
        'freestyle'
      );

      expect(result.content).toContain('# Test Architecture Template');
      expect(result.content).toContain('This is a test template.');
      expect(result.additionalFiles).toBeUndefined();
    });

    it('should load ears requirements template', async () => {
      const result = await templateManager.loadTemplate('requirements', 'ears');

      expect(result.content).toContain('# Test Requirements Template');
      expect(result.content).toContain('## REQ-1: Test Requirement');
      expect(result.additionalFiles).toBeUndefined();
    });

    it('should load comprehensive design template', async () => {
      const result = await templateManager.loadTemplate(
        'design',
        'comprehensive'
      );

      expect(result.content).toContain('# Test Design Template');
      expect(result.content).toContain('## Components');
      expect(result.additionalFiles).toBeUndefined();
    });

    it('should load arc42 directory template with images', async () => {
      const result = await templateManager.loadTemplate(
        'architecture',
        'arc42'
      );

      expect(result.content).toContain('# Arc42 Template');
      expect(result.content).toContain('## Introduction and Goals');
      expect(result.additionalFiles).toBeDefined();
      expect(result.additionalFiles).toHaveLength(1);

      // Safe to access [0] after length check
      const firstFile = result.additionalFiles?.[0];
      expect(firstFile?.relativePath).toBe('images/test-image.png');
      expect(firstFile?.content).toEqual(Buffer.from('fake-image-data'));
    });

    it('should throw error for non-existent template', async () => {
      await expect(
        templateManager.loadTemplate('architecture', 'nonexistent')
      ).rejects.toThrow('Template not found: architecture/nonexistent');
    });

    it('should throw error for non-existent template type', async () => {
      await expect(
        // @ts-ignore - testing invalid input
        templateManager.loadTemplate('invalid', 'freestyle')
      ).rejects.toThrow('Template not found: invalid/freestyle');
    });
  });

  // PHASE-0: disabled for incremental re-enable
  describe('getAvailableTemplates', () => {
    it('should return all available template options', async () => {
      const templates = await templateManager.getAvailableTemplates();

      expect(templates).toEqual({
        architecture: ['arc42', 'freestyle'],
        requirements: ['ears', 'freestyle'],
        design: ['comprehensive', 'freestyle'],
      });
    });
  });
});
