import { describe, it, expect, beforeAll } from 'vitest';
import { GeneratorRegistry } from '../src/config-generator.js';

/**
 * Test suite for GeneratorRegistry
 * Tests the registry pattern implementation for config generators
 *
 * Note: The registry is static and pre-populated with built-in generators
 * at module load time, so we test the registry as-is rather than trying
 * to clear it between tests.
 */
describe('GeneratorRegistry', () => {
  // Test with the actual built-in generators
  const builtInGenerators = ['kiro', 'claude', 'gemini', 'opencode', 'copilot'];

  beforeAll(() => {
    // Verify the registry is properly initialized
    expect(GeneratorRegistry).toBeDefined();
  });

  describe('Built-in generators registration', () => {
    it('should have all built-in generators registered', () => {
      for (const name of builtInGenerators) {
        expect(GeneratorRegistry.exists(name)).toBe(true);
      }
    });

    it('should have registered generators with aliases', () => {
      // 'vscode' and 'copilot-vscode' are aliases for 'copilot'
      expect(GeneratorRegistry.exists('copilot')).toBe(true);
      expect(GeneratorRegistry.exists('copilot-vscode')).toBe(true);
      expect(GeneratorRegistry.exists('vscode')).toBe(true);
      expect(GeneratorRegistry.exists('kiro')).toBe(true);
      expect(GeneratorRegistry.exists('kiro-cli')).toBe(true);
    });

    it('should handle case-insensitive lookups', () => {
      expect(GeneratorRegistry.exists('KIRO')).toBe(true);
      expect(GeneratorRegistry.exists('Claude')).toBe(true);
      expect(GeneratorRegistry.exists('VSCODE')).toBe(true);
    });
  });

  describe('createGenerator', () => {
    it('should create generator instances for all built-in generators', () => {
      for (const name of builtInGenerators) {
        const generator = GeneratorRegistry.createGenerator(name);
        expect(generator).toBeDefined();
        expect(typeof generator).toBe('object');
        expect(typeof (generator as { generate: unknown }).generate).toBe(
          'function'
        );
      }
    });

    it('should create a generator instance by alias', () => {
      // 'vscode' and 'copilot-vscode' are aliases for 'copilot'
      const vscodeGenerator = GeneratorRegistry.createGenerator('vscode');
      const copilotGenerator = GeneratorRegistry.createGenerator('copilot');
      const copilotVscodeGenerator =
        GeneratorRegistry.createGenerator('copilot-vscode');

      expect(vscodeGenerator).toBeDefined();
      expect(copilotGenerator).toBeDefined();
      expect(copilotVscodeGenerator).toBeDefined();
      // All should be instances of the same class
      expect(vscodeGenerator.constructor.name).toBe(
        copilotGenerator.constructor.name
      );
      expect(copilotVscodeGenerator.constructor.name).toBe(
        copilotGenerator.constructor.name
      );
    });

    it('should be case-insensitive when creating generators', () => {
      const generator1 = GeneratorRegistry.createGenerator('claude');
      const generator2 = GeneratorRegistry.createGenerator('CLAUDE');
      const generator3 = GeneratorRegistry.createGenerator('Claude');

      expect(generator1.constructor.name).toBe(generator2.constructor.name);
      expect(generator2.constructor.name).toBe(generator3.constructor.name);
    });

    it('should throw error for unknown generator', () => {
      expect(() => {
        GeneratorRegistry.createGenerator('unknown-generator');
      }).toThrow(/Unsupported agent: unknown-generator/);
    });

    it('should include available generators in error message', () => {
      try {
        GeneratorRegistry.createGenerator('unknown');
        expect.fail('Should have thrown an error');
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('Supported agents:');
        expect(message).toContain('kiro');
        expect(message).toContain('claude');
      }
    });
  });

  describe('getAllGenerators', () => {
    it('should return all built-in generators', () => {
      const generators = GeneratorRegistry.getAllGenerators();
      expect(generators.length).toBeGreaterThanOrEqual(5);

      const names = generators.map(g => g.name);
      for (const builtInName of builtInGenerators) {
        expect(names).toContain(builtInName);
      }
    });

    it('should not include duplicate entries for aliases', () => {
      const generators = GeneratorRegistry.getAllGenerators();

      // Count occurrences of 'copilot' (which has 'vscode' and 'copilot-vscode' as aliases)
      const copilotGenerators = generators.filter(g => g.name === 'copilot');
      expect(copilotGenerators.length).toBe(1);
    });

    it('should return generator metadata with required fields', () => {
      const generators = GeneratorRegistry.getAllGenerators();

      for (const generator of generators) {
        expect(generator.name).toBeDefined();
        expect(typeof generator.name).toBe('string');
        expect(generator.description).toBeDefined();
        expect(typeof generator.description).toBe('string');
      }
    });
  });

  describe('getGeneratorNames', () => {
    it('should return array of generator names', () => {
      const names = GeneratorRegistry.getGeneratorNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThanOrEqual(5);
    });

    it('should include all built-in generators', () => {
      const names = GeneratorRegistry.getGeneratorNames();

      for (const builtInName of builtInGenerators) {
        expect(names).toContain(builtInName);
      }
    });

    it('should not include aliases in the names list', () => {
      const names = GeneratorRegistry.getGeneratorNames();

      // 'vscode' and 'copilot-vscode' are aliases for 'copilot'
      // They should not appear in the names list
      expect(names).not.toContain('vscode');
      expect(names).not.toContain('copilot-vscode');
      expect(names).toContain('copilot');
      expect(names).toContain('kiro');
    });
  });

  describe('getHelpText', () => {
    it('should return formatted help text', () => {
      const helpText = GeneratorRegistry.getHelpText();

      expect(typeof helpText).toBe('string');
      expect(helpText.length).toBeGreaterThan(0);
    });

    it('should include all generator names and descriptions', () => {
      const helpText = GeneratorRegistry.getHelpText();

      // Check for built-in generators
      for (const name of builtInGenerators) {
        expect(helpText).toContain(name);
      }

      // Check for key descriptions
      expect(helpText).toContain('.kiro/agents/vibe.json');
      expect(helpText).toContain('CLAUDE.md');
      expect(helpText).toContain('GEMINI.md');
      expect(helpText).toContain('opencode.json');
      expect(helpText).toContain('.vscode/mcp.json');
    });

    it('should format each generator on its own line', () => {
      const helpText = GeneratorRegistry.getHelpText();
      const lines = helpText.split('\n');

      // Should have one line per generator (5 built-in generators)
      expect(lines.length).toBeGreaterThanOrEqual(5);

      // Each line should contain both a name and description
      for (const line of lines) {
        expect(line.length).toBeGreaterThan(0);
      }
    });
  });

  describe('exists', () => {
    it('should return true for all built-in generators', () => {
      for (const name of builtInGenerators) {
        expect(GeneratorRegistry.exists(name)).toBe(true);
      }
    });

    it('should return true for aliases', () => {
      // 'vscode' and 'copilot-vscode' are aliases for 'copilot'
      expect(GeneratorRegistry.exists('vscode')).toBe(true);
      expect(GeneratorRegistry.exists('copilot-vscode')).toBe(true);
      expect(GeneratorRegistry.exists('copilot')).toBe(true);
      // 'kiro-cli' is an alias for 'kiro'
      expect(GeneratorRegistry.exists('kiro-cli')).toBe(true);
      expect(GeneratorRegistry.exists('kiro')).toBe(true);
    });

    it('should return false for unknown generators', () => {
      expect(GeneratorRegistry.exists('unknown-generator')).toBe(false);
      expect(GeneratorRegistry.exists('invalid')).toBe(false);
      expect(GeneratorRegistry.exists('nonexistent')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(GeneratorRegistry.exists('KIRO')).toBe(true);
      expect(GeneratorRegistry.exists('Claude')).toBe(true);
      expect(GeneratorRegistry.exists('VSCODE')).toBe(true);
      expect(GeneratorRegistry.exists('gemini')).toBe(true);
      expect(GeneratorRegistry.exists('GEMINI')).toBe(true);
    });
  });
});
