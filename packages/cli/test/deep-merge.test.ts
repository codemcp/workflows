import { describe, it, expect } from 'vitest';
import { deepMerge } from '../src/config-generator.js';

describe('deepMerge', () => {
  describe('Basic Merging', () => {
    it('should merge two simple objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should preserve target properties not in source', () => {
      const target = { a: 1, b: 2, c: 3 };
      const source = { b: 20 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 20, c: 3 });
    });

    it('should add new properties from source', () => {
      const target = { a: 1 };
      const source = { b: 2, c: 3 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });
  });

  describe('Nested Object Merging', () => {
    it('should recursively merge nested objects', () => {
      const target = {
        level1: {
          a: 1,
          b: 2,
        },
      };
      const source = {
        level1: {
          b: 20,
          c: 3,
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        level1: {
          a: 1,
          b: 20,
          c: 3,
        },
      });
    });

    it('should merge deeply nested objects', () => {
      const target = {
        level1: {
          level2: {
            a: 1,
            b: 2,
          },
          x: 10,
        },
      };
      const source = {
        level1: {
          level2: {
            b: 20,
            c: 3,
          },
          y: 20,
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        level1: {
          level2: {
            a: 1,
            b: 20,
            c: 3,
          },
          x: 10,
          y: 20,
        },
      });
    });

    it('should handle mixed nested and flat properties', () => {
      const target = {
        flat: 'value1',
        nested: {
          a: 1,
        },
      };
      const source = {
        flat: 'value2',
        nested: {
          b: 2,
        },
        newFlat: 'value3',
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        flat: 'value2',
        nested: {
          a: 1,
          b: 2,
        },
        newFlat: 'value3',
      });
    });
  });

  describe('Array Handling', () => {
    it('should replace arrays instead of merging', () => {
      const target = { arr: [1, 2, 3] };
      const source = { arr: [4, 5] };
      const result = deepMerge(target, source);

      expect(result).toEqual({ arr: [4, 5] });
    });

    it('should handle arrays in nested objects', () => {
      const target = {
        config: {
          items: [1, 2, 3],
          name: 'old',
        },
      };
      const source = {
        config: {
          items: [4, 5],
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        config: {
          items: [4, 5],
          name: 'old',
        },
      });
    });
  });

  describe('Special Values', () => {
    it('should handle null values in source', () => {
      const target = { a: 1, b: 2 };
      const source = { b: null };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: null });
    });

    it('should handle undefined values in source', () => {
      const target = { a: 1, b: 2 };
      const source = { b: undefined };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: undefined });
    });

    it('should handle empty objects', () => {
      const target = {};
      const source = { a: 1 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1 });
    });

    it('should handle merging into empty target', () => {
      const target = {};
      const source = {
        nested: {
          a: 1,
          b: 2,
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        nested: {
          a: 1,
          b: 2,
        },
      });
    });
  });

  describe('Type Overriding', () => {
    it('should replace object with primitive', () => {
      const target = { a: { nested: 'value' } };
      const source = { a: 'string' };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 'string' });
    });

    it('should replace primitive with object', () => {
      const target = { a: 'string' };
      const source = { a: { nested: 'value' } };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: { nested: 'value' } });
    });

    it('should replace array with object', () => {
      const target = { a: [1, 2, 3] };
      const source = { a: { key: 'value' } };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: { key: 'value' } });
    });

    it('should replace object with array', () => {
      const target = { a: { key: 'value' } };
      const source = { a: [1, 2, 3] };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: [1, 2, 3] });
    });
  });

  describe('Real-World Scenarios', () => {
    it('should merge MCP server configurations', () => {
      const target = {
        mcpServers: {
          'existing-server': {
            command: 'node',
            args: ['server.js'],
          },
        },
      };
      const source = {
        mcpServers: {
          workflows: {
            command: 'npx',
            args: ['@codemcp/workflows'],
          },
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        mcpServers: {
          'existing-server': {
            command: 'node',
            args: ['server.js'],
          },
          workflows: {
            command: 'npx',
            args: ['@codemcp/workflows'],
          },
        },
      });
    });

    it('should merge agent configurations', () => {
      const target = {
        agent: {
          'custom-agent': {
            description: 'Custom agent',
            mode: 'secondary',
          },
        },
      };
      const source = {
        agent: {
          vibe: {
            description: 'Vibe agent',
            mode: 'primary',
          },
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        agent: {
          'custom-agent': {
            description: 'Custom agent',
            mode: 'secondary',
          },
          vibe: {
            description: 'Vibe agent',
            mode: 'primary',
          },
        },
      });
    });

    it('should update existing agent while preserving others', () => {
      const target = {
        agent: {
          vibe: {
            description: 'Old description',
            mode: 'secondary',
          },
          other: {
            description: 'Other agent',
          },
        },
      };
      const source = {
        agent: {
          vibe: {
            description: 'New description',
            mode: 'primary',
            newField: 'value',
          },
        },
      };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        agent: {
          vibe: {
            description: 'New description',
            mode: 'primary',
            newField: 'value',
          },
          other: {
            description: 'Other agent',
          },
        },
      });
    });
  });

  describe('Immutability', () => {
    it('should not modify target object', () => {
      const target = { a: 1, nested: { b: 2 } };
      const source = { a: 10, nested: { c: 3 } };

      const result = deepMerge(target, source);

      // Target should remain unchanged
      expect(target).toEqual({ a: 1, nested: { b: 2 } });
      // Result should have merged values
      expect(result).toEqual({ a: 10, nested: { b: 2, c: 3 } });
    });

    it('should not modify source object', () => {
      const target = { a: 1, nested: { b: 2 } };
      const source = { a: 10, nested: { c: 3 } };

      deepMerge(target, source);

      // Source should remain unchanged
      expect(source).toEqual({ a: 10, nested: { c: 3 } });
    });
  });
});
