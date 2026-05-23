/**
 * Workflow Manager
 *
 * Manages multiple predefined workflows and provides workflow discovery and selection
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createLogger } from './logger.js';
import { StateMachineLoader } from './state-machine-loader.js';
import { YamlStateMachine } from './state-machine-types.js';
import { ConfigManager } from './config-manager.js';

const logger = createLogger('WorkflowManager');

/**
 * Domain descriptions for tool parameter metadata.
 * These are exposed to the LLM via the load_workflows tool to help it
 * discover and choose domains intelligently.
 *
 * Each description summarizes what the domain is suitable for,
 * based on the actual workflow YAML descriptions.
 */
export const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  code: 'Day-to-day software engineering: features (epcc), test-driven development (tdd), bug fixes (bugfix, minor), greenfield projects (greenfield), large structured development (waterfall), and code reviews (pr-review)',
  architecture:
    'System understanding and planning: architectural decisions (adr), legacy system modernization (big-bang-conversion), API and boundary analysis (boundary-testing), business capability modeling (business-analysis), and progressive architecture discovery (c4-analysis)',
  sdd: 'Specification-driven development: write detailed specs before coding — structured requirements, user stories, testability focus, and constitutional compliance gates for bugfixes, features, and greenfield projects',
  'sdd-crowd':
    'Multi-agent collaborative specification-driven development: role-based handoffs between business analysts (specify), architects (plan), and developers (implement) for coordinated distributed teams',
  skilled:
    'Skill-augmented development: explicit prompts to apply specialized expertise (architecture, coding, testing, application design) at each phase — for scenarios where best practices and domain expertise should be leveraged',
  office:
    'Content creation and communication: structured workflows for writing blog posts (discovery through distribution) and creating slide presentations (ideate through deliver)',
  children:
    'Educational game development for children ages 8-12: simplified, age-appropriate programming concepts with frequent positive reinforcement and incremental achievement',
};

export interface WorkflowManagerOptions {
  /**
   * Default domains to use for workflow filtering.
   * Takes precedence over all environment variables.
   * Can be a comma-separated string or an array of domain names.
   */
  defaultDomains?: string | string[];
}

export interface WorkflowInfo {
  name: string;
  displayName: string;
  description: string;
  initialState: string;
  phases: string[];
  // Enhanced metadata for better discoverability
  metadata?: {
    domain?: string;
    complexity?: 'low' | 'medium' | 'high';
    bestFor?: string[];
    useCases?: string[];
    examples?: string[];
  };
}

/**
 * Manages predefined workflows and provides workflow discovery
 */
export class WorkflowManager {
  private predefinedWorkflows: Map<string, YamlStateMachine> = new Map();
  private projectWorkflows: Map<string, YamlStateMachine> = new Map();
  private workflowInfos: Map<string, WorkflowInfo> = new Map();
  private stateMachineLoader: StateMachineLoader;
  private lastProjectPath: string | null = null; // Track last loaded project path
  private enabledDomains: Set<string>;
  private _defaultDomains: string | string[] | null = null; // Constructor override

  constructor(options?: WorkflowManagerOptions) {
    this.stateMachineLoader = new StateMachineLoader();
    if (options?.defaultDomains !== undefined) {
      this._defaultDomains = options.defaultDomains;
    }
    this.enabledDomains = this.parseEnabledDomains();
    this.loadPredefinedWorkflows();
  }

  /**
   * Parse enabled domains from environment variable with four-level precedence chain:
   * 1. Constructor parameter `defaultDomains` (highest priority)
   * 2. `WORKFLOW_DOMAINS` env var (canonical runtime configuration)
   * 3. `DEFAULT_DOMAINS` env var (new: runtime default when canonical is unset)
   * 4. `VIBE_WORKFLOW_DOMAINS` env var (legacy alias for backward compatibility)
   * 5. Empty Set — final fallback: no filtering, all workflows load
   */
  private parseEnabledDomains(): Set<string> {
    // 1. Constructor parameter (highest priority)
    if (this._defaultDomains !== null) {
      const domains = new Set(
        Array.isArray(this._defaultDomains)
          ? this._defaultDomains
          : this._defaultDomains
              .split(',')
              .map(d => d.trim())
              .filter(d => d)
      );
      logger.debug('Using constructor default domains', {
        domains: Array.from(domains),
      });
      return domains;
    }

    // 2. WORKFLOW_DOMAINS (canonical)
    if (process.env['WORKFLOW_DOMAINS']) {
      return this._parseDomainString(
        process.env['WORKFLOW_DOMAINS'],
        'WORKFLOW_DOMAINS'
      );
    }

    // 3. DEFAULT_DOMAINS (new: runtime default)
    if (process.env['DEFAULT_DOMAINS']) {
      return this._parseDomainString(
        process.env['DEFAULT_DOMAINS'],
        'DEFAULT_DOMAINS'
      );
    }

    // 4. VIBE_WORKFLOW_DOMAINS (legacy alias)
    if (process.env['VIBE_WORKFLOW_DOMAINS']) {
      return this._parseDomainString(
        process.env['VIBE_WORKFLOW_DOMAINS'],
        'VIBE_WORKFLOW_DOMAINS (legacy)'
      );
    }

    // 5. Empty Set — no filtering, all workflows load
    logger.debug('No domain configuration found, loading all workflows');
    return new Set();
  }

  /**
   * Parse a comma-separated domain string into a Set.
   */
  private _parseDomainString(
    domainString: string,
    source: string
  ): Set<string> {
    const domains = new Set(
      domainString
        .split(',')
        .map(d => d.trim())
        .filter(d => d)
    );
    logger.debug('Parsed enabled domains', {
      source,
      domains: Array.from(domains),
    });
    return domains;
  }

  /**
   * Load project-specific workflows from .vibe/workflows/
   */
  public loadProjectWorkflows(projectPath: string): void {
    // Clear project workflows cache if project path changed
    if (this.lastProjectPath !== projectPath) {
      this.projectWorkflows.clear();
      this.lastProjectPath = projectPath;
    }

    // First, migrate any legacy workflow files
    this.migrateLegacyWorkflow(projectPath);

    const workflowsDir = path.join(projectPath, '.vibe', 'workflows');

    if (!fs.existsSync(workflowsDir)) {
      return;
    }

    try {
      const files = fs.readdirSync(workflowsDir);
      const yamlFiles = files.filter(
        file => file.endsWith('.yaml') || file.endsWith('.yml')
      );

      for (const file of yamlFiles) {
        try {
          const filePath = path.join(workflowsDir, file);
          const workflow = this.stateMachineLoader.loadFromFile(filePath);
          const workflowName = workflow.name; // Use name from YAML, not filename

          // Project workflows are always loaded (no domain filtering)
          this.projectWorkflows.set(workflowName, workflow);

          const workflowInfo: WorkflowInfo = {
            name: workflowName,
            displayName: workflow.name,
            description: workflow.description,
            initialState: workflow.initial_state,
            phases: Object.keys(workflow.states),
            metadata: workflow.metadata,
          };

          this.workflowInfos.set(workflowName, workflowInfo);

          logger.info('Loaded project workflow', {
            name: workflowName,
            domain: workflow.metadata?.domain,
          });
        } catch (error) {
          logger.error('Failed to load project workflow', error as Error, {
            file,
          });
        }
      }
    } catch (error) {
      logger.error(
        'Failed to scan project workflows directory',
        error as Error,
        { workflowsDir }
      );
    }
  }

  /**
   * Migrate legacy workflow.yaml to new workflows directory
   */
  private migrateLegacyWorkflow(projectPath: string): void {
    const legacyPaths = [
      path.join(projectPath, '.vibe', 'workflow.yaml'),
      path.join(projectPath, '.vibe', 'workflow.yml'),
    ];

    const workflowsDir = path.join(projectPath, '.vibe', 'workflows');
    const targetPath = path.join(workflowsDir, 'custom.yaml');

    for (const legacyPath of legacyPaths) {
      if (fs.existsSync(legacyPath) && !fs.existsSync(targetPath)) {
        try {
          // Create workflows directory if it doesn't exist
          if (!fs.existsSync(workflowsDir)) {
            fs.mkdirSync(workflowsDir, { recursive: true });
          }

          // Copy the file to new location
          fs.copyFileSync(legacyPath, targetPath);

          // Remove the old file
          fs.unlinkSync(legacyPath);

          logger.info('Migrated legacy workflow to new location', {
            from: legacyPath,
            to: targetPath,
          });
          break;
        } catch (_error) {
          logger.error('Failed to migrate legacy workflow');
        }
      }
    }
  }
  /**
   * Get all available workflows regardless of domain filtering.
   * Uses DEFAULT_ALL_DOMAINS env var if set, otherwise falls back to all known domains.
   */
  public getAllAvailableWorkflows(): WorkflowInfo[] {
    // Create a temporary manager with all domains enabled
    const originalEnv = process.env['WORKFLOW_DOMAINS'];
    const allDomains =
      process.env['DEFAULT_ALL_DOMAINS'] ||
      'code,architecture,office,sdd,sdd-crowd,skilled,children';

    process.env['WORKFLOW_DOMAINS'] = allDomains;

    try {
      const tempManager = new WorkflowManager();
      return tempManager.getAvailableWorkflows();
    } finally {
      if (originalEnv !== undefined) {
        process.env['WORKFLOW_DOMAINS'] = originalEnv;
      } else {
        delete process.env['WORKFLOW_DOMAINS'];
      }
    }
  }

  /**
   * Get information about any currently active workflow.
   * Returns null if no active workflow is detected.
   */
  private getActiveWorkflow(): WorkflowInfo | null {
    // Check if any loaded workflow has metadata indicating it's active.
    // Since WorkflowManager doesn't track conversation state directly,
    // we return null here. The actual active workflow detection is handled
    // by ConversationManager. This method exists as a placeholder for
    // future integration if needed.
    return null;
  }

  /**
   * Replace the current domain set and reload workflows.
   *
   * This allows runtime switching of domains without recreating the WorkflowManager.
   * Validates domains against known set and checks for active workflow conflicts.
   *
   * @param domains - Comma-separated string or array of domain names
   * @throws Error if an unknown domain is provided or if switching would conflict with an active workflow
   */
  public setDomains(domains: string | string[]): void {
    const newSet = new Set(
      Array.isArray(domains)
        ? domains
        : domains
            .split(',')
            .map(d => d.trim())
            .filter(d => d)
    );

    // Validate domains against known set
    const knownDomains = new Set(Object.keys(DOMAIN_DESCRIPTIONS));
    for (const domain of newSet) {
      if (!knownDomains.has(domain)) {
        throw new Error(
          `Unknown domain: '${domain}'. Known domains: ${Array.from(knownDomains).join(', ')}`
        );
      }
    }

    // Guard: check for active workflow conflict
    const activeWorkflow = this.getActiveWorkflow();
    if (
      activeWorkflow &&
      activeWorkflow.metadata?.domain &&
      !newSet.has(activeWorkflow.metadata.domain)
    ) {
      throw new Error(
        `Cannot switch domains: active workflow '${activeWorkflow.name}' is in domain '${activeWorkflow.metadata.domain}', which is not in the new set. Finish or reset the current workflow first.`
      );
    }

    // Update and reload
    this.enabledDomains = newSet;
    this.loadPredefinedWorkflows();
    if (this.lastProjectPath) {
      this.loadProjectWorkflows(this.lastProjectPath);
    }

    logger.info('Domains updated', {
      domains: Array.from(newSet),
      totalWorkflows: this.predefinedWorkflows.size,
    });
  }

  public getAvailableWorkflows(): WorkflowInfo[] {
    return Array.from(this.workflowInfos.values());
  }

  /**
   * Get available workflows for a specific project
   * Applies configuration filtering and loads project-specific workflows
   */
  public getAvailableWorkflowsForProject(projectPath: string): WorkflowInfo[] {
    // Load project workflows first
    this.loadProjectWorkflows(projectPath);

    const allWorkflows = this.getAvailableWorkflows();

    // Load project configuration
    const config = ConfigManager.loadProjectConfig(projectPath);

    // Apply configuration filtering if enabled_workflows is specified
    let filteredWorkflows = allWorkflows;
    if (config?.enabled_workflows) {
      // Validate that all configured workflows exist
      for (const workflowName of config.enabled_workflows) {
        if (
          workflowName !== 'custom' &&
          !this.isPredefinedWorkflow(workflowName)
        ) {
          throw new Error(
            `Invalid workflow '${workflowName}' in configuration. Available workflows: ${this.getWorkflowNames().join(', ')}, custom`
          );
        }
      }

      // Filter to only enabled workflows
      filteredWorkflows = allWorkflows.filter(
        w => config.enabled_workflows?.includes(w.name) ?? false
      );
    }

    // Handle custom workflow (only if custom is in enabled list or no config)
    const customEnabled =
      !config?.enabled_workflows || config.enabled_workflows.includes('custom');
    if (customEnabled) {
      const hasCustomWorkflow = this.validateWorkflowName(
        'custom',
        projectPath
      );
      if (hasCustomWorkflow) {
        // Add custom workflow to the list if it exists and is enabled
        const customWorkflowInfo: WorkflowInfo = {
          name: 'custom',
          displayName: 'Custom Workflow',
          description: 'Project-specific custom workflow',
          initialState: 'unknown', // Will be determined when loaded
          phases: [], // Will be determined when loaded
        };
        filteredWorkflows.push(customWorkflowInfo);
      }
    }

    return filteredWorkflows;
  }

  /**
   * Get workflow information by name
   */
  public getWorkflowInfo(name: string): WorkflowInfo | undefined {
    return this.workflowInfos.get(name);
  }

  /**
   * Get a specific workflow by name (checks both predefined and project workflows)
   */
  public getWorkflow(name: string): YamlStateMachine | undefined {
    return (
      this.projectWorkflows.get(name) || this.predefinedWorkflows.get(name)
    );
  }

  /**
   * Check if a workflow name is a predefined workflow
   */
  public isPredefinedWorkflow(name: string): boolean {
    return this.predefinedWorkflows.has(name);
  }

  /**
   * Get workflow names as enum values for tool schema
   * Includes both predefined and project workflows
   */
  public getWorkflowNames(): string[] {
    const predefinedNames = Array.from(this.predefinedWorkflows.keys());
    const projectNames = Array.from(this.projectWorkflows.keys());

    // Combine and deduplicate (project workflows override predefined ones)
    const allNames = [...predefinedNames];
    for (const projectName of projectNames) {
      if (!allNames.includes(projectName)) {
        allNames.push(projectName);
      }
    }

    return allNames;
  }

  /**
   * Load a workflow (predefined or custom) for a project
   * FIXED: Now respects the workflow parameter correctly
   */
  public loadWorkflowForProject(
    projectPath: string,
    workflowName?: string
  ): YamlStateMachine {
    // Load project workflows first
    this.loadProjectWorkflows(projectPath);

    // If no workflow specified, use first available workflow
    if (!workflowName) {
      const availableWorkflows =
        this.getAvailableWorkflowsForProject(projectPath);
      if (availableWorkflows.length === 0) {
        throw new Error(
          'No workflows available. Please install a workflow or adjust WORKFLOW_DOMAINS environment variable.'
        );
      }
      workflowName = availableWorkflows[0].name;
    }

    // If it's a predefined workflow, return it
    if (this.isPredefinedWorkflow(workflowName)) {
      const workflow = this.getWorkflow(workflowName);
      if (workflow) {
        logger.info('Loading predefined workflow', { workflowName });
        return workflow;
      }
    }

    // Check project workflows
    if (this.projectWorkflows.has(workflowName)) {
      const workflow = this.projectWorkflows.get(workflowName);
      if (workflow) {
        logger.info('Loading project workflow', { workflowName });
        return workflow;
      }
    }

    throw new Error(`Unknown workflow: ${workflowName}`);
  }

  /**
   * Find the workflows directory using multiple strategies
   * This handles both development and npm package deployment scenarios
   */
  private findWorkflowsDirectory(): string | null {
    const currentFileUrl = import.meta.url;
    const currentFilePath = fileURLToPath(currentFileUrl);
    const strategies: string[] = [];

    // Strategy 1: Local resources directory (symlinked from root)
    strategies.push(
      path.join(path.dirname(currentFilePath), '../resources/workflows')
    );

    // Strategy 2: Relative to current file (development and direct npm scenarios)
    // From packages/core/dist/workflow-manager.js -> ../../../../resources/workflows
    strategies.push(
      path.resolve(
        path.dirname(currentFilePath),
        '../../../../resources/workflows'
      )
    );

    // Strategy 3: Find package root by looking for package.json with our package name
    let currentDir = path.dirname(currentFilePath);
    for (let i = 0; i < 10; i++) {
      // Limit search depth
      const packageJsonPath = path.join(currentDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8')
          );
          if (packageJson.name === '@codemcp/workflows-core') {
            strategies.push(path.join(currentDir, 'resources/workflows'));
            break;
          }
        } catch (_error) {
          // Ignore JSON parse errors and continue searching
        }
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break; // Reached filesystem root
      currentDir = parentDir;
    }

    // Strategy 3: Common npm installation paths
    // Local node_modules (when used as dependency)
    strategies.push(
      path.join(
        process.cwd(),
        'node_modules/@codemcp/workflows-core/resources/workflows'
      )
    );

    // Global npm installation (when installed globally)
    if (process.env.NODE_PATH) {
      strategies.push(
        path.join(
          process.env.NODE_PATH,
          '@codemcp/workflows-core/resources/workflows'
        )
      );
    }

    // Strategy 4: npx cache locations (for npx @codemcp/workflows-server@latest)
    // npx typically caches packages in ~/.npm/_npx or similar locations
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      // Common npx cache locations
      const npxCachePaths = [
        path.join(homeDir, '.npm/_npx'),
        path.join(homeDir, '.npm/_cacache'),
        path.join(homeDir, 'AppData/Local/npm-cache/_npx'), // Windows
        path.join(homeDir, 'Library/Caches/npm/_npx'), // macOS
      ];

      for (const cachePath of npxCachePaths) {
        if (fs.existsSync(cachePath)) {
          try {
            // Look for @codemcp/workflows in cache subdirectories
            const cacheEntries = fs.readdirSync(cachePath);
            for (const entry of cacheEntries) {
              const entryPath = path.join(cachePath, entry);
              if (fs.statSync(entryPath).isDirectory()) {
                // Look for our package in this cache entry
                const possiblePaths = [
                  path.join(
                    entryPath,
                    'node_modules/@codemcp/workflows-core/resources/workflows'
                  ),
                  path.join(
                    entryPath,
                    '@codemcp/workflows-core/resources/workflows'
                  ),
                ];
                strategies.push(...possiblePaths);
              }
            }
          } catch (_error) {
            // Ignore errors reading cache directories
          }
        }
      }
    }

    // Strategy 5: Look in the directory where the current executable is located
    // This handles cases where npx runs the package from a temporary location
    const executableDir = path.dirname(process.argv[1] || '');
    if (executableDir) {
      strategies.push(path.join(executableDir, '../resources/workflows'));
      strategies.push(path.join(executableDir, 'resources/workflows'));
    }

    // Strategy 6: Use require.resolve to find the package location
    try {
      // Try to resolve the package.json of our own package
      const require = createRequire(import.meta.url);
      const packagePath =
        require.resolve('@codemcp/workflows-core/package.json');
      const packageDir = path.dirname(packagePath);
      strategies.push(path.join(packageDir, 'resources/workflows'));
    } catch (_error) {
      // require.resolve might fail in some environments, that's okay
    }

    // Remove duplicates and invalid paths
    const uniqueStrategies = [...new Set(strategies)].filter(
      p => p.trim() !== '/resources/workflows'
    );

    // Test each strategy
    for (const workflowsDir of uniqueStrategies) {
      logger.debug('Trying workflows directory', { workflowsDir });
      if (fs.existsSync(workflowsDir)) {
        // Verify it contains workflow files
        try {
          const files = fs.readdirSync(workflowsDir);
          const yamlFiles = files.filter(
            file => file.endsWith('.yaml') || file.endsWith('.yml')
          );
          if (yamlFiles.length > 0) {
            logger.info('Found workflows directory', {
              workflowsDir,
              yamlFiles: yamlFiles.length,
            });
            return workflowsDir;
          }
        } catch (error) {
          // Directory exists but can't read it, continue to next strategy
          logger.debug('Cannot read workflows directory', {
            workflowsDir,
            error,
          });
        }
      }
    }

    logger.error(
      'Could not find workflows directory',
      new Error('Workflows directory not found'),
      {
        strategiesCount: uniqueStrategies.length,
        currentFilePath,
        strategies: uniqueStrategies,
      }
    );
    return null;
  }

  /**
   * Load all predefined workflows from resources/workflows directory
   */
  private loadPredefinedWorkflows(): void {
    try {
      // Clear existing workflows before reloading (important for setDomains)
      this.predefinedWorkflows.clear();
      this.workflowInfos.clear();

      const workflowsDir = this.findWorkflowsDirectory();

      if (!workflowsDir || !fs.existsSync(workflowsDir)) {
        logger.warn('Workflows directory not found', { workflowsDir });
        return;
      }

      // Read all YAML files in the workflows directory
      const files = fs.readdirSync(workflowsDir);
      const yamlFiles = files.filter(
        file => file.endsWith('.yaml') || file.endsWith('.yml')
      );

      logger.info('Loading predefined workflows', {
        workflowsDir,
        yamlFiles: yamlFiles.length,
      });

      for (const file of yamlFiles) {
        try {
          const filePath = path.join(workflowsDir, file);
          const workflow = this.stateMachineLoader.loadFromFile(filePath);
          const workflowName = path.basename(file, path.extname(file));

          // Apply domain filtering
          if (this.enabledDomains.size > 0 && workflow.metadata?.domain) {
            if (!this.enabledDomains.has(workflow.metadata.domain)) {
              logger.debug('Skipping workflow due to domain filter', {
                name: workflowName,
                domain: workflow.metadata.domain,
                enabledDomains: Array.from(this.enabledDomains),
              });
              continue;
            }
          }

          this.predefinedWorkflows.set(workflowName, workflow);

          const workflowInfo: WorkflowInfo = {
            name: workflowName,
            displayName: workflow.name,
            description: workflow.description,
            initialState: workflow.initial_state,
            phases: Object.keys(workflow.states),
            metadata: workflow.metadata,
          };

          this.workflowInfos.set(workflowName, workflowInfo);

          logger.info('Loaded predefined workflow', {
            name: workflowName,
            domain: workflow.metadata?.domain,
            phases: workflowInfo.phases.length,
          });
        } catch (error) {
          logger.error('Failed to load workflow file', error as Error, {
            file,
          });
        }
      }

      logger.info('Predefined workflows loaded', {
        count: this.predefinedWorkflows.size,
        workflows: Array.from(this.predefinedWorkflows.keys()),
      });
    } catch (error) {
      logger.error('Failed to load predefined workflows', error as Error);
    }
  }

  /**
   * Validate a workflow name
   */
  public validateWorkflowName(
    workflowName: string,
    projectPath: string
  ): boolean {
    // Check if it's a predefined workflow
    if (this.isPredefinedWorkflow(workflowName)) {
      return true;
    }

    // Check if it's a project workflow (load project workflows first)
    this.loadProjectWorkflows(projectPath);
    if (this.projectWorkflows.has(workflowName)) {
      return true;
    }

    // Also check workflow infos in case workflow failed to load but info was created
    if (this.workflowInfos.has(workflowName)) {
      return true;
    }

    return false;
  }
}
