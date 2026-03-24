/**
 * Skill Generator for Different AI Coding Agents
 *
 * This module implements a factory pattern to generate skill files
 * for different AI coding agents (Claude Code, Gemini, OpenCode, Copilot, Kiro).
 * Each agent has its own generator class with single responsibility.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getSkillPaths, type SkillPaths } from './skill-paths.js';
import {
  generateSystemPrompt,
  StateMachineLoader,
} from '@codemcp/workflows-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the version from the package.json
 */
async function getVersion(): Promise<string> {
  // Try to find package.json in various locations
  const possiblePaths = [
    join(__dirname, '..', '..', 'package.json'), // cli package
    join(__dirname, '..', '..', '..', 'package.json'), // root package
  ];

  for (const packagePath of possiblePaths) {
    if (existsSync(packagePath)) {
      try {
        const content = await readFile(packagePath, 'utf-8');
        const pkg = JSON.parse(content) as { version?: string };
        if (pkg.version) {
          return pkg.version;
        }
      } catch {
        // Continue to next path
      }
    }
  }

  return '0.0.0'; // Fallback version
}

/**
 * Abstract base class for skill generators
 */
export abstract class SkillGenerator {
  /**
   * Generate skill files for the specific agent
   */
  abstract generate(outputDir: string): Promise<void>;

  /**
   * Write file with proper error handling
   */
  protected async writeFile(filePath: string, content: string): Promise<void> {
    try {
      // Ensure directory exists
      const dir = dirname(filePath);
      await mkdir(dir, { recursive: true });

      await writeFile(filePath, content, 'utf-8');
      console.log(`✓ Generated: ${filePath}`);
    } catch (error) {
      throw new Error(`Failed to write file ${filePath}: ${error}`);
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
   * Get MCP config in command + args format (used by Kiro/Amazon Q CLI)
   */
  protected getKiroMcpConfig(): object {
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
   * Write MCP configuration file for the platform
   */
  protected async writeMcpConfig(paths: SkillPaths): Promise<void> {
    const mcpConfig = this.getDefaultMcpConfig();

    // Determine the config structure based on platform
    let configContent: object;
    if (paths.mcpConfigKey) {
      // Wrap in the platform-specific key
      configContent = { [paths.mcpConfigKey]: mcpConfig };
    } else {
      // Use directly (for Kiro, it's { mcpServers: {...} } at root)
      configContent = { mcpServers: mcpConfig };
    }

    await this.writeFile(
      paths.mcpConfigPath,
      JSON.stringify(configContent, null, 2)
    );
  }

  /**
   * Copy all skill templates to the output directory
   */
  protected async copySkillTemplates(outputDir: string): Promise<void> {
    const skillTemplates = [
      'starting-project.md',
      'architecture.md',
      'application-design.md',
      'coding.md',
      'testing.md',
      'task-handling.md',
    ];

    for (const template of skillTemplates) {
      try {
        const templatePath = this.resolveSkillTemplatePath(template);
        const content = await readFile(templatePath, 'utf-8');
        const outputPath = join(outputDir, 'skills', template);
        await this.writeFile(outputPath, content);
      } catch (error) {
        console.warn(`⚠ Could not copy skill template ${template}: ${error}`);
      }
    }
  }

  /**
   * Get the system prompt using existing generation logic
   * Same approach as config-generator.ts
   */
  protected getSystemPrompt(): string {
    try {
      const loader = new StateMachineLoader();
      const stateMachine = loader.loadStateMachine(process.cwd());
      return generateSystemPrompt(stateMachine);
    } catch (error) {
      throw new Error(`Failed to generate system prompt: ${error}`);
    }
  }

  /**
   * Get the skill content by combining frontmatter template with dynamic system prompt
   * The frontmatter is loaded from resources/templates/skills/SKILL.md
   * The body is generated dynamically from generateSystemPrompt()
   */
  protected async getSkillTemplate(): Promise<string> {
    const frontmatterPath = this.resolveSkillTemplatePath('SKILL.md');
    const frontmatter = await this.loadAndProcessTemplate(frontmatterPath);
    const systemPrompt = this.getSystemPrompt();
    return `${frontmatter}\n\n${systemPrompt}`;
  }

  /**
   * Get the power content by combining frontmatter template with dynamic system prompt
   * (Used by Kiro which uses a different frontmatter format)
   * The frontmatter is loaded from resources/templates/skills/POWER.md
   * The body is generated dynamically from generateSystemPrompt()
   */
  protected async getPowerTemplate(): Promise<string> {
    const frontmatterPath = this.resolveSkillTemplatePath('POWER.md');
    const frontmatter = await this.loadAndProcessTemplate(frontmatterPath);
    const systemPrompt = this.getSystemPrompt();
    return `${frontmatter}\n\n${systemPrompt}`;
  }

  /**
   * Resolve the path to a skill template file
   */
  private resolveSkillTemplatePath(filename: string): string {
    const possiblePaths = [
      // Local development - resources symlinked
      join(__dirname, '..', 'resources', 'templates', 'skills', filename),
      // From dist directory
      join(__dirname, '..', '..', 'resources', 'templates', 'skills', filename),
      // Root resources
      join(
        __dirname,
        '..',
        '..',
        '..',
        'resources',
        'templates',
        'skills',
        filename
      ),
      // From core package
      join(
        __dirname,
        '..',
        '..',
        'core',
        'resources',
        'templates',
        'skills',
        filename
      ),
    ];

    for (const templatePath of possiblePaths) {
      if (existsSync(templatePath)) {
        return templatePath;
      }
    }

    throw new Error(
      `Skill template not found: ${filename}. Searched paths: ${possiblePaths.join(', ')}`
    );
  }

  /**
   * Load and process a template file, substituting version placeholders
   */
  private async loadAndProcessTemplate(templatePath: string): Promise<string> {
    try {
      const content = await readFile(templatePath, 'utf-8');
      const version = await getVersion();
      return content.replace(/\$\{VERSION\}/g, version);
    } catch (error) {
      throw new Error(`Failed to load skill template: ${error}`);
    }
  }
}

/**
 * Claude Code Skill Generator
 * Generates skills for Claude Code / Claude Desktop
 */
class ClaudeSkillGenerator extends SkillGenerator {
  async generate(outputDir: string): Promise<void> {
    const paths = getSkillPaths('claude', outputDir);
    const skillContent = await this.getSkillTemplate();
    await this.writeFile(paths.skillFile, skillContent);

    // Generate MCP config
    await this.writeMcpConfig(paths);

    // Copy skill templates
    await this.copySkillTemplates(outputDir);
  }
}

/**
 * Gemini Skill Generator
 * Generates skills for Gemini CLI
 */
class GeminiSkillGenerator extends SkillGenerator {
  async generate(outputDir: string): Promise<void> {
    const paths = getSkillPaths('gemini', outputDir);
    const skillContent = await this.getSkillTemplate();
    await this.writeFile(paths.skillFile, skillContent);

    // Generate MCP config
    await this.writeMcpConfig(paths);

    // Copy skill templates
    await this.copySkillTemplates(outputDir);
  }
}

/**
 * OpenCode Skill Generator
 * Generates skills for OpenCode
 */
class OpenCodeSkillGenerator extends SkillGenerator {
  async generate(outputDir: string): Promise<void> {
    const paths = getSkillPaths('opencode', outputDir);
    const skillContent = await this.getSkillTemplate();
    await this.writeFile(paths.skillFile, skillContent);

    // Generate MCP config with OpenCode-specific format
    await this.writeOpencodeMcpConfig(paths);

    // Copy skill templates
    await this.copySkillTemplates(outputDir);
  }

  /**
   * Write OpenCode-specific MCP configuration
   * OpenCode uses a different format: type: "local" and command as array
   */
  private async writeOpencodeMcpConfig(paths: SkillPaths): Promise<void> {
    const isWindows = process.platform.startsWith('win');

    const mcpConfig = {
      workflows: {
        type: 'local' as const,
        command: isWindows
          ? ['cmd', '/c', 'npx', '@codemcp/workflows-server@latest']
          : ['npx', '@codemcp/workflows-server@latest'],
      },
    };

    const configContent = {
      $schema: 'https://opencode.ai/config.json',
      mcp: mcpConfig,
    };

    await this.writeFile(
      paths.mcpConfigPath,
      JSON.stringify(configContent, null, 2)
    );
  }
}

/**
 * Copilot Skill Generator
 * Generates skills for GitHub Copilot
 */
class CopilotSkillGenerator extends SkillGenerator {
  async generate(outputDir: string): Promise<void> {
    const paths = getSkillPaths('copilot', outputDir);
    const skillContent = await this.getSkillTemplate();
    await this.writeFile(paths.skillFile, skillContent);

    // Generate MCP config
    await this.writeMcpConfig(paths);

    // Copy skill templates
    await this.copySkillTemplates(outputDir);
  }
}

/**
 * Kiro Skill Generator
 * Generates skills for Kiro IDE (uses POWER.md template with bundled mcp.json)
 * Uses command + args format for MCP config
 */
class KiroSkillGenerator extends SkillGenerator {
  async generate(outputDir: string): Promise<void> {
    const paths = getSkillPaths('kiro', outputDir);

    // Kiro uses the POWER.md template format
    const skillContent = await this.getPowerTemplate();
    await this.writeFile(paths.skillFile, skillContent);

    // Kiro bundles MCP config inside the power directory (command + args format)
    await this.writeKiroMcpConfig(paths);

    // Copy skill templates
    await this.copySkillTemplates(outputDir);
  }

  /**
   * Write Kiro-specific MCP configuration (command + args format)
   */
  private async writeKiroMcpConfig(paths: SkillPaths): Promise<void> {
    const mcpConfig = this.getKiroMcpConfig();
    const configContent = { mcpServers: mcpConfig };

    await this.writeFile(
      paths.mcpConfigPath,
      JSON.stringify(configContent, null, 2)
    );
  }
}

/**
 * Kiro CLI Skill Generator
 * Generates skills for Kiro CLI (uses SKILL.md + mcp config)
 * Unlike Kiro IDE, the CLI does not support powers
 * Uses command + args format for MCP config (Amazon Q CLI format)
 */
class KiroCliSkillGenerator extends SkillGenerator {
  async generate(outputDir: string): Promise<void> {
    const paths = getSkillPaths('kiro-cli', outputDir);
    const skillContent = await this.getSkillTemplate();
    await this.writeFile(paths.skillFile, skillContent);

    // Generate MCP config with Kiro-specific format (command + args)
    await this.writeKiroMcpConfig(paths);

    // Copy skill templates
    await this.copySkillTemplates(outputDir);
  }

  /**
   * Write Kiro-specific MCP configuration (command + args format)
   */
  private async writeKiroMcpConfig(paths: SkillPaths): Promise<void> {
    const mcpConfig = this.getKiroMcpConfig();
    const configContent = { mcpServers: mcpConfig };

    await this.writeFile(
      paths.mcpConfigPath,
      JSON.stringify(configContent, null, 2)
    );
  }
}

/**
 * Metadata for a skill generator
 */
interface SkillGeneratorMetadata {
  /** Primary identifier for the generator */
  name: string;
  /** Human-readable description */
  description: string;
  /** Alternative names that can be used to reference this generator */
  aliases?: string[];
  /** The generator class constructor */
  generatorClass: new () => SkillGenerator;
}

/**
 * Registry for skill generators
 * Provides discovery, validation, and instantiation of generators
 */
export class SkillGeneratorRegistry {
  private static generators = new Map<string, SkillGeneratorMetadata>();

  /**
   * Register a generator with its metadata
   */
  static register(metadata: SkillGeneratorMetadata): void {
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
  static createGenerator(name: string): SkillGenerator {
    const metadata = this.generators.get(name.toLowerCase());
    if (!metadata) {
      const available = this.getGeneratorNames().join(', ');
      throw new Error(
        `Unsupported platform: ${name}. Supported platforms: ${available}`
      );
    }
    return new metadata.generatorClass();
  }

  /**
   * Get all unique registered generators (without duplicates from aliases)
   */
  static getAllGenerators(): SkillGeneratorMetadata[] {
    const unique = new Map<string, SkillGeneratorMetadata>();
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
SkillGeneratorRegistry.register({
  name: 'claude',
  description: 'Generate skill for Claude Code / Claude Desktop',
  aliases: ['claude-code', 'claude-desktop'],
  generatorClass: ClaudeSkillGenerator,
});

SkillGeneratorRegistry.register({
  name: 'gemini',
  description: 'Generate skill for Gemini CLI',
  aliases: ['gemini-cli'],
  generatorClass: GeminiSkillGenerator,
});

SkillGeneratorRegistry.register({
  name: 'opencode',
  description: 'Generate skill for OpenCode',
  generatorClass: OpenCodeSkillGenerator,
});

SkillGeneratorRegistry.register({
  name: 'copilot',
  description: 'Generate skill for GitHub Copilot',
  aliases: ['github-copilot', 'copilot-vscode', 'vscode'],
  generatorClass: CopilotSkillGenerator,
});

SkillGeneratorRegistry.register({
  name: 'kiro',
  description: 'Generate power for Kiro IDE (POWER.md + bundled mcp.json)',
  generatorClass: KiroSkillGenerator,
});

SkillGeneratorRegistry.register({
  name: 'kiro-cli',
  description: 'Generate skill for Kiro/Amazon Q CLI (SKILL.md + mcp.json)',
  aliases: ['amazonq', 'amazonq-cli'],
  generatorClass: KiroCliSkillGenerator,
});

/**
 * Main function to generate skill for specified platform
 */
export async function generateSkill(
  platform: string,
  outputDir: string = '.'
): Promise<void> {
  console.log(`Generating skill for ${platform}...`);

  const generator = SkillGeneratorRegistry.createGenerator(platform);
  await generator.generate(outputDir);

  console.log(`✅ Skill generated successfully for ${platform}`);
}
