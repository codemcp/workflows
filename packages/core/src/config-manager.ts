/**
 * Configuration Manager
 *
 * Handles loading and validation of project configuration from .vibe/config.yaml
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { createLogger } from './logger.js';

const logger = createLogger('ConfigManager');

export interface ProjectConfig {
  enabled_workflows?: string[];
  /**
   * Optional capability→model/agent routing map.
   *
   * Keys are capability strings declared on workflow phases via
   * `required_capability` (e.g. `thinking`, `research`, `coding`, or any
   * custom term). Each value is an object with optional `model` and `agent`
   * fields used to enrich the capability hint instruction. Absent ⇒ no
   * model/agent clause (opt-in). An empty entry object `{}` is allowed and
   * is a no-op (no model, no agent).
   * @example
   * capability_models:
   *   thinking:
   *     model: anthropic/claude-opus-4-7
   *     agent: general_thinking
   */
  capability_models?: Record<string, { model?: string; agent?: string }>;
}

/**
 * Manages project configuration loading and validation
 */
export class ConfigManager {
  private static readonly CONFIG_FILENAME = 'config.yaml';

  /**
   * Load project configuration from .vibe/config.yaml
   * Returns null if no config file exists (backward compatibility)
   * Throws error for invalid configuration
   */
  public static loadProjectConfig(projectPath: string): ProjectConfig | null {
    const configPath = path.join(projectPath, '.vibe', this.CONFIG_FILENAME);

    // No config file = backward compatibility (all workflows available)
    if (!fs.existsSync(configPath)) {
      logger.debug('No config file found, using defaults', { configPath });
      return null;
    }

    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config = yaml.load(configContent) as ProjectConfig;

      this.validateConfig(config, configPath);

      logger.info('Loaded project configuration', {
        configPath,
        enabledWorkflows: config.enabled_workflows?.length || 0,
        capabilityModels: config.capability_models
          ? Object.keys(config.capability_models).length
          : 0,
      });

      return config;
    } catch (error) {
      if (error instanceof yaml.YAMLException) {
        throw new Error(
          `Invalid YAML in config file ${configPath}: ${error.message}`
        );
      }
      throw new Error(`Failed to load config file ${configPath}: ${error}`);
    }
  }

  /**
   * Validate configuration structure and content
   */
  private static validateConfig(
    config: ProjectConfig,
    configPath: string
  ): void {
    if (!config || typeof config !== 'object') {
      throw new Error(
        `Invalid config file ${configPath}: must be a YAML object`
      );
    }

    if (config.enabled_workflows !== undefined) {
      if (!Array.isArray(config.enabled_workflows)) {
        throw new Error(
          `Invalid config file ${configPath}: enabled_workflows must be an array`
        );
      }

      if (config.enabled_workflows.length === 0) {
        throw new Error(
          `Invalid config file ${configPath}: enabled_workflows cannot be empty`
        );
      }

      // Validate all entries are strings
      for (const workflow of config.enabled_workflows) {
        if (typeof workflow !== 'string' || workflow.trim() === '') {
          throw new Error(
            `Invalid config file ${configPath}: all workflow names must be non-empty strings`
          );
        }
      }
    }

    if (config.capability_models !== undefined) {
      if (
        typeof config.capability_models !== 'object' ||
        config.capability_models === null ||
        Array.isArray(config.capability_models)
      ) {
        throw new Error(
          `Invalid config file ${configPath}: capability_models must be an object`
        );
      }

      for (const [key, entry] of Object.entries(config.capability_models)) {
        if (
          entry === null ||
          typeof entry !== 'object' ||
          Array.isArray(entry)
        ) {
          throw new Error(
            `Invalid config file ${configPath}: capability_models entry '${key}' must be an object`
          );
        }

        const { model, agent } = entry;
        if (
          model !== undefined &&
          (typeof model !== 'string' || model.trim() === '')
        ) {
          throw new Error(
            `Invalid config file ${configPath}: capability_models entry '${key}' model must be a non-empty string`
          );
        }
        if (
          agent !== undefined &&
          (typeof agent !== 'string' || agent.trim() === '')
        ) {
          throw new Error(
            `Invalid config file ${configPath}: capability_models entry '${key}' agent must be a non-empty string`
          );
        }
      }
    }
  }
}
