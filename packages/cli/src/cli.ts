/**
 * CLI Functionality
 *
 * Handles command line arguments and delegates to appropriate functionality
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { WorkflowManager } from '@codemcp/workflows-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if we're in development (local) or published package
const isLocal = existsSync(join(__dirname, '../../core/dist/index.js'));

let generateSystemPrompt: (stateMachine: unknown) => string;
let StateMachineLoader: new () => unknown;

if (isLocal) {
  // Local development - use workspace imports
  // Node.js can resolve @codemcp/workflows-core via pnpm workspace configuration
  const coreModule = await import('@codemcp/workflows-core');
  generateSystemPrompt = coreModule.generateSystemPrompt as (
    stateMachine: unknown
  ) => string;
  StateMachineLoader = coreModule.StateMachineLoader as new () => unknown;
} else {
  // Published package - use relative imports
  // Node.js cannot resolve @codemcp/workflows-core from subdirectories in published packages
  // because it expects packages in node_modules/@codemcp/workflows-core/, not
  // node_modules/@codemcp/workflows/packages/core/
  const coreModule = await import('../../core/dist/index.js');
  generateSystemPrompt = coreModule.generateSystemPrompt as (
    stateMachine: unknown
  ) => string;
  StateMachineLoader = coreModule.StateMachineLoader as new () => unknown;
}

import { startVisualizationTool } from './visualization-launcher.js';
import { generateConfig, GeneratorRegistry } from './config-generator.js';
import { generateSkill, SkillGeneratorRegistry } from './skill-generator.js';

/**
 * Parse a named flag from an args array, supporting both space-separated and
 * equals-sign notation:
 *   --flag value       → returns "value"
 *   --flag=value       → returns "value"
 *
 * Returns `undefined` when the flag is not present.
 */
export function parseFlag(args: string[], flag: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // --flag=value notation
    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
    // --flag value notation
    if (arg === flag && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  return undefined;
}

/**
 * Parse command line arguments and handle CLI commands
 */
async function parseCliArgs(): Promise<{ shouldExit: boolean }> {
  const args = process.argv.slice(2);

  // Handle help flag
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return { shouldExit: true };
  }

  // Get the first argument as command
  const command = args[0];

  // Handle setup commands
  if (command === 'setup') {
    const subcommand = args[1];
    if (subcommand === 'list') {
      handleSetupList();
      return { shouldExit: true };
    } else if (subcommand) {
      const mode = parseFlag(args, '--mode') ?? 'config';
      if (mode !== 'skill' && mode !== 'config') {
        console.error('❌ Error: --mode must be "skill" or "config"');
        process.exit(1);
      }
      await handleSetup(subcommand, mode);
      return { shouldExit: true };
    } else {
      console.error('❌ Error: setup requires a target');
      console.error('Usage: setup <target> [--mode config|skill]');
      console.error('       setup list');
      process.exit(1);
    }
  }

  // Handle workflow commands
  if (command === 'workflow') {
    const subcommand = args[1];
    if (subcommand === 'list') {
      handleWorkflowList();
      return { shouldExit: true };
    } else if (subcommand === 'copy') {
      const sourceWorkflow = args[2];
      const customName = args[3];
      if (!sourceWorkflow || !customName) {
        console.error(
          '❌ Error: workflow copy requires source workflow and custom name'
        );
        console.error('Usage: workflow copy <source-workflow> <custom-name>');
        process.exit(1);
      }
      handleWorkflowCopy(sourceWorkflow, customName);
      return { shouldExit: true };
    } else {
      console.error('❌ Unknown workflow subcommand:', subcommand);
      console.error('Available: workflow list, workflow copy <source> <name>');
      process.exit(1);
    }
  }

  // Handle crowd commands (renamed from agents)
  if (command === 'crowd') {
    const subcommand = args[1];
    if (subcommand === 'list') {
      handleCrowdList();
      return { shouldExit: true };
    } else if (subcommand === 'copy') {
      const outputDir = parseFlag(args, '--output-dir');
      handleCrowdCopy(outputDir);
      return { shouldExit: true };
    } else {
      console.error('❌ Unknown crowd subcommand:', subcommand);
      console.error('Available: crowd list, crowd copy [--output-dir DIR]');
      process.exit(1);
    }
  }

  // Handle visualize subcommand (also default with no args)
  if (command === 'visualize' || args.length === 0) {
    startVisualizationTool();
    return { shouldExit: true };
  }

  // Handle validate subcommand
  if (command === 'validate') {
    const workflowPath = args[1];
    if (!workflowPath) {
      console.error('❌ Error: validate requires a workflow file path');
      console.error('Usage: validate <workflow-file.yaml>');
      process.exit(1);
    }
    handleValidateWorkflow(workflowPath);
    return { shouldExit: true };
  }

  // Handle system-prompt subcommand
  if (command === 'system-prompt') {
    showSystemPrompt();
    return { shouldExit: true };
  }

  // =================================================================
  // DEPRECATED FLAGS - Show deprecation notice and new command syntax
  // =================================================================

  // Handle deprecated --generate-config flag
  if (args.includes('--generate-config')) {
    const targetIndex = args.findIndex(arg => arg === '--generate-config') + 1;
    const target = args[targetIndex] || '<target>';
    console.warn('⚠️  DEPRECATED: --generate-config is deprecated.');
    console.warn(`   Use instead: setup ${target} --mode config`);
    console.warn('');
    console.warn('   Run "setup list" to see available targets.');
    return { shouldExit: true };
  }

  // Handle deprecated --validate flag
  if (args.includes('--validate')) {
    const fileIndex = args.findIndex(arg => arg === '--validate') + 1;
    const file = args[fileIndex] || '<workflow.yaml>';
    console.warn('⚠️  DEPRECATED: --validate is deprecated.');
    console.warn(`   Use instead: validate ${file}`);
    return { shouldExit: true };
  }

  // Handle deprecated --system-prompt flag
  if (args.includes('--system-prompt')) {
    console.warn('⚠️  DEPRECATED: --system-prompt is deprecated.');
    console.warn('   Use instead: system-prompt');
    return { shouldExit: true };
  }

  // Handle deprecated --visualize/--viz flags
  if (args.includes('--visualize') || args.includes('--viz')) {
    console.warn('⚠️  DEPRECATED: --visualize/--viz is deprecated.');
    console.warn('   Use instead: visualize');
    console.warn('   Or simply run with no arguments (default behavior).');
    return { shouldExit: true };
  }

  // Handle deprecated 'agents' subcommand (renamed to 'crowd')
  if (command === 'agents') {
    const subcommand = args[1] || '';
    console.warn('⚠️  DEPRECATED: "agents" subcommand is renamed to "crowd".');
    console.warn(`   Use instead: crowd ${subcommand}`);
    return { shouldExit: true };
  }

  // Handle deprecated 'skill' subcommand (merged into 'setup')
  if (command === 'skill') {
    const subcommand = args[1];
    if (subcommand === 'list') {
      console.warn('⚠️  DEPRECATED: "skill list" is deprecated.');
      console.warn('   Use instead: setup list');
    } else {
      console.warn(
        '⚠️  DEPRECATED: "skill" subcommand is merged into "setup".'
      );
      console.warn(`   Use instead: setup ${subcommand || '<target>'}`);
    }
    return { shouldExit: true };
  }

  // Unknown arguments
  console.error('❌ Unknown command:', args.join(' '));
  showHelp();
  return { shouldExit: true };
}

/**
 * Handle workflow validation
 */
function handleValidateWorkflow(workflowPath: string): void {
  try {
    console.log(`🔍 Validating workflow: ${workflowPath}`);

    const loader = new StateMachineLoader() as {
      loadFromFile: (path: string) => unknown;
    };
    const workflow = loader.loadFromFile(workflowPath) as {
      name: string;
      description: string;
      initial_state: string;
      states: Record<string, unknown>;
      metadata?: { domain?: string; complexity?: string };
    };

    console.log('✅ Workflow validation successful!');
    console.log(`📋 Workflow: ${workflow.name}`);
    console.log(`📝 Description: ${workflow.description}`);
    console.log(`🏁 Initial state: ${workflow.initial_state}`);
    console.log(`🔄 States: ${Object.keys(workflow.states).join(', ')}`);

    if (workflow.metadata) {
      console.log(`🏷️  Domain: ${workflow.metadata.domain || 'not specified'}`);
      console.log(
        `⚡ Complexity: ${workflow.metadata.complexity || 'not specified'}`
      );
    }
  } catch (error) {
    console.error('❌ Workflow validation failed:');
    console.error((error as Error).message);
    process.exit(1);
  }
}

/**
 * Handle workflow list command
 */
function handleWorkflowList(): void {
  try {
    const workflowManager = new WorkflowManager();
    const workflows = workflowManager.getAvailableWorkflowsForProject(
      process.cwd()
    );

    console.log('📋 Available workflows:');
    for (const w of workflows) {
      console.log(`  ${w.name.padEnd(12)} - ${w.description}`);
    }
  } catch (error) {
    console.error('Error listing workflows:', error);
    process.exit(1);
  }
}

/**
 * Handle workflow copy command
 */
function handleWorkflowCopy(sourceWorkflow: string, customName: string): void {
  try {
    // Get all available workflows (including unloaded domains)
    const workflowManager = new WorkflowManager();
    const allWorkflows = workflowManager.getAllAvailableWorkflows();

    // Validate source workflow exists
    const validWorkflow = allWorkflows.find(w => w.name === sourceWorkflow);
    if (!validWorkflow) {
      console.error(`❌ Invalid source workflow: ${sourceWorkflow}`);
      console.error(
        `Available workflows: ${allWorkflows.map(w => w.name).join(', ')}`
      );
      process.exit(1);
    }

    // Find source workflow file
    const possibleSourcePaths = [
      join(
        __dirname,
        '..',
        '..',
        '..',
        'resources',
        'workflows',
        `${sourceWorkflow}.yaml`
      ),
      join(
        __dirname,
        '..',
        '..',
        'core',
        'resources',
        'workflows',
        `${sourceWorkflow}.yaml`
      ),
      join(process.cwd(), 'resources', 'workflows', `${sourceWorkflow}.yaml`),
    ];

    // Find the source content
    const foundPath = possibleSourcePaths.find(p => existsSync(p));
    if (!foundPath) {
      console.error(`❌ Could not find source workflow: ${sourceWorkflow}`);
      process.exit(1);
    }

    const sourceContent = readFileSync(foundPath, 'utf8');

    // Create .vibe/workflows directory if it doesn't exist
    const vibeDir = join(process.cwd(), '.vibe');
    const workflowsDir = join(vibeDir, 'workflows');

    if (!existsSync(vibeDir)) {
      mkdirSync(vibeDir, { recursive: true });
    }
    if (!existsSync(workflowsDir)) {
      mkdirSync(workflowsDir, { recursive: true });
    }

    // Update workflow name in content
    const customContent = sourceContent.replace(
      new RegExp(`name: '${sourceWorkflow}'`, 'g'),
      `name: '${customName}'`
    );

    const workflowPath = join(workflowsDir, `${customName}.yaml`);

    if (existsSync(workflowPath)) {
      console.error(
        `❌ Workflow '${customName}' already exists at ${workflowPath}`
      );
      process.exit(1);
    }

    writeFileSync(workflowPath, customContent);
    console.log(
      `✅ Copied '${sourceWorkflow}' workflow to '${customName}' at ${workflowPath}`
    );
    console.log('💡 Edit the file to customize your workflow');
  } catch (error) {
    console.error('Error copying workflow:', error);
    process.exit(1);
  }
}

/**
 * Handle setup command - combines skill and config generation
 */
async function handleSetup(
  target: string,
  mode: 'skill' | 'config'
): Promise<void> {
  try {
    // Check if target is valid (use exists() to support aliases)
    const isSkillTarget = SkillGeneratorRegistry.exists(target);
    const isConfigTarget = GeneratorRegistry.exists(target);

    if (!isSkillTarget && !isConfigTarget) {
      const skillTargets = SkillGeneratorRegistry.getGeneratorNames();
      const configTargets = GeneratorRegistry.getGeneratorNames();
      const allTargets = [...new Set([...skillTargets, ...configTargets])];
      console.error(`❌ Unknown target: ${target}`);
      console.error(`Available targets: ${allTargets.join(', ')}`);
      process.exit(1);
    }

    if (mode === 'config') {
      if (!isConfigTarget) {
        const configTargets = GeneratorRegistry.getGeneratorNames();
        console.error(`❌ Target "${target}" does not support config mode`);
        console.error(`Config mode targets: ${configTargets.join(', ')}`);
        process.exit(1);
      }
      await generateConfig(target, process.cwd());
    } else {
      // skill mode (default)
      if (!isSkillTarget) {
        const skillTargets = SkillGeneratorRegistry.getGeneratorNames();
        console.error(`❌ Target "${target}" does not support skill mode`);
        console.error(`Skill mode targets: ${skillTargets.join(', ')}`);
        console.error(`💡 Try: setup ${target} --mode config`);
        process.exit(1);
      }
      await generateSkill(target, process.cwd());
    }
  } catch (error) {
    console.error(`❌ Failed to generate ${mode}: ${error}`);
    process.exit(1);
  }
}

/**
 * Handle setup list command - shows all available targets
 */
function handleSetupList(): void {
  const skillTargets = SkillGeneratorRegistry.getGeneratorNames();
  const configTargets = GeneratorRegistry.getGeneratorNames();
  const allTargets = [...new Set([...skillTargets, ...configTargets])].sort();

  console.log('📋 Available setup targets:\n');
  console.log('  Target'.padEnd(20) + 'Modes');
  console.log('  ' + '-'.repeat(35));

  for (const target of allTargets) {
    const modes: string[] = [];
    if (skillTargets.includes(target)) modes.push('skill');
    if (configTargets.includes(target)) modes.push('config');
    console.log(`  ${target.padEnd(18)} ${modes.join(', ')}`);
  }

  console.log('\n💡 Usage:');
  console.log(
    '   setup <target>              Generate full agent configuration (default)'
  );
  console.log(
    '   setup <target> --mode config  Generate full agent configuration'
  );
  console.log('   setup <target> --mode skill   Generate skill files only');
}

/**
 * Handle crowd list command (renamed from agents list)
 */
function handleCrowdList(): void {
  try {
    // Find agents directory
    const possibleAgentsPaths = [
      join(__dirname, '..', '..', '..', 'resources', 'agents'),
      join(__dirname, '..', '..', 'core', 'resources', 'agents'),
    ];

    let agentsDir: string | null = null;
    for (const path of possibleAgentsPaths) {
      if (existsSync(path)) {
        agentsDir = path;
        break;
      }
    }

    if (!agentsDir) {
      console.error('❌ Could not find agents directory');
      process.exit(1);
    }

    const files = readdirSync(agentsDir).filter(
      (f: string) => f.endsWith('.yaml') || f.endsWith('.yml')
    );

    if (files.length === 0) {
      console.log('📋 No crowd agent configurations found');
      return;
    }

    console.log('📋 Available crowd agent configurations:\n');
    for (const file of files) {
      const agentPath = join(agentsDir, file);
      const content = readFileSync(agentPath, 'utf8');

      // Extract name and displayName from YAML
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const displayNameMatch = content.match(/^displayName:\s*(.+)$/m);
      const name = nameMatch
        ? (nameMatch[1]?.trim() ?? file.replace(/\.ya?ml$/, ''))
        : file.replace(/\.ya?ml$/, '');
      const displayName = displayNameMatch?.[1]?.trim() ?? name;

      console.log(`  ${name.padEnd(18)} ${displayName}`);
    }

    console.log(
      '\n💡 Use "crowd copy" to copy these configurations to your project'
    );
  } catch (error) {
    console.error('Error listing crowd agents:', error);
    process.exit(1);
  }
}

/**
 * Handle crowd copy command (renamed from agents copy)
 */
function handleCrowdCopy(outputDir?: string): void {
  try {
    // Find source agents directory
    const possibleAgentsPaths = [
      join(__dirname, '..', '..', '..', 'resources', 'agents'),
      join(__dirname, '..', '..', 'core', 'resources', 'agents'),
    ];

    let sourceAgentsDir: string | null = null;
    for (const path of possibleAgentsPaths) {
      if (existsSync(path)) {
        sourceAgentsDir = path;
        break;
      }
    }

    if (!sourceAgentsDir) {
      console.error('❌ Could not find source agents directory');
      process.exit(1);
    }

    // Determine target directory
    const targetDir = outputDir || join(process.cwd(), '.crowd', 'agents');

    // Create target directory if it doesn't exist
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // Read all agent files
    const files = readdirSync(sourceAgentsDir).filter(
      (f: string) => f.endsWith('.yaml') || f.endsWith('.yml')
    );

    if (files.length === 0) {
      console.error('❌ No crowd agent configurations found to copy');
      process.exit(1);
    }

    console.log(
      `📋 Copying ${files.length} crowd agent configuration(s) to ${targetDir}\n`
    );

    // Copy each file
    let copiedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const sourcePath = join(sourceAgentsDir, file);
      const targetPath = join(targetDir, file);

      if (existsSync(targetPath)) {
        console.log(`⏭️  ${file} (already exists, skipping)`);
        skippedCount++;
      } else {
        const content = readFileSync(sourcePath, 'utf8');
        writeFileSync(targetPath, content);
        console.log(`✅ ${file}`);
        copiedCount++;
      }
    }

    console.log(
      `\n🎉 Copied ${copiedCount} crowd agent configuration(s)${skippedCount > 0 ? ` (skipped ${skippedCount} existing)` : ''}`
    );
    console.log(`\n💡 Crowd agent configurations are now in: ${targetDir}`);
    console.log('💡 Configure these agents in your crowd-mcp setup');
  } catch (error) {
    console.error('Error copying crowd agents:', error);
    process.exit(1);
  }
}

/**
 * Show help information
 */
function showHelp(): void {
  const skillTargets = SkillGeneratorRegistry.getGeneratorNames();
  const configTargets = GeneratorRegistry.getGeneratorNames();
  const allTargets = [...new Set([...skillTargets, ...configTargets])].sort();

  console.log(`
Responsible Vibe CLI Tools

USAGE:
  npx @codemcp/workflows [COMMAND]
  npx @codemcp/workflows             Start the interactive visualizer (default)

SETUP COMMANDS:
  setup <target>                Generate full agent configuration (default mode)
  setup <target> --mode config  Generate full agent configuration
  setup <target> --mode skill   Generate skill files only
  setup list                    List available targets

WORKFLOW COMMANDS:
  workflow list                 List available workflows
  workflow copy <source> <name> Copy a workflow with custom name

CROWD AGENT COMMANDS:
  crowd list                    List available crowd agent configurations
  crowd copy [--output-dir DIR] Copy crowd agent configs to project

UTILITY COMMANDS:
  visualize                     Start the interactive workflow visualizer
  validate <workflow.yaml>      Validate a workflow file
  system-prompt                 Show the system prompt for LLM integration

OPTIONS:
  --help, -h                    Show this help message

AVAILABLE TARGETS:
  ${allTargets.join(', ')}

DESCRIPTION:
  CLI tools for the responsible-vibe development workflow system.
  By default, starts the interactive workflow visualizer.

MORE INFO:
  GitHub: https://github.com/codemcp/workflows
  npm: https://www.npmjs.com/package/@codemcp/workflows
`);
}

/**
 * Show system prompt for LLM integration
 */
function showSystemPrompt(): void {
  try {
    // Load the default state machine for prompt generation
    const loader = new StateMachineLoader() as {
      loadStateMachine: (cwd: string) => unknown;
    };
    const stateMachine = loader.loadStateMachine(process.cwd());

    // Generate the system prompt
    const systemPrompt = generateSystemPrompt(stateMachine);

    console.log(systemPrompt);
  } catch (error) {
    console.error('Error generating system prompt:', error);
    process.exit(1);
  }
}

/**
 * Main CLI entry point
 */
export async function runCli() {
  const { shouldExit } = await parseCliArgs();

  if (shouldExit) {
    return;
  }
}
