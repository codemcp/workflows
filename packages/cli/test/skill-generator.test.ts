import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Skill Generator', () => {
  let tempDir: string;
  let generateSkill: (platform: string, outputDir: string) => Promise<void>;
  let SkillGeneratorRegistry: {
    getGeneratorNames: () => string[];
    exists: (name: string) => boolean;
  };

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'skill-generator-test-'));

    // Import from source
    const module = await import('../src/skill-generator.js');
    generateSkill = module.generateSkill;
    SkillGeneratorRegistry = module.SkillGeneratorRegistry;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Registry', () => {
    it('should have all expected platforms registered', () => {
      const platforms = SkillGeneratorRegistry.getGeneratorNames();
      expect(platforms).toContain('claude');
      expect(platforms).toContain('gemini');
      expect(platforms).toContain('opencode');
      expect(platforms).toContain('copilot');
      expect(platforms).toContain('kiro');
      expect(platforms).toContain('kiro-cli');
    });

    it('should recognize aliases', () => {
      expect(SkillGeneratorRegistry.exists('claude-code')).toBe(true);
      expect(SkillGeneratorRegistry.exists('gemini-cli')).toBe(true);
      expect(SkillGeneratorRegistry.exists('github-copilot')).toBe(true);
      // kiro-cli aliases
      expect(SkillGeneratorRegistry.exists('kiro-cli')).toBe(true);
    });
  });

  describe('Claude Skill Generation', () => {
    it('should generate skill files in correct location', async () => {
      await generateSkill('claude', tempDir);

      // Check SKILL.md
      const skillPath = join(
        tempDir,
        '.claude',
        'skills',
        'responsible-vibe',
        'SKILL.md'
      );
      expect(existsSync(skillPath)).toBe(true);

      // Check .mcp.json
      const mcpPath = join(tempDir, '.mcp.json');
      expect(existsSync(mcpPath)).toBe(true);
    });

    it('should generate valid SKILL.md with frontmatter', async () => {
      await generateSkill('claude', tempDir);

      const skillPath = join(
        tempDir,
        '.claude',
        'skills',
        'responsible-vibe',
        'SKILL.md'
      );
      const content = readFileSync(skillPath, 'utf-8');

      // Check YAML frontmatter
      expect(content).toMatch(/^---\n/);
      expect(content).toContain('name: responsible-vibe');
      expect(content).toContain('description:');
      expect(content).toContain('license: MIT');

      // Check content includes system prompt (dynamically generated)
      expect(content).toContain('whats_next');
    });

    it('should generate valid MCP config', async () => {
      await generateSkill('claude', tempDir);

      const mcpPath = join(tempDir, '.mcp.json');
      const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));

      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers['workflows']).toBeDefined();
      // command should be a string, args should be an array
      expect(config.mcpServers['workflows'].command).toBe('npx');
      expect(config.mcpServers['workflows'].args).toContain(
        '@codemcp/workflows-server@latest'
      );
    });
  });

  describe('Gemini Skill Generation', () => {
    it('should generate skill files in correct location', async () => {
      await generateSkill('gemini', tempDir);

      const skillPath = join(
        tempDir,
        '.gemini',
        'skills',
        'responsible-vibe',
        'SKILL.md'
      );
      expect(existsSync(skillPath)).toBe(true);

      const settingsPath = join(tempDir, 'settings.json');
      expect(existsSync(settingsPath)).toBe(true);
    });
  });

  describe('OpenCode Skill Generation', () => {
    it('should generate skill files in correct location', async () => {
      await generateSkill('opencode', tempDir);

      const skillPath = join(
        tempDir,
        '.opencode',
        'skills',
        'responsible-vibe',
        'SKILL.md'
      );
      expect(existsSync(skillPath)).toBe(true);

      const configPath = join(tempDir, 'opencode.json');
      expect(existsSync(configPath)).toBe(true);
    });

    it('should generate MCP config with correct structure', async () => {
      await generateSkill('opencode', tempDir);

      const configPath = join(tempDir, 'opencode.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));

      // OpenCode uses 'mcp' key with specific structure
      expect(config.$schema).toBe('https://opencode.ai/config.json');
      expect(config.mcp).toBeDefined();
      expect(config.mcp['workflows']).toBeDefined();
      expect(config.mcp['workflows'].type).toBe('local');
      // OpenCode uses command as array
      expect(Array.isArray(config.mcp['workflows'].command)).toBe(true);
      expect(config.mcp['workflows'].command).toContain('npx');
      expect(config.mcp['workflows'].command).toContain(
        '@codemcp/workflows-server@latest'
      );
    });
  });

  describe('Copilot Skill Generation', () => {
    it('should generate skill files in correct location', async () => {
      await generateSkill('copilot', tempDir);

      const skillPath = join(
        tempDir,
        '.github',
        'skills',
        'responsible-vibe',
        'SKILL.md'
      );
      expect(existsSync(skillPath)).toBe(true);

      const mcpPath = join(tempDir, '.vscode', 'mcp.json');
      expect(existsSync(mcpPath)).toBe(true);
    });

    it('should generate MCP config with servers key', async () => {
      await generateSkill('copilot', tempDir);

      const mcpPath = join(tempDir, '.vscode', 'mcp.json');
      const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));

      // Copilot uses 'servers' key
      expect(config.servers).toBeDefined();
      expect(config.servers['workflows']).toBeDefined();
    });
  });

  describe('Kiro Power Generation', () => {
    it('should generate power files in correct location', async () => {
      await generateSkill('kiro', tempDir);

      // Kiro uses powers directory and POWER.md
      const powerPath = join(
        tempDir,
        '.kiro',
        'powers',
        'responsible-vibe',
        'POWER.md'
      );
      expect(existsSync(powerPath)).toBe(true);

      // MCP config is bundled inside the power directory
      const mcpPath = join(
        tempDir,
        '.kiro',
        'powers',
        'responsible-vibe',
        'mcp.json'
      );
      expect(existsSync(mcpPath)).toBe(true);
    });

    it('should generate valid POWER.md with frontmatter', async () => {
      await generateSkill('kiro', tempDir);

      const powerPath = join(
        tempDir,
        '.kiro',
        'powers',
        'responsible-vibe',
        'POWER.md'
      );
      const content = readFileSync(powerPath, 'utf-8');

      // Check YAML frontmatter
      expect(content).toMatch(/^---\n/);
      expect(content).toContain('name:');
      expect(content).toContain('displayName:');
      expect(content).toContain('keywords:');

      // Verify it includes the dynamic system prompt content
      expect(content).toContain('whats_next');
    });

    it('should bundle MCP config inside power directory', async () => {
      await generateSkill('kiro', tempDir);

      const mcpPath = join(
        tempDir,
        '.kiro',
        'powers',
        'responsible-vibe',
        'mcp.json'
      );
      const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));

      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers['workflows']).toBeDefined();
      // Kiro uses command + args format
      expect(config.mcpServers['workflows'].command).toBe('npx');
      expect(config.mcpServers['workflows'].args).toContain(
        '@codemcp/workflows-server@latest'
      );
    });
  });

  describe('Kiro CLI Skill Generation', () => {
    it('should generate skill files in correct location', async () => {
      await generateSkill('kiro-cli', tempDir);

      // Kiro CLI uses skills directory and SKILL.md (not powers)
      const skillPath = join(
        tempDir,
        '.kiro',
        'skills',
        'responsible-vibe',
        'SKILL.md'
      );
      expect(existsSync(skillPath)).toBe(true);

      // MCP config is in .kiro/settings directory per Kiro CLI docs
      const mcpPath = join(tempDir, '.kiro', 'settings', 'mcp.json');
      expect(existsSync(mcpPath)).toBe(true);
    });

    it('should generate valid SKILL.md with frontmatter', async () => {
      await generateSkill('kiro-cli', tempDir);

      const skillPath = join(
        tempDir,
        '.kiro',
        'skills',
        'responsible-vibe',
        'SKILL.md'
      );
      const content = readFileSync(skillPath, 'utf-8');

      // Check YAML frontmatter - should be SKILL.md format, not POWER.md
      expect(content).toMatch(/^---\n/);
      expect(content).toContain('name: responsible-vibe');
      expect(content).toContain('license: MIT');

      // Should NOT contain POWER.md-specific fields
      expect(content).not.toContain('displayName:');
      expect(content).not.toContain('keywords:');

      // Verify it includes the dynamic system prompt content
      expect(content).toContain('whats_next');
    });

    it('should generate MCP config with command + args format', async () => {
      await generateSkill('kiro-cli', tempDir);

      const mcpPath = join(tempDir, '.kiro', 'settings', 'mcp.json');
      const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));

      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers['workflows']).toBeDefined();
      // Kiro CLI uses command + args format (not array)
      expect(config.mcpServers['workflows'].command).toBe('npx');
      expect(config.mcpServers['workflows'].args).toContain(
        '@codemcp/workflows-server@latest'
      );
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported platform', async () => {
      await expect(generateSkill('unsupported', tempDir)).rejects.toThrow(
        'Unsupported platform: unsupported'
      );
    });
  });
});
