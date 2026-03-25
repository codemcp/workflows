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

describe('Config Generator', () => {
  let tempDir: string;
  let generateConfig: (agent: string, outputDir: string) => Promise<void>;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'config-generator-test-'));

    // Import from source
    const module = await import('../src/config-generator.js');
    generateConfig = module.generateConfig;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Amazon Q / Kiro Configuration', () => {
    it('should generate Amazon Q configuration file', async () => {
      await generateConfig('kiro', tempDir);

      const configPath = join(tempDir, '.amazonq', 'cli-agents', 'vibe.json');
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.name).toBe('vibe');
      expect(config.description).toBe('Responsible vibe development');
      expect(config.mcpServers).toBeDefined();
      expect(config.tools).toContain('@workflows');
      expect(config.allowedTools).toContain('@workflows/whats_next');
    });
  });

  describe('Claude Configuration', () => {
    it('should generate Claude configuration files', async () => {
      await generateConfig('claude', tempDir);

      // Check .claude/agents/vibe.md (agent config)
      const agentPath = join(tempDir, '.claude', 'agents', 'vibe.md');
      expect(existsSync(agentPath)).toBe(true);
      const agentContent = readFileSync(agentPath, 'utf-8');
      expect(agentContent).toContain('---');
      expect(agentContent).toContain('name: Responsible Vibe');
      expect(agentContent).toContain('description:');
      expect(agentContent).toContain('whats_next');

      // Check .mcp.json
      const mcpJsonPath = join(tempDir, '.mcp.json');
      expect(existsSync(mcpJsonPath)).toBe(true);
      const mcpConfig = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'));
      expect(mcpConfig.mcpServers).toBeDefined();
      expect(mcpConfig.mcpServers['workflows'].command).toBe('npx');
      expect(mcpConfig.mcpServers['workflows'].args).toContain(
        '@codemcp/workflows-server@latest'
      );

      // Check .claude/settings.json
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      expect(existsSync(settingsPath)).toBe(true);
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings.permissions.allow).toContain('MCP(workflows:whats_next)');
    });
  });

  describe('Gemini Configuration', () => {
    it('should generate Gemini configuration files', async () => {
      await generateConfig('gemini', tempDir);

      // Check settings.json
      const settingsPath = join(tempDir, 'settings.json');
      expect(existsSync(settingsPath)).toBe(true);
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      expect(settings.contextFileName).toBe('GEMINI.md');
      expect(settings.mcpServers).toBeDefined();

      // Check GEMINI.md
      const geminiMdPath = join(tempDir, 'GEMINI.md');
      expect(existsSync(geminiMdPath)).toBe(true);
      const geminiContent = readFileSync(geminiMdPath, 'utf-8');
      expect(geminiContent).toContain('Vibe Development Agent');
      expect(geminiContent).toContain('whats_next');
    });
  });

  describe('OpenCode Configuration', () => {
    it('should generate OpenCode configuration file', async () => {
      await generateConfig('opencode', tempDir);

      const configPath = join(tempDir, 'opencode.json');
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mcp['workflows']).toBeDefined();
      expect(config.agent.vibe).toBeDefined();
    });
  });

  describe('VS Code Configuration', () => {
    it('should generate VS Code configuration files', async () => {
      await generateConfig('vscode', tempDir);

      // Check .vscode/mcp.json
      const mcpJsonPath = join(tempDir, '.vscode', 'mcp.json');
      expect(existsSync(mcpJsonPath)).toBe(true);
      const mcpConfig = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'));
      expect(mcpConfig.servers['workflows']).toBeDefined();

      // Check .github/agents/Vibe.agent.md
      const agentPath = join(tempDir, '.github', 'agents', 'Vibe.agent.md');
      expect(existsSync(agentPath)).toBe(true);
      const agentContent = readFileSync(agentPath, 'utf-8');

      // Check YAML frontmatter
      expect(agentContent).toContain('---');
      expect(agentContent).toContain(
        'description: AI assistant that helps users develop software features using the workflows server.'
      );
      expect(agentContent).toContain(
        "tools: ['edit', 'runNotebooks', 'search', 'new', 'runCommands', 'runTasks', 'workflows/*'"
      );

      // Check system prompt content
      expect(agentContent).toContain('whats_next()');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported agent', async () => {
      await expect(generateConfig('unsupported', tempDir)).rejects.toThrow(
        'Unsupported agent: unsupported'
      );
    });
  });

  describe('Configuration Merging', () => {
    describe('OpenCode', () => {
      it('should merge with existing opencode.json', async () => {
        const configPath = join(tempDir, 'opencode.json');

        // Create existing config with custom content
        const existingConfig = {
          $schema: 'https://opencode.ai/config.json',
          mcp: {
            'custom-server': {
              command: ['node', 'server.js'],
              type: 'local',
              enabled: true,
            },
          },
          agent: {
            'custom-agent': {
              description: 'My custom agent',
              mode: 'secondary',
            },
          },
          customField: 'should be preserved',
        };
        writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));

        // Generate config
        await generateConfig('opencode', tempDir);

        // Read result
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));

        // Verify merge
        expect(config.customField).toBe('should be preserved');
        expect(config.mcp['custom-server']).toBeDefined();
        expect(config.mcp['workflows']).toBeDefined();
        expect(config.agent['custom-agent']).toBeDefined();
        expect(config.agent.vibe).toBeDefined();
      });

      it('should handle invalid JSON gracefully', async () => {
        const configPath = join(tempDir, 'opencode.json');
        writeFileSync(configPath, '{ invalid json');

        await expect(generateConfig('opencode', tempDir)).rejects.toThrow(
          /contains invalid JSON/
        );
      });

      it('should create new file when none exists', async () => {
        await generateConfig('opencode', tempDir);

        const configPath = join(tempDir, 'opencode.json');
        expect(existsSync(configPath)).toBe(true);
      });
    });

    describe('Amazon Q / Kiro', () => {
      it('should merge with existing vibe.json', async () => {
        const configDir = join(tempDir, '.amazonq', 'cli-agents');
        mkdirSync(configDir, { recursive: true });
        const configPath = join(configDir, 'vibe.json');

        // Create existing config
        const existingConfig = {
          name: 'vibe',
          customField: 'preserved',
          tools: ['custom-tool'],
        };
        writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));

        // Generate config using 'kiro' (primary name, amazonq-cli is alias)
        await generateConfig('kiro', tempDir);

        // Read result
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));

        // Verify merge
        expect(config.customField).toBe('preserved');
        expect(config.tools).toContain('@workflows');
        expect(config.name).toBe('vibe');
      });
    });

    describe('Claude', () => {
      it('should merge .mcp.json with existing servers', async () => {
        const mcpPath = join(tempDir, '.mcp.json');

        // Create existing .mcp.json
        const existingMcp = {
          mcpServers: {
            'custom-server': {
              command: 'custom',
              args: ['arg1'],
            },
          },
        };
        writeFileSync(mcpPath, JSON.stringify(existingMcp, null, 2));

        // Generate config
        await generateConfig('claude', tempDir);

        // Read result
        const mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf-8'));

        // Verify merge
        expect(mcpConfig.mcpServers['custom-server']).toBeDefined();
        expect(mcpConfig.mcpServers['workflows']).toBeDefined();
      });

      it('should merge .claude/settings.json with existing permissions', async () => {
        const claudeDir = join(tempDir, '.claude');
        mkdirSync(claudeDir, { recursive: true });
        const settingsPath = join(claudeDir, 'settings.json');

        // Create existing settings
        const existingSettings = {
          permissions: {
            allow: ['CustomTool(*)'],
            customField: 'preserved',
          },
        };
        writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2));

        // Generate config
        await generateConfig('claude', tempDir);

        // Read result
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

        // Verify merge
        expect(settings.permissions.customField).toBe('preserved');
        expect(settings.permissions.allow).toContain(
          'MCP(workflows:whats_next)'
        );
      });
    });

    describe('Gemini', () => {
      it('should merge settings.json with existing config', async () => {
        const settingsPath = join(tempDir, 'settings.json');

        // Create existing settings
        const existingSettings = {
          theme: 'Custom',
          customField: 'preserved',
          mcpServers: {
            'existing-server': {
              command: 'test',
            },
          },
        };
        writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2));

        // Generate config
        await generateConfig('gemini', tempDir);

        // Read result
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

        // Verify merge - theme should be updated to Default, but customField preserved
        expect(settings.theme).toBe('Default');
        expect(settings.customField).toBe('preserved');
        expect(settings.mcpServers['existing-server']).toBeDefined();
        expect(settings.mcpServers['workflows']).toBeDefined();
      });
    });
  });
});
