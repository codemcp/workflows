import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import {
  CapabilityGenerator,
  CapabilityGeneratorRegistry,
  OpencodeCapabilityGenerator,
  generateCapabilities,
  type CapabilityGeneratorOptions,
  type CapabilityGeneratorResult,
} from '../src/capability-generator.js';

describe('Capability Generator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'capability-generator-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('happy path', () => {
    it('generates all three agent files and the matching config entries', async () => {
      const result = await generateCapabilities('opencode', {
        projectPath: tempDir,
        models: {
          thinking: 'anthropic/claude-opus-4-7',
          coding: 'anthropic/claude-sonnet-4-5',
          research: 'anthropic/claude-haiku-4-5',
        },
      });

      // 1. Generated files
      expect(result.generatedFiles).toHaveLength(3);
      expect(result.skippedFiles).toHaveLength(0);
      expect(result.configUpdated).toBe(true);
      expect(result.configPath).toBe(join(tempDir, '.vibe', 'config.yaml'));

      // 2. Per-file checks
      for (const cap of ['thinking', 'coding', 'research']) {
        const filePath = join(tempDir, '.opencode', 'agents', `${cap}.md`);
        expect(existsSync(filePath)).toBe(true);
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('---');
        expect(content).toContain('mode: subagent');
      }

      const thinkingContent = readFileSync(
        join(tempDir, '.opencode', 'agents', 'thinking.md'),
        'utf-8'
      );
      expect(thinkingContent).toContain('model: anthropic/claude-opus-4-7');
      expect(thinkingContent).toContain('description:');

      const codingContent = readFileSync(
        join(tempDir, '.opencode', 'agents', 'coding.md'),
        'utf-8'
      );
      expect(codingContent).toContain('model: anthropic/claude-sonnet-4-5');

      const researchContent = readFileSync(
        join(tempDir, '.opencode', 'agents', 'research.md'),
        'utf-8'
      );
      expect(researchContent).toContain('model: anthropic/claude-haiku-4-5');

      // 3. Config checks
      const configRaw = readFileSync(result.configPath, 'utf-8');
      const config = yaml.load(configRaw) as Record<string, unknown>;
      expect(config.capability_models).toBeDefined();
      const capModels = config.capability_models as Record<
        string,
        { model: string; agent: string }
      >;
      expect(capModels.thinking).toEqual({
        model: 'anthropic/claude-opus-4-7',
        agent: 'thinking',
      });
      expect(capModels.coding).toEqual({
        model: 'anthropic/claude-sonnet-4-5',
        agent: 'coding',
      });
      expect(capModels.research).toEqual({
        model: 'anthropic/claude-haiku-4-5',
        agent: 'research',
      });
    });

    it('does not write a config when no models are provided', async () => {
      const result = await generateCapabilities('opencode', {
        projectPath: tempDir,
        models: {},
      });
      expect(result.configUpdated).toBe(false);
      expect(result.generatedFiles).toHaveLength(0);
      expect(existsSync(join(tempDir, '.vibe', 'config.yaml'))).toBe(false);
    });
  });

  describe('partial flags', () => {
    it('only writes the requested capabilities', async () => {
      const result = await generateCapabilities('opencode', {
        projectPath: tempDir,
        models: { thinking: 'anthropic/claude-opus-4-7' },
      });

      expect(result.generatedFiles).toHaveLength(1);
      expect(
        existsSync(join(tempDir, '.opencode', 'agents', 'thinking.md'))
      ).toBe(true);
      expect(
        existsSync(join(tempDir, '.opencode', 'agents', 'coding.md'))
      ).toBe(false);
      expect(
        existsSync(join(tempDir, '.opencode', 'agents', 'research.md'))
      ).toBe(false);

      const config = yaml.load(
        readFileSync(result.configPath, 'utf-8')
      ) as Record<string, unknown>;
      const capModels = config.capability_models as Record<string, unknown>;
      expect(Object.keys(capModels)).toEqual(['thinking']);
    });
  });

  describe('overwrite protection', () => {
    it('skips existing files when --force is not set', async () => {
      const agentsDir = join(tempDir, '.opencode', 'agents');
      mkdirSync(agentsDir, { recursive: true });
      const thinkingPath = join(agentsDir, 'thinking.md');
      const customContent = '---CUSTOM DO NOT OVERWRITE---\n';
      writeFileSync(thinkingPath, customContent);

      const result = await generateCapabilities('opencode', {
        projectPath: tempDir,
        models: { thinking: 'anthropic/claude-opus-4-7' },
      });

      expect(result.generatedFiles).toHaveLength(0);
      expect(result.skippedFiles).toEqual([thinkingPath]);
      expect(readFileSync(thinkingPath, 'utf-8')).toBe(customContent);
    });

    it('overwrites existing files when --force is set', async () => {
      const agentsDir = join(tempDir, '.opencode', 'agents');
      mkdirSync(agentsDir, { recursive: true });
      const thinkingPath = join(agentsDir, 'thinking.md');
      const customContent = '---CUSTOM DO NOT OVERWRITE---\n';
      writeFileSync(thinkingPath, customContent);

      const result = await generateCapabilities('opencode', {
        projectPath: tempDir,
        models: { thinking: 'anthropic/claude-opus-4-7' },
        force: true,
      });

      expect(result.generatedFiles).toEqual([thinkingPath]);
      expect(result.skippedFiles).toHaveLength(0);
      const newContent = readFileSync(thinkingPath, 'utf-8');
      expect(newContent).not.toBe(customContent);
      expect(newContent).toContain('mode: subagent');
      expect(newContent).toContain('model: anthropic/claude-opus-4-7');
    });
  });

  describe('config merging', () => {
    it('preserves unrelated top-level keys', async () => {
      const vibeDir = join(tempDir, '.vibe');
      mkdirSync(vibeDir, { recursive: true });
      writeFileSync(
        join(vibeDir, 'config.yaml'),
        'enabled_workflows:\n  - epcc\n'
      );

      const result = await generateCapabilities('opencode', {
        projectPath: tempDir,
        models: { thinking: 'anthropic/claude-opus-4-7' },
      });

      expect(result.configUpdated).toBe(true);
      const config = yaml.load(
        readFileSync(result.configPath, 'utf-8')
      ) as Record<string, unknown>;
      expect(config.enabled_workflows).toEqual(['epcc']);
      expect(
        (config.capability_models as Record<string, unknown>).thinking
      ).toBeDefined();
    });

    it('merges per-key: overwrites the provided capability only', async () => {
      const vibeDir = join(tempDir, '.vibe');
      mkdirSync(vibeDir, { recursive: true });
      writeFileSync(
        join(vibeDir, 'config.yaml'),
        [
          'capability_models:',
          '  thinking:',
          '    model: old',
          '    agent: old',
          '  coding:',
          '    model: keep',
          '    agent: coding',
          '',
        ].join('\n')
      );

      const result = await generateCapabilities('opencode', {
        projectPath: tempDir,
        models: { thinking: 'new' },
      });

      expect(result.configUpdated).toBe(true);
      const config = yaml.load(
        readFileSync(result.configPath, 'utf-8')
      ) as Record<string, unknown>;
      const capModels = config.capability_models as Record<
        string,
        { model: string; agent: string }
      >;
      expect(capModels.thinking).toEqual({ model: 'new', agent: 'thinking' });
      expect(capModels.coding).toEqual({ model: 'keep', agent: 'coding' });
    });

    it('reports configUpdated=false when nothing actually changes', async () => {
      const vibeDir = join(tempDir, '.vibe');
      mkdirSync(vibeDir, { recursive: true });
      writeFileSync(
        join(vibeDir, 'config.yaml'),
        [
          'capability_models:',
          '  thinking:',
          '    model: anthropic/claude-opus-4-7',
          '    agent: thinking',
          '',
        ].join('\n')
      );

      const result = await generateCapabilities('opencode', {
        projectPath: tempDir,
        models: { thinking: 'anthropic/claude-opus-4-7' },
      });

      expect(result.configUpdated).toBe(false);
    });
  });
});

describe('CapabilityGeneratorRegistry', () => {
  it('exists() reports known targets and rejects unknown ones', () => {
    expect(CapabilityGeneratorRegistry.exists('opencode')).toBe(true);
    expect(CapabilityGeneratorRegistry.exists('kiro')).toBe(true);
    expect(CapabilityGeneratorRegistry.exists('totally-unknown')).toBe(false);
  });

  it('getSupportedNames() includes opencode and excludes all stubs', () => {
    const supported = CapabilityGeneratorRegistry.getSupportedNames();
    expect(supported).toContain('opencode');
    expect(supported).not.toContain('kiro');
    expect(supported).not.toContain('claude');
    expect(supported).not.toContain('gemini');
    expect(supported).not.toContain('vscode');
    expect(supported).not.toContain('github-copilot');
  });

  it('createGenerator("opencode") returns a working CapabilityGenerator', async () => {
    const generator = CapabilityGeneratorRegistry.createGenerator('opencode');
    expect(generator).toBeInstanceOf(CapabilityGenerator);
    expect(generator).toBeInstanceOf(OpencodeCapabilityGenerator);
    expect(generator.name).toBe('opencode');

    const tempDir = mkdtempSync(join(tmpdir(), 'cap-registry-opencode-'));
    try {
      const opts: CapabilityGeneratorOptions = {
        projectPath: tempDir,
        models: { thinking: 'anthropic/claude-opus-4-7' },
      };
      const result: CapabilityGeneratorResult = await generator.generate(opts);
      expect(result.generatedFiles).toHaveLength(1);
      expect(result.configUpdated).toBe(true);
      expect(
        existsSync(join(tempDir, '.opencode', 'agents', 'thinking.md'))
      ).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('createGenerator("kiro") throws "not yet supported"', () => {
    expect(() => CapabilityGeneratorRegistry.createGenerator('kiro')).toThrow(
      /not yet supported/i
    );
  });

  it('createGenerator("claude") throws "not yet supported"', () => {
    expect(() => CapabilityGeneratorRegistry.createGenerator('claude')).toThrow(
      /not yet supported/i
    );
  });

  it('createGenerator("gemini") throws "not yet supported"', () => {
    expect(() => CapabilityGeneratorRegistry.createGenerator('gemini')).toThrow(
      /not yet supported/i
    );
  });

  it('createGenerator("vscode") throws "not yet supported"', () => {
    expect(() => CapabilityGeneratorRegistry.createGenerator('vscode')).toThrow(
      /not yet supported/i
    );
  });

  it('createGenerator("github-copilot") throws "not yet supported"', () => {
    expect(() =>
      CapabilityGeneratorRegistry.createGenerator('github-copilot')
    ).toThrow(/not yet supported/i);
  });

  it('createGenerator("totally-unknown") throws "unknown capability target" and lists opencode', () => {
    expect(() =>
      CapabilityGeneratorRegistry.createGenerator('totally-unknown')
    ).toThrow(/unknown capability target/i);
    expect(() =>
      CapabilityGeneratorRegistry.createGenerator('totally-unknown')
    ).toThrow(/opencode/);
  });

  it('getHelpText() includes all 6 target names and a status indicator', () => {
    const help = CapabilityGeneratorRegistry.getHelpText();
    for (const name of [
      'opencode',
      'kiro',
      'claude',
      'gemini',
      'vscode',
      'github-copilot',
    ]) {
      expect(help).toContain(name);
    }
    // At least one of the two status indicators should be present.
    expect(help).toMatch(/[✅⏳]/);
    // The supported line should use ✅ and the stub lines should use ⏳.
    expect(help).toContain('✅');
    expect(help).toContain('⏳');
  });
});
