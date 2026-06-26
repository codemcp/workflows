/**
 * Unit tests for ConfigManager
 *
 * Covers `.vibe/config.yaml` loading and validation, including the
 * `capability_models` field.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '@codemcp/workflows-core';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

describe('ConfigManager', () => {
  let testProjectPath: string;
  let vibeDir: string;
  let configPath: string;

  beforeEach(() => {
    testProjectPath = fs.mkdtempSync(
      path.join(tmpdir(), 'config-manager-test-')
    );
    vibeDir = path.join(testProjectPath, '.vibe');
    fs.mkdirSync(vibeDir, { recursive: true });
    configPath = path.join(vibeDir, 'config.yaml');
  });

  afterEach(() => {
    fs.rmSync(testProjectPath, { recursive: true, force: true });
  });

  describe('loadProjectConfig (no config file)', () => {
    it('returns null when no config file exists (backward compatibility)', () => {
      fs.rmSync(vibeDir, { recursive: true, force: true });
      expect(ConfigManager.loadProjectConfig(testProjectPath)).toBeNull();
    });
  });

  describe('capability_models validation', () => {
    it('accepts a valid capability_models with model and agent entries', () => {
      fs.writeFileSync(
        configPath,
        [
          'capability_models:',
          '  thinking:',
          '    model: anthropic/claude-opus-4-7',
          '    agent: general_thinking',
          '  research:',
          '    model: anthropic/claude-haiku-4-5',
        ].join('\n')
      );

      const config = ConfigManager.loadProjectConfig(testProjectPath);
      expect(config).not.toBeNull();
      expect(config?.capability_models?.thinking).toEqual({
        model: 'anthropic/claude-opus-4-7',
        agent: 'general_thinking',
      });
      expect(config?.capability_models?.research).toEqual({
        model: 'anthropic/claude-haiku-4-5',
      });
    });

    it('accepts an empty entry object {} (no-op: no model, no agent)', () => {
      fs.writeFileSync(
        configPath,
        ['capability_models:', '  thinking: {}'].join('\n')
      );

      const config = ConfigManager.loadProjectConfig(testProjectPath);
      expect(config).not.toBeNull();
      expect(config?.capability_models?.thinking).toEqual({});
    });

    it('accepts an empty record capability_models: {} (no-op)', () => {
      fs.writeFileSync(configPath, 'capability_models: {}\n');

      const config = ConfigManager.loadProjectConfig(testProjectPath);
      expect(config).not.toBeNull();
      expect(config?.capability_models).toEqual({});
    });

    it('accepts absent capability_models (opt-in / backward compatibility)', () => {
      fs.writeFileSync(configPath, 'enabled_workflows:\n  - epcc\n');

      const config = ConfigManager.loadProjectConfig(testProjectPath);
      expect(config).not.toBeNull();
      expect(config?.capability_models).toBeUndefined();
    });

    it('rejects capability_models that is a string (not an object)', () => {
      fs.writeFileSync(configPath, 'capability_models: oops\n');

      expect(() => ConfigManager.loadProjectConfig(testProjectPath)).toThrow(
        /capability_models must be an object/
      );
    });

    it('rejects capability_models that is an array (not a record)', () => {
      fs.writeFileSync(
        configPath,
        'capability_models:\n  - thinking\n  - research\n'
      );

      expect(() => ConfigManager.loadProjectConfig(testProjectPath)).toThrow(
        /capability_models must be an object/
      );
    });

    it('rejects capability_models that is null', () => {
      fs.writeFileSync(configPath, 'capability_models:\n');

      expect(() => ConfigManager.loadProjectConfig(testProjectPath)).toThrow(
        /capability_models must be an object/
      );
    });

    it('rejects an entry value that is not an object (string)', () => {
      fs.writeFileSync(configPath, 'capability_models:\n  thinking: oops\n');

      expect(() => ConfigManager.loadProjectConfig(testProjectPath)).toThrow(
        /capability_models entry 'thinking' must be an object/
      );
    });

    it('rejects an entry value that is an array', () => {
      fs.writeFileSync(
        configPath,
        'capability_models:\n  thinking:\n    - foo\n'
      );

      expect(() => ConfigManager.loadProjectConfig(testProjectPath)).toThrow(
        /capability_models entry 'thinking' must be an object/
      );
    });

    it('rejects an entry with a numeric model', () => {
      fs.writeFileSync(
        configPath,
        'capability_models:\n  thinking:\n    model: 123\n'
      );

      expect(() => ConfigManager.loadProjectConfig(testProjectPath)).toThrow(
        /capability_models entry 'thinking' model must be a non-empty string/
      );
    });

    it('rejects an entry with a numeric agent', () => {
      fs.writeFileSync(
        configPath,
        'capability_models:\n  thinking:\n    agent: 456\n'
      );

      expect(() => ConfigManager.loadProjectConfig(testProjectPath)).toThrow(
        /capability_models entry 'thinking' agent must be a non-empty string/
      );
    });

    it('rejects an entry with an empty-string model', () => {
      fs.writeFileSync(
        configPath,
        'capability_models:\n  thinking:\n    model: ""\n'
      );

      expect(() => ConfigManager.loadProjectConfig(testProjectPath)).toThrow(
        /capability_models entry 'thinking' model must be a non-empty string/
      );
    });

    it('rejects an entry with a null model', () => {
      fs.writeFileSync(
        configPath,
        'capability_models:\n  thinking:\n    model:\n'
      );

      expect(() => ConfigManager.loadProjectConfig(testProjectPath)).toThrow(
        /capability_models entry 'thinking' model must be a non-empty string/
      );
    });

    it('accepts an entry with only agent (model absent)', () => {
      fs.writeFileSync(
        configPath,
        'capability_models:\n  research:\n    agent: fast_explorer\n'
      );

      const config = ConfigManager.loadProjectConfig(testProjectPath);
      expect(config).not.toBeNull();
      expect(config?.capability_models?.research).toEqual({
        agent: 'fast_explorer',
      });
    });
  });
});
