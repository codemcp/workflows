import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseFlag } from '../src/cli.js';

// Use vi.hoisted for proper test isolation
const mocks = vi.hoisted(() => ({
  WorkflowManager: vi.fn(),
  generateSystemPrompt: vi.fn(),
  StateMachineLoader: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  join: vi.fn(),
  dirname: vi.fn(),
  fileURLToPath: vi.fn(),
  spawn: vi.fn(),
  generateConfig: vi.fn(),
  GeneratorRegistry: {
    getGeneratorNames: vi.fn(() => [
      'kiro',
      'claude',
      'gemini',
      'opencode',
      'copilot',
    ]),
    exists: vi.fn((name: string) =>
      ['kiro', 'claude', 'gemini', 'opencode', 'copilot'].includes(name)
    ),
    getHelpText: vi.fn(
      () =>
        `  kiro                Generate .kiro/agents/vibe.json (Kiro)
  claude               Generate CLAUDE.md, .mcp.json, settings.json
  gemini               Generate settings.json, GEMINI.md
  opencode             Generate opencode.json
  copilot              Generate .vscode/mcp.json, .github/agents/Vibe.agent.md`
    ),
  },
  SkillGeneratorRegistry: {
    getGeneratorNames: vi.fn(() => [
      'claude',
      'gemini',
      'opencode',
      'copilot',
      'kiro',
    ]),
    exists: vi.fn((name: string) =>
      ['claude', 'gemini', 'opencode', 'copilot', 'kiro'].includes(name)
    ),
    getHelpText: vi.fn(() => ''),
  },
  generateSkill: vi.fn(),
}));

vi.mock('@codemcp/workflows-core', () => ({
  WorkflowManager: mocks.WorkflowManager,
  generateSystemPrompt: mocks.generateSystemPrompt,
  StateMachineLoader: mocks.StateMachineLoader,
}));

vi.mock('node:fs', () => ({
  existsSync: mocks.existsSync,
  mkdirSync: mocks.mkdirSync,
  writeFileSync: mocks.writeFileSync,
  readFileSync: mocks.readFileSync,
}));

vi.mock('node:path', () => ({
  join: mocks.join,
  dirname: mocks.dirname,
}));

vi.mock('node:url', () => ({
  fileURLToPath: mocks.fileURLToPath,
}));

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}));

vi.mock('../src/config-generator.js', () => ({
  generateConfig: mocks.generateConfig,
  GeneratorRegistry: mocks.GeneratorRegistry,
}));

vi.mock('../src/skill-generator.js', () => ({
  generateSkill: mocks.generateSkill,
  SkillGeneratorRegistry: mocks.SkillGeneratorRegistry,
}));

describe('CLI', () => {
  let originalArgv: string[];
  let originalExit: typeof process.exit;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let runCli: () => void;

  beforeEach(async () => {
    // Save original values
    originalArgv = process.argv;
    originalExit = process.exit;

    // Setup spies
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/mock/cwd');

    // Configure mocks
    mocks.WorkflowManager.mockImplementation(function (this: unknown) {
      return {
        getAvailableWorkflowsForProject: vi.fn().mockReturnValue([
          { name: 'waterfall', description: 'V-Model development workflow' },
          { name: 'epcc', description: 'EPCC workflow' },
        ]),
        getAllAvailableWorkflows: vi.fn().mockReturnValue([
          { name: 'waterfall', description: 'V-Model development workflow' },
          { name: 'epcc', description: 'EPCC workflow' },
        ]),
      };
    });
    mocks.generateSystemPrompt.mockReturnValue('Mock system prompt');
    mocks.StateMachineLoader.mockImplementation(function (this: unknown) {
      return {
        loadStateMachine: vi.fn().mockReturnValue({}),
      };
    });

    mocks.existsSync.mockImplementation(path => {
      const pathStr = String(path);
      if (
        pathStr.includes('resources/workflows/') &&
        pathStr.includes('waterfall.yaml')
      )
        return true;
      if (pathStr.includes('my-custom.yaml')) return false;
      if (pathStr.includes('.vibe')) return false;
      return false;
    });
    mocks.mkdirSync.mockImplementation(() => undefined);
    mocks.writeFileSync.mockImplementation(() => {});
    mocks.readFileSync.mockReturnValue(
      "name: 'waterfall'\ndescription: 'test'"
    );

    mocks.join.mockImplementation((...args) => args.join('/'));
    mocks.dirname.mockReturnValue('/mock/dirname');
    mocks.fileURLToPath.mockReturnValue('/mock/filename.js');

    // Mock spawn to prevent actual process spawning in tests
    mocks.spawn.mockReturnValue({
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          // Simulate successful process completion
          setTimeout(() => callback(0), 0);
        }
        return this;
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      kill: vi.fn(),
    } as unknown);

    // Mock generateConfig and generateSkill to prevent actual file generation
    mocks.generateConfig.mockResolvedValue(undefined);
    mocks.generateSkill.mockResolvedValue(undefined);

    // Import from source
    const module = await import('../src/cli.js');
    runCli = module.runCli;
  });

  afterEach(() => {
    // Restore original values
    process.argv = originalArgv;
    process.exit = originalExit;

    // Restore spies
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Help Command', () => {
    it('should show help with --help flag', () => {
      process.argv = ['node', 'cli.js', '--help'];

      runCli();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Responsible Vibe CLI Tools')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('setup <target>')
      );
    });

    it('should show help with -h flag', () => {
      process.argv = ['node', 'cli.js', '-h'];

      runCli();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Responsible Vibe CLI Tools')
      );
    });
  });

  describe('Generate Config Command', () => {
    it('should show deprecation warning for --generate-config', () => {
      process.argv = ['node', 'cli.js', '--generate-config', 'kiro'];

      // Mock console.warn for deprecation notices
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      runCli();

      // Should show deprecation warning
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '⚠️  DEPRECATED: --generate-config is deprecated.'
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '   Use instead: setup kiro --mode config'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should show deprecation warning when --generate-config has no agent', () => {
      process.argv = ['node', 'cli.js', '--generate-config'];

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      runCli();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '⚠️  DEPRECATED: --generate-config is deprecated.'
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '   Use instead: setup <target> --mode config'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('System Prompt Command', () => {
    it('should handle system-prompt subcommand', () => {
      // Don't throw on process.exit for this test
      processExitSpy.mockImplementation(() => undefined as never);

      process.argv = ['node', 'cli.js', 'system-prompt'];

      runCli();

      expect(consoleLogSpy).toHaveBeenCalledWith('Mock system prompt');
    });

    it('should show deprecation warning for --system-prompt flag', () => {
      process.argv = ['node', 'cli.js', '--system-prompt'];

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      runCli();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '⚠️  DEPRECATED: --system-prompt is deprecated.'
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '   Use instead: system-prompt'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Workflow Commands', () => {
    it('should handle workflow list command', () => {
      // Don't throw on process.exit for this test
      processExitSpy.mockImplementation(() => undefined as never);

      process.argv = ['node', 'cli.js', 'workflow', 'list'];

      runCli();

      expect(consoleLogSpy).toHaveBeenCalledWith('📋 Available workflows:');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('waterfall')
      );
    });

    it('should handle workflow copy command', async () => {
      // Don't throw on process.exit for this test
      processExitSpy.mockImplementation(() => undefined as never);

      process.argv = [
        'node',
        'cli.js',
        'workflow',
        'copy',
        'waterfall',
        'my-custom',
      ];

      runCli();

      // Verify source workflow validation was called
      const { WorkflowManager } = await import('@codemcp/workflows-core');
      const mockInstance = vi.mocked(WorkflowManager).mock.results[0].value;
      expect(mockInstance.getAllAvailableWorkflows).toHaveBeenCalled();

      // Verify file operations
      const fs = await import('node:fs');
      expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledWith(
        expect.stringContaining('waterfall.yaml'),
        'utf8'
      );
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        expect.stringContaining('my-custom.yaml'),
        expect.stringContaining("name: 'my-custom'")
      );

      // Verify success message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Copied 'waterfall' workflow to 'my-custom'")
      );
    });

    it('should show error for invalid source workflow', async () => {
      // Reset the mock to return workflows without 'invalid-workflow'
      const { WorkflowManager } = await import('@codemcp/workflows-core');
      vi.mocked(WorkflowManager).mockImplementation(function (this: unknown) {
        return {
          getAvailableWorkflowsForProject: vi.fn().mockReturnValue([
            {
              name: 'waterfall',
              description: 'V-Model development workflow',
            },
            { name: 'epcc', description: 'EPCC workflow' },
          ]),
          getAllAvailableWorkflows: vi.fn().mockReturnValue([
            {
              name: 'waterfall',
              description: 'V-Model development workflow',
            },
            { name: 'epcc', description: 'EPCC workflow' },
          ]),
        };
      });

      process.argv = [
        'node',
        'cli.js',
        'workflow',
        'copy',
        'invalid-workflow',
        'my-custom',
      ];

      processExitSpy.mockImplementation(() => undefined as never);

      runCli();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Invalid source workflow: invalid-workflow')
      );
    });

    it('should show error when workflow copy has missing parameters', () => {
      process.argv = ['node', 'cli.js', 'workflow', 'copy'];

      // Mock process.exit to not throw for this test
      processExitSpy.mockImplementation(() => undefined as never);

      runCli();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'workflow copy requires source workflow and custom name'
        )
      );
    });

    it('should show error for unknown workflow subcommand', () => {
      process.argv = ['node', 'cli.js', 'workflow', 'unknown'];

      // Mock process.exit to not throw for this test
      processExitSpy.mockImplementation(() => undefined as never);

      runCli();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Unknown workflow subcommand:',
        'unknown'
      );
    });
  });

  describe('Setup Command --mode flag', () => {
    it('should call generateConfig when --mode config is passed (space notation)', async () => {
      process.argv = ['node', 'cli.js', 'setup', 'claude', '--mode', 'config'];

      await runCli();

      expect(mocks.generateConfig).toHaveBeenCalledWith('claude', '/mock/cwd');
    });

    it('should call generateConfig when --mode=config is passed (equals notation)', async () => {
      process.argv = ['node', 'cli.js', 'setup', 'claude', '--mode=config'];

      await runCli();

      expect(mocks.generateConfig).toHaveBeenCalledWith('claude', '/mock/cwd');
    });

    it('should show error for invalid --mode value', async () => {
      process.argv = ['node', 'cli.js', 'setup', 'claude', '--mode=invalid'];

      processExitSpy.mockImplementation(() => undefined as never);

      await runCli();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('--mode must be "skill" or "config"')
      );
    });

    it('should show error for invalid --mode= value (equals notation)', async () => {
      process.argv = ['node', 'cli.js', 'setup', 'claude', '--mode='];

      processExitSpy.mockImplementation(() => undefined as never);

      await runCli();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('--mode must be "skill" or "config"')
      );
    });
  });

  describe('Unknown Arguments', () => {
    it('should show error for unknown command', () => {
      process.argv = ['node', 'cli.js', '--unknown-flag'];

      runCli();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Unknown command:',
        '--unknown-flag'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Responsible Vibe CLI Tools')
      );
    });
  });

  describe('parseFlag helper', () => {
    it('returns value for --flag value notation', () => {
      expect(parseFlag(['--mode', 'config'], '--mode')).toBe('config');
    });

    it('returns value for --flag=value notation', () => {
      expect(parseFlag(['--mode=config'], '--mode')).toBe('config');
    });

    it('returns undefined when flag is absent', () => {
      expect(parseFlag(['setup', 'claude'], '--mode')).toBeUndefined();
    });

    it('returns undefined when --flag appears last with no following value', () => {
      expect(parseFlag(['--mode'], '--mode')).toBeUndefined();
    });

    it('handles empty string value from --flag= notation', () => {
      expect(parseFlag(['--flag='], '--flag')).toBe('');
    });

    it('does not confuse prefix-matching flags (--mode vs --mode-extra)', () => {
      expect(parseFlag(['--mode-extra=config'], '--mode')).toBeUndefined();
    });

    it('returns first match when flag appears multiple times', () => {
      expect(parseFlag(['--mode=skill', '--mode=config'], '--mode')).toBe(
        'skill'
      );
    });
  });

  describe('Default Behavior', () => {
    it('should start visualization tool by default', () => {
      process.argv = ['node', 'cli.js'];

      // spawn is already mocked in beforeEach, so no actual processes will be spawned
      runCli();

      // Should not show error
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should start visualization tool with visualize subcommand', () => {
      process.argv = ['node', 'cli.js', 'visualize'];

      // spawn is already mocked in beforeEach, so no actual processes will be spawned
      runCli();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should show deprecation warning for --visualize flag', () => {
      process.argv = ['node', 'cli.js', '--visualize'];

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      runCli();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '⚠️  DEPRECATED: --visualize/--viz is deprecated.'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should show deprecation warning for --viz flag', () => {
      process.argv = ['node', 'cli.js', '--viz'];

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      runCli();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '⚠️  DEPRECATED: --visualize/--viz is deprecated.'
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
