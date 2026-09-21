/**
 * Integration tests for InstructionGenerator referred_docs injection.
 *
 * These tests use the real InstructionGenerator + real ProjectDocsManager
 * (no mocking) so that actual filesystem existence checks work correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InstructionGenerator } from '../../src/instruction-generator.js';
import type { ConversationContext } from '../../src/types.js';
import type { InstructionContext } from '../../src/interfaces/instruction-generator.interface.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('InstructionGenerator – referred_docs injection', () => {
  let instructionGenerator: InstructionGenerator;
  let tempProjectPath: string;
  let tempInstructionContext: InstructionContext;

  beforeEach(async () => {
    instructionGenerator = new InstructionGenerator();

    // Create a real temp directory so file existence checks work
    tempProjectPath = join(tmpdir(), `instruction-referred-test-${Date.now()}`);
    const docsPath = join(tempProjectPath, '.vibe', 'docs');
    await mkdir(docsPath, { recursive: true });

    tempInstructionContext = {
      phase: 'code',
      conversationContext: {
        projectPath: tempProjectPath,
        planFilePath: join(tempProjectPath, '.vibe', 'plan.md'),
        gitBranch: 'main',
        conversationId: 'test-referred-docs',
      } as ConversationContext,
      transitionReason: 'Test',
      isModeled: false,
      instructionSource: 'whats_next',
    };
  });

  afterEach(async () => {
    try {
      await rm(tempProjectPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('injects requirements sentence when requirements file exists but architecture does not', async () => {
    const docsPath = join(tempProjectPath, '.vibe', 'docs');
    await writeFile(join(docsPath, 'requirements.md'), '# Requirements');
    // architecture.md intentionally NOT created

    const result = await instructionGenerator.generateInstructions(
      'Do the work.',
      {
        ...tempInstructionContext,
        referredDocs: ['requirements', 'architecture'],
      }
    );

    const reqPath = join(docsPath, 'requirements.md');
    expect(result.instructions).toContain(reqPath);
    expect(result.instructions).toContain('for all requirements to understand');
    // Architecture sentence should NOT appear (file missing)
    expect(result.instructions).not.toContain(
      'affect the structure of this software'
    );
  });

  it('does not inject any sentences when referred_docs is absent', async () => {
    const result = await instructionGenerator.generateInstructions(
      'Do the work.',
      {
        ...tempInstructionContext,
        referredDocs: undefined,
      }
    );

    expect(result.instructions).not.toContain('for all requirements');
    expect(result.instructions).not.toContain('affect the structure');
    expect(result.instructions).not.toContain('meet the conventions');
  });

  it('does not produce empty backticks when doc variables are in YAML body but files are missing', async () => {
    // Simulate a YAML body that references $ARCHITECTURE_DOC as a path
    // (no file exists on disk → old code would substitute '' → empty backticks)
    const baseInstructions =
      'Document findings in `$ARCHITECTURE_DOC` or the plan file.';

    const result = await instructionGenerator.generateInstructions(
      baseInstructions,
      {
        ...tempInstructionContext,
        referredDocs: undefined,
      }
    );

    // The variable should be replaced with the literal path, NOT with ''
    expect(result.instructions).not.toContain('``');
    expect(result.instructions).not.toContain('$ARCHITECTURE_DOC');
    // Should contain the actual path
    expect(result.instructions).toContain(
      join(tempProjectPath, '.vibe', 'docs', 'architecture.md')
    );
  });

  it('injects all three sentences when all three doc files exist', async () => {
    const docsPath = join(tempProjectPath, '.vibe', 'docs');
    await writeFile(join(docsPath, 'requirements.md'), '# Req');
    await writeFile(join(docsPath, 'architecture.md'), '# Arch');
    await writeFile(join(docsPath, 'design.md'), '# Design');

    const result = await instructionGenerator.generateInstructions(
      'Implement the feature.',
      {
        ...tempInstructionContext,
        referredDocs: ['requirements', 'architecture', 'design'],
      }
    );

    expect(result.instructions).toContain('for all requirements');
    expect(result.instructions).toContain('affect the structure');
    expect(result.instructions).toContain('meet the conventions');
  });

  it('injected sentences appear before the phase body', async () => {
    const docsPath = join(tempProjectPath, '.vibe', 'docs');
    await writeFile(join(docsPath, 'requirements.md'), '# Req');

    const result = await instructionGenerator.generateInstructions(
      'Do the work.',
      {
        ...tempInstructionContext,
        referredDocs: ['requirements'],
      }
    );

    const reqSentenceIdx = result.instructions.indexOf(
      'for all requirements to understand'
    );
    const bodyIdx = result.instructions.indexOf('Do the work.');
    expect(reqSentenceIdx).toBeGreaterThanOrEqual(0);
    expect(bodyIdx).toBeGreaterThanOrEqual(0);
    expect(reqSentenceIdx).toBeLessThan(bodyIdx);
  });
});
