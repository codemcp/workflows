/**
 * Configuration Generator for Different AI Coding Agents
 *
 * This module implements a factory pattern to generate configuration files
 * for different AI coding agents (Amazon Q, Claude Code, Gemini CLI).
 * Each agent has its own generator class with single responsibility.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { generateSystemPrompt } from '@codemcp/workflows-core';
import { StateMachineLoader } from '@codemcp/workflows-core';
import {} from '@codemcp/workflows-core';

/**
 * Deep merge two objects, with values from source taking precedence
 * Arrays are replaced, not merged
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  if (!source || typeof source !== 'object') {
    return source;
  }

  if (!target || typeof target !== 'object') {
    return source;
  }

  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      // Recursively merge nested objects
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else {
      // For primitives, arrays, or null values, use source value
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Abstract base class for configuration generators
 */
abstract class ConfigGenerator {
  /**
   * Generate configuration files for the specific agent
   */
  abstract generate(outputDir: string): Promise<void>;

  /**
   * Get the system prompt using existing generation logic
   * Suppresses info logs during CLI operations
   */
  protected getSystemPrompt(): string {
    try {
      // Create loggers with ERROR level to suppress info messages
      const loader = new StateMachineLoader();
      const stateMachine = loader.loadStateMachine(process.cwd());
      return generateSystemPrompt(stateMachine);
    } catch (error) {
      throw new Error(`Failed to generate system prompt: ${error}`);
    }
  }

  /**
   * Write file with proper error handling
   */
  protected async writeFile(filePath: string, content: string): Promise<void> {
    try {
      await writeFile(filePath, content, 'utf-8');
      console.log(`✓ Generated: ${filePath}`);
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${error}`);
    }
  }

  /**
   * Read and merge with existing JSON config file if it exists
   * Returns merged config with new config taking precedence
   */
  protected async mergeWithExistingConfig(
    filePath: string,
    newConfig: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!existsSync(filePath)) {
      return newConfig;
    }

    try {
      const existingContent = await readFile(filePath, 'utf-8');
      const existingConfig = JSON.parse(existingContent) as Record<
        string,
        unknown
      >;
      console.log('✓ Merged with existing configuration');
      return deepMerge(existingConfig, newConfig);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `Existing ${filePath} contains invalid JSON. Please fix the file or remove it to generate a new configuration. Error: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * We'll be using the reduced deployable which only contains the mcp server, not the CLI
   * On Windows, npx commands need to be prefixed with "cmd /c"
   */
  protected getDefaultMcpConfig(): object {
    const isWindows = process.platform.startsWith('win');

    if (isWindows) {
      return {
        workflows: {
          command: 'cmd',
          args: ['/c', 'npx', '@codemcp/workflows-server@latest'],
        },
      };
    }

    return {
      workflows: {
        command: 'npx',
        args: ['@codemcp/workflows-server@latest'],
      },
    };
  }

  /**
   * Get default allowed tools for workflows
   */
  protected getDefaultAllowedTools(): string[] {
    return ['whats_next', 'conduct_review', 'list_workflows', 'get_tool_info'];
  }
}

/**
 * Amazon Q Configuration Generator
 * Generates a single comprehensive JSON file
 * Merges with existing configuration instead of overwriting
 */
class AmazonQConfigGenerator extends ConfigGenerator {
  async generate(outputDir: string): Promise<void> {
    const systemPrompt = this.getSystemPrompt();
    const mcpServers = this.getDefaultMcpConfig();

    const newConfig: Record<string, unknown> = {
      name: 'vibe',
      description: 'Responsible vibe development',
      prompt: systemPrompt,
      mcpServers: mcpServers,
      tools: [
        'execute_bash',
        'fs_read',
        'fs_write',
        'report_issue',
        'knowledge',
        'thinking',
        'use_aws',
        '@workflows',
      ],
      allowedTools: [
        'fs_read',
        'fs_write',
        '@workflows/whats_next',
        '@workflows/conduct_review',
        '@workflows/list_workflows',
        '@workflows/get_tool_info',
      ],
      toolsSettings: {
        execute_bash: {
          alwaysAllow: [
            {
              preset: 'readOnly',
            },
          ],
        },
        use_aws: {
          alwaysAllow: [
            {
              preset: 'readOnly',
            },
          ],
        },
      },
      resources: ['file://README.md', 'file://.amazonq/rules/**/*.md'],
      hooks: {},
    };

    // Create .amazonq/cli-agents directory
    const amazonqDir = join(outputDir, '.amazonq', 'cli-agents');
    await mkdir(amazonqDir, { recursive: true });

    const configPath = join(amazonqDir, 'vibe.json');
    const finalConfig = await this.mergeWithExistingConfig(
      configPath,
      newConfig
    );
    await this.writeFile(configPath, JSON.stringify(finalConfig, null, 2));
  }
}

/**
 * Claude Code Configuration Generator
 * Generates multiple files: .claude/agents/vibe.md, .mcp.json, .claude/settings.json
 * Merges with existing configuration instead of overwriting
 */
class ClaudeConfigGenerator extends ConfigGenerator {
  async generate(outputDir: string): Promise<void> {
    const systemPrompt = this.getSystemPrompt();
    const mcpServers = this.getDefaultMcpConfig();

    // Generate .claude/agents/vibe.md (agent configuration) - always overwrite as it's generated content
    const claudeDir = join(outputDir, '.claude');
    const agentsDir = join(claudeDir, 'agents');
    await mkdir(agentsDir, { recursive: true });
    const agentContent = `---
name: Responsible Vibe
description: AI assistant that helps users develop software features using structured development workflows.
---

${systemPrompt}`;
    const agentPath = join(agentsDir, 'vibe.md');
    await this.writeFile(agentPath, agentContent);

    // Generate .mcp.json (MCP server configuration) - merge with existing
    const mcpConfig: Record<string, unknown> = {
      mcpServers: mcpServers,
    };
    const mcpJsonPath = join(outputDir, '.mcp.json');
    const finalMcpConfig = await this.mergeWithExistingConfig(
      mcpJsonPath,
      mcpConfig
    );
    await this.writeFile(mcpJsonPath, JSON.stringify(finalMcpConfig, null, 2));

    // Generate .claude/settings.json (permissions and security) - merge with existing
    const settings: Record<string, unknown> = {
      permissions: {
        allow: [
          'MCP(workflows:whats_next)',
          'MCP(workflows:conduct_review)',
          'MCP(workflows:list_workflows)',
          'MCP(workflows:get_tool_info)',
          'Read(README.md)',
          'Read(./.vibe/**)',
          'Write(./.vibe/**)',
        ],
        ask: ['Bash(*)', 'Write(**)'],
        deny: ['Read(./.env)', 'Read(./.env.*)', 'Read(./secrets/**)'],
      },
    };
    const settingsPath = join(claudeDir, 'settings.json');
    const finalSettings = await this.mergeWithExistingConfig(
      settingsPath,
      settings
    );
    await this.writeFile(settingsPath, JSON.stringify(finalSettings, null, 2));
  }
}

/**
 * Gemini CLI Configuration Generator
 * Generates settings.json and GEMINI.md
 * Merges with existing configuration instead of overwriting
 */
class GeminiConfigGenerator extends ConfigGenerator {
  async generate(outputDir: string): Promise<void> {
    const systemPrompt = this.getSystemPrompt();
    const mcpServers = this.getDefaultMcpConfig();
    const allowedTools = this.getDefaultAllowedTools();

    // Generate settings.json (comprehensive configuration) - merge with existing
    const settings: Record<string, unknown> = {
      contextFileName: 'GEMINI.md',
      autoAccept: false,
      theme: 'Default',
      vimMode: false,
      sandbox: false,
      mcpServers: mcpServers,
      allowMCPServers: ['workflows'],
      coreTools: ['ReadFileTool', 'WriteFileTool', 'GlobTool', 'ShellTool'],
      telemetry: {
        enabled: false,
        target: 'local',
        otlpEndpoint: 'http://localhost:4317',
        logPrompts: false,
      },
      usageStatisticsEnabled: false,
      hideTips: false,
      hideBanner: false,
    };
    const settingsPath = join(outputDir, 'settings.json');
    const finalSettings = await this.mergeWithExistingConfig(
      settingsPath,
      settings
    );
    await this.writeFile(settingsPath, JSON.stringify(finalSettings, null, 2));

    // Generate GEMINI.md (context/prompt file) - always overwrite as it's generated content
    const geminiMdContent = `# Vibe Development Agent

${systemPrompt}

## Project Context

This agent is configured to work with the workflows server for structured development workflows.

## Available Tools

The following tools are available for development tasks:
${allowedTools.map(tool => `- ${tool}`).join('\n')}
`;
    const geminiMdPath = join(outputDir, 'GEMINI.md');
    await this.writeFile(geminiMdPath, geminiMdContent);
  }
}

/**
 * OpenCode Configuration Generator
 * Generates opencode.json with agent configuration and MCP server setup
 * Merges with existing configuration instead of overwriting
 */
class OpencodeConfigGenerator extends ConfigGenerator {
  async generate(outputDir: string): Promise<void> {
    const systemPrompt = this.getSystemPrompt();
    const configPath = join(outputDir, 'opencode.json');
    const isWindows = process.platform.startsWith('win');

    // Generate new config structure
    const newConfig: Record<string, unknown> = {
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        workflows: {
          type: 'local',
          command: isWindows
            ? ['cmd', '/c', 'npx', '@codemcp/workflows-server@latest']
            : ['npx', '@codemcp/workflows-server@latest'],
        },
      },
      agent: {
        vibe: {
          description:
            'Responsible vibe development agent with structured workflows',
          mode: 'primary',
          prompt: systemPrompt,
          tools: {
            'workflows*': false,
            workflows_whats_next: true,
            workflows_conduct_review: true,
            workflows_list_workflows: true,
            workflows_get_tool_info: true,
          },
          permission: {
            workflows_reset_development: 'ask',
            workflows_start_development: 'ask',
            workflows_proceed_to_phase: 'ask',
          },
        },
      },
    };

    const finalConfig = await this.mergeWithExistingConfig(
      configPath,
      newConfig
    );
    await this.writeFile(configPath, JSON.stringify(finalConfig, null, 2));
  }
}

/**
 * VS Code Configuration Generator
 * Generates .vscode/mcp.json and .github/agents/Vibe.agent.md for GitHub Copilot Vibe mode
 */
class VSCodeConfigGenerator extends ConfigGenerator {
  async generate(outputDir: string): Promise<void> {
    const systemPrompt = this.getSystemPrompt();
    const mcpServers = this.getDefaultMcpConfig();

    // Generate .vscode/mcp.json (MCP server configuration for VS Code)
    const vscodeDir = join(outputDir, '.vscode');
    await mkdir(vscodeDir, { recursive: true });

    const mcpConfig = {
      servers: mcpServers,
    };
    const mcpJsonPath = join(vscodeDir, 'mcp.json');
    await this.writeFile(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));

    // Generate .github/agents/Vibe.agent.md (Agent configuration for GitHub Copilot Vibe mode)
    const githubAgentsDir = join(outputDir, '.github', 'agents');
    await mkdir(githubAgentsDir, { recursive: true });

    const agentContent = `---
description: AI assistant that helps users develop software features using the workflows server.
tools: ['edit', 'runNotebooks', 'search', 'new', 'runCommands', 'runTasks', 'workflows/*', 'usages', 'vscodeAPI', 'problems', 'changes', 'testFailure', 'openSimpleBrowser', 'fetch', 'githubRepo', 'extensions', 'runSubagent']
---

${systemPrompt}
`;

    const agentPath = join(githubAgentsDir, 'Vibe.agent.md');
    await this.writeFile(agentPath, agentContent);
  }
}

/**
 * Metadata for a configuration generator
 */
interface GeneratorMetadata {
  /** Primary identifier for the generator */
  name: string;
  /** Human-readable description */
  description: string;
  /** Alternative names that can be used to reference this generator */
  aliases?: string[];
  /** The generator class constructor */
  generatorClass: new () => ConfigGenerator;
}

/**
 * Registry for configuration generators
 * Provides discovery, validation, and instantiation of generators
 */
class GeneratorRegistry {
  private static generators = new Map<string, GeneratorMetadata>();

  /**
   * Register a generator with its metadata
   */
  static register(metadata: GeneratorMetadata): void {
    // Register with primary name
    this.generators.set(metadata.name.toLowerCase(), metadata);

    // Register aliases
    if (metadata.aliases) {
      for (const alias of metadata.aliases) {
        this.generators.set(alias.toLowerCase(), metadata);
      }
    }
  }

  /**
   * Create a generator instance by name or alias
   */
  static createGenerator(name: string): ConfigGenerator {
    const metadata = this.generators.get(name.toLowerCase());
    if (!metadata) {
      const available = this.getGeneratorNames().join(', ');
      throw new Error(
        `Unsupported agent: ${name}. Supported agents: ${available}`
      );
    }
    return new metadata.generatorClass();
  }

  /**
   * Get all unique registered generators (without duplicates from aliases)
   */
  static getAllGenerators(): GeneratorMetadata[] {
    const unique = new Map<string, GeneratorMetadata>();
    for (const metadata of this.generators.values()) {
      unique.set(metadata.name, metadata);
    }
    return Array.from(unique.values());
  }

  /**
   * Get list of primary generator names
   */
  static getGeneratorNames(): string[] {
    return this.getAllGenerators().map(g => g.name);
  }

  /**
   * Get formatted help text for all generators
   */
  static getHelpText(): string {
    return this.getAllGenerators()
      .map(g => `  ${g.name.padEnd(20)} ${g.description}`)
      .join('\n');
  }

  /**
   * Check if a generator exists by name or alias
   */
  static exists(name: string): boolean {
    return this.generators.has(name.toLowerCase());
  }
}

// Register all available generators
GeneratorRegistry.register({
  name: 'kiro',
  description: 'Generate .amazonq/cli-agents/vibe.json (Kiro/Amazon Q)',
  aliases: ['amazonq-cli', 'amazonq'],
  generatorClass: AmazonQConfigGenerator,
});

GeneratorRegistry.register({
  name: 'kiro-cli',
  description: 'Generate .amazonq/cli-agents/vibe.json (Kiro/Amazon Q CLI)',
  generatorClass: AmazonQConfigGenerator,
});

GeneratorRegistry.register({
  name: 'claude',
  description: 'Generate CLAUDE.md, .mcp.json, settings.json',
  generatorClass: ClaudeConfigGenerator,
});

GeneratorRegistry.register({
  name: 'gemini',
  description: 'Generate settings.json, GEMINI.md',
  generatorClass: GeminiConfigGenerator,
});

GeneratorRegistry.register({
  name: 'opencode',
  description: 'Generate opencode.json',
  generatorClass: OpencodeConfigGenerator,
});

GeneratorRegistry.register({
  name: 'copilot',
  description: 'Generate .vscode/mcp.json, .github/agents/Vibe.agent.md',
  aliases: ['copilot-vscode', 'vscode'],
  generatorClass: VSCodeConfigGenerator,
});

/**
 * Factory class for creating configuration generators
 * @deprecated Use GeneratorRegistry.createGenerator() instead
 */
class ConfigGeneratorFactory {
  static createGenerator(agent: string): ConfigGenerator {
    return GeneratorRegistry.createGenerator(agent);
  }
}

/**
 * Main function to generate configuration for specified agent
 */
export async function generateConfig(
  agent: string,
  outputDir: string = '.'
): Promise<void> {
  console.log(`Generating configuration for ${agent}...`);

  const generator = ConfigGeneratorFactory.createGenerator(agent);
  await generator.generate(outputDir);

  console.log(`✅ Configuration generated successfully for ${agent}`);
}

/**
 * Export GeneratorRegistry for CLI usage
 */
export { GeneratorRegistry };

/**
 * Export deepMerge for testing
 */
export { deepMerge };
