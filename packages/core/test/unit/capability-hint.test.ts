/**
 * Unit tests for formatCapabilityHint
 */

import { describe, it, expect } from 'vitest';
import { formatCapabilityHint } from '../../src/capability-hint.js';

describe('formatCapabilityHint', () => {
  describe('no config', () => {
    it('returns empty string when capability is undefined', () => {
      expect(formatCapabilityHint(undefined)).toBe('');
    });

    it('returns empty string when capability is empty string', () => {
      expect(formatCapabilityHint('')).toBe('');
    });

    it('emits the thinking string with parenthetical description', () => {
      expect(formatCapabilityHint('thinking')).toBe(
        'Capability hint: This phase requires thinking capability (deep reasoning, complex planning).'
      );
    });

    it('emits the research string with parenthetical description', () => {
      expect(formatCapabilityHint('research')).toBe(
        'Capability hint: This phase requires research capability (fast information gathering and browsing).'
      );
    });

    it('emits no parenthetical for coding (self-evident)', () => {
      const result = formatCapabilityHint('coding');
      expect(result).toBe(
        'Capability hint: This phase requires coding capability.'
      );
      expect(result).not.toContain('capability (');
    });

    it('echoes unknown/custom capability without parenthetical', () => {
      expect(formatCapabilityHint('customThing')).toBe(
        'Capability hint: This phase requires customThing capability.'
      );
      expect(formatCapabilityHint('architect')).toBe(
        'Capability hint: This phase requires architect capability.'
      );
    });

    it('accepts an explicitly undefined config', () => {
      expect(formatCapabilityHint('thinking', undefined)).toBe(
        'Capability hint: This phase requires thinking capability (deep reasoning, complex planning).'
      );
    });

    it('accepts an empty config object (neither model nor agent)', () => {
      const result = formatCapabilityHint('thinking', {});
      expect(result).toBe(
        'Capability hint: This phase requires thinking capability (deep reasoning, complex planning).'
      );
      expect(result).not.toContain('subagents');
    });
  });

  describe('subagent clause', () => {
    const thinkingLabel =
      'Capability hint: This phase requires thinking capability (deep reasoning, complex planning).';

    it('emits agent-only clause', () => {
      expect(formatCapabilityHint('thinking', { agent: 'researcher' })).toBe(
        `${thinkingLabel} When launching subagents, use agent: researcher.`
      );
    });

    it('emits model-only clause', () => {
      expect(
        formatCapabilityHint('thinking', { model: 'gpt-5-thinking' })
      ).toBe(
        `${thinkingLabel} When launching subagents, prefer model: gpt-5-thinking.`
      );
    });

    it('emits agent-led clause when both agent and model present', () => {
      expect(
        formatCapabilityHint('thinking', {
          agent: 'researcher',
          model: 'gpt-5-thinking',
        })
      ).toBe(
        `${thinkingLabel} When launching subagents, use agent: researcher (model: gpt-5-thinking).`
      );
    });

    it('matches the canonical example string verbatim', () => {
      expect(
        formatCapabilityHint('thinking', {
          agent: 'general_thinking',
          model: 'anthropic/claude-opus-4-7',
        })
      ).toBe(
        'Capability hint: This phase requires thinking capability (deep reasoning, complex planning). When launching subagents, use agent: general_thinking (model: anthropic/claude-opus-4-7).'
      );
    });

    it('does not emit clause when only undefined fields are present', () => {
      const result = formatCapabilityHint('thinking', {
        agent: undefined,
        model: undefined,
      });
      expect(result).toBe(thinkingLabel);
    });

    it('clause combines with a capability that has no parenthetical (coding)', () => {
      expect(formatCapabilityHint('coding', { agent: 'coder' })).toBe(
        'Capability hint: This phase requires coding capability. When launching subagents, use agent: coder.'
      );
    });
  });
});
